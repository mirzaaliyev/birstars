// Signed session cookies. One cookie for the recipient ("site"), one for the editor ("admin").
// The signing key is derived from the two passwords, so changing either password
// signs everybody out — handy if a link leaks.

export const COOKIE = { site: 'bs_site', admin: 'bs_admin' };
const MAX_AGE = { site: 60 * 60 * 24 * 400, admin: 60 * 60 * 24 * 30 };

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function key(env) {
  const material = env.SESSION_SECRET || `birstars\u0000${env.SITE_PASSWORD || ''}\u0000${env.ADMIN_PASSWORD || ''}`;
  return crypto.subtle.importKey('raw', enc.encode(material), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(env, payload) {
  return b64url(await crypto.subtle.sign('HMAC', await key(env), enc.encode(payload)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function passwordMatches(input, expected) {
  if (!expected) return false;
  const h = async s => b64url(await crypto.subtle.digest('SHA-256', enc.encode(String(s))));
  return safeEqual(await h(input.trim()), await h(expected.trim()));
}

export async function makeCookie(env, scope, secure) {
  const payload = `${scope}.${Math.floor(Date.now() / 1000)}`;
  const value = `${payload}.${await sign(env, payload)}`;
  return `${COOKIE[scope]}=${value}; Path=/; Max-Age=${MAX_AGE[scope]}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearCookie(scope, secure) {
  return `${COOKIE[scope]}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

async function valid(env, request, scope) {
  const raw = readCookie(request, COOKIE[scope]);
  if (!raw) return false;
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== scope) return false;
  const issued = Number(parts[1]);
  if (!Number.isFinite(issued) || Date.now() / 1000 - issued > MAX_AGE[scope]) return false;
  return safeEqual(parts[2], await sign(env, `${parts[0]}.${parts[1]}`));
}

// The editor can see every page too, so they can check the site without the recipient's password.
export async function roles(env, request) {
  const admin = await valid(env, request, 'admin');
  const site = admin || await valid(env, request, 'site');
  return { site, admin };
}
