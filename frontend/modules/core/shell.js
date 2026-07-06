const SIDEBAR_STATE_KEY = 'vcc-sidebar-state';

(function applySavedTheme() {
  const saved = localStorage.getItem('vcc-theme') ?? 'dark';
  document.documentElement.dataset.theme = saved;
})();

export function initTheme() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  const current = document.documentElement.dataset.theme ?? 'dark';
  btn.textContent = current === 'dark' ? '☀ Claro' : '◑ Oscuro';
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('vcc-theme', next);
    btn.textContent = next === 'dark' ? '☀ Claro' : '◑ Oscuro';
  });
}

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const pinBtn = document.getElementById('btn-sidebar-pin');
  const collapseBtn = document.getElementById('btn-sidebar-collapse');
  if (!sidebar || !pinBtn || !collapseBtn) return;

  let state;
  try { state = JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY)) ?? {}; }
  catch { state = {}; }
  let collapsed = state.collapsed ?? false;
  let pinned = state.pinned ?? true;

  const persist = () => localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed, pinned }));

  const render = () => {
    sidebar.classList.toggle('collapsed', collapsed);
    sidebar.classList.toggle('pinned', pinned);
    pinBtn.classList.toggle('pinned', pinned);
    collapseBtn.title = collapsed ? 'Expandir panel' : 'Colapsar panel';
    pinBtn.title = pinned ? 'Desfijar panel' : 'Fijar panel expandido';
  };
  render();

  collapseBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    if (collapsed) { pinned = false; sidebar.classList.remove('peek'); }
    persist();
    render();
  });

  pinBtn.addEventListener('click', () => {
    pinned = !pinned;
    if (pinned) { collapsed = false; sidebar.classList.remove('peek'); }
    persist();
    render();
  });

  let leaveTimer = null;
  sidebar.addEventListener('mouseenter', () => {
    if (!collapsed || pinned) return;
    clearTimeout(leaveTimer);
    sidebar.classList.add('peek');
  });
  sidebar.addEventListener('mouseleave', () => {
    if (!collapsed || pinned) return;
    leaveTimer = setTimeout(() => sidebar.classList.remove('peek'), 150);
  });
}

export function initTabs({ onTabChange } = {}) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
      onTabChange?.(btn.dataset.tab);
    });
  });
}

export function tickFooterClock() {
  const el = document.getElementById('footer-time');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString('es-AR');
}
