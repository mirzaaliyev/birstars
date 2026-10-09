// Telegram notifications to the team about the recipient's key moments.
// Off unless both Worker secrets are set: TG_BOT_TOKEN (from @BotFather) and TG_CHAT_ID
// (one id or several, comma-separated; a group id starts with "-"). Never breaks a request.

export const notifyConfigured = env => !!(env.TG_BOT_TOKEN && env.TG_CHAT_ID);

// Tolerate the usual copy-paste extras: spaces, line breaks, quotes, a leading "bot", a whole api URL.
function cleanToken(raw) {
  let t = String(raw || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  const m = t.match(/(\d{5,}:[A-Za-z0-9_-]{20,})/);
  return m ? m[1] : t.replace(/^bot/i, '');
}
const cleanChat = c => c.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/^id:?\s*/i, '').trim();

// Telegram's own error text, turned into what to check.
function explain(desc) {
  if (/not found/i.test(desc) && !/chat/i.test(desc)) return 'неверный токен бота (TG_BOT_TOKEN). Скопируйте его заново из @BotFather: /mybots → бот → API Token';
  if (/unauthorized/i.test(desc)) return 'токен бота отозван или неверный (TG_BOT_TOKEN)';
  if (/chat not found/i.test(desc)) return 'бот не нашёл чат: проверьте TG_CHAT_ID и нажмите Start у своего бота';
  if (/bot was blocked|forbidden/i.test(desc)) return 'бот заблокирован или ещё не запущен: откройте бота и нажмите Start';
  return desc;
}

export async function notify(env, text) {
  if (!notifyConfigured(env)) return { ok: false, error: 'not_configured' };
  const token = cleanToken(env.TG_BOT_TOKEN);
  const chats = String(env.TG_CHAT_ID).split(',').map(cleanChat).filter(Boolean);
  const results = await Promise.all(chats.map(async chat_id => {
    try {
      const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/bot${token}/sendMessage`, {   // TG_API: local mock in dev only
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
      });
      const d = await r.json().catch(() => ({}));
      return d.ok ? null : explain(d.description || `HTTP ${r.status}`);
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
