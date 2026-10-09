import { getDb, now } from './db.js';
import { notify, notifyConfigured, bakuTime, FIRST } from './notify.js';

export function device(ua) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Другое';
  const br = /WhatsApp/.test(ua) ? 'WhatsApp' : /Telegram/.test(ua) ? 'Telegram' : /Instagram/.test(ua) ? 'Instagram'
    : /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /YaBrowser/.test(ua) ? 'Яндекс'
    : /OPR\//.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : '';
  return br ? `${os}, ${br}` : os;
}

export async function logVisit(env, request, page) {
  try {
    const db = await getDb(env);
    const ua = request.headers.get('User-Agent') || '';
    const cf = request.cf || {};
    const place = [cf.city, cf.country].filter(Boolean).join(', ');
    const dev = device(ua);
    await db.prepare('INSERT INTO visits (page, at, device, place, ua) VALUES (?, ?, ?, ?, ?)')
      .bind(page, now(), dev, place, ua.slice(0, 300)).run();
    // Telegram: only the first time each stage is reached.
    if (FIRST[page] && notifyConfigured(env)) {
      const n = (await db.prepare('SELECT COUNT(*) AS n FROM visits WHERE page = ?').bind(page).first())?.n;
      if (n === 1) await notify(env, `${FIRST[page]}\n${[dev, place, bakuTime()].filter(Boolean).join(' · ')}`);
    }
  } catch (_) { /* the log must never break the page */ }
}

