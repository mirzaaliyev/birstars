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
    el.textContent = 'Тестовый режим';
    el.title = 'Просмотры и прочитанное не записываются и сохраняются только в этом браузере';
    document.body.appendChild(el);
  }
  window.BirPreview = { reads: list('read'), watched: list('watched'), badge };
})();
