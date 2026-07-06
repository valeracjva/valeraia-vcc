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
    .replace(/>/g, '&gt;');
}

export function formField(label, id, value, placeholder, readonly = false) {
  return `<div class="form-field">` +
    `<label class="form-label" for="${id}">${label}</label>` +
    `<input class="form-input" id="${id}" value="${escHtml(value)}" placeholder="${escHtml(placeholder)}"${readonly ? ' readonly' : ''}>` +
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
