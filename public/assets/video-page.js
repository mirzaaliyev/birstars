// Shared logic for the two video pages (teaser on "/", main video on "/force").
// The text and buttons under the video appear only after the video has been watched to the end,
// so the first thing the recipient does is watch it. On a later visit from the same device they
// show right away.
(() => {
  const page = document.body.dataset.page;          // 'teaser' | 'force'
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const box = $('player'), endcard = $('endcard'), replay = $('end-replay'), caption = $('caption');
  const WATCHED = `birstars-watched-${page}`;
  let ctrl = { replay() {} };

  const watched = () => { try { return localStorage.getItem(WATCHED) === '1'; } catch (_) { return false; } };
  const markWatched = () => { try { localStorage.setItem(WATCHED, '1'); } catch (_) {} };

  function setText(el, text) { if (!el) return; el.textContent = text || ''; el.hidden = !text; }
  function go(url) { url === '/galaxy' && window.warpTo ? window.warpTo(url) : (location.href = url); }

  function reveal(animate) {
    if (!caption.hidden) return;
    caption.hidden = false;
    if (animate && !reduce) {
      caption.classList.add('reveal');
      const r = caption.getBoundingClientRect();
      if (r.bottom > innerHeight) caption.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  function render(s) {
    const video = page === 'teaser' ? s.teaser_video : s.force_video;
    if (page === 'teaser') {
      setText($('text'), s.teaser_text);
      const cont = $('continue');
      cont.hidden = s.show_continue !== '1';
      cont.textContent = s.continue_label;
    } else {
      setText($('title'), s.force_title);
      setText($('text'), s.force_text);
      const cta = $('cta'); cta.textContent = s.force_cta; cta.hidden = !s.force_cta;
    }
    const hasVideo = !!window.BirVideo.parseVideo(video);
    // No video yet, or already watched on this device: nothing to wait for.
    if (!hasVideo || watched()) reveal(false);

    ctrl = window.BirVideo.mountPlayer(box, video, {
      emptyText: s.video_soon,
      onEnded: () => {
        markWatched();
        endcard.hidden = false;
        reveal(true);
        const primary = page === 'teaser' ? $('continue') : $('cta');
        (primary && !primary.hidden ? primary : replay).focus({ preventScroll: true });
      },
      // If the end can't be detected, don't hide the way forward.
      onUnavailable: () => reveal(false),
    });
  }

  replay.onclick = () => { endcard.hidden = true; ctrl.replay(); };
  const cta = $('cta'); if (cta) cta.onclick = () => go('/galaxy');

  fetch('/api/content', { headers: { Accept: 'application/json' } })
    .then(r => { if (r.status === 401) { location.reload(); throw 0; } return r.json(); })
    .then(d => render(d.settings))
    .catch(e => {
      if (e === 0) return;
      const p = document.createElement('div'); p.className = 'player-empty';
      p.textContent = 'Не удалось загрузить страницу. Проверьте интернет и обновите её.';
      box.appendChild(p);
    });
})();
