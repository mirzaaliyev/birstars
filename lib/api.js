import { passwordMatches, makeCookie, clearCookie } from './auth.js';
import { getDb, HttpError, now, readSettings, readStars } from './db.js';
import { DEFAULTS, cleanSetting } from './settings.js';
import { logVisit } from './visits.js';
import { notify, notifyConfigured, bakuTime } from './notify.js';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});

async function body(request) {
  try { return await request.json(); } catch (_) { throw new HttpError(400, 'Некорректный запрос.'); }
}

const LIMIT = { name: 120, role: 200, text: 3000, video: 2000 };
// video: a Stream/YouTube link or embed code, parsed on the page. icon: an id from public/assets/icons.js ('' = dot).
function cleanStar(s) {
  const name = String(s?.name ?? '').trim().slice(0, LIMIT.name);
  const role = String(s?.role ?? '').trim().slice(0, LIMIT.role);
  const text = String(s?.text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, LIMIT.text);
  const video = String(s?.video ?? '').trim().slice(0, LIMIT.video);
  const icon = String(s?.icon ?? '').trim().toLowerCase();
  if (!name || (!text && !video)) throw new HttpError(400, 'У звезды должны быть имя и текст поздравления или видео.');
  return { name, role, text, video, icon: /^[a-z0-9-]{1,32}$/.test(icon) ? icon : '' };
}
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

async function login({ request, env }) {
  const { password = '', scope } = await body(request);
  if (scope !== 'site' && scope !== 'admin') throw new HttpError(400, 'Некорректный запрос.');
  // The recipient's screen also accepts the team's test password.
  const candidates = scope === 'admin' ? [['admin', env.ADMIN_PASSWORD]] : [['site', env.SITE_PASSWORD], ['test', env.TEST_PASSWORD]];
  if (!candidates.some(([, pw]) => pw)) throw new HttpError(503, 'Пароль ещё не настроен в Cloudflare.');
  let role = null;
  for (const [r, pw] of candidates) if (!role && await passwordMatches(String(password), pw)) role = r;
  if (!role) {
    await new Promise(r => setTimeout(r, 900));   // slows down guessing
    return json({ error: 'Неверный пароль. Проверьте и попробуйте ещё раз.' }, 401);
  }
  const secure = new URL(request.url).protocol === 'https:';
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  h.append('Set-Cookie', await makeCookie(env, role, secure));
  // Recipient and tester are mutually exclusive on one browser.
  if (role === 'site') h.append('Set-Cookie', clearCookie('test', secure));
  if (role === 'test') h.append('Set-Cookie', clearCookie('site', secure));
  return new Response('{"ok":true}', { headers: h });
}

async function logout({ request }) {
  const secure = new URL(request.url).protocol === 'https:';
  const h = new Headers({ 'Content-Type': 'application/json' });
  h.append('Set-Cookie', clearCookie('admin', secure));
  h.append('Set-Cookie', clearCookie('site', secure));
  h.append('Set-Cookie', clearCookie('test', secure));
  return new Response('{"ok":true}', { headers: h });
}

