import { passwordMatches, makeCookie, clearCookie } from './auth.js';
import { getDb, HttpError, now, readSettings, readStars } from './db.js';
import { DEFAULTS, cleanSetting } from './settings.js';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});

async function body(request) {
  try { return await request.json(); } catch (_) { throw new HttpError(400, 'Некорректный запрос.'); }
}

const LIMIT = { name: 120, role: 200, text: 3000 };
function cleanStar(s) {
  const name = String(s?.name ?? '').trim().slice(0, LIMIT.name);
  const role = String(s?.role ?? '').trim().slice(0, LIMIT.role);
  const text = String(s?.text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, LIMIT.text);
  if (!name || !text) throw new HttpError(400, 'У звезды должны быть имя и текст поздравления.');
  return { name, role, text };
}
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

async function login({ request, env }) {
  const { password = '', scope } = await body(request);
  if (scope !== 'site' && scope !== 'admin') throw new HttpError(400, 'Некорректный запрос.');
  const expected = scope === 'admin' ? env.ADMIN_PASSWORD : env.SITE_PASSWORD;
  if (!expected) throw new HttpError(503, 'Пароль ещё не настроен в Cloudflare.');
  if (!(await passwordMatches(String(password), expected))) {
    await new Promise(r => setTimeout(r, 900));   // slows down guessing
    return json({ error: 'Неверный пароль. Проверьте и попробуйте ещё раз.' }, 401);
  }
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'Set-Cookie': await makeCookie(env, scope, secure) });
}

async function logout({ request }) {
  const secure = new URL(request.url).protocol === 'https:';
  const h = new Headers({ 'Content-Type': 'application/json' });
  h.append('Set-Cookie', clearCookie('admin', secure));
  h.append('Set-Cookie', clearCookie('site', secure));
  return new Response('{"ok":true}', { headers: h });
}

async function content(db) {
  const [settings, stars, reads] = await Promise.all([
    readSettings(db), readStars(db), db.prepare('SELECT star_id FROM reads').all(),
  ]);
  return { settings, stars, read: reads.results.map(r => r.star_id) };
}

async function adminState(db) {
  const [settings, stars, visits, summary, readCount] = await Promise.all([
    readSettings(db),
    readStars(db),
    db.prepare('SELECT page, at, device, place FROM visits ORDER BY id DESC LIMIT 200').all(),
    db.prepare('SELECT page, MIN(at) AS first, MAX(at) AS last, COUNT(*) AS n FROM visits GROUP BY page').all(),
    db.prepare('SELECT COUNT(*) AS n FROM reads').first(),
  ]);
  return { settings, stars, visits: visits.results, summary: summary.results, read: readCount?.n || 0 };
}

async function handle(ctx) {
  const { request, env, path } = ctx;
  const m = request.method;

  if (path === '/login' && m === 'POST') return login(ctx);
  if (path === '/logout' && m === 'POST') return logout(ctx);

  const db = await getDb(env);

  // recipient
  if (path === '/content' && m === 'GET') return json(await content(db));
  if (path === '/read' && m === 'POST') {
    const { id } = await body(request);
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'Некорректный запрос.');
    await db.prepare('INSERT OR IGNORE INTO reads (star_id, read_at) VALUES (?, ?)').bind(id, now()).run();
    return json({ ok: true });
  }
  if (path === '/read/reset' && m === 'POST') {
    await db.prepare('DELETE FROM reads').run();
    return json({ ok: true });
  }

  // editor (src/index.js has already checked the admin cookie)
  if (path === '/admin/state' && m === 'GET') return json(await adminState(db));

  if (path === '/admin/stars' && m === 'POST') {
    const { items } = await body(request);
    if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Нет звёзд для добавления.');
    if (items.length > 1000) throw new HttpError(400, 'Слишком много строк за один раз.');
    const clean = items.map(cleanStar);
    const max = (await db.prepare('SELECT COALESCE(MAX(pos), 0) AS m FROM stars').first()).m;
    const t = now();
    const ids = clean.map(() => newId());
    await db.batch(clean.map((s, i) => db.prepare(
      'INSERT INTO stars (id, name, role, text, pos, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(ids[i], s.name, s.role, s.text, max + i + 1, t, t)));
    return json({ ok: true, ids });
  }

  if (path === '/admin/stars/delete-all' && m === 'POST') {
    await db.batch([db.prepare('DELETE FROM stars'), db.prepare('DELETE FROM reads')]);
    return json({ ok: true });
  }

  const starMatch = path.match(/^\/admin\/stars\/([A-Za-z0-9_-]{1,64})$/);
  if (starMatch && m === 'PUT') {
    const s = cleanStar(await body(request));
    const r = await db.prepare('UPDATE stars SET name = ?, role = ?, text = ?, updated_at = ? WHERE id = ?')
      .bind(s.name, s.role, s.text, now(), starMatch[1]).run();
    if (!r.meta.changes) throw new HttpError(404, 'Звезда не найдена — возможно, её уже удалили.');
    return json({ ok: true });
  }
  if (starMatch && m === 'DELETE') {
    await db.batch([
      db.prepare('DELETE FROM stars WHERE id = ?').bind(starMatch[1]),
      db.prepare('DELETE FROM reads WHERE star_id = ?').bind(starMatch[1]),
    ]);
    return json({ ok: true });
  }

  if (path === '/admin/settings' && m === 'PUT') {
    const input = await body(request);
    const stmts = [];
    for (const [k, v] of Object.entries(input || {})) {
      const val = cleanSetting(k, v);
      if (val === undefined) continue;
      stmts.push(val === DEFAULTS[k]
        ? db.prepare('DELETE FROM settings WHERE key = ?').bind(k)
        : db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, val));
    }
    if (stmts.length) await db.batch(stmts);
    return json({ ok: true, settings: await readSettings(db) });
  }

  if (path === '/admin/visits/clear' && m === 'POST') {
    await db.prepare('DELETE FROM visits').run();
    return json({ ok: true });
  }

  throw new HttpError(404, 'Не найдено.');
}

// path is the part after /api, e.g. "/content" or "/admin/stars/abc".
export async function handleApi(request, env, path) {
  try {
    return await handle({ request, env, path });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Ошибка сервера. Попробуйте ещё раз через минуту.' }, 500);
  }
}
