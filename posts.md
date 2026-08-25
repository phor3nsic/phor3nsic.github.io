---
layout: default
title: "Writing"
permalink: /posts/
description: "Walleson Rodrigues' writing archive on technology, bug hunting, faith, family, and research."
---

<div class="page-shell">
  <header class="page-hero" data-reveal>
    <p class="eyebrow">[ NOTES / FIELD LOG ]</p>
    <h1>Writing &amp;<br>discoveries.</h1>
    <p>An evolving archive: stories from the bug hunter journey, techniques, technology, and reflections on faith, family, and purpose.</p>
  </header>

  <div class="archive-head" data-reveal>
    <h2>Archive</h2>
    <span>{{ site.posts | size }} published entries</span>
  </div>

  <div class="post-list" data-reveal>
    {% for post in site.posts %}
      <a class="post-row" href="{{ post.url | relative_url }}">
        <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d.%m.%Y" }}</time>
        <div>
          <h3>{{ post.title }}</h3>
          <p>{{ post.subtitle | default: post.excerpt | strip_html | strip_newlines | truncate: 150 }}</p>
        </div>
        <span class="post-arrow" aria-hidden="true">↗</span>
      </a>
    {% endfor %}
  </div>

  <aside class="archive-note" data-reveal>
    <div>
      <h2>Looking for advanced research?</h2>
      <p>High-cyber analysis and deep research live at DeepLookLabs.</p>
    </div>
    <a class="button button-primary" href="https://deeplooklabs.com" target="_blank" rel="noopener">Enter the lab <span aria-hidden="true">↗</span></a>
  </aside>
</div>
