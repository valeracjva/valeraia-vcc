import { get, apiFetch } from '../core/api.js';
import { escHtml, openEditModal, formField, formSelect } from '../core/dom.js';

let confirmDialogRef = null;
let vaultCategories = [];
let vaultData = new Map();      // category -> { keys: [...] }
let expanded = new Set();       // categorías expandidas
let editing = new Set();        // "category:key"
let revealed = new Set();       // "category:key"
const VAULT_VIEW_KEY = 'vcc-vault-view';
let activeVaultModal = null;

const cssEsc = (value) => {
  const s = String(value ?? '');
  return globalThis.CSS?.escape ? CSS.escape(s) : s.replace(/"/g, '\\"');
};

const SECRETS_DIR = 'D:\\Workspace-Repos\\secrets';

const envPathFor = (category, file) => {
  const cat = vaultCategories.find(c => c.category === category);
  const value = cat?.file_path ?? cat?.path ?? file ?? `${category}.env`;
  return /^[A-Za-z]:[\\/]/.test(value) ? value : `${SECRETS_DIR}\\${value}`;
};

export function initVault({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;
  document.getElementById('btn-vault-refresh')?.addEventListener('click', () => loadVault());
  document.getElementById('btn-vault-manage')?.addEventListener('click', () => showVaultManageModal());
  document.getElementById('vault-container')?.addEventListener('click', onVaultClick);
  document.getElementById('vault-container')?.addEventListener('keydown', onVaultKeydown);
  document.querySelectorAll('.btn-vault-view').forEach(btn => {
    btn.addEventListener('click', () => {
      setVaultView(btn.dataset.vaultView === 'list' ? 'list' : 'cards');
      renderVault();
    });
  });
  syncVaultViewButtons();
}

function getVaultView() {
  return localStorage.getItem(VAULT_VIEW_KEY) === 'list' ? 'list' : 'cards';
}

function setVaultView(view) {
  localStorage.setItem(VAULT_VIEW_KEY, view);
  syncVaultViewButtons();
}

function syncVaultViewButtons() {
  const view = getVaultView();
  document.querySelectorAll('.btn-vault-view').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vaultView === view);
  });
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

  syncVaultViewButtons();

  if (getVaultView() === 'list') {
    container.innerHTML = '';
    container.appendChild(renderVaultList());
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'vault-grid';

  for (const cat of vaultCategories) {
    grid.appendChild(renderCategoryCard(cat));
  }

  container.innerHTML = '';
  container.appendChild(grid);
}

