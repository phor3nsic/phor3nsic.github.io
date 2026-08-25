---
layout: default
title: "Home"
description: "Walleson Rodrigues — DeepLookLabs founder, security researcher, and bug hunter. Writing about faith, family, technology, and the journey."
---

<section class="hero">
  <div class="hero-copy" data-reveal>
    <p class="eyebrow">Walleson Rodrigues · personal log</p>
    <h1>Where others see noise, I find <span>signals</span></h1>
    <p class="hero-intro">Security researcher, bug hunter, and founder of <strong>DeepLookLabs</strong>. This is my personal space to share what I find at the intersection of faith, family, technology, and the journey.</p>
    <div class="identity-line" aria-label="Roles">
      <span>Founder @ DeepLookLabs</span>
      <span>Security Researcher</span>
    </div>
    <div class="hero-actions">
      <a class="button button-primary" href="https://deeplooklabs.com" target="_blank" rel="noopener">Discover DeepLookLabs <span aria-hidden="true">↗</span></a>
      <a class="button" href="{{ '/posts/' | relative_url }}">Explore writing <span aria-hidden="true">↓</span></a>
    </div>
  </div>

  <div class="hero-visual" data-reveal>
    <span class="coordinate">25.2637° S // 57.5759° W</span>
    <div class="portrait-frame">
      <img src="{{ '/assets/images/pixel-profile.webp' | relative_url }}" alt="Pixel-art portrait of Walleson Rodrigues" width="900" height="900">
    </div>
    <div class="portrait-meta">Founder<br>DeepLookLabs</div>
  </div>
</section>

<div class="ticker" aria-hidden="true">
  <div class="ticker-track">
    <span>Faith ✦ Family ✦ Technology ✦ Bug Hunting ✦ Research ✦ Purpose ✦</span>
    <span>Faith ✦ Family ✦ Technology ✦ Bug Hunting ✦ Research ✦ Purpose ✦</span>
  </div>
</div>

<section class="section" id="territories">
  <header class="section-head" data-reveal>
    <div>
      <p class="section-index">[ 01 / TERRITORIES ]</p>
      <h2>Beyond<br>cyber.</h2>
    </div>
    <p>Technology is part of the story, not the whole story. Here I document technical and human lessons — the ideas, convictions, and people that give meaning to the path.</p>
  </header>

  <div class="topic-grid">
    <article class="topic-card" data-reveal>
      <span class="topic-number">01_A</span>
      <h3>Faith &amp; meaning</h3>
      <p>Reflections on principles, purpose, and the compass that guides decisions when there is no playbook.</p>
    </article>
    <article class="topic-card" data-reveal>
      <span class="topic-number">01_B</span>
      <h3>Family &amp; legacy</h3>
      <p>On presence, building, and everything that remains when the computer is finally closed.</p>
    </article>
    <article class="topic-card" data-reveal>
      <span class="topic-number">01_C</span>
      <h3>Technology &amp; craft</h3>
      <p>Tools, automation, code, and the choices behind work shaped by curiosity and intention.</p>
    </article>
    <article class="topic-card" data-reveal>
      <span class="topic-number">01_D</span>
      <h3>The bug hunter journey</h3>
      <p>Field stories, techniques, setbacks, and discoveries gathered while investigating the unexpected.</p>
    </article>
  </div>
</section>

<section class="lab-section" id="deeplooklabs">
  <div class="lab-inner">
    <div class="lab-symbol" data-reveal>
      <img src="{{ '/assets/images/deeplook-isotype-teal.png' | relative_url }}" alt="DeepLookLabs isotype" width="645" height="746">
    </div>
    <div class="lab-copy" data-reveal>
      <p class="eyebrow">Advanced research division</p>
      <h2>DeepLook<span>Labs.</span></h2>
      <p>I founded DeepLookLabs to take security research beyond the surface. Deep analysis, advanced research, and high-cyber work live in a dedicated space of their own.</p>
      <a class="button button-primary" href="https://deeplooklabs.com" target="_blank" rel="noopener">Visit deeplooklabs.com <span aria-hidden="true">↗</span></a>
    </div>
  </div>
</section>

<section class="section" id="latest-writing">
  <header class="section-head" data-reveal>
    <div>
      <p class="section-index">[ 02 / ARCHIVE ]</p>
      <h2>Latest<br>writing.</h2>
    </div>
    <p>Open notes on vulnerabilities, research observations, and the chapters that shape a journey.</p>
  </header>

  <div class="post-list" data-reveal>
    {% assign visible_posts = site.posts | where_exp: "post", "post.published != false" %}
    {% for post in visible_posts limit: 4 %}
      <a class="post-row" href="{{ post.url | relative_url }}">
        <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d.%m.%Y" }}</time>
        <div>
          <h3>{{ post.title }}</h3>
          <p>{{ post.subtitle | default: post.excerpt | strip_html | strip_newlines | truncate: 130 }}</p>
        </div>
        <span class="post-arrow" aria-hidden="true">↗</span>
      </a>
    {% endfor %}
  </div>

  <div class="hero-actions">
    <a class="button" href="{{ '/posts/' | relative_url }}">View the full archive <span aria-hidden="true">→</span></a>
  </div>
</section>

<section class="manifesto" data-reveal>
  <blockquote>
    “Looking deep is a technique.<br>Keeping at it is a principle.”
    <cite>Walleson Rodrigues // Phor3nsic</cite>
  </blockquote>
</section>
