export function buildAccordion(label, count, bodyEl, { badge = null, startOpen = false, storageKey = null, title = null } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'vcc-accordion';

  const storKey = storageKey ? `vcc-acc-${storageKey}` : null;
  const savedStr = storKey ? localStorage.getItem(storKey) : null;
  const isOpen = savedStr !== null ? savedStr === 'open' : startOpen;

  const header = document.createElement('div');
  header.className = 'section-header';
  if (title) header.title = title;

  const arrow = document.createElement('span');
  arrow.className = 'section-header-arrow';
  arrow.textContent = isOpen ? '▼' : '▶';

  const lbl = document.createElement('span');
  lbl.textContent = label;

  const cnt = document.createElement('span');
  cnt.className = 'section-header-count';
  cnt.textContent = count;

  header.appendChild(arrow);
  header.appendChild(lbl);
  header.appendChild(cnt);

  if (badge) {
    const b = document.createElement('span');
    b.className = `acc-badge acc-badge-${badge}`;
    b.textContent = badge;
    header.appendChild(b);
  }

  const body = document.createElement('div');
  body.className = 'acc-body' + (isOpen ? '' : ' hidden');
  body.appendChild(bodyEl);

  header.addEventListener('click', () => {
    const nowOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !nowOpen);
    arrow.textContent = nowOpen ? '▼' : '▶';
    if (storKey) localStorage.setItem(storKey, nowOpen ? 'open' : 'closed');
  });

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formField(label, id, value, placeholder, readonly = false) {
  return `<div class="form-field">` +
    `<label class="form-label" for="${id}">${label}</label>` +
    `<input class="form-input" id="${id}" value="${escHtml(value)}" placeholder="${escHtml(placeholder)}"${readonly ? ' readonly' : ''}>` +
    `</div>`;
}

export function formPasswordField(label, id, value, placeholder) {
  return `<div class="form-field">` +
    `<label class="form-label" for="${id}">${label}</label>` +
    `<input class="form-input" type="password" id="${id}" value="${escHtml(value)}" placeholder="${escHtml(placeholder)}" autocomplete="new-password">` +
    `</div>`;
}

export function formSelect(label, id, selected, options) {
  const opts = options.map(([v, l]) =>
    `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`
  ).join('');
  return `<div class="form-field">` +
    `<label class="form-label" for="${id}">${label}</label>` +
    `<select class="form-input" id="${id}">${opts}</select>` +
    `</div>`;
}

export function showManageBanner(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `manage-banner${isError ? ' manage-banner-error' : ''}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

export function openEditModal(renderInto, { size = 'standard', title = '' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay infra-edit-modal';
  const box = document.createElement('div');
  box.className = size === 'compact'
    ? 'modal-box infra-edit-modal-box infra-edit-modal-compact'
    : 'modal-box infra-edit-modal-box';

  // Header con botón de cierre (X) — siguiendo el patrón de json-modal-header
  const header = document.createElement('div');
  header.className = 'infra-edit-modal-header';
  header.innerHTML = `
    <span class="infra-edit-modal-title"></span>
    <button class="infra-edit-modal-close" aria-label="Cerrar">✕</button>
  `;
  box.appendChild(header);

  const content = document.createElement('div');
  content.className = 'infra-edit-modal-content';
  box.appendChild(content);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Título opcional
  if (title) {
    header.querySelector('.infra-edit-modal-title').textContent = title;
  }

  // Regla VCC: los modales de edición nunca cierran con clic afuera -- solo Escape o los
  // botones Cancelar/Guardar/X (formularios largos, un clic accidental no debe perder lo tipeado).
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKeydown); overlay.remove(); };
  document.addEventListener('keydown', onKeydown);

  // Botón X en el header
  header.querySelector('.infra-edit-modal-close').addEventListener('click', close);

  renderInto(content, close);
  return close;
}
