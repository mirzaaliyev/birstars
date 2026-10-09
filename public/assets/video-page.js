// Shared logic for the two video pages (teaser on "/", main video on "/force").
// Teaser: text and the "continue" link show right away (the link itself is switched on in the admin).
// Main video: text and the "to the stars" button appear only once the video has been watched to the
// end, so the first thing the recipient does is watch it. That fact is stored on the server, so on
// any of their devices the button is there right away afterwards.
(() => {
  const page = document.body.dataset.page;          // 'teaser' | 'force'
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const box = $('player'), endcard = $('endcard'), replay = $('end-replay'), caption = $('caption');
  let ctrl = { replay() {} };
  let preview = false;

  function markWatched() {
    if (preview) { window.BirPreview.watched.add(page); return; }   // tester/editor: this browser only
    fetch('/api/watched', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page }) }).catch(() => {});
  }

  function setText(el, text) { if (!el) return; el.textContent = text || ''; el.hidden = !text; }
  function go(url) { url === '/galaxy' && window.warpTo ? window.warpTo(url) : (location.href = url); }

  // Animated reveal (after the video ends): the page is centred vertically, so showing the caption
  // would make the player jump up. Instead the player glides from its old place to the new one
  // (FLIP), and the caption rises in just after it.
  function reveal(animate) {
    if (!caption.hidden) return;
    if (!animate || reduce) { caption.hidden = false; return; }
    const before = box.getBoundingClientRect().top;
    caption.hidden = false;
    const shift = before - box.getBoundingClientRect().top;
    if (Math.abs(shift) > 1) {
      box.style.transition = 'none';
      box.style.transform = `translateY(${shift}px)`;
      box.getBoundingClientRect();                       // commit the starting position
      box.style.transition = 'transform .9s cubic-bezier(.25, .8, .25, 1)';
      box.style.transform = '';
      box.addEventListener('transitionend', () => { box.style.transition = ''; }, { once: true });
    }
    caption.style.animationDelay = Math.abs(shift) > 1 ? '.3s' : '0s';
    caption.classList.add('reveal');
    const r = caption.getBoundingClientRect();
    if (r.bottom > innerHeight) setTimeout(() => caption.scrollIntoView({ behavior: 'smooth', block: 'end' }), 350);
  }

  function render(s, watched) {
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
    // Teaser, no video yet, or already watched: nothing to wait for.
    if (page === 'teaser' || !hasVideo || watched.includes(page)) reveal(false);

    ctrl = window.BirVideo.mountPlayer(box, video, {
      emptyText: s.video_soon,
      onEnded: () => {
        if (page === 'force') markWatched();
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
    .then(d => {
      preview = !!d.preview && !!window.BirPreview;
      if (preview) window.BirPreview.badge();
      render(d.settings, preview ? window.BirPreview.watched.get() : (d.watched || []));
    })
    .catch(e => {
      if (e === 0) return;
      const p = document.createElement('div'); p.className = 'player-empty';
      p.textContent = 'Не удалось загрузить страницу. Проверьте интернет и обновите её.';
      box.appendChild(p);
    });
})();
