import { API_BASE } from '../core/constants.js';
import { get } from '../core/api.js';
import { publishActivityNote } from '../core/activity-rail.js';
import { escHtml } from '../core/dom.js';

let confirmDialogRef = null;
let openJsonModalRef = null;

export function updateTunnelDots(tunnels) {
  for (const [port, active] of Object.entries(tunnels)) {
    const dot = document.getElementById(`tunnel-dot-${port}`);
    if (!dot) continue;
    dot.textContent = active ? '●' : '○';
    dot.classList.toggle('active', active);
    dot.classList.toggle('inactive', !active);
  }
}

// === M6 — Túneles SSH ===
let tunnelsBusy    = {};
let tunnelManageMode = false;
let tunnelAdhocMode  = false;

// ── Render cards ──────────────────────────────────────────────────────────────

function renderTunnels(tunnels) {
  const c = document.getElementById('tunnels-container');
  c.innerHTML = '';
  // Limpiar cache solo de puertos que cambiaron de estado (activo ↔ inactivo)
  for (const t of tunnels) {
    if (dbCache[t.port] && !t.active) delete dbCache[t.port];
  }

  const countLbl = document.getElementById('tunnels-count-label');
  if (countLbl) {
    const active = tunnels.filter(t => t.active).length;
    countLbl.textContent = `${active} activo${active !== 1 ? 's' : ''} de ${tunnels.length}`;
  }

  for (const t of tunnels) {
    const card = document.createElement('div');
    card.className = `tunnel-card${t.prod ? ' tunnel-prod' : ''}${t.adhoc ? ' tunnel-adhoc' : ''}`;
    card.dataset.port = t.port;

    // Header: dot + nombre + badges
    const header = document.createElement('div');
    header.className = 'tunnel-card-header';

    const dot = document.createElement('span');
    dot.className   = `tunnel-card-dot ${t.active ? 'active' : 'inactive'}`;
    dot.textContent = t.active ? '●' : '○';

    const nameEl = document.createElement('div');
    nameEl.className = 'tunnel-card-name';
    nameEl.innerHTML =
      escHtml(t.name) +
      (t.prod  ? ' <span class="badge-prod">PROD</span>'    : '') +
      (t.adhoc ? ' <span class="badge-adhoc">ad-hoc</span>' : '');

    header.appendChild(dot);
    header.appendChild(nameEl);

    // Info: descripción + meta
    const info = document.createElement('div');
    info.className = 'tunnel-card-info';
    info.innerHTML =
      `<div class="tunnel-card-desc">${escHtml(t.desc || '')}</div>` +
      `<div class="tunnel-card-meta">:${t.port} → ${escHtml(t.remote)}</div>`;

    // Footer: botón tunnel
    const footer = document.createElement('div');
    footer.className = 'tunnel-card-footer';

    const btn = document.createElement('button');
    btn.className   = `btn-tunnel ${t.active ? 'close' : 'open'}`;
    btn.dataset.port = t.port;
    btn.textContent  = t.active ? 'Cerrar' : 'Abrir';
    btn.disabled     = !!tunnelsBusy[t.port];
    if (tunnelsBusy[t.port]) btn.textContent = '...';
    btn.addEventListener('click', () => toggleTunnel(t.port, t.active, t.prod));
    footer.appendChild(btn);

    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(footer);

    // Sección DB: siempre visible si dbEnabled, carga automática si activo
    if (t.dbEnabled) {
      const dbSection = document.createElement('div');
      dbSection.className = 'tunnel-db-section';

      const dbLabel = document.createElement('div');
      dbLabel.className = 'tunnel-db-section-label';
      dbLabel.textContent = '🗄 Bases de datos';

      const dbContent = document.createElement('div');
      dbContent.className = 'tunnel-db-content';

      if (t.active) {
        if (dbCache[t.port]) {
          renderDbRows(dbContent, dbCache[t.port]);
        } else {
          dbContent.innerHTML = '<span class="tunnel-db-loading">Consultando…</span>';
          loadTunnelDb(t.port, dbContent);
        }
      } else {
        dbContent.innerHTML = '<span class="tunnel-db-offline">Túnel cerrado</span>';
      }

      dbSection.appendChild(dbLabel);
      dbSection.appendChild(dbContent);
      card.appendChild(dbSection);
    }

    c.appendChild(card);
  }
}

// ── DB: carga directa (sin toggle) ───────────────────────────────────────────
const dbCache = {}; // { port: rows[] }