// Preview (editor or tester): a clean slate, as the recipient saw it the first time.
// Their own progress lives in their browser only.
// Hidden positions are not sent to the page at all.
const publicStars = (settings, stars) => settings.show_roles === '0' ? stars.map(s => ({ ...s, role: '' })) : stars;
async function content(db, preview) {
  if (preview) {
    const [settings, stars] = await Promise.all([readSettings(db), readStars(db)]);
    return { settings, stars: publicStars(settings, stars), read: [], watched: [], preview: true };
  }
  const [settings, stars, reads, watched] = await Promise.all([
    readSettings(db), readStars(db), db.prepare('SELECT star_id FROM reads').all(), db.prepare('SELECT page FROM watched').all(),
  ]);
  return { settings, stars: publicStars(settings, stars), read: reads.results.map(r => r.star_id), watched: watched.results.map(r => r.page), preview: false };
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
  const { request, env, path, who } = ctx;
  const m = request.method;

  if (path === '/login' && m === 'POST') return login(ctx);
  if (path === '/logout' && m === 'POST') return logout(ctx);

  const db = await getDb(env);

  // recipient (the editor and testers get the same pages, but nothing they do is written)
  if (path === '/content' && m === 'GET') return json(await content(db, who.preview));
  if (path === '/read' && m === 'POST') {
    const { id } = await body(request);
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'Некорректный запрос.');
    if (!who.preview) {
      const r = await db.prepare('INSERT OR IGNORE INTO reads (star_id, read_at) VALUES (?, ?)').bind(id, now()).run();
      // Telegram: the moment the last unread star is opened.
      if (r.meta.changes && notifyConfigured(env)) {
        const c = await db.prepare('SELECT (SELECT COUNT(*) FROM stars) AS total, (SELECT COUNT(*) FROM reads WHERE star_id IN (SELECT id FROM stars)) AS read').first();
        if (c && c.total > 0 && c.read === c.total) await notify(env, `🌟 CEO прочитал все поздравления — ${c.total}\n${bakuTime()}`);
      }
    }
    return json({ ok: true });
  }
  // The recipient finished a video: remembered for all of their devices and logged.
  // The editor's and testers' views are not recorded.
  if (path === '/watched' && m === 'POST') {
    const { page } = await body(request);
    if (page !== 'force') throw new HttpError(400, 'Некорректный запрос.');
    if (!who.preview) {
      await db.prepare('INSERT OR IGNORE INTO watched (page, at) VALUES (?, ?)').bind(page, now()).run();
      await logVisit(env, request, `${page}_end`);
    }
    return json({ ok: true });
  }
  if (path === '/read/reset' && m === 'POST') {
    if (!who.preview) await db.prepare('DELETE FROM reads').run();
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
      'INSERT INTO stars (id, name, role, text, video, icon, pos, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(ids[i], s.name, s.role, s.text, s.video, s.icon, max + i + 1, t, t)));
    return json({ ok: true, ids });
  }

  if (path === '/admin/stars/delete-all' && m === 'POST') {
    await db.batch([db.prepare('DELETE FROM stars'), db.prepare('DELETE FROM reads')]);
    return json({ ok: true });
  }

  const starMatch = path.match(/^\/admin\/stars\/([A-Za-z0-9_-]{1,64})$/);
  if (starMatch && m === 'PUT') {
    const s = cleanStar(await body(request));
    const r = await db.prepare('UPDATE stars SET name = ?, role = ?, text = ?, video = ?, icon = ?, updated_at = ? WHERE id = ?')
      .bind(s.name, s.role, s.text, s.video, s.icon, now(), starMatch[1]).run();
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

  // Telegram: is it set up, and a test message from the admin.
  if (path === '/admin/notify' && m === 'GET') return json({ configured: notifyConfigured(env) });
  if (path === '/admin/notify/test' && m === 'POST') {
    if (!notifyConfigured(env)) throw new HttpError(400, 'Telegram не подключён: добавьте секреты TG_BOT_TOKEN и TG_CHAT_ID в Cloudflare.');
    const r = await notify(env, `🔔 Bir Stars: тестовое уведомление\n${bakuTime()}`);
    if (!r.ok) throw new HttpError(502, `Telegram не принял сообщение: ${r.error}`);
    return json({ ok: true });
  }

  // The recipient's real progress; the admin panel's reset button.
  if (path === '/admin/reads/reset' && m === 'POST') {
    await db.prepare('DELETE FROM reads').run();
    return json({ ok: true });
  }

  // Whole log, or one page ({ page }). Clearing "second video finished" also clears the 'watched'
  // mark, so the recipient again sees the text and button only after watching.
  if (path === '/admin/visits/clear' && m === 'POST') {
    const { page } = await body(request).catch(() => ({}));
    if (page === undefined || page === null || page === '') {
      await db.batch([db.prepare('DELETE FROM visits'), db.prepare('DELETE FROM watched')]);
    } else {
      if (!['teaser', 'force', 'force_end', 'galaxy'].includes(page)) throw new HttpError(400, 'Некорректный запрос.');
      const stmts = [db.prepare('DELETE FROM visits WHERE page = ?').bind(page)];
      if (page === 'force_end') stmts.push(db.prepare("DELETE FROM watched WHERE page = 'force'"));
      await db.batch(stmts);
    }
    return json({ ok: true });
  }

  throw new HttpError(404, 'Не найдено.');
}

// path is the part after /api, e.g. "/content" or "/admin/stars/abc".
export async function handleApi(request, env, path, who) {
  try {
    return await handle({ request, env, path, who });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Ошибка сервера. Попробуйте ещё раз через минуту.' }, 500);
  }
}
