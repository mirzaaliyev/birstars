// Shared logic for the two video pages (teaser on "/", main video on "/force").
(() => {
  const page = document.body.dataset.page;          // 'teaser' | 'force'
  const $ = id => document.getElementById(id);
  const box = $('player'), endcard = $('endcard'), next = $('end-next'), replay = $('end-replay');
  let ctrl = { replay() {} };

  function setText(el, text) { if (!el) return; el.textContent = text || ''; el.hidden = !text; }

  function go(url) { url === '/galaxy' && window.warpTo ? window.warpTo(url) : (location.href = url); }

  function render(s) {
    const video = page === 'teaser' ? s.teaser_video : s.force_video;
    let nextUrl = null, nextLabel = '';
    if (page === 'teaser') {
      setText($('text'), s.teaser_text);
      const cont = $('continue');
      cont.hidden = s.show_continue !== '1';
      cont.textContent = s.continue_label;
      if (s.show_continue === '1') { nextUrl = '/force'; nextLabel = s.continue_label; }
    } else {
      setText($('title'), s.force_title);
      setText($('text'), s.force_text);
      const cta = $('cta'); cta.textContent = s.force_cta; cta.hidden = !s.force_cta;
      nextUrl = '/galaxy'; nextLabel = s.force_cta || 'К звёздам';
    }
    next.hidden = !nextUrl;
    next.textContent = nextLabel;
    next.onclick = () => go(nextUrl);
    $('caption').hidden = false;
    ctrl = window.BirVideo.mountPlayer(box, video, {
      emptyText: s.video_soon,
      onEnded: () => { endcard.hidden = false; (nextUrl ? next : replay).focus(); },
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
