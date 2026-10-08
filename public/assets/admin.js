(() => {
  const $ = id => document.getElementById(id);
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; };
  const starsWord = n => `${n} ${plural(n, 'звезда', 'звезды', 'звёзд')}`;
  const PAGES = { teaser: 'Тизер', force: 'Второй ролик', force_end: 'Второй ролик досмотрен', galaxy: 'Звёздное небо' };
  const TEXT_KEYS = ['teaser_video', 'teaser_text', 'continue_label', 'force_video', 'force_title', 'force_text', 'force_cta',
    'galaxy_title', 'galaxy_lead', 'center_label', 'center_text', 'center_from', 'video_soon'];

  const state = { settings: {}, stars: [], visits: [], summary: [], read: 0 };
  let textsFilled = false;

  /* ---------- helpers ---------- */
  async function api(path, method = 'GET', data) {
    const r = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (r.status === 401) { location.reload(); throw new Error('auth'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Ошибка сервера. Попробуйте ещё раз.');
    return d;
  }
  let flashTimer;
  function flash(text) {
    const el = $('status'); el.textContent = text; el.hidden = false;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
  function fail(e) { if (e.message !== 'auth') flash(e.message); }
  const fmt = iso => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Baku', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  function confirmDialog({ title, text, ok }) {
    const d = $('confirm-dialog');
    $('c-title').textContent = title; $('c-text').textContent = text; $('c-ok').textContent = ok;
    d.returnValue = '';
    d.showModal();
    d.querySelector('button[value="cancel"]').focus();
    return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
  }
  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  /* ---------- tabs ---------- */
  function showTab(name) {
    document.querySelectorAll('[role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'visits') loadState().catch(fail);
  }
  document.querySelectorAll('[role="tab"]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  /* ---------- load ---------- */
  async function loadState() {
    const d = await api('/api/admin/state');
    Object.assign(state, d);
    $('fatal').hidden = true;
    renderStars(); renderVisits();
    // Fill the form on first load; later refreshes must not overwrite unsaved edits.
    if (!textsFilled || !dirty()) { fillTexts(); textsFilled = true; }
    $('show_continue').checked = state.settings.show_continue === '1';
  }

  /* ---------- stars ---------- */
  function renderStars() {
    const n = state.stars.length;
    $('stars-count').textContent = n ? starsWord(n) : 'Звёзды';
    $('stars-empty').hidden = n > 0;
    $('danger').hidden = n === 0;
    $('read-info').textContent = state.read ? `Получатель прочитал ${state.read} из ${n}.` : 'Получатель ещё ничего не прочитал.';
    $('reset-read').disabled = !state.read;
    const q = $('search').value.trim().toLowerCase();
    const list = $('stars-list'); list.textContent = '';
    const shown = state.stars.filter(s => !q || (s.name + ' ' + s.role + ' ' + s.text).toLowerCase().includes(q));
    $('no-results').hidden = !(n && !shown.length);
    for (const s of shown) {
      const li = document.createElement('li');
      const who = document.createElement('div'); who.className = 'who';
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = s.name;
      const rl = document.createElement('span'); rl.className = 'role'; rl.textContent = s.role;
      who.append(nm, rl);
      const tx = document.createElement('div'); tx.className = 'text'; tx.textContent = s.text;
      const acts = document.createElement('div'); acts.className = 'acts';
      const ed = document.createElement('button'); ed.className = 'link'; ed.textContent = 'Изменить';
      ed.onclick = () => openStar(s);
      const del = document.createElement('button'); del.className = 'link'; del.textContent = 'Удалить';
      del.onclick = async () => {
        if (!await confirmDialog({ title: 'Удалить звезду?', text: `Поздравление от ${s.name} исчезнет с неба.`, ok: 'Удалить' })) return;
        try { await api(`/api/admin/stars/${s.id}`, 'DELETE'); flash('Звезда удалена'); await loadState(); } catch (e) { fail(e); }
      };
      acts.append(ed, del);
      li.append(who, acts, tx);
      list.append(li);
    }
  }
  $('search').addEventListener('input', renderStars);

  // add / edit
  let editing = null;
  const sd = $('star-dialog');
  function updateCount() {
    const n = $('s-text').value.trim().length;
    $('s-count').textContent = n > 400 ? `${n} символов — длинное поздравление, на телефоне займёт весь экран` : `${n} символов`;
  }
  function openStar(s) {
    editing = s || null;
    $('star-dialog-title').textContent = s ? 'Изменить звезду' : 'Новая звезда';
    $('s-name').value = s ? s.name : ''; $('s-role').value = s ? s.role : ''; $('s-text').value = s ? s.text : '';
    $('s-error').hidden = true; updateCount();
    sd.showModal(); $('s-name').focus();
  }
  $('s-text').addEventListener('input', updateCount);
  $('open-add').onclick = () => openStar(null);
  $('star-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = { name: $('s-name').value.trim(), role: $('s-role').value.trim(), text: $('s-text').value.trim() };
    if (!data.name || !data.text) { $('s-error').textContent = 'Заполните имя и поздравление.'; $('s-error').hidden = false; return; }
    $('s-save').disabled = true;
    try {
      if (editing) await api(`/api/admin/stars/${editing.id}`, 'PUT', data);
      else await api('/api/admin/stars', 'POST', { items: [data] });
      sd.close(); flash(editing ? 'Изменения сохранены' : `Звезда ${data.name} добавлена`);
      await loadState();
    } catch (err) { if (err.message !== 'auth') { $('s-error').textContent = err.message; $('s-error').hidden = false; } }
    $('s-save').disabled = false;
  });

  // import
  function parseTSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
  }
  function columns(header) {
    const find = re => header.findIndex(h => re.test(h));
    const name = find(/^(имя|фио|name|ad\b|ad soyad|full name)/i);
    const surname = find(/(фамилия|surname|last name|soyad)$/i);
    return {
      name, surname: surname !== name ? surname : -1,
      role: find(/(должн|позиц|vəzifə|position|title|role)/i),
      text: find(/(поздрав|текст|təbrik|message|text|wish)/i),
    };
  }
  function parseImport(text) {
    const rows = parseTSV(text);
    const ok = [], bad = [], dup = [];
    if (!rows.length) return { ok, bad, dup };
    let cols = columns(rows[0]), start = 0;
    if (cols.name >= 0 && cols.text >= 0) start = 1;
    else {
      const w = Math.max(...rows.map(r => r.length));
      cols = w >= 4 ? { name: 0, surname: 1, role: 2, text: 3 } : { name: 0, surname: -1, role: w >= 3 ? 1 : -1, text: w >= 3 ? 2 : 1 };
    }
    const seen = new Set(state.stars.map(s => (s.name + '|' + s.text).toLowerCase()));
    rows.slice(start).forEach((r, i) => {
      const line = i + start + 1;
      const name = [r[cols.name], cols.surname >= 0 ? r[cols.surname] : ''].filter(Boolean).join(' ').trim();
      const role = cols.role >= 0 ? (r[cols.role] || '') : '';
      const text = (r[cols.text] || '').trim();
      if (!name || !text) { bad.push(line); return; }
      const key = (name + '|' + text).toLowerCase();
      if (seen.has(key)) { dup.push(line); return; }
      seen.add(key); ok.push({ name, role, text });
    });
    return { ok, bad, dup };
  }
  let parsed = { ok: [], bad: [], dup: [] };
  $('open-import').onclick = () => { $('i-text').value = ''; $('i-text').dispatchEvent(new Event('input')); $('i-error').hidden = true; $('import-dialog').showModal(); $('i-text').focus(); };
  $('i-text').addEventListener('input', () => {
    const v = $('i-text').value;
    parsed = parseImport(v);
    const { ok, bad, dup } = parsed, prev = $('i-preview'), btn = $('i-save');
    prev.textContent = '';
    btn.disabled = !ok.length;
    btn.textContent = ok.length ? `Импортировать ${starsWord(ok.length)}` : 'Импортировать';
    if (!v.trim()) { $('i-summary').textContent = 'Вставьте строки, чтобы увидеть, что будет добавлено.'; return; }
    const parts = [`Готово к импорту: ${ok.length}.`];
    if (bad.length) parts.push(`Пропущены строки без имени или текста: ${bad.join(', ')}.`);
    if (dup.length) parts.push(`Пропущены повторы того, что уже есть: ${dup.join(', ')}.`);
    $('i-summary').textContent = parts.join(' ');
    ok.slice(0, 5).forEach(x => {
      const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = x.name;
      li.append(b, document.createTextNode(`${x.role ? ', ' + x.role : ''} — ${x.text}`)); prev.append(li);
    });
    if (ok.length > 5) { const li = document.createElement('li'); li.textContent = `и ещё ${ok.length - 5}`; prev.append(li); }
  });
  $('import-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!parsed.ok.length) return;
    $('i-save').disabled = true;
    try {
      await api('/api/admin/stars', 'POST', { items: parsed.ok });
      $('import-dialog').close(); flash(`Добавлено: ${starsWord(parsed.ok.length)}`); await loadState();
    } catch (err) { if (err.message !== 'auth') { $('i-error').textContent = err.message; $('i-error').hidden = false; } $('i-save').disabled = false; }
  });

  // demo
  $('add-demo').onclick = async () => {
    const F = ['Aysel', 'Nigar', 'Leyla', 'Günel', 'Səbinə', 'Nərmin', 'Ülviyyə', 'Aynur', 'Lalə', 'Fidan'];
    const M = ['Rəşad', 'Elvin', 'Orxan', 'Kamran', 'Fərid', 'Tural', 'Ramil', 'Murad', 'Cavid', 'Emin'];
    const S = ['Məmmədov', 'Əliyev', 'Hüseynov', 'Quliyev', 'Həsənov', 'İsmayılov', 'Rzayev', 'Babayev', 'Kərimov', 'Cəfərov'];
    const R = ['Product Designer', 'Head of Marketing', 'Backend Engineer', 'Account Manager', 'Copywriter', 'Data Analyst', 'Product Owner', 'HR Business Partner', 'Head of Customer Experience and Digital Service Channels'];
    const T = ['Спасибо за смелость принимать решения, которые другие откладывают.', 'Пусть энергии хватает на все идеи, а мы поможем довести их до релиза.',
      'Спасибо за честность и за то, что всегда находите время выслушать.', 'Желаю крепкого здоровья, спокойных выходных и громких запусков.',
      'Пусть всё задуманное сбудется — и раньше дедлайна.', 'Təbrik edirəm! Sizə möhkəm cansağlığı və yeni uğurlar arzulayıram.'];
    const items = Array.from({ length: 30 }, (_, i) => {
      const f = i % 2 === 0;
      return { name: `[Тест] ${(f ? F : M)[i % 10]} ${S[(i * 3) % 10]}${f ? 'a' : ''}`, role: R[i % R.length], text: T[i % T.length] };
    });
    try { await api('/api/admin/stars', 'POST', { items }); flash('Добавлено 30 тестовых звёзд'); await loadState(); } catch (e) { fail(e); }
  };

  $('delete-all').onclick = async () => {
    const n = state.stars.length;
    if (!await confirmDialog({ title: `Удалить все ${starsWord(n)}?`, text: 'Небо станет пустым, отметки о прочитанном тоже удалятся. Отменить это нельзя.', ok: 'Удалить все' })) return;
    try { await api('/api/admin/stars/delete-all', 'POST', {}); flash('Все звёзды удалены'); await loadState(); } catch (e) { fail(e); }
  };
  $('reset-read').onclick = async () => {
    if (!await confirmDialog({ title: 'Сбросить прочитанное?', text: `${starsWord(state.read)} снова станут непрочитанными на всех устройствах получателя.`, ok: 'Сбросить' })) return;
    try { await api('/api/read/reset', 'POST', {}); flash('Прочитанное сброшено'); await loadState(); } catch (e) { fail(e); }
  };

  /* ---------- texts ---------- */
  const form = $('texts-form');
  const val = k => form.elements[k].value;
  function fillTexts() { TEXT_KEYS.forEach(k => { form.elements[k].value = state.settings[k] ?? ''; }); afterTextInput(); }
  function changed() { return TEXT_KEYS.filter(k => val(k).trim() !== String(state.settings[k] ?? '').trim()); }
  function dirty() { return textsFilled && changed().length > 0; }
  function videoHint(k) {
    const el = form.querySelector(`.hint[data-for="${k}"]`), raw = val(k).trim();
    const v = window.BirVideo.parseVideo(raw);
    el.className = 'hint';
    if (!raw) { el.textContent = 'Ролик не добавлен — на странице будет текст-заглушка.'; return; }
    if (v) { el.classList.add('ok'); el.textContent = `Распознано: ${window.BirVideo.describe(v)}`; }
    else { el.classList.add('bad'); el.textContent = 'Не удалось распознать. Вставьте ссылку или код встраивания из Cloudflare Stream (или ссылку на YouTube).'; }
  }
  function afterTextInput() {
    videoHint('teaser_video'); videoHint('force_video');
    $('galaxy-preview').textContent = `На странице: «${starsWord(state.stars.length || 30)} ${val('galaxy_title').trim()}»`;
    const c = changed().length;
    $('save-texts').disabled = !c;
    $('dirty-note').textContent = c ? `Несохранённых полей: ${c}` : 'Изменений нет';
  }
  form.addEventListener('input', afterTextInput);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const bad = ['teaser_video', 'force_video'].filter(k => val(k).trim() && !window.BirVideo.parseVideo(val(k)));
    if (bad.length) { form.elements[bad[0]].focus(); flash('Проверьте ссылку на ролик'); return; }
    const data = {}; changed().forEach(k => { data[k] = val(k); });
    $('save-texts').disabled = true;
    try { const d = await api('/api/admin/settings', 'PUT', data); state.settings = d.settings; fillTexts(); flash('Сохранено'); }
    catch (err) { fail(err); afterTextInput(); }
  });
  addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  $('show_continue').addEventListener('change', async e => {
    const on = e.target.checked;
    try {
      const d = await api('/api/admin/settings', 'PUT', { show_continue: on ? '1' : '0' });
      state.settings.show_continue = d.settings.show_continue;
      flash(on ? 'Ссылка на продолжение появилась на главной' : 'Ссылка на продолжение скрыта');
    } catch (err) { e.target.checked = !on; fail(err); }
  });

  /* ---------- visits ---------- */
  function renderVisits() {
    const sum = $('summary'); sum.textContent = '';
    for (const key of Object.keys(PAGES)) {
      const s = state.summary.find(x => x.page === key);
      const box = document.createElement('div');
      const h = document.createElement('h3'); h.textContent = PAGES[key];
      const p = document.createElement('p');
      if (s) { p.className = 'yes'; p.textContent = `Впервые: ${fmt(s.first)}. Всего открытий: ${s.n}.`; }
      else p.textContent = 'Ещё не открывали.';
      box.append(h, p); sum.append(box);
    }
    const body = $('visits-body'); body.textContent = '';
    $('visits-empty').hidden = state.visits.length > 0;
    $('visits-table').hidden = !state.visits.length;
    for (const v of state.visits) {
      const tr = document.createElement('tr');
      [fmt(v.at), PAGES[v.page] || v.page, v.device, v.place || '—'].forEach(t => { const td = document.createElement('td'); td.textContent = t; tr.append(td); });
      body.append(tr);
    }
  }
  $('refresh-visits').onclick = () => loadState().then(() => flash('Обновлено')).catch(fail);
  $('clear-visits').onclick = async () => {
    if (!await confirmDialog({ title: 'Очистить журнал?', text: 'Все записи об открытиях удалятся, отметка о просмотре второго ролика тоже сбросится. Это удобно сделать после ваших проверок, перед отправкой ссылки.', ok: 'Очистить' })) return;
    try { await api('/api/admin/visits/clear', 'POST', {}); flash('Журнал очищен'); await loadState(); } catch (e) { fail(e); }
  };

  $('logout').onclick = async () => { try { await api('/api/logout', 'POST', {}); } catch (_) {} location.reload(); };

  /* ---------- start ---------- */
  showTab(['stars', 'texts', 'visits'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'stars');
  loadState().catch(e => { if (e.message !== 'auth') { $('fatal').textContent = e.message; $('fatal').hidden = false; } });
})();
