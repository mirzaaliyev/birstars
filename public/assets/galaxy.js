(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const tip = $('tip');
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; };
  const starsWord = n => `${n} ${plural(n, 'звезда', 'звезды', 'звёзд')}`;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const FONT = '"Onest", system-ui, sans-serif';

  /* ---------------- palette: black sky, white stars with a faint cold tint ---------------- */
  const TINTS = ['#FFFFFF', '#EAF2FF', '#F3F6FA', '#DDE9F7'];
  const CENTER_TINT = '#E4EEFA';
  const READ_FILL = '#8A96A3';

  /* ---------------- state ---------------- */
  const state = { settings: {}, items: [], read: new Set(), loaded: false };

  /* ---------------- layout tuned by star count (30 → roomy, 120+ → dense) ---------------- */
  let P = layoutParams(30);
  function layoutParams(n) {
    const t = clamp01((n - 30) / 90);
    return {
      star: lerp(4.4, 2.6, t), centerProb: lerp(.5, .22, t), crossProb: lerp(.2, .15, t),
      linkCenter: lerp(230, 170, t), link: lerp(120, 72, t),
      chargeCenter: lerp(-900, -700, t), charge: lerp(-320, -105, t), distMax: lerp(900, 650, t),
      collideCenter: lerp(80, 55, t), collide: lerp(46, 20, t), pad: lerp(120, 160, t),
      zoomDesk: lerp(1.15, 1.5, t), zoomPhone: lerp(1.45, 1.5, t),
    };
  }

  /* ---------------- graph ---------------- */
  let nodes = [], links = [], stars = [], center = null, nbr = new Map();
  let bounds = { x0: -600, x1: 600, y0: -500, y1: 500 };
  let firstBuild = true;
  const t0 = performance.now();

  function build(items) {
    P = layoutParams(items.length);
    const now = performance.now() - t0;
    center = { id: '__center', type: 'center', name: state.settings.center_label || 'Bir', delay: 100, x: 0, y: 0, fx: 0, fy: 0 };
    const ns = [center], ls = [];
    items.forEach((it, i) => {
      const h = hashStr(it.id), r = mulberry32(h);
      const target = (i === 0 || r() < P.centerProb) ? center : ns[1 + Math.floor(r() * (ns.length - 1))];
      const a = r() * 6.283, d = 40 + r() * 60;
      const s = {
        id: it.id, type: 'star', name: it.name, role: it.role || '', msg: it.text,
        tint: TINTS[h % TINTS.length], size: .8 + r() * .7, phase: r() * 6.283, speed: .6 + r() * 1.2,
        x: target.x + Math.cos(a) * d, y: target.y + Math.sin(a) * d, delay: null,
      };
      ns.push(s); ls.push({ source: s, target });
      if (ns.length > 6 && r() < P.crossProb) {
        const t2 = ns[1 + Math.floor(r() * (ns.length - 2))];
        if (t2 !== target && t2 !== s) ls.push({ source: s, target: t2 });
      }
    });
    const sim = d3.forceSimulation(ns)
      .force('link', d3.forceLink(ls).distance(l => l.target.type === 'center' ? P.linkCenter : P.link).strength(.55))
      .force('charge', d3.forceManyBody().strength(d => d.type === 'center' ? P.chargeCenter : P.charge).distanceMax(P.distMax))
      .force('x', d3.forceX(0).strength(.03))
      .force('y', d3.forceY(0).strength(.03))
      .force('collide', d3.forceCollide(d => d.type === 'center' ? P.collideCenter : P.collide))
      .stop();
    for (let i = 0; i < 500; i++) sim.tick();
    ns.forEach(n => { if (n.delay == null) n.delay = now + 250 + Math.hypot(n.x, n.y) * .55 + Math.random() * 350; });

    nodes = ns; links = ls; stars = ns.filter(n => n.type === 'star');
    nbr = new Map(ns.map(n => [n, new Set()]));
    ls.forEach(l => { nbr.get(l.source).add(l.target); nbr.get(l.target).add(l.source); });
    bounds = {
      x0: d3.min(ns, n => n.x) - P.pad, x1: d3.max(ns, n => n.x) + P.pad,
      y0: d3.min(ns, n => n.y) - P.pad, y1: d3.max(ns, n => n.y) + P.pad,
    };
    updateExtent();
    if (firstBuild) {
      const fk = fitTransform(1).k, k0 = fk * (W <= 600 ? P.zoomPhone : P.zoomDesk);
      sel.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k0));
      firstBuild = false;
    }
  }

  /* ---------------- canvas / zoom ---------------- */
  const canvas = $('sky'), ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, t = d3.zoomIdentity;
  const sel = d3.select(canvas);
  const zoom = d3.zoom()
    .clickDistance(6)
    .on('start', e => { if (e.sourceEvent && e.sourceEvent.type !== 'wheel') canvas.classList.add('dragging'); })
    .on('zoom', e => { t = e.transform; hideTip(); })
    .on('end', () => canvas.classList.remove('dragging'));

  function fitTransform(factor) {
    const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
    const k = Math.min(W / bw, H / bh) * factor;
    const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
    return d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-cx, -cy);
  }
  function updateExtent() {
    const fk = fitTransform(1).k;
    zoom.scaleExtent([fk * .8, Math.max(5, fk * 12)]);
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    updateExtent();
  }
  resize();
  sel.call(zoom).on('dblclick.zoom', null).on('wheel.zoom', null);
  sel.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(.7));
  addEventListener('resize', resize);

  // Trackpad: two-finger scroll pans, pinch zooms. Mouse wheel zooms.
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const pinch = e.ctrlKey;
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 100 && Number.isInteger(e.deltaY));
    if (pinch || mouseWheel) {
      const rate = e.deltaMode === 1 ? .05 : (pinch ? .012 : .002);
      zoom.scaleBy(sel, Math.pow(2, -e.deltaY * rate), d3.pointer(e, canvas));
    } else {
      zoom.translateBy(sel, -e.deltaX / t.k, -e.deltaY / t.k);
    }
  }, { passive: false });

  $('zin').onclick = () => sel.transition().duration(reduce ? 0 : 320).call(zoom.scaleBy, 1.6);
  $('zout').onclick = () => sel.transition().duration(reduce ? 0 : 320).call(zoom.scaleBy, 1 / 1.6);
  $('zfit').onclick = () => sel.transition().duration(reduce ? 0 : 700).call(zoom.transform, fitTransform(.95));

  /* ---------------- sprites & dust ---------------- */
  const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const sprites = new Map();
  function sprite(tint) {
    if (sprites.has(tint)) return sprites.get(tint);
    const s = document.createElement('canvas'); s.width = s.height = 128;
    const g = s.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, hexA(tint, .85)); gr.addColorStop(.14, hexA(tint, .36));
    gr.addColorStop(.45, hexA(tint, .07)); gr.addColorStop(1, hexA(tint, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    sprites.set(tint, s); return s;
  }
  const dust = Array.from({ length: 700 }, () => ({ x: Math.random(), y: Math.random(), z: .12 + Math.random() * .45, r: .2 + Math.random() * 1.05, a: .1 + Math.random() * .45, ph: Math.random() * 6.28 }));

  /* ---------------- hit testing ---------------- */
  let hover = null, focus = null, current = null, lastFocusEl = null;
  const toScreen = n => [n.x * t.k + t.x, n.y * t.k + t.y];
  function hit(px, py, touch) {
    const wx = (px - t.x) / t.k, wy = (py - t.y) / t.k;
    const rad = (touch ? 30 : 22) / t.k;
    let best = null, bd = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      const vis = n.type === 'center' ? Math.max(8, 5 / t.k) * 2.4 : Math.max(P.star * n.size, 3 / t.k) * 2.5;
      const lim = Math.max(rad, vis);
      if (d < lim && d < bd) { best = n; bd = d; }
    }
    return best;
  }
  function showTip(n) {
    const [sx, sy] = toScreen(n);
    tip.textContent = n.name; tip.style.left = sx + 'px'; tip.style.top = sy + 'px'; tip.hidden = false;
  }
  function hideTip() { tip.hidden = true; }
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const n = hit(e.clientX, e.clientY, false);
    if (n !== hover) { hover = n; canvas.classList.toggle('pointer', !!n); }
    n ? showTip(n) : hideTip();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; hideTip(); canvas.classList.remove('pointer'); });

  // Own tap detection: d3-zoom swallows the native click when a finger or trackpad moves a pixel or two.
  const downs = new Map();
  let lastOpenAt = 0;
  canvas.addEventListener('pointerdown', e => {
    downs.set(e.pointerId, { x: e.clientX, y: e.clientY, at: performance.now(), multi: downs.size > 0 });
    if (downs.size > 1) downs.forEach(d => d.multi = true);
  });
  canvas.addEventListener('pointercancel', e => downs.delete(e.pointerId));
  addEventListener('pointerup', e => {
    const d = downs.get(e.pointerId);
    downs.delete(e.pointerId);
    if (!d || d.multi || e.button > 0 || !modal.hidden || !confirmEl.hidden) return;
    const touch = e.pointerType !== 'mouse';
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > (touch ? 14 : 10) || performance.now() - d.at > 800) return;
    const n = hit(d.x, d.y, touch);
    if (n) openStar(n);
  });
  sel.on('click.star', e => {
    if (performance.now() - lastOpenAt < 600 || !modal.hidden) return;
    const n = hit(e.clientX, e.clientY, false);
    if (n) openStar(n);
  });

  /* ---------------- server ---------------- */
  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    if (r.status === 401) { location.reload(); throw new Error('auth'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Ошибка сервера');
    return d;
  }
  // Marks are saved one by one in the background; a failed save is retried on the next open.
  const pending = new Set();
  async function saveRead(id) {
    pending.add(id);
    try { await api('/api/read', { method: 'POST', body: JSON.stringify({ id }) }); pending.delete(id); }
    catch (e) { if (e.message !== 'auth') flash('Не удалось сохранить прогресс. Проверьте интернет.'); }
  }
  addEventListener('online', () => pending.forEach(saveRead));

  const readCount = () => stars.reduce((a, s) => a + (state.read.has(s.id) ? 1 : 0), 0);

  /* ---------------- HUD ---------------- */
  const progressEl = $('progress');
  function updateHud() {
    const n = stars.length;
    $('title').textContent = n ? `${starsWord(n)} ${state.settings.galaxy_title || ''}`.trim() : ' ';
    $('lead').textContent = n ? (state.settings.galaxy_lead || '') : '';
    progressEl.hidden = $('random').hidden = n === 0;
    $('empty').hidden = n > 0;
    if (!n) { $('empty-text').textContent = 'Звёзды скоро появятся.'; $('retry').hidden = true; }
    updateProgress();
  }
  function updateProgress() {
    const n = stars.length, r = readCount();
    progressEl.innerHTML = r >= n ? `Прочитаны все ${n}` : `Прочитано <b>${r}</b> из ${n}`;
    $('reset').hidden = r === 0;
  }

  let flashTimer = null;
  function flash(text) {
    const el = $('status'); el.textContent = text; el.hidden = false;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => el.hidden = true, 3600);
  }

  /* ---------------- message card ---------------- */
  const modal = $('modal'), card = $('card'), nextBtn = $('m-next');
  function openStar(n) {
    lastOpenAt = performance.now();
    current = n; focus = n; hideTip();
    const isCenter = n.type === 'center';
    const s = state.settings;
    card.classList.toggle('center', isCenter);
    $('m-msg').textContent = isCenter ? s.center_text : n.msg;
    $('m-name').textContent = isCenter ? s.center_from : n.name;
    $('m-role').textContent = isCenter ? '' : n.role;
    $('m-role').hidden = !$('m-role').textContent;
    $('m-name').hidden = !$('m-name').textContent;
    if (!isCenter && !state.read.has(n.id)) { state.read.add(n.id); saveRead(n.id); updateProgress(); }
    // While unread stars remain the button leads to the nearest one; once all are read it picks a random star.
    const left = stars.some(x => !state.read.has(x.id));
    nextBtn.textContent = !left ? 'Случайная звезда' : isCenter ? 'Перейти к звёздам' : 'Следующая звезда';
    nextBtn.hidden = left ? false : stars.filter(x => x !== n).length === 0;
    lastFocusEl = document.activeElement;
    modal.hidden = false;
    scroller.scrollTop = 0;
    requestAnimationFrame(updateMore);
    modal.querySelector('.close').focus();
  }
  // Fade the bottom edge of a long text while there is more of it to scroll.
  const scroller = $('m-scroll');
  function updateMore() { scroller.classList.toggle('more', scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 4); }
  scroller.addEventListener('scroll', updateMore, { passive: true });
  addEventListener('resize', () => { if (!modal.hidden) updateMore(); });
  function closeModal(restore = true) {
    modal.hidden = true; focus = null;
    if (restore && lastFocusEl && lastFocusEl.focus) lastFocusEl.focus();
  }
  // The tap that opened the card also produces a click on the backdrop beneath the finger: ignore it.
  modal.addEventListener('click', e => { if (performance.now() - lastOpenAt < 450) return; if (e.target.closest('[data-close]')) closeModal(); });

  function flyTo(n, then) {
    const k = Math.max(t.k, 1.7);
    const cy = W <= 600 ? H * .3 : H / 2;
    const target = d3.zoomIdentity.translate(W / 2, cy).scale(k).translate(-n.x, -n.y);
    focus = n;
    if (reduce) { sel.call(zoom.transform, target); then && then(); return; }
    sel.transition().duration(1150).ease(d3.easeCubicInOut).call(zoom.transform, target).on('end', () => then && then());
  }
  $('random').onclick = () => {
    const unread = stars.filter(s => !state.read.has(s.id));
    const pool = unread.length ? unread : stars;
    if (!pool.length) return;
    const n = pool[Math.floor(Math.random() * pool.length)];
    flyTo(n, () => openStar(n));
  };
  nextBtn.onclick = () => {
    const from = current || center;
    const unread = stars.filter(s => !state.read.has(s.id));
    let n;
    if (unread.length) {
      let bd = Infinity;
      for (const s of unread) { const d = Math.hypot(s.x - from.x, s.y - from.y); if (d < bd) { bd = d; n = s; } }
    } else {
      const pool = stars.filter(s => s !== current);
      if (!pool.length) return;
      n = pool[Math.floor(Math.random() * pool.length)];
    }
    closeModal(false);
    flyTo(n, () => openStar(n));
  };

  /* ---------------- confirm ---------------- */
  const confirmEl = $('confirm');
  let confirmResolve = null;
  function askConfirm({ title, text, ok }) {
    $('c-title').textContent = title; $('c-text').textContent = text; $('c-ok').textContent = ok;
    const prevFocus = document.activeElement;
    confirmEl.hidden = false;
    confirmEl.querySelector('.btn[data-cancel]').focus();
    return new Promise(res => {
      confirmResolve = v => { confirmEl.hidden = true; confirmResolve = null; if (prevFocus && prevFocus.focus) prevFocus.focus(); res(v); };
    });
  }
  confirmEl.addEventListener('click', e => { if (e.target.closest('[data-cancel]') && confirmResolve) confirmResolve(false); });
  $('c-ok').onclick = () => confirmResolve && confirmResolve(true);

  $('reset').onclick = async () => {
    const r = readCount();
    const ok = await askConfirm({
      title: 'Сбросить прочитанное?',
      text: `${starsWord(r)} снова ${r === 1 ? 'станет непрочитанной' : 'станут непрочитанными'} — на всех устройствах.`,
      ok: 'Сбросить',
    });
    if (!ok) return;
    try { await api('/api/read/reset', { method: 'POST', body: '{}' }); state.read.clear(); updateProgress(); }
    catch (e) { if (e.message !== 'auth') flash('Не удалось сбросить. Попробуйте ещё раз.'); }
  };

  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!confirmEl.hidden && confirmResolve) return confirmResolve(false);
    if (!modal.hidden) return closeModal();
  });

  /* ---------------- load ---------------- */
  async function load() {
    $('empty').hidden = true;
    try {
      const d = await api('/api/content');
      state.settings = d.settings; state.items = d.stars; state.read = new Set(d.read); state.loaded = true;
      build(state.items);
      updateHud();
    } catch (e) {
      if (e.message === 'auth') return;
      $('empty').hidden = false; $('empty-text').textContent = 'Не удалось загрузить звёзды. Проверьте интернет.'; $('retry').hidden = false;
    }
  }
  $('retry').onclick = load;
  if (window.warpArrive) window.warpArrive();
  load();

  /* ---------------- render loop ---------------- */
  const appear = (n, time) => reduce ? 1 : Math.max(0, Math.min(1, (time * 1000 - n.delay) / 700));

  function frame(now) {
    const time = (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    const bg = ctx.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .45, Math.max(W, H) * .8);
    bg.addColorStop(0, 'hsl(210, 32%, 8%)'); bg.addColorStop(1, 'hsl(212, 30%, 3%)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#E2EAF4';
    for (const d of dust) {
      const x = ((d.x * W + t.x * d.z) % W + W) % W;
      const y = ((d.y * H + t.y * d.z) % H + H) % H;
      ctx.globalAlpha = reduce ? d.a : d.a * (.65 + .35 * Math.sin(time * 1.2 + d.ph));
      ctx.beginPath(); ctx.arc(x, y, d.r, 0, 6.2832); ctx.fill();
    }

    if (state.loaded && center) {
      const active = focus || hover;
      const act = active ? nbr.get(active) : null;
      const dimmed = n => active && act && n !== active && !act.has(n);

      ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
      ctx.lineWidth = 1 / t.k;
      ctx.strokeStyle = '#D6E2F0';
      for (const l of links) {
        const ap = Math.min(appear(l.source, time), appear(l.target, time));
        if (ap <= 0) continue;
        let a = l.target.type === 'center' ? .11 : .15;
        if (active) a = (l.source === active || l.target === active) ? .55 : .04;
        ctx.globalAlpha = a * ap;
        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); ctx.stroke();
      }

      // central star
      {
        const ap = appear(center, time);
        const r = Math.max(8, 5 / t.k) * (hover === center || focus === center ? 1.2 : 1);
        const pulse = reduce ? 1 : .88 + .12 * Math.sin(time * .8);
        ctx.globalAlpha = ap * pulse;
        const g = r * 9;
        ctx.drawImage(sprite(CENTER_TINT), center.x - g, center.y - g, g * 2, g * 2);
        ctx.globalAlpha = ap;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(center.x, center.y, r, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = ap * .3; ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(center.x, center.y, r * 2.4, 0, 6.2832); ctx.stroke();
      }

      for (const s of stars) {
        const ap = appear(s, time); if (ap <= 0) continue;
        const isRead = state.read.has(s.id);
        let a = isRead ? .42 : 1;
        if (!reduce && !isRead) a *= .8 + .2 * Math.sin(time * s.speed + s.phase);
        if (dimmed(s)) a *= .28;
        const big = (s === hover || s === focus) ? 1.6 : 1;
        const r = Math.max(P.star * s.size, 3 / t.k) * big;
        const g = r * (isRead ? 3.2 : 6.5);
        ctx.globalAlpha = a * ap * (isRead ? .35 : 1);
        ctx.drawImage(sprite(s.tint), s.x - g, s.y - g, g * 2, g * 2);
        ctx.globalAlpha = a * ap;
        ctx.fillStyle = isRead ? READ_FILL : '#FFFFFF';
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.2832); ctx.fill();
        if (s === focus && !reduce) {
          const p = (time * 1.2) % 1;
          ctx.globalAlpha = (1 - p) * .7; ctx.strokeStyle = '#FFFFFF';
          ctx.beginPath(); ctx.arc(s.x, s.y, r * (2 + p * 4), 0, 6.2832); ctx.stroke();
        }
      }

      // labels: names only; they appear once neighbouring stars are far enough apart on screen
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center';
      {
        const [sx, sy] = toScreen(center);
        const r = Math.max(8 * t.k, 5);
        ctx.globalAlpha = .92 * appear(center, time);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `500 16px ${FONT}`;
        ctx.fillText(center.name, sx, sy + r * 2.4 + 24);
      }
      const nameA = Math.max(0, Math.min(.85, (t.k * P.link - 85) / 35));
      if (nameA > 0) {
        ctx.font = `400 13px ${FONT}`;
        ctx.fillStyle = '#E8EEF5';
        for (const s of stars) {
          const [sx, sy] = toScreen(s);
          if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 40) continue;
          const r = Math.max(P.star * s.size * t.k, 3);
          ctx.globalAlpha = nameA * appear(s, time) * (state.read.has(s.id) ? .5 : 1) * (dimmed(s) ? .3 : 1);
          ctx.fillText(s.name, sx, sy + r + 18);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
