// Quiet starfield behind the sign-in and video pages, so every page lives in the same sky.
(() => {
  const canvas = document.querySelector('.sky-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, stars = [];

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const n = Math.round(W * H / 2600);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() < .06 ? 1 + Math.random() * .9 : .25 + Math.random() * .7,
      a: .15 + Math.random() * .55, ph: Math.random() * 6.28, sp: .4 + Math.random() * 1.2,
    }));
    if (reduce) draw(0);
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(W * .5, H * .42, 0, W * .5, H * .42, Math.max(W, H) * .75);
    g.addColorStop(0, 'hsl(210 32% 8%)'); g.addColorStop(1, 'hsl(212 30% 3%)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#E8F0FA';
    for (const s of stars) {
      ctx.globalAlpha = reduce ? s.a : s.a * (.6 + .4 * Math.sin(t / 1000 * s.sp + s.ph));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
  }

  function loop(t) { if (!document.hidden) draw(t); requestAnimationFrame(loop); }
  resize();
  addEventListener('resize', resize);
  if (!reduce) requestAnimationFrame(loop);
})();