async function loadTunnelDb(port, contentEl) {
  try {
    const data = await get(`/api/tunnel-db/${port}`);
    dbCache[port] = data.databases;
    renderDbRows(contentEl, data.databases);
  } catch (err) {
    contentEl.innerHTML = `<span class="tunnel-db-error">${escHtml(err.message ?? 'Error al consultar')}</span>`;
  }
}

function renderDbRows(body, rows) {
  body.innerHTML = '';
  if (!rows?.length) {
    body.innerHTML = '<span class="tunnel-db-empty">Sin bases de datos</span>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'tunnel-db-table';
  table.innerHTML =
    '<thead><tr><th>Base</th><th>Tablas</th><th>Tamaño</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${escHtml(r.db)}</td>` +
      `<td>${r.tables}</td>` +
      `<td>${r.size_mb != null ? r.size_mb + ' MB' : '—'}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  body.appendChild(table);
}

function showTunnelError(msg) {
  const c = document.getElementById('tunnels-container');
  c.innerHTML =
    `<div class="tunnel-error-state">` +
    `<span style="color:var(--red)">${escHtml(msg)}</span>` +
    `<button class="btn btn-success btn-ssl-refresh" id="btn-tunnel-retry">↻ Reintentar</button>` +
    `</div>`;
  document.getElementById('btn-tunnel-retry').addEventListener('click', loadTunnels);
}

function showTunnelBanner(msg, isError) {
  const existing = document.getElementById('tunnel-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id        = 'tunnel-banner';
  banner.className = `tunnel-banner ${isError ? 'error' : 'info'}`;
  banner.textContent = msg;
  document.getElementById('tunnels-container').before(banner);
  setTimeout(() => banner.remove(), 5000);
}

export async function loadTunnels() {
  try {
    const data = await get('/api/tunnels/config');
    document.getElementById('tunnel-banner')?.remove();
    renderTunnels(data);
  } catch {
    showTunnelError('No se pudo cargar la lista de túneles');
  }
}

// ── Open / close con confirmación PROD ───────────────────────────────────────

async function toggleTunnel(port, isActive, isProd) {
  if (!isActive && isProd) {
    const ok = await confirmDialogRef(
      '⚠ Túnel PRODUCCIÓN',
      `Vas a abrir el túnel al puerto ${port}. Esto da acceso directo a la base de datos de producción. ¿Confirmás?`,
      true
    );
    if (!ok) return;
  }

  const entryId = `tunnel-${port}-${Date.now()}`;
  publishActivityNote({
    entryId,
    title: `Túnel ${port}`,
    category: 'tunnel',
    status: 'running',
    message: isActive ? 'cerrando túnel' : 'abriendo túnel',
    details: [isProd ? 'preset PROD' : 'preset no PROD'],
  });

  tunnelsBusy[port] = true;
  const btn = document.querySelector(`.btn-tunnel[data-port="${port}"]`);
  if (btn) { btn.disabled = true; btn.textContent = isActive ? 'Cerrando...' : 'Abriendo...'; }

  let opError = false;
  try {
    const action = isActive ? 'close' : 'open';
    const res  = await fetch(`${API_BASE}/api/tunnels/${port}/${action}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (!isActive && body.status === 'timeout')) opError = true;
  } catch { opError = true; }

  delete tunnelsBusy[port];

  try {
    const data = await get('/api/tunnels/config');
    document.getElementById('tunnel-banner')?.remove();
    renderTunnels(data);
    if (opError) {
      showTunnelBanner(
        isActive ? 'No se pudo cerrar el túnel' : 'No se pudo abrir el túnel — ¿VPN activa?',
        true
      );
      publishActivityNote({
        entryId,
        title: `Túnel ${port}`,
        category: 'tunnel',
        status: 'error',
        message: isActive ? 'falló el cierre' : 'falló la apertura',
        details: [isActive ? 'El backend no confirmó el cierre' : 'El backend respondió timeout o error'],
      });
    } else {
      publishActivityNote({
        entryId,
        title: `Túnel ${port}`,
        category: 'tunnel',
        status: 'success',
        message: isActive ? 'túnel cerrado' : 'túnel abierto',
        details: [isProd ? 'preset PROD' : 'preset no PROD'],
      });
    }
  } catch {
    showTunnelBanner('Error al actualizar estado de túneles', true);
    publishActivityNote({
      entryId,
      title: `Túnel ${port}`,
      category: 'tunnel',
      status: 'error',
      message: 'no se pudo refrescar el estado',
      details: ['Falló la recarga de /api/tunnels/config'],
    });
    const b = document.querySelector(`.btn-tunnel[data-port="${port}"]`);
    if (b) { b.disabled = false; b.textContent = isActive ? 'Cerrar' : 'Abrir'; }
  }

  try { updateTunnelDots(await get('/api/tunnels')); } catch { /* silencioso */ }
}

