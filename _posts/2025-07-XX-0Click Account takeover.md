---
layout: default
title: "0-Click Account takeover"
subtitle: "From UserData exposure to account takeover without interaction"
date: 2026-01-21
---

# 0-Click Account Takeover

An account takeover vulnerability exists in the password reset functionality. The /api/v1/account/info endpoint leaks sensitive `UserData` that can be used in conjunction with the password reset link to gain unauthorized access to a victim's account.
