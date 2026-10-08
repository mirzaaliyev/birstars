import { DEFAULTS } from './settings.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stars (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT '',
     text TEXT NOT NULL,
     pos INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reads (star_id TEXT PRIMARY KEY, read_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS visits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     page TEXT NOT NULL,
     at TEXT NOT NULL,
     device TEXT NOT NULL DEFAULT '',
     place TEXT NOT NULL DEFAULT '',
     ua TEXT NOT NULL DEFAULT ''
   )`,
];

// Tables are created on first use, so the database needs no manual setup.
let ready = null;
export async function getDb(env) {
  if (!env.DB) throw new HttpError(503, 'База данных не подключена: проверьте привязку D1 «DB» в wrangler.jsonc.');
  if (!ready) {
    ready = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(e => { ready = null; throw e; });
  }
  await ready;
  return env.DB;
}

export const now = () => new Date().toISOString();

export async function readSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const r of results) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out;
}

export async function readStars(db) {
  const { results } = await db.prepare('SELECT id, name, role, text FROM stars ORDER BY pos, created_at').all();
  return results;
}
