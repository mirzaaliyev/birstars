// Preview mode: the editor or a tester is looking at the site. The server records nothing for them,
// so their read stars and finished videos are kept in this browser only, and a small badge says so.
(() => {
  const PREFIX = 'birstars-preview-';
  function list(name) {
    return {
      get() {
        try { const v = JSON.parse(localStorage.getItem(PREFIX + name) || '[]'); return Array.isArray(v) ? v : []; }
        catch (_) { return []; }
      },
      set(arr) { try { localStorage.setItem(PREFIX + name, JSON.stringify(arr)); } catch (_) {} },
      add(item) { const a = this.get(); if (!a.includes(item)) { a.push(item); this.set(a); } },
    };
  }
  function badge() {
    if (document.querySelector('.preview-badge')) return;
    document.body.classList.add('is-preview');
    const el = document.createElement('div');
    el.className = 'preview-badge';
    const label = document.createElement('span');
    label.textContent = 'Тестовый режим';
    label.title = 'Просмотры и прочитанное не записываются и сохраняются только в этом браузере';
    const out = document.createElement('button');
    out.type = 'button'; out.className = 'link'; out.textContent = 'Выйти';
    // Signs out of everything on this device (recipient, test and admin) and back to the password screen.
    out.onclick = async () => {
      out.disabled = true;
      try { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (_) {}
      try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch (_) {}
      location.href = '/';
    };
    el.append(label, out);
    document.body.appendChild(el);
  }
  window.BirPreview = { reads: list('read'), watched: list('watched'), badge };
})();