// ── ABM — Gestionar presets ───────────────────────────────────────────────────

function inp(type, val, placeholder, cls = '') {
  return `<input type="${type}" class="ssl-input ${cls}" value="${escHtml(String(val ?? ''))}" placeholder="${escHtml(placeholder)}">`;
}

function renderManageTunnels(tunnels) {
  // Filtrar ad-hoc — solo se gestionan los presets guardados
  const saved = tunnels.filter(t => !t.adhoc);
  const mc    = document.getElementById('tunnels-manage-container');
  mc.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'ssl-manage-wrap';

  const table = document.createElement('table');
  table.className = 'ssl-manage-table data-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>Puerto</th><th>Nombre</th><th>Remote</th><th>Clave SSH</th>` +
    `<th>Forward</th><th>Prod</th><th></th>` +
    `</tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const t of saved) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${inp('number', t.port, '3308', 'port-inp')}</td>` +
      `<td>${inp('text', t.name, 'Nombre')}</td>` +
      `<td>${inp('text', t.remote, 'user@host')}</td>` +
      `<td><input type="text" list="ssh-keys-list" class="ssl-input" value="${escHtml(t.key)}" placeholder=".ssh/key"></td>` +
      `<td>${inp('text', t.forward, 'host:3306')}</td>` +
      `<td style="text-align:center"><input type="checkbox" ${t.prod ? 'checked' : ''}></td>` +
      `<td><button class="btn btn-sm btn-danger btn-ssl-action del" title="Eliminar">✕</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Fila para agregar
  const addRow = document.createElement('div');
  addRow.className = 'ssl-add-row';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-sm btn-primary btn-ssl-action add';
  addBtn.textContent = '＋ Agregar túnel';
  addBtn.addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${inp('number', '', '3311', 'port-inp')}</td>` +
      `<td>${inp('text', '', 'Nombre')}</td>` +
      `<td>${inp('text', '', 'user@host')}</td>` +
      `<td><input type="text" list="ssh-keys-list" class="ssl-input" value="" placeholder=".ssh/key"></td>` +
      `<td>${inp('text', '', 'host:3306')}</td>` +
      `<td style="text-align:center"><input type="checkbox"></td>` +
      `<td><button class="btn btn-sm btn-danger btn-ssl-action del" title="Eliminar">✕</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  });
  addRow.appendChild(addBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'btn btn-sm btn-success btn-ssl-action add';
  saveBtn.style.marginLeft = '0.5rem';
  saveBtn.textContent = '✓ Guardar';
  saveBtn.addEventListener('click', () => saveTunnelConfig(tbody));
  addRow.appendChild(saveBtn);

  wrap.appendChild(table);
  wrap.appendChild(addRow);
  mc.appendChild(wrap);
}

async function saveTunnelConfig(tbody) {
  const rows = [...tbody.querySelectorAll('tr')];
  const tunnels = rows.map(tr => {
    const [portEl, nameEl, remoteEl, keyEl, forwardEl, prodEl] = tr.querySelectorAll('input');
    return {
      port:    parseInt(portEl.value, 10),
      name:    nameEl.value.trim(),
      desc:    '',
      remote:  remoteEl.value.trim(),
      key:     keyEl.value.trim(),
      forward: forwardEl.value.trim(),
      prod:    prodEl.checked,
    };
  });

  try {
    const res  = await fetch(`${API_BASE}/api/tunnels/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tunnels }),
    });
    const body = await res.json();
    if (!res.ok) { showTunnelBanner(`Error: ${body.error}`, true); return; }
    showTunnelBanner('Configuración guardada', false);
    toggleManageTunnels(false);
    await loadTunnels();
  } catch {
    showTunnelBanner('Error al guardar', true);
  }
}

async function toggleManageTunnels(force) {
  tunnelManageMode = force !== undefined ? force : !tunnelManageMode;
  const mc   = document.getElementById('tunnels-manage-container');
  const main = document.getElementById('tunnels-container');
  const btn  = document.getElementById('btn-tunnel-manage');

  if (tunnelManageMode) {
    tunnelAdhocMode = false;
    document.getElementById('tunnels-adhoc-container').classList.add('hidden');
    document.getElementById('btn-tunnel-adhoc').textContent = '＋ Ad-hoc';

    const data = await get('/api/tunnels/config').catch(() => []);
    renderManageTunnels(data);
    main.classList.add('hidden');
    mc.classList.remove('hidden');
    btn.textContent = '← Vista';
  } else {
    mc.classList.add('hidden');
    main.classList.remove('hidden');
    btn.textContent = '⚙ Gestionar';
  }
}

