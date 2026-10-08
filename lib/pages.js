// Server-rendered pages: the password screen shown instead of any page until the visitor signs in.
// It also carries the link-preview tags, so WhatsApp/iMessage show the logo even before sign-in.

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function headTags(origin) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="theme-color" content="#05070a">
<meta property="og:type" content="website">
<meta property="og:title" content="Bir Stars">
<meta property="og:image" content="${esc(origin)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/onest.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">`;
}

export function loginPage({ scope, origin }) {
  const admin = scope === 'admin';
  const title = admin ? 'Вход в админку' : 'Введите пароль';
  const hint = admin ? 'Пароль редактора.' : 'Пароль пришёл вам в SMS вместе со ссылкой.';
  return `<!doctype html>
<html lang="ru">
<head>
${headTags(origin)}
<title>Bir Stars</title>
</head>
<body class="page-login">
<canvas class="sky-bg" aria-hidden="true"></canvas>
<main class="login">
  <form class="login-form" id="login" novalidate>
    <img class="login-logo" src="/assets/logo-circle.svg" alt="Bir" width="64" height="64">
    <h1>${title}</h1>
    <p class="muted">${hint}</p>
    <label class="visually-hidden" for="pw">Пароль</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Пароль" required>
    <button class="btn primary" type="submit">Открыть</button>
    <p class="error" id="err" role="alert" hidden></p>
  </form>
</main>
<script src="/assets/sky-bg.js" defer></script>
<script>
(() => {
  const form = document.getElementById('login'), pw = document.getElementById('pw'), err = document.getElementById('err');
  const btn = form.querySelector('button');
  pw.focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pw.value.trim()) { pw.focus(); return; }
    btn.disabled = true; err.hidden = true;
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw.value, scope: ${JSON.stringify(scope)} }) });
      if (r.ok) { location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      err.textContent = d.error || 'Не удалось войти. Попробуйте ещё раз.';
    } catch (_) {
      err.textContent = 'Нет соединения. Проверьте интернет и попробуйте ещё раз.';
    }
    err.hidden = false; btn.disabled = false; pw.select();
  });
})();
</script>
</body>
</html>`;
}
