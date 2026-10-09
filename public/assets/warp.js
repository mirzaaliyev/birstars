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

  // speed: how far stars travel this frame; bg: opacity of the dark fill behind them; alpha: streak opacity.
  // Streaks are grouped by depth into a few batches, so a frame is 8 strokes instead of 520.
  const LEVELS = 8;
  function frame(o, speed, bg, alpha) {
    const { ctx, stars, W, H } = o, cx = W / 2, cy = H / 2, f = Math.max(W, H) * .5 * .35;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `hsla(212, 30%, 3%, ${bg})`;
    ctx.fillRect(0, 0, W, H);
    if (alpha <= .005) return;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#EAF2FF';
    const paths = Array.from({ length: LEVELS }, () => new Path2D());
    for (const s of stars) {
      const z0 = s.z;
      s.z -= speed;
      if (s.z <= .02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue; }
      const q = Math.max(0, Math.min(LEVELS - 1, Math.floor((1 - s.z) * LEVELS)));
      const path = paths[q];
      path.moveTo(cx + s.x / z0 * f, cy + s.y / z0 * f);
      path.lineTo(cx + s.x / s.z * f, cy + s.y / s.z * f);
    }
    for (let q = 0; q < LEVELS; q++) {
      const near = (q + .5) / LEVELS;            // 0 far … 1 near
      ctx.globalAlpha = Math.min(1, near * 1.4) * alpha;
      ctx.lineWidth = Math.max(.6, near * 2.2);
      ctx.stroke(paths[q]);
    }
  }
  const smooth = x => x * x * (3 - 2 * x);

  // Leaving: stars stretch into streaks, then the streaks dissolve into darkness. The next page opens on
  // that dark frame, so the moment the browser switches pages there is nothing in motion to freeze.
  window.warpTo = function (url) {
    if (reduce) { location.href = url; return; }
    try { sessionStorage.setItem(KEY, '1'); } catch (_) {}
    const o = overlay(), dur = 1400, t0 = performance.now();
    (function step(now) {
      const p = Math.max(0, Math.min(1, (now - t0) / dur));   // rAF time can be slightly before t0
      const speed = .004 + Math.pow(p, 1.7) * .1;
      const alpha = p < .78 ? 1 : 1 - smooth((p - .78) / .22);
      frame(o, speed, Math.min(1, p * 2.2), alpha);
      if (p < 1) requestAnimationFrame(step); else location.href = url;
    })(t0);
  };

  // Arriving: streaks emerge from the dark at full speed, decelerate and fade, revealing the sky.
  window.warpArrive = function () {
    let flag = null;
    try { flag = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (_) {}
    if (!flag || reduce) return;
    const o = overlay(), dur = 1200, t0 = performance.now();
    frame(o, 0, 1, 0);                               // dark from the very first paint
    (function step(now) {
      const p = Math.max(0, Math.min(1, (now - t0) / dur));   // rAF time can be slightly before t0
      const speed = .09 * Math.pow(1 - p, 2.2) + .001;
      const alpha = smooth(Math.min(1, p / .14)) * (1 - Math.pow(p, 3));
      frame(o, speed, Math.max(0, 1 - smooth(Math.min(1, p * 1.5))), alpha);
      if (p < 1) requestAnimationFrame(step); else o.c.remove();
    })(t0);
  };
})();
