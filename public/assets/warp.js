// Jump to hyperspace: stars stretch into lines, then the next page opens and the streaks slow down into the sky.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'birstars-warp';

  function overlay() {
    const c = document.createElement('canvas');
    c.className = 'warp';
    document.body.appendChild(c);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const stars = Array.from({ length: 520 }, () => ({ x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1), z: .05 + Math.random() }));
    return { c, ctx, stars, W: innerWidth, H: innerHeight };
  }

  // speed: how far stars travel this frame; bg: opacity of the dark fill behind them
  function frame(o, speed, bg, alpha) {
    const { ctx, stars, W, H } = o, cx = W / 2, cy = H / 2, f = Math.max(W, H) * .5;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `hsla(212, 30%, 3%, ${bg})`;
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (const s of stars) {
      const z0 = s.z;
      s.z -= speed;
      if (s.z <= .02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue; }
      const x1 = cx + s.x / z0 * f * .35, y1 = cy + s.y / z0 * f * .35;
      const x2 = cx + s.x / s.z * f * .35, y2 = cy + s.y / s.z * f * .35;
      ctx.globalAlpha = Math.min(1, (1 - s.z) * 1.4) * alpha;
      ctx.strokeStyle = '#EAF2FF';
      ctx.lineWidth = Math.max(.6, (1 - s.z) * 2.2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }

  window.warpTo = function (url) {
    if (reduce) { location.href = url; return; }
    try { sessionStorage.setItem(KEY, '1'); } catch (_) {}
    const o = overlay(), dur = 1300, t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const speed = .004 + Math.pow(p, 1.7) * .1;
      frame(o, speed, Math.min(1, p * 2.2), 1);
      if (p < 1) requestAnimationFrame(step); else location.href = url;
    })(t0);
  };

  // Called on the arriving page: streaks decelerate and fade, revealing the page beneath.
  window.warpArrive = function () {
    let flag = null;
    try { flag = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (_) {}
    if (!flag || reduce) return;
    const o = overlay(), dur = 1100, t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const speed = .09 * Math.pow(1 - p, 2.2) + .001;
      frame(o, speed, Math.max(0, 1 - p * 1.6), 1 - Math.pow(p, 3));
      if (p < 1) requestAnimationFrame(step); else o.c.remove();
    })(t0);
  };
})();
