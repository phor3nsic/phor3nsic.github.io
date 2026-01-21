---
layout: post
title: "Iframe Sandbox Trick: Triggering Authentication Dialogs Without allow-popups"
date: 2026-01-21
---

# Iframe Sandbox Trick: Triggering Authentication Dialogs Without `allow-popups`

Hello everyone.  
In this post, I’d like to share a simple trick I discovered some time ago regarding an unexpected behavior in sandboxed iframes: it is possible to trigger browser authentication dialogs (modal credential prompts) inside an iframe sandboxed **without** `allow-popups`, as long as `allow-scripts` is present.

This behavior allows a modal authentication prompt to appear even though the sandbox policy intends to prevent disruptive user interface dialogs.

<img src="/assets/images/trick-iframe-sandbox.gif">

## Requirements

The scenario requires a sandboxed iframe with scripts enabled but popups disabled:

```html
<iframe sandbox="allow-scripts"></iframe>
```

## The Trick
Even without the allow-popups directive, it is still possible to trigger a Basic Authentication dialog inside the sandboxed iframe.

If you control the src attribute of the iframe, you can simply load a URL that responds with an HTTP 401 challenge, such as:

```
https://httpbin.org/basic-auth/user/pass
```

or your own server configured for HTTP Basic Authentication.
When the browser receives the `WWW-Authenticate` header, it automatically displays the authentication prompt — effectively a modal dialog — despite the iframe lacking `allow-popups`.

This demonstrates that authentication dialogs are not governed by the iframe sandbox popup restrictions, unlike `alert()`, `prompt()`, or `confirm()`.

Related Research
A similar behavior was previously mentioned in the context of CSS Injection by @EdOverflow, documented in the Bug Bounty Wiki:

https://github.com/EdOverflow/bugbountywiki/wiki/CSS-injection

However, applying this technique inside sandboxed iframes reveals a practical way to spawn modal authentication dialogs where UI popups are expected to be blocked.

## Security Considerations
Google’s anti-malvertising team has discussed preventing sandboxed frames from showing confusing modal dialogs to users. Their concern explicitly included authentication dialogs:

> Folks in Google's anti-malvertising team would like to be able to prevent sandboxed frames from popping up confusing,  modal messages to users. This includes things like `alert()`, `confirm()`, and `prompt()` (and `print()` (and maybe > authentication dialogs)).

Reference:
https://chromestatus.com/feature/4747009953103872

I reported a proof of concept to Google. The response I received was:

> I don't believe there are any bugs, because nobody (implementation + spec) said we should block those messages.

Reference:
https://issues.chromium.org/issues/40266321

This indicates that, at the time of writing, authentication dialogs are considered out-of-scope for iframe sandbox popup restrictions by both specification and implementation.

Proof of Concept
Visit:
https://wallesonmoura.com.br/pocs/trick-iframe-sandbox.html

Provide a URL pointing to a Basic Auth endpoint in the `url` parameter.

Observe the authentication dialog appearing inside the sandboxed iframe.

## Conclusion
This behavior may be abused to cause user confusion, potentially leak credentials through password manager extensions, or enable phishing-style UI redressing when combined with clickjacking or deceptive framing. Although currently considered “working as intended,” it highlights an interesting gap between iframe sandbox UI restrictions and browser-controlled authentication dialogs.