// Signed session cookies: the recipient ("site"), the editor ("admin") and the team's test password ("test").
// The signing key is derived from the passwords, so changing the recipient's or the editor's password
// signs everybody out — handy if a link leaks. The test password only signs the test cookie, so
// changing it signs out the testers and nobody else.

export const COOKIE = { site: 'bs_site', admin: 'bs_admin', test: 'bs_test' };
const MAX_AGE = { site: 60 * 60 * 24 * 400, admin: 60 * 60 * 24 * 30, test: 60 * 60 * 24 * 30 };

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function key(env, scope) {
  let material = env.SESSION_SECRET || `birstars\u0000${env.SITE_PASSWORD || ''}\u0000${env.ADMIN_PASSWORD || ''}`;
  if (scope === 'test') material += `\u0000test\u0000${env.TEST_PASSWORD || ''}`;
  return crypto.subtle.importKey('raw', enc.encode(material), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(env, scope, payload) {
  return b64url(await crypto.subtle.sign('HMAC', await key(env, scope), enc.encode(payload)));
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
  const value = `${payload}.${await sign(env, scope, payload)}`;
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
  if (!raw || (scope === 'test' && !env.TEST_PASSWORD)) return false;
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== scope) return false;
  const issued = Number(parts[1]);
  if (!Number.isFinite(issued) || Date.now() / 1000 - issued > MAX_AGE[scope]) return false;
  return safeEqual(parts[2], await sign(env, scope, `${parts[0]}.${parts[1]}`));
}

// site: may see the recipient's pages. The editor and the testers see them too, but in preview:
// their visits, finished videos and read stars are not recorded on the server.
export async function roles(env, request) {
  const admin = await valid(env, request, 'admin');
  const recipient = await valid(env, request, 'site');
  const test = !admin && !recipient && await valid(env, request, 'test');
  return { site: admin || recipient || test, admin, test, preview: admin || test };
}
