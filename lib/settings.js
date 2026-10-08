// Editable texts and video links. Every key here shows up in the admin panel.
// Values are plain text; the pages insert them with textContent, never as HTML.
export const DEFAULTS = {
  teaser_video: '',
  teaser_text: '',
  show_continue: '0',
  continue_label: 'Смотреть продолжение',

  force_video: '',
  force_title: 'С днём рождения!',
  force_text: 'Мы собрали для вас небо. Каждая звезда в нём — поздравление от коллеги.',
  force_cta: 'К звёздам',

  galaxy_title: 'от команды Bir',
  galaxy_lead: 'Каждая звезда — поздравление от коллеги. Перетаскивайте небо, приближайте и нажимайте на звёзды.',

  center_label: 'Bir',
  center_text:
    'Это небо собрали коллеги со всей экосистемы Bir. Каждая звезда вокруг — поздравление от одного человека.\n\n' +
    'Читайте в любом порядке: прочитанные звёзды становятся тусклее, а прогресс сохраняется на всех ваших устройствах.',
  center_from: 'Команда Bir',

  video_soon: 'Ролик скоро появится.',
};

export const LIMITS = { short: 300, long: 4000 };
const LONG = new Set(['teaser_text', 'force_text', 'galaxy_lead', 'center_text']);

export function cleanSetting(key, value) {
  if (!(key in DEFAULTS)) return undefined;
  let v = String(value ?? '');
  if (key === 'show_continue') return v === '1' || v === 'true' ? '1' : '0';
  v = v.replace(/\r\n?/g, '\n').trim();
  return v.slice(0, LONG.has(key) || key.endsWith('_video') ? LIMITS.long : LIMITS.short);
}
