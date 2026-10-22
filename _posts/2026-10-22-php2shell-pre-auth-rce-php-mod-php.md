---
layout: default
title: "php2shell — Pre-Auth RCE in PHP mod_php"
subtitle: "Analyzing CVE-2026-109618 and CVE-2026-109619 to achieve remote code execution"
description: "Technical analysis of CVE-2026-109618 and CVE-2026-109619 — two critical vulnerabilities in PHP mod_php that, when chained, allow pre-authentication remote code execution via Use-After-Free in the Zend Engine and dangling session globals."
date: 2026-10-22
tags:
  - php
  - rce
  - exploit-development
  - use-after-free
  - mod_php
  - apache
  - CVE-2026-109618
  - CVE-2026-109619
  - vulnerability-research
  - cybersecurity
---

# php2shell — Pre-Auth RCE in PHP mod_php
_Analyzing CVE-2026-109618 and CVE-2026-109619 to achieve remote code execution_

Two critical vulnerabilities were recently disclosed in PHP affecting Apache servers running mod_php: **CVE-2026-109618** and **CVE-2026-109619**. When chained together, they allow **pre-authentication remote code execution** — no credentials, no application-level bugs, no access to `/proc` or GDB. Just HTTP requests against the PHP runtime itself.

I spent some time analyzing both vulnerabilities, understanding the exploitation chain, and building a functional exploit that achieves RCE under controlled conditions. In this post I want to share a brief overview of what these CVEs are about and what I was able to confirm.

## The Vulnerabilities

### CVE-2026-109618 — OOM Stale HashTable Bucket

This one lives in `_zend_hash_str_add_or_update_i` inside the Zend Engine. When an Out-of-Memory condition occurs during HTTP request processing, the HashTable can leave stale buckets — pointers to already-freed memory. On the next request handled by the same Apache prefork worker, those pointers get reused. Classic Use-After-Free.

### CVE-2026-109619 — Dangling Session Globals

This one targets the session upload progress mechanism in `ext/session`. When OOM happens before `PG(modules_activated)=1` — during multipart/form-data parsing with session upload progress enabled — the module shutdown function (`zend_deactivate_modules()`) is skipped entirely. The session RSHUTDOWN never executes, leaving `PS(id)` and `PS(http_session_vars)` pointing to per-request memory that has already been freed.

The next request that hits the same worker accesses those dangling pointers. Controllable UAF.

## What I Confirmed

After analyzing the vulnerability chain described by the original researchers, I was able to develop a functional exploit that achieves RCE through three stages:

1. **Heap Leak** — triggering the OOM to leave `PS(id)` dangling, then spraying form fields to reclaim the memory and leak heap pointers via `Set-Cookie`. The pointers aligned to 2 MB reveal the ZendMM chunk base.

2. **Code Leak** — a second OOM with different padding to overlap HashTable buckets. The `pDestructor` field (a pointer to `zval_ptr_dtor` inside libphp) leaks out, giving us the libphp base address. Pure in-band ASLR bypass.

3. **Code Execution** — reclaiming `PS(http_session_vars)` with a fake HashTable whose `pDestructor` points to `zif_system`. When PHP cleans up the HashTable, it calls `pDestructor(arg1)` → `system("cmd")`.

The exploit was confirmed against **PHP 8.4.26 on x86_64**, achieving command execution as `www-data`. The lab setup used `memory_limit=8M`, `session.upload_progress.enabled=On`, and a single Apache worker (`MaxRequestWorkers=1`).

I also confirmed reliable crash/DoS (10/10 SIGABRT) on both PHP 8.2.34 (arm64) and PHP 8.4.26 (x86_64).

## OOM Trigger Technique

The OOM is triggered through uploads with **empty filenames** and **deeply nested field names**:

```
Content-Disposition: form-data; name="f[0_0][0_1]...[0_14]"; filename=""
```

Each empty-filename upload consumes ~35 KB during multipart parsing, but the upload body itself can be empty — keeping the total POST body under 1 MB while exhausting the memory limit. With `memory_limit=8M`, roughly 200–400 uploads are enough.

## Patched Versions

The fix landed in commit `3584a98bda` and is available in:

- PHP 8.2.35
- PHP 8.3.36
- PHP 8.4.27
- PHP 8.5.12

## Mitigation

If you can't update immediately:

- Disable session upload progress: `session.upload_progress.enabled=Off`
- Use **PHP-FPM** instead of mod_php (process isolation prevents worker reuse)
- Keep `max_file_uploads` at its default (20)
- Never run `display_errors=On` in production

## Credits

The original detailed writeup and the empty-filename amplification technique were documented by **Calif / Wiz (Ryan Austin — [@lcfr_hax](https://x.com/lcfr_hax))**, including the analysis of the `BG(unserialize)` flow and extension to WordPress environments.

**Peace!**
