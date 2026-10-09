// Telegram notifications to the team about the recipient's key moments.
// Off unless both Worker secrets are set: TG_BOT_TOKEN (from @BotFather) and TG_CHAT_ID
// (one id or several, comma-separated; a group id starts with "-"). Never breaks a request.

export const notifyConfigured = env => !!(env.TG_BOT_TOKEN && env.TG_CHAT_ID);

export async function notify(env, text) {
  if (!notifyConfigured(env)) return { ok: false, error: 'not_configured' };
  const chats = String(env.TG_CHAT_ID).split(',').map(s => s.trim()).filter(Boolean);
  const results = await Promise.all(chats.map(async chat_id => {
    try {
      const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/bot${env.TG_BOT_TOKEN}/sendMessage`, {   // TG_API: local mock in dev only
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
      });
      const d = await r.json().catch(() => ({}));
      return d.ok ? null : (d.description || `HTTP ${r.status}`);
    } catch (e) { return String(e && e.message || e); }
  }));
  const errors = results.filter(Boolean);
  return errors.length ? { ok: false, error: errors.join('; ') } : { ok: true };
}

export const bakuTime = (d = new Date()) =>
  d.toLocaleString('ru-RU', { timeZone: 'Asia/Baku', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// First time the recipient reaches each stage (again after that line is reset in the admin).
export const FIRST = {
  teaser: '🎬 CEO открыл тизер',
  force: '🎬 CEO открыл второй ролик',
  force_end: '✅ CEO досмотрел второй ролик до конца',
  galaxy: '✨ CEO открыл звёздное небо',
};
