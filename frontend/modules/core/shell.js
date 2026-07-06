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

export function confirmDialog(title, body, danger = false, expectedText = null) {
  return new Promise((resolve) => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent  = body;
    const ok     = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    const input  = document.getElementById('confirm-input');
    ok.className = danger ? 'btn btn-danger btn-modal-ok' : 'btn btn-primary btn-modal-ok';
    input.classList.toggle('hidden', !expectedText);
    input.value = '';
    input.placeholder = expectedText ? `Escribí ${expectedText}` : '';
    ok.disabled = !!expectedText;
    document.getElementById('confirm-modal').classList.remove('hidden');
    if (expectedText) input.focus();

    function cleanup(result) {
      document.getElementById('confirm-modal').classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('input', onInput);
      input.classList.add('hidden');
      ok.disabled = false;
      resolve(result);
    }
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onInput  = () => { ok.disabled = input.value !== expectedText; };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('input', onInput);
  });
}

export function openJsonModal({ title, value, onSave }) {
  const modal    = document.getElementById('json-modal');
  const textarea = document.getElementById('json-modal-textarea');
  const errEl    = document.getElementById('json-modal-error');
  const saveBtn  = document.getElementById('json-modal-save');

  document.getElementById('json-modal-title').textContent = title;
  textarea.value = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  errEl.textContent = '';
  errEl.classList.add('hidden');
  modal.classList.remove('hidden');
  textarea.focus();

  const close = () => modal.classList.add('hidden');

  const save = async () => {
    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch (e) {
      errEl.textContent = 'JSON inválido: ' + e.message;
      errEl.classList.remove('hidden');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    try {
      await onSave(parsed);
      close();
    } catch (e) {
      errEl.textContent = 'Error al guardar: ' + (e.message ?? 'desconocido');
      errEl.classList.remove('hidden');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  };

  document.getElementById('json-modal-save').onclick   = save;
  document.getElementById('json-modal-cancel').onclick = close;
  document.getElementById('json-modal-close').onclick  = close;
}

export function initJsonModal() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('json-modal').classList.add('hidden');
  });
}
