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
  // The centre of the sky is the Bir mark (transparent background).
  const logo = new Image();
  logo.src = '/assets/logo-sky.svg';
  const logoReady = () => logo.complete && logo.naturalWidth > 0;
  // World-space radius of the logo; never smaller than 22 px on screen.
  const centerR = () => Math.max(28, 22 / t.k);
  const READ_FILL = '#8A96A3';

  // Star icons (public/assets/icons.js): each SVG is pre-rendered in its colour and its read colour.
  const ICON_PX = 96;
  const icons = new Map();
  for (const ic of (window.BirIcons || [])) {
    const img = new Image();
    const entry = { ...ic, ready: false, lit: null, dim: null, url: '' };
    img.onload = () => {
      const tint = color => {
        const c = document.createElement('canvas'); c.width = c.height = ICON_PX;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, ICON_PX, ICON_PX);
        g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, ICON_PX, ICON_PX);
        return c;
      };
      entry.lit = tint(ic.color || '#FFFFFF'); entry.dim = tint(ic.readColor || READ_FILL);
      entry.url = entry.lit.toDataURL(); entry.ready = true;
    };
    img.src = ic.src;
    icons.set(ic.id, entry);
  }

  /* ---------------- state ---------------- */
  const state = { settings: {}, items: [], read: new Set(), loaded: false, preview: false };

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

  // Layout runs in a worker (falls back to the main thread), so the hyperspace arrival keeps its frame rate.
  let worker = null, workerSeq = 0;
  const waiting = new Map();
  try {
    worker = new Worker('/assets/layout-worker.js');
    worker.onmessage = e => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data.pos); } };
    worker.onerror = () => { worker = null; waiting.forEach(w => w(null)); waiting.clear(); };
  } catch (_) { worker = null; }
  function layoutPositions(P, nodes, links) {
    const sync = () => window.birLayout(d3, P, nodes, links);
    if (!worker) return Promise.resolve(sync());
    return new Promise(resolve => {
      const id = ++workerSeq;
      const timer = setTimeout(() => { if (waiting.delete(id)) resolve(null); }, 4000);
      waiting.set(id, pos => { clearTimeout(timer); resolve(pos); });
      worker.postMessage({ id, P, nodes, links });
    }).then(pos => pos || sync());
  }

  let buildSeq = 0;
  async function build(items) {
    const my = ++buildSeq;
    P = layoutParams(items.length);
    center = { id: '__center', type: 'center', name: state.settings.center_label || 'Bir', label: state.settings.center_label || '', delay: 100, x: 0, y: 0, fx: 0, fy: 0 };
    const ns = [center], ls = [];
    items.forEach((it, i) => {
      const h = hashStr(it.id), r = mulberry32(h);
      const target = (i === 0 || r() < P.centerProb) ? center : ns[1 + Math.floor(r() * (ns.length - 1))];
      const a = r() * 6.283, d = 40 + r() * 60;
      const s = {
        id: it.id, type: 'star', name: it.name, role: it.role || '', msg: it.text, video: it.video || '', icon: it.icon || '',
        tint: TINTS[h % TINTS.length], size: .8 + r() * .7, phase: r() * 6.283, speed: .6 + r() * 1.2,
        x: target.x + Math.cos(a) * d, y: target.y + Math.sin(a) * d, delay: null,
      };
      ns.push(s); ls.push({ source: s, target });
      if (ns.length > 6 && r() < P.crossProb) {
        const t2 = ns[1 + Math.floor(r() * (ns.length - 2))];
        if (t2 !== target && t2 !== s) ls.push({ source: s, target: t2 });
      }
    });
    const index = new Map(ns.map((n, i) => [n, i]));
    const pos = await layoutPositions(P,
      ns.map(n => ({ c: n.type === 'center', x: n.x, y: n.y })),
      ls.map(l => [index.get(l.source), index.get(l.target)]));
    if (my !== buildSeq) return false;
    ns.forEach((n, i) => { n.x = pos[i][0]; n.y = pos[i][1]; });
    const now = performance.now() - t0;
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
    return true;
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
  // k: glow strength (coloured icon halos are a bit stronger so the colour reads on a small star).
  function sprite(tint, k = 1) {
    const key = tint + k;
    if (sprites.has(key)) return sprites.get(key);
    const s = document.createElement('canvas'); s.width = s.height = 128;
    const g = s.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, hexA(tint, Math.min(1, .85 * k))); gr.addColorStop(.14, hexA(tint, .36 * k));
    gr.addColorStop(.45, hexA(tint, .07 * k)); gr.addColorStop(1, hexA(tint, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    sprites.set(key, s); return s;
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
      const vis = n.type === 'center' ? centerR() : Math.max(P.star * n.size, 3 / t.k) * 2.5;
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
    if (n) { flight++; openStar(n); }
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
    if (state.preview) { window.BirPreview.reads.add(id); return; }   // tester/editor: this browser only
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
  const videoBox = $('m-video'), mark = card.querySelector('.mark');
  const stopVideo = () => { videoBox.textContent = ''; };
  function openStar(n) {
    lastOpenAt = performance.now();
    current = n; focus = n; hideTip();
    const isCenter = n.type === 'center';
    const s = state.settings;
    card.classList.toggle('center', isCenter);
    // Video greeting: vertical player above a short caption.
    const hasVideo = !isCenter && !!(n.video && window.BirVideo && window.BirVideo.parseVideo(n.video));
    card.classList.toggle('has-video', hasVideo);
    videoBox.textContent = ''; videoBox.hidden = !hasVideo;
    if (hasVideo) window.BirVideo.mountPlayer(videoBox, n.video, {});
    const ic = !isCenter && n.icon && icons.get(n.icon);
    mark.classList.toggle('icon', !!ic);
    mark.style.backgroundImage = ic ? `url("${ic.url || ic.src}")` : '';
    mark.style.setProperty('--glow', ic && ic.glow ? ic.glow : '');
    const msg = isCenter ? s.center_text : n.msg;
    $('m-msg').textContent = msg;
    $('m-msg').hidden = !msg;
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
    clearTimeout(closeTimer); modal.classList.remove('closing');
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
  // Closing plays a short fade/slide before the card is hidden.
  let closeTimer = null;
  function closeModal(restore = true) {
    focus = null;
    stopVideo();
    clearTimeout(closeTimer);
    if (reduce) modal.hidden = true;
    else {
      modal.classList.add('closing');
      closeTimer = setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); }, 200);
    }
    if (restore && lastFocusEl && lastFocusEl.focus) lastFocusEl.focus();
  }
  // The tap that opened the card also produces a click on the backdrop beneath the finger: ignore it.
  modal.addEventListener('click', e => { if (performance.now() - lastOpenAt < 450) return; if (e.target.closest('[data-close]')) closeModal(); });

  // A newer flight or a direct tap on a star cancels the pending "open on arrival".
  let flight = 0;
  function flyTo(n, then) {
    const my = ++flight;
    const done = () => { if (my === flight && then) then(); };
    const k = Math.max(t.k, 1.7);
    const cy = W <= 600 ? H * .3 : H / 2;
    const target = d3.zoomIdentity.translate(W / 2, cy).scale(k).translate(-n.x, -n.y);
    focus = n;
    if (reduce) { sel.call(zoom.transform, target); done(); return; }
    sel.transition().duration(1150).ease(d3.easeCubicInOut).call(zoom.transform, target).on('end', done);
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
      text: `${starsWord(r)} снова ${r === 1 ? 'станет непрочитанной' : 'станут непрочитанными'} — ${state.preview ? 'только в этом браузере' : 'на всех устройствах'}.`,
      ok: 'Сбросить',
    });
    if (!ok) return;
    if (state.preview) { window.BirPreview.reads.set([]); state.read.clear(); updateProgress(); return; }
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
      state.settings = d.settings; state.items = d.stars; state.loaded = true;
      state.preview = !!d.preview && !!window.BirPreview;
      state.read = new Set(state.preview ? window.BirPreview.reads.get() : d.read);
      if (state.preview) window.BirPreview.badge();
      if (!(await build(state.items))) return;
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

  // Hover / focus / dimming are eased per frame instead of switching instantly.
  let lastNow = performance.now();
  const ease = (v, target, k) => v + (target - v) * k;

  function frame(now) {
    const time = (now - t0) / 1000;
    const dt = Math.min(.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 11);   // ~200 ms to settle
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
      // Hover / focus highlights only the star itself: its links and neighbours stay as they are,
      // so no star looks more important for being connected to another.
      for (const n of nodes) {
        n.hv = ease(n.hv || 0, (n === hover || n === focus) ? 1 : 0, k);                  // 0..1 highlighted
        n.dm = 0;
      }

      ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
      ctx.lineWidth = 1 / t.k;
      ctx.strokeStyle = '#D6E2F0';
      for (const l of links) {
        const ap = Math.min(appear(l.source, time), appear(l.target, time));
        if (ap <= 0) continue;
        ctx.globalAlpha = (l.target.type === 'center' ? .11 : .15) * ap;
        // lines to the centre stop at the edge of the logo instead of running through it
        let x2 = l.target.x, y2 = l.target.y;
        if (l.target.type === 'center') {
          const dx = l.source.x - x2, dy = l.source.y - y2, d = Math.hypot(dx, dy) || 1, cut = centerR() * 1.12;
          if (d <= cut) continue;
          x2 += dx / d * cut; y2 += dy / d * cut;
        }
        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(x2, y2); ctx.stroke();
      }

      // central star
      {
        const ap = appear(center, time);
        const R = centerR() * (1 + .08 * center.hv);
        const pulse = reduce ? 1 : .8 + .2 * Math.sin(time * .8);
        ctx.globalAlpha = ap * pulse * .9;
        const g = R * 3.4;
        ctx.drawImage(sprite(CENTER_TINT), center.x - g, center.y - g, g * 2, g * 2);
        ctx.globalAlpha = ap;
        if (logoReady()) {
          ctx.drawImage(logo, center.x - R, center.y - R, R * 2, R * 2);
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath(); ctx.arc(center.x, center.y, R * .3, 0, 6.2832); ctx.fill();
        }
      }

      for (const s of stars) {
        const ap = appear(s, time); if (ap <= 0) continue;
        const isRead = state.read.has(s.id);
        let a = isRead ? .42 : 1;
        if (!reduce && !isRead) a *= .8 + .2 * Math.sin(time * s.speed + s.phase);
        a *= 1 - .72 * s.dm;
        const big = 1 + .6 * s.hv;
        const r = Math.max(P.star * s.size, 3 / t.k) * big;
        const ic = s.icon && icons.get(s.icon);
        const warm = ic && ic.glow;                      // coloured halo, e.g. the family hearts
        const g = r * (isRead ? 3.2 : 6.5) * (warm ? 1.3 : 1);
        ctx.globalAlpha = a * ap * (isRead ? .35 : 1);
        ctx.drawImage(warm ? sprite(ic.glow, 1.25) : sprite(s.tint), s.x - g, s.y - g, g * 2, g * 2);
        ctx.globalAlpha = a * ap;
        if (ic && ic.ready) {
          const side = Math.max(r * 3.2, 12 / t.k);
          ctx.drawImage(isRead ? ic.dim : ic.lit, s.x - side / 2, s.y - side / 2, side, side);
        } else {
          ctx.fillStyle = isRead ? READ_FILL : '#FFFFFF';
          ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.2832); ctx.fill();
        }
        if (s === focus && !reduce) {
          const p = (time * 1.2) % 1;
          ctx.globalAlpha = (1 - p) * .7; ctx.strokeStyle = '#FFFFFF';
          ctx.beginPath(); ctx.arc(s.x, s.y, r * (2 + p * 4), 0, 6.2832); ctx.stroke();
        }
      }

      // labels: names only; they appear once neighbouring stars are far enough apart on screen
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center';
      if (center.label) {
        const [sx, sy] = toScreen(center);
        ctx.globalAlpha = .92 * appear(center, time);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `500 16px ${FONT}`;
        ctx.fillText(center.label, sx, sy + centerR() * t.k + 26);
      }
      const nameA = Math.max(0, Math.min(.85, (t.k * P.link - 85) / 35));
      if (nameA > 0) {
        ctx.font = `400 13px ${FONT}`;
        ctx.fillStyle = '#E8EEF5';
        for (const s of stars) {
          const [sx, sy] = toScreen(s);
          if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 40) continue;
          const r = Math.max(P.star * s.size * t.k, 3);
          ctx.globalAlpha = nameA * appear(s, time) * (state.read.has(s.id) ? .5 : 1) * (1 - .7 * s.dm);
          ctx.fillText(s.name, sx, sy + r + 18);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
