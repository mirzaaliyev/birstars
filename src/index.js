// Worker entry: every request comes here first (assets.run_worker_first), so nothing is served
// without the password. Static files are then fetched from ./public through the ASSETS binding.
import { roles } from '../lib/auth.js';
import { logVisit } from '../lib/visits.js';
import { loginPage } from '../lib/pages.js';
import { handleApi } from '../lib/api.js';

// Paths anyone may load: static assets (no content in them), robots, preview image, icons, sign-in endpoint.
const PUBLIC = [/^\/assets\//, /^\/robots\.txt$/, /^\/og\.png$/, /^\/favicon\.svg$/, /^\/apple-touch-icon\.png$/, /^\/api\/login$/];
const TRACKED = { '/': 'teaser', '/force': 'force', '/galaxy': 'galaxy' };

const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const json = (data, status) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function route(request, env, ctx) {
  const url = new URL(request.url);
  let p = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  const asset = () => env.ASSETS.fetch(request);

  if (p === '/api/login') return handleApi(request, env, '/login', { site: false, admin: false });
  if (PUBLIC.some(r => r.test(p))) return asset();

  // Writes must come from our own pages.
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Запрос отклонён.' }, 403);
  }

  const who = await roles(env, request);
  const isApi = p.startsWith('/api/');

  if (p === '/admin' || p.startsWith('/api/admin')) {
    if (!who.admin) return isApi ? json({ error: 'Нужно войти заново.' }, 401) : html(loginPage({ scope: 'admin', origin: url.origin }));
    return isApi ? handleApi(request, env, p.slice(4), who) : asset();
  }

  if (!who.site) {
    return isApi ? json({ error: 'Нужно войти заново.' }, 401) : html(loginPage({ scope: 'site', origin: url.origin }));
  }

  if (isApi) return handleApi(request, env, p.slice(4), who);

  const res = await asset();
  if (TRACKED[p] && request.method === 'GET' && !who.admin && res.status === 200) ctx.waitUntil(logVisit(env, request, TRACKED[p]));
  if ((res.headers.get('Content-Type') || '').includes('text/html')) {
    const r = new Response(res.body, res);
    r.headers.set('Cache-Control', 'no-store');
    return r;
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const res = await route(request, env, ctx);
    const r = new Response(res.body, res);
    r.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    r.headers.set('X-Content-Type-Options', 'nosniff');
    r.headers.set('Referrer-Policy', 'same-origin');
    return r;
  },
};
