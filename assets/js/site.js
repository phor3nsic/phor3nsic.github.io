(() => {
  const body = document.body;
  const cursor = document.querySelector('.pixel-cursor');
  const finePointer = window.matchMedia('(pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (cursor && finePointer.matches && !reducedMotion.matches) {
    body.classList.add('has-custom-cursor');

    window.addEventListener('pointermove', (event) => {
      cursor.style.setProperty('--cursor-x', `${event.clientX}px`);
      cursor.style.setProperty('--cursor-y', `${event.clientY}px`);
      cursor.classList.add('is-visible');
    });

    document.querySelectorAll('a, button').forEach((element) => {
      element.addEventListener('pointerenter', () => cursor.classList.add('is-active'));
      element.addEventListener('pointerleave', () => cursor.classList.remove('is-active'));
    });

    document.addEventListener('pointerleave', () => cursor.classList.remove('is-visible'));
  }

  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.site-nav');

  if (menuButton && navigation) {
    menuButton.addEventListener('click', () => {
      const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!isOpen));
      navigation.classList.toggle('is-open', !isOpen);
    });

    navigation.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        menuButton.setAttribute('aria-expanded', 'false');
        navigation.classList.remove('is-open');
      });
    });
  }

  const revealItems = document.querySelectorAll('[data-reveal]');

  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-revealed'));
  }

  const likePanel = document.querySelector('[data-like-post]');

  if (likePanel) {
    const likeButton = likePanel.querySelector('[data-like-button]');
    const likeCount = likePanel.querySelector('[data-like-count]');
    const likeLabel = likePanel.querySelector('[data-like-label]');
    const likeStatus = likePanel.querySelector('[data-like-status]');
    const config = window.PHOR3NSIC_SUPABASE || {};
    const postSlug = likePanel.dataset.likePost;
    const postTitle = likePanel.dataset.likeTitle || document.title;

    const getVisitorId = () => {
      const storageKey = 'phor3nsic-anonymous-visitor';
      try {
        let visitorId = window.localStorage.getItem(storageKey);
        if (!visitorId) {
          visitorId = window.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          window.localStorage.setItem(storageKey, visitorId);
        }
        return visitorId;
      } catch (error) {
        return window.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    };

    const supabaseRpc = async (functionName, payload) => {
      if (!config.url || !config.key) throw new Error('Like service is not configured');

      const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          'Accept-Profile': 'public',
          'Content-Profile': 'public'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`Like service returned ${response.status}`);
      return response.json();
    };

    const renderLikes = (count, liked) => {
      likeCount.textContent = String(count);
      likeButton.classList.toggle('is-liked', liked);
      likeButton.setAttribute('aria-pressed', String(liked));
      likeLabel.textContent = liked ? 'Liked' : 'Like this post';
    };

    const setLikeStatus = (message) => {
      likeStatus.textContent = message;
    };

    const visitorId = getVisitorId();
    likeButton.disabled = true;

    supabaseRpc('get_post_like_count', { p_post_slug: postSlug })
      .then((count) => {
        renderLikes(Number(count) || 0, false);
        setLikeStatus('Anonymous likes · one per browser');
        likeButton.disabled = false;
      })
      .catch(() => {
        likeCount.textContent = '—';
        setLikeStatus('Likes are temporarily unavailable.');
      });

    likeButton.addEventListener('click', async () => {
      likeButton.disabled = true;
      setLikeStatus('Saving…');

      try {
        const result = await supabaseRpc('toggle_post_like', {
          p_post_slug: postSlug,
          p_visitor_id: visitorId,
          p_post_title: postTitle
        });
        const state = Array.isArray(result) ? result[0] : result;
        renderLikes(Number(state.like_count) || 0, Boolean(state.liked));
        setLikeStatus(state.liked ? 'Thanks for the signal.' : 'Like removed.');
      } catch (error) {
        setLikeStatus('Could not save your like. Please try again.');
      } finally {
        likeButton.disabled = false;
      }
    });
  }

  document.querySelectorAll('[data-share-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = button.dataset.shareUrl || window.location.href;
      const label = button.querySelector('[data-share-copy-label]');
      const status = button.parentElement.querySelector('[data-share-status]');

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(url);
        } else {
          const temporaryInput = document.createElement('textarea');
          temporaryInput.value = url;
          temporaryInput.setAttribute('readonly', '');
          temporaryInput.style.position = 'fixed';
          temporaryInput.style.opacity = '0';
          document.body.appendChild(temporaryInput);
          temporaryInput.select();
          document.execCommand('copy');
          temporaryInput.remove();
        }

        if (label) label.textContent = 'Copied!';
        if (status) status.textContent = 'Post link copied to clipboard.';

        window.setTimeout(() => {
          if (label) label.textContent = 'Copy link';
          if (status) status.textContent = '';
        }, 2200);
      } catch (error) {
        if (status) status.textContent = 'Could not copy the link. Please copy it from the address bar.';
      }
    });
  });
})();
