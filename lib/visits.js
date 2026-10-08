import { getDb, now } from './db.js';

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
    await db.prepare('INSERT INTO visits (page, at, device, place, ua) VALUES (?, ?, ?, ?, ?)')
      .bind(page, now(), device(ua), place, ua.slice(0, 300)).run();
  } catch (_) { /* the log must never break the page */ }
}