// ── Ad-hoc — túnel de un solo uso ────────────────────────────────────────────

function renderAdhocForm() {
  const ac = document.getElementById('tunnels-adhoc-container');
  ac.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'tunnel-adhoc-form';
  form.innerHTML =
    `<div class="tunnel-adhoc-title">Túnel ad-hoc</div>` +
    `<div class="tunnel-adhoc-grid">` +
      `<label>Puerto local<input type="number" id="adhoc-port" class="ssl-input" placeholder="3311" min="1024" max="65535"></label>` +
      `<label>Nombre (opcional)<input type="text" id="adhoc-name" class="ssl-input" placeholder="Mi túnel"></label>` +
      `<label>Remote (user@host)<input type="text" id="adhoc-remote" class="ssl-input" placeholder="ubuntu@10.145.2.26"></label>` +
      `<label>Clave SSH<input type="text" id="adhoc-key" list="ssh-keys-list" class="ssl-input" placeholder=".ssh/srv-appstest.key"></label>` +
      `<label>Forward (host:port)<input type="text" id="adhoc-forward" class="ssl-input" placeholder="127.0.0.1:3306"></label>` +
    `</div>` +
    `<div class="tunnel-adhoc-actions">` +
      `<button class="btn btn-primary btn-ssl-action add" id="btn-adhoc-submit">Abrir túnel</button>` +
      `<span class="adhoc-status" id="adhoc-status"></span>` +
    `</div>`;

  form.querySelector('#btn-adhoc-submit').addEventListener('click', submitAdhoc);
  ac.appendChild(form);
}

async function submitAdhoc() {
  const port    = document.getElementById('adhoc-port').value;
  const name    = document.getElementById('adhoc-name').value;
  const remote  = document.getElementById('adhoc-remote').value;
  const key     = document.getElementById('adhoc-key').value;
  const forward = document.getElementById('adhoc-forward').value;
  const status  = document.getElementById('adhoc-status');

  status.textContent = 'Abriendo...';
  document.getElementById('btn-adhoc-submit').disabled = true;

  try {
    const res  = await fetch(`${API_BASE}/api/tunnels/adhoc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: parseInt(port, 10), name, remote, key, forward }),
    });
    const body = await res.json();
    if (!res.ok) { status.textContent = `Error: ${body.error}`; }
    else if (body.status === 'timeout') { status.textContent = '⚠ Timeout — ¿VPN activa?'; }
    else {
      status.textContent = '✓ Abierto';
      toggleAdhocForm(false);
      await loadTunnels();
    }
  } catch {
    status.textContent = 'Error de conexión';
  }

  document.getElementById('btn-adhoc-submit').disabled = false;
}

function toggleAdhocForm(force) {
  tunnelAdhocMode = force !== undefined ? force : !tunnelAdhocMode;
  const ac  = document.getElementById('tunnels-adhoc-container');
  const btn = document.getElementById('btn-tunnel-adhoc');

  if (tunnelAdhocMode) {
    // Cerrar manage si estaba abierto
    tunnelManageMode = false;
    document.getElementById('tunnels-manage-container').classList.add('hidden');
    document.getElementById('btn-tunnel-manage').textContent = '⚙ Gestionar';

    renderAdhocForm();
    ac.classList.remove('hidden');
    btn.textContent = '✕ Cerrar';
  } else {
    ac.classList.add('hidden');
    btn.textContent = '＋ Ad-hoc';
  }
}


export function initTunnels({ confirmDialog, openJsonModal } = {}) {
  confirmDialogRef = confirmDialog ?? null;
  openJsonModalRef = openJsonModal ?? null;
  document.getElementById('btn-tunnel-manage').addEventListener('click', () => toggleManageTunnels());
  document.getElementById('btn-tunnel-adhoc').addEventListener('click',  () => toggleAdhocForm());

  document.getElementById('btn-tunnel-edit-config').addEventListener('click', async () => {
    const data = await get('/api/tunnels/config-raw').catch(() => null)
               ?? await get('/api/tunnels/config').catch(() => []);
    if (!openJsonModalRef) return;
    openJsonModalRef({
      title: 'tunnels-config.json',
      value: Array.isArray(data) ? { tunnels: data } : data,
      onSave: async (parsed) => {
        const res = await fetch(`${API_BASE}/api/tunnels/config`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(parsed),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? res.statusText);
        }
        await loadTunnels();
      },
    });
  });
  // Cerrar modal con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('confirm-modal').classList.contains('hidden')) {
      document.getElementById('confirm-cancel').click();
    }
  });
}