function renderVaultList() {
  const table = document.createElement('table');
  table.className = 'data-table vault-list-table';
  table.innerHTML = `
    <thead><tr>
      <th>CATEGORÍA</th><th>ARCHIVO</th><th>RUTA</th><th>CLAVES</th><th>MODIFICADO</th><th>ACCIONES</th>
    </tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const cat of vaultCategories) {
    const count = Number.isFinite(cat.keys_count) ? cat.keys_count : 0;
    const tr = document.createElement('tr');
    tr.dataset.category = cat.category;
    tr.innerHTML = `
      <td><strong class="vault-list-category">${escHtml(cat.category)}</strong></td>
      <td><code>${escHtml(cat.file)}</code></td>
      <td><code class="vault-file-path" title="${escHtml(envPathFor(cat.category, cat.file))}">${escHtml(envPathFor(cat.category, cat.file))}</code></td>
      <td>${count}</td>
      <td class="vault-list-date">${new Date(cat.modified_at).toLocaleString('es-AR')}</td>
      <td class="vault-list-actions">
        <button class="btn btn-sm btn-ghost" data-vault-action="open-modal" data-category="${escHtml(cat.category)}">Ver secretos</button>
        <button class="btn btn-sm btn-primary" data-vault-action="add" data-category="${escHtml(cat.category)}">＋ Agregar</button>
      </td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderCategoryCard(cat) {
  const data = vaultData.get(cat.category);
  const keys = data?.keys ?? [];
  const isOpen = expanded.has(cat.category);
  const count = Number.isFinite(cat.keys_count) ? cat.keys_count : keys.length;
  const filePath = envPathFor(cat.category, cat.file);

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
    <header class="vault-card-header" data-vault-toggle="${escHtml(cat.category)}" role="button" tabindex="0" aria-expanded="${isOpen}">
      <div class="infra-card-header vault-card-status-row">
        <span class="infra-dot vault-dot"></span>
        <span class="infra-risk-badge vault-card-badge">SECRETO</span>
        <span class="vault-card-count">${count} claves</span>
        <span class="vault-card-state">${isOpen ? 'abierta' : 'cerrada'}</span>
      </div>
      <div class="infra-card-row2 vault-card-row2">
        <span class="infra-id vault-card-title" title="${escHtml(cat.category)}">${escHtml(cat.category)}</span>
        <span class="infra-ip vault-card-file" title="${escHtml(cat.file)}">${escHtml(cat.file)}</span>
      </div>
      <div class="vault-card-path" title="${escHtml(filePath)}">${escHtml(filePath)}</div>
      <div class="infra-empresa vault-card-meta">Modificado ${new Date(cat.modified_at).toLocaleString('es-AR')}</div>
      ${!isOpen ? `<div class="vault-preview">${previewKeys}${previewMore}</div>` : ''}
      <div class="infra-toggle vault-card-toggle" data-open="${isOpen}">
        <span class="infra-arrow">${isOpen ? '▼' : '▶'}</span>
        <span class="infra-toggle-label">${isOpen ? 'Ocultar claves' : 'Ver claves'}</span>
      </div>
    </header>
  `;

  card.appendChild(body);
  return card;
}

function renderCategoryBody(category, keys, file, modifiedAt) {
  const sortedKeys = [...keys].sort((a, b) => a.key.localeCompare(b.key, 'es'));
  const filePath = envPathFor(category, file);

  if (!sortedKeys.length) {
    return `
      <div class="vault-empty vault-empty-inline">
        <div class="vault-empty-title">Sin secretos en esta categoría</div>
        <div class="vault-empty-text">${escHtml(filePath)} · mod: ${new Date(modifiedAt).toLocaleString('es-AR')}</div>
      </div>
      <div class="vault-card-actions">
        <button class="btn btn-sm btn-primary" data-vault-action="add" data-category="${escHtml(category)}">＋ Agregar secreto</button>
      </div>
    `;
  }

  return `
    <div class="vault-entries">
      ${sortedKeys.map(k => renderEntry(category, k)).join('')}
    </div>
    <div class="vault-card-actions">
      <button class="btn btn-sm btn-primary" data-vault-action="add" data-category="${escHtml(category)}">＋ Agregar secreto</button>
    </div>
  `;
}

function renderCategoryModalContent(category, content) {
  const cat = vaultCategories.find(c => c.category === category);
  const data = vaultData.get(category);
  const keys = data?.keys ?? [];
  const file = cat?.file ?? `${category}.env`;
  const filePath = data?.file_path ?? envPathFor(category, file);
  const modifiedAt = cat?.modified_at ?? data?.modified_at ?? new Date().toISOString();
  content.innerHTML = `
    <div class="vault-modal-meta">
      <span><strong>${escHtml(file)}</strong></span>
      <span class="vault-modal-path" title="${escHtml(filePath)}">${escHtml(filePath)}</span>
      <span>${keys.length} claves</span>
      <span>Modificado ${new Date(modifiedAt).toLocaleString('es-AR')}</span>
    </div>
    ${renderCategoryBody(category, keys, file, modifiedAt)}
  `;
}

async function showCategorySecretsModal(category) {
  const close = openEditModal((content) => {
    activeVaultModal = { category, content };
    content.addEventListener('click', onVaultClick);
    content.innerHTML = `<div class="vault-loading">Cargando ${escHtml(category)}…</div>`;
    ensureCategoryLoaded(category)
      .then(() => renderCategoryModalContent(category, content))
      .catch(err => {
        content.innerHTML = `<div class="vault-error"><div class="vault-empty-title">No se pudo abrir la categoría</div><div class="vault-empty-text">${escHtml(err.message)}</div></div>`;
      });
  }, { title: `Secretos · ${category}` });
  return close;
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
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye-edit" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">Ver</button>
          <button class="btn btn-sm btn-primary vault-icon-btn" data-vault-action="save" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Guardar">Guardar</button>
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="cancel" data-edit-id="${escHtml(editId)}" title="Cancelar">Cancelar</button>
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
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">${isRevealed ? 'Ocultar' : 'Ver'}</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="edit" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Editar">Editar</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="delete" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Eliminar">Eliminar</button>
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

function updateCategoryHeaderState(category, isOpen) {
  const header = document.querySelector(`[data-vault-toggle="${cssEsc(category)}"]`);
  if (!header) return;

  header.setAttribute('aria-expanded', String(isOpen));
  const state = header.querySelector('.vault-card-state');
  if (state) state.textContent = isOpen ? 'abierta' : 'cerrada';
  const toggle = header.querySelector('.vault-card-toggle');
  if (toggle) toggle.dataset.open = String(isOpen);
  const arrow = header.querySelector('.infra-arrow');
  if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
  const label = header.querySelector('.infra-toggle-label');
  if (label) label.textContent = isOpen ? 'Ocultar claves' : 'Ver claves';
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
    updateCategoryHeaderState(category, false);
    body.classList.add('hidden');
    body.innerHTML = '';
    return;
  }

  expanded.add(category);
  updateCategoryHeaderState(category, true);
  body.classList.remove('hidden');
  body.innerHTML = `<div class="vault-loading">Cargando ${escHtml(category)}…</div>`;

  try {
    await ensureCategoryLoaded(category);
    renderCategory(category);
  } catch (err) {
    expanded.delete(category);
    updateCategoryHeaderState(category, false);
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
  const data = vaultData.get(category) ?? { keys: [] };
  const body = document.querySelector(`[data-vault-body="${cssEsc(category)}"]`);
  if (body) body.innerHTML = renderCategoryBody(category, data.keys, cat.file, cat.modified_at);
  if (activeVaultModal?.category === category) {
    renderCategoryModalContent(category, activeVaultModal.content);
  }
}

async function refreshCategory(category) {
  const [list, data] = await Promise.all([
    get('/api/vault'),
    get(`/api/vault/${encodeURIComponent(category)}`),
  ]);
  vaultCategories = list;
  vaultData.set(category, data);
  renderVault();
  if (activeVaultModal?.category === category) {
    renderCategoryModalContent(category, activeVaultModal.content);
  }
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

async function showVaultManageModal() {
  const firstCategory = vaultCategories[0]?.category ?? '';
  const options = vaultCategories.map(cat => [cat.category, cat.category]);
  const close = openEditModal((box, done) => {
    box.innerHTML = `
      <div class="modal-body vault-manage-hint">Alta rápida de secreto. Elegí la categoría, cargá clave y valor, y se guarda en el .env correspondiente.</div>
      ${formSelect('Categoría', 'vault-manage-category', firstCategory, options)}
      ${formField('Clave', 'vault-manage-key', '', 'NOMBRE_VARIABLE')}
      ${formField('Valor', 'vault-manage-value', '', 'valor')}
      <div class="manage-banner hidden" id="vault-manage-banner"></div>
      <div class="manage-form-actions">
        <button class="btn btn-modal-cancel" id="vault-manage-cancel">Cancelar</button>
        <button class="btn btn-modal-ok" id="vault-manage-save">Guardar</button>
      </div>`;

    const categoryEl = box.querySelector('#vault-manage-category');
    const keyEl = box.querySelector('#vault-manage-key');
    const valueEl = box.querySelector('#vault-manage-value');
    const banner = box.querySelector('#vault-manage-banner');
    box.querySelector('#vault-manage-cancel').addEventListener('click', done);
    box.querySelector('#vault-manage-save').addEventListener('click', async () => {
      const category = categoryEl.value;
      const key = keyEl.value.trim();
      const value = valueEl.value;
      if (!category || !key || !/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        banner.textContent = 'Clave inválida. Usá formato NOMBRE_VARIABLE.';
        banner.className = 'manage-banner manage-banner-error';
        keyEl.focus();
        return;
      }
      try {
        await apiFetch(`/api/vault/${encodeURIComponent(category)}`, { method: 'POST', body: { key, value } });
        done();
        await refreshCategory(category);
      } catch (err) {
        banner.textContent = err.message;
        banner.className = 'manage-banner manage-banner-error';
      }
    });
  }, { size: 'compact', title: 'Gestionar secretos' });
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

  if (action === 'open-modal' && category) {
    showCategorySecretsModal(category);
    return;
  }

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

function onVaultKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const toggle = e.target.closest('[data-vault-toggle]');
  if (!toggle) return;
  e.preventDefault();
  toggleCategory(toggle.getAttribute('data-vault-toggle'));
}
