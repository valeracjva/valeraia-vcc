import { get, apiFetch } from '../core/api.js';
import { escHtml, openEditModal, formField } from '../core/dom.js';

let confirmDialogRef = null;
let vaultCategories = [];
let vaultData = new Map();      // category -> { keys: [...] }
let expanded = new Set();       // categorías expandidas
let editing = new Set();        // "category:key"
let revealed = new Set();       // "category:key"

const cssEsc = (value) => {
  const s = String(value ?? '');
  return globalThis.CSS?.escape ? CSS.escape(s) : s.replace(/"/g, '\\"');
};

export function initVault({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;
  document.getElementById('btn-vault-refresh')?.addEventListener('click', () => loadVault());
  document.getElementById('vault-container')?.addEventListener('click', onVaultClick);
}

export async function loadVault() {
  const container = document.getElementById('vault-container');
  if (!container) return;
  container.innerHTML = `<div class="vault-loading">Cargando secretos…</div>`;

  try {
    vaultCategories = await get('/api/vault');
    if (!vaultCategories.length) {
      container.innerHTML = `
        <div class="vault-empty">
          <div class="vault-empty-title">No hay archivos .env en la carpeta de secretos.</div>
          <div class="vault-empty-text">Creá un archivo en <code>D:\Workspace-Repos\secrets</code> para empezar.</div>
        </div>`;
      return;
    }
    renderVault();
  } catch (err) {
    container.innerHTML = `
      <div class="vault-error">
        <div class="vault-empty-title">No pude cargar los secretos</div>
        <div class="vault-empty-text">${escHtml(err.message)}</div>
      </div>`;
  }
}

function renderVault() {
  const container = document.getElementById('vault-container');
  if (!container) return;

  const grid = document.createElement('div');
  grid.className = 'vault-grid';

  for (const cat of vaultCategories) {
    grid.appendChild(renderCategoryCard(cat));
  }

  container.innerHTML = '';
  container.appendChild(grid);
}

function renderCategoryCard(cat) {
  const data = vaultData.get(cat.category);
  const keys = data?.keys ?? [];
  const isOpen = expanded.has(cat.category);
  const count = Number.isFinite(cat.keys_count) ? cat.keys_count : keys.length;

  const card = document.createElement('section');
  card.className = 'infra-card vault-card';
  card.dataset.category = cat.category;

  const body = document.createElement('div');
  body.className = `vault-card-body${isOpen ? '' : ' hidden'}`;
  body.dataset.vaultBody = cat.category;
  body.innerHTML = isOpen
    ? renderCategoryBody(cat.category, keys, cat.file, cat.modified_at)
    : '';

  const previewKeys = keys.slice(0, 2).map(k => `<span class="vault-preview-key">${escHtml(k.key)}</span>`).join('');
  const previewMore = keys.length > 2 ? `<span class="vault-preview-more">+${keys.length - 2}</span>` : '';

  card.innerHTML = `
    <header class="vault-card-header" data-vault-toggle="${escHtml(cat.category)}">
      <div class="vault-card-title-row">
        <div class="vault-card-title-wrap">
          <div class="vault-card-title">🔑 ${escHtml(cat.category)}</div>
          <div class="vault-card-subtitle">${escHtml(cat.file)}</div>
        </div>
        <span class="vault-card-badge">${count} claves</span>
      </div>
      <div class="vault-card-meta">
        <span>${new Date(cat.modified_at).toLocaleString('es-AR')}</span>
        <span>${isOpen ? 'abierta' : 'cerrada'}</span>
      </div>
      ${!isOpen ? `<div class="vault-preview">${previewKeys}${previewMore}</div>` : ''}
    </header>
  `;

  card.appendChild(body);
  return card;
}

function renderCategoryBody(category, keys, file, modifiedAt) {
  if (!keys.length) {
    return `
      <div class="vault-empty vault-empty-inline">
        <div class="vault-empty-title">Sin secretos en esta categoría</div>
        <div class="vault-empty-text">${escHtml(file)} · mod: ${new Date(modifiedAt).toLocaleString('es-AR')}</div>
      </div>
      <div class="vault-card-actions">
        <button class="btn btn-sm btn-primary" data-vault-action="add" data-category="${escHtml(category)}">＋ Agregar secreto</button>
      </div>
    `;
  }

  return `
    <div class="vault-entries">
      ${keys.map(k => renderEntry(category, k)).join('')}
    </div>
    <div class="vault-card-actions">
      <button class="btn btn-sm btn-primary" data-vault-action="add" data-category="${escHtml(category)}">＋ Agregar secreto</button>
    </div>
  `;
}

function renderEntry(category, entry) {
  const editId = `${category}:${entry.key}`;
  const isEditing = editing.has(editId);
  const isRevealed = revealed.has(editId);

  if (isEditing) {
    return `
      <div class="vault-entry editing" data-vault-entry="${escHtml(editId)}">
        <div class="vault-entry-key">${escHtml(entry.key)}</div>
        <div class="vault-entry-value-wrap">
          <input class="form-input vault-edit-input" data-vault-edit-input="${escHtml(editId)}" type="text" value="${escHtml(entry.value)}" autocomplete="off">
        </div>
        <div class="vault-entry-actions">
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye-edit" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">👁</button>
          <button class="btn btn-sm btn-primary vault-icon-btn" data-vault-action="save" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Guardar">💾</button>
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="cancel" data-edit-id="${escHtml(editId)}" title="Cancelar">✕</button>
        </div>
      </div>`;
  }

  return `
    <div class="vault-entry" data-vault-entry="${escHtml(editId)}">
      <div class="vault-entry-key">${escHtml(entry.key)}</div>
      <div class="vault-entry-value-wrap">
        <div class="vault-entry-value${isRevealed ? '' : ' masked'}" data-vault-value="${escHtml(editId)}">${isRevealed ? escHtml(entry.value) : '••••••••••••'}</div>
      </div>
      <div class="vault-entry-actions">
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">${isRevealed ? '🙈' : '👁'}</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="edit" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Editar">✏</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="delete" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Eliminar">🗑</button>
      </div>
    </div>`;
}

function renderCategory(catName) {
  const cat = vaultCategories.find(c => c.category === catName);
  if (!cat) return;
  const body = document.querySelector(`[data-vault-body="${cssEsc(catName)}"]`);
  if (!body) return;

  const data = vaultData.get(catName);
  const keys = data?.keys ?? [];
  body.innerHTML = renderCategoryBody(catName, keys, cat.file, cat.modified_at);
}

async function ensureCategoryLoaded(category) {
  if (vaultData.has(category)) return vaultData.get(category);
  const data = await get(`/api/vault/${encodeURIComponent(category)}`);
  vaultData.set(category, data);
  return data;
}

async function toggleCategory(category) {
  const body = document.querySelector(`[data-vault-body="${cssEsc(category)}"]`);
  if (!body) return;

  if (expanded.has(category)) {
    expanded.delete(category);
    body.classList.add('hidden');
    body.innerHTML = '';
    return;
  }

  expanded.add(category);
  body.classList.remove('hidden');
  body.innerHTML = `<div class="vault-loading">Cargando ${escHtml(category)}…</div>`;

  try {
    await ensureCategoryLoaded(category);
    renderCategory(category);
  } catch (err) {
    expanded.delete(category);
    body.innerHTML = `<div class="vault-error"><div class="vault-empty-title">No se pudo abrir la categoría</div><div class="vault-empty-text">${escHtml(err.message)}</div></div>`;
  }
}

function setEditing(editId, enabled) {
  if (enabled) editing.add(editId);
  else editing.delete(editId);
}

function setRevealed(editId, enabled) {
  if (enabled) revealed.add(editId);
  else revealed.delete(editId);
}

function rerenderCategoryFromState(category) {
  const cat = vaultCategories.find(c => c.category === category);
  if (!cat) return;
  const body = document.querySelector(`[data-vault-body="${cssEsc(category)}"]`);
  if (!body) return;

  const data = vaultData.get(category) ?? { keys: [] };
  body.innerHTML = renderCategoryBody(category, data.keys, cat.file, cat.modified_at);
}

async function refreshCategory(category) {
  const [list, data] = await Promise.all([
    get('/api/vault'),
    get(`/api/vault/${encodeURIComponent(category)}`),
  ]);
  vaultCategories = list;
  vaultData.set(category, data);
  renderVault();
  if (expanded.has(category)) {
    expanded.delete(category);
    toggleCategory(category);
  }
}

async function addSecret(category) {
  const close = openEditModal((box, done) => {
    box.innerHTML = `
      <div class="modal-title">Agregar secreto · ${escHtml(category)}</div>
      <div class="modal-body">Se agrega al final del archivo <code>${escHtml(category)}.env</code>.</div>
      ${formField('Clave', 'vault-add-key', '', 'NOMBRE_VARIABLE')}
      ${formField('Valor', 'vault-add-value', '', 'valor')}
      <div class="manage-form-actions">
        <button class="btn btn-modal-cancel" id="vault-add-cancel">Cancelar</button>
        <button class="btn btn-modal-ok" id="vault-add-save">Guardar</button>
      </div>`;

    const keyEl = box.querySelector('#vault-add-key');
    const valueEl = box.querySelector('#vault-add-value');
    box.querySelector('#vault-add-cancel').addEventListener('click', done);
    box.querySelector('#vault-add-save').addEventListener('click', async () => {
      const key = keyEl.value.trim();
      const value = valueEl.value;
      if (!key || !/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        keyEl.focus();
        return;
      }
      try {
        await apiFetch(`/api/vault/${encodeURIComponent(category)}`, { method: 'POST', body: { key, value } });
        done();
        await refreshCategory(category);
      } catch (err) {
        alert(`Error al agregar: ${err.message}`);
      }
    });
  }, { size: 'compact' });
  return close;
}

async function saveEntry(category, key) {
  const editId = `${category}:${key}`;
  const input = document.querySelector(`[data-vault-edit-input="${cssEsc(editId)}"]`);
  if (!input) return;

  try {
    await apiFetch(`/api/vault/${encodeURIComponent(category)}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { value: input.value },
    });
    setEditing(editId, false);
    setRevealed(editId, false);
    await refreshCategory(category);
  } catch (err) {
    alert(`Error al guardar: ${err.message}`);
  }
}

async function deleteEntry(category, key) {
  const ok = confirmDialogRef
    ? await confirmDialogRef('Eliminar secreto', `¿Eliminar ${key} de ${category}?`, true)
    : window.confirm(`¿Eliminar ${key} de ${category}?`);
  if (!ok) return;

  try {
    await apiFetch(`/api/vault/${encodeURIComponent(category)}/${encodeURIComponent(key)}`, { method: 'DELETE' });
    setEditing(`${category}:${key}`, false);
    setRevealed(`${category}:${key}`, false);
    await refreshCategory(category);
  } catch (err) {
    alert(`Error al eliminar: ${err.message}`);
  }
}

function onVaultClick(e) {
  const btn = e.target.closest('[data-vault-action], [data-vault-toggle]');
  if (!btn) return;

  const toggle = btn.getAttribute('data-vault-toggle');
  if (toggle) {
    toggleCategory(toggle);
    return;
  }

  const action = btn.dataset.vaultAction;
  const category = btn.dataset.category;
  const key = btn.dataset.key;
  const editId = btn.dataset.editId;

  if (action === 'add' && category) {
    addSecret(category);
    return;
  }

  if (action === 'toggle-eye' && editId) {
    setRevealed(editId, !revealed.has(editId));
    rerenderCategoryFromState(editId.split(':')[0]);
    return;
  }

  if (action === 'toggle-eye-edit' && editId) {
    const input = document.querySelector(`[data-vault-edit-input="${cssEsc(editId)}"]`);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
    return;
  }

  if (action === 'edit' && category && key) {
    setEditing(`${category}:${key}`, true);
    rerenderCategoryFromState(category);
    const input = document.querySelector(`[data-vault-edit-input="${cssEsc(`${category}:${key}`)}"]`);
    input?.focus();
    return;
  }

  if (action === 'cancel' && editId) {
    setEditing(editId, false);
    rerenderCategoryFromState(editId.split(':')[0]);
    return;
  }

  if (action === 'save' && category && key) {
    saveEntry(category, key);
    return;
  }

  if (action === 'delete' && category && key) {
    deleteEntry(category, key);
  }
}
