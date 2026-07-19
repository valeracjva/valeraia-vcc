import { API_BASE } from '../core/constants.js';
import { get } from '../core/api.js';
import { publishActivityNote } from '../core/activity-rail.js';
import { escHtml, openEditModal, showManageBanner } from '../core/dom.js';

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

let tunnelsManageSaved = [];

function renderManageTunnels(tunnels) {
  // Filtrar ad-hoc — solo se gestionan los presets guardados
  tunnelsManageSaved = tunnels.filter(t => !t.adhoc);
  const mc = document.getElementById('tunnels-manage-container');
  mc.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-solid btn-manage-add';
  addBtn.textContent = '＋ Agregar túnel';
  addBtn.addEventListener('click', () => showTunnelModal(null));
  mc.appendChild(addBtn);

  const table = document.createElement('table');
  table.className = 'manage-table data-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>Puerto</th><th>Nombre</th><th>Remote</th><th>Forward</th><th>Prod</th><th></th>` +
    `</tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const t of tunnelsManageSaved) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><code>${t.port}</code></td>` +
      `<td>${escHtml(t.name)}</td>` +
      `<td>${escHtml(t.remote)}</td>` +
      `<td>${escHtml(t.forward)}</td>` +
      `<td>${t.prod ? 'Sí' : '—'}</td>` +
      `<td class="manage-actions"></td>`;
    const tdActs = tr.querySelector('.manage-actions');

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-sm btn-ghost btn-manage-edit';
    btnEdit.textContent = 'Editar';
    btnEdit.addEventListener('click', () => showTunnelModal(t));

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm btn-danger btn-manage-del';
    btnDel.textContent = 'Eliminar';
    btnDel.addEventListener('click', async () => {
      const ok = await confirmDialogRef(`¿Eliminar el túnel "${t.name}" (puerto ${t.port})?`, 'Esta acción no se puede deshacer.', true);
      if (!ok) return;
      const updated = tunnelsManageSaved.filter(x => x.port !== t.port);
      await saveTunnelConfig(updated);
    });

    tdActs.appendChild(btnEdit);
    tdActs.appendChild(btnDel);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  mc.appendChild(table);
}

function showTunnelModal(tunnel) {
  openEditModal((box, close) => {
    const isEdit = tunnel !== null;
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(tunnel.name)}` : 'Nuevo túnel'}</div>` +
        `<div class="manage-form-grid">` +
          `<div class="form-field"><label class="form-label" for="tun-f-port">Puerto</label><input class="form-input" type="number" id="tun-f-port" value="${isEdit ? tunnel.port : ''}" placeholder="3311"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-name">Nombre</label><input class="form-input" id="tun-f-name" value="${escHtml(tunnel?.name ?? '')}" placeholder="Nombre"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-remote">Remote</label><input class="form-input" id="tun-f-remote" value="${escHtml(tunnel?.remote ?? '')}" placeholder="user@host"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-key">Clave SSH</label><input class="form-input" list="ssh-keys-list" id="tun-f-key" value="${escHtml(tunnel?.key ?? '')}" placeholder=".ssh/key"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-forward">Forward</label><input class="form-input" id="tun-f-forward" value="${escHtml(tunnel?.forward ?? '')}" placeholder="host:3306"></div>` +
        `</div>` +
        `<label class="form-toggle-row">` +
          `<input type="checkbox" id="tun-f-prod"${tunnel?.prod ? ' checked' : ''}>` +
          `<span class="form-toggle-label">Producción</span>` +
        `</label>` +
        `<div class="manage-banner hidden" id="tun-f-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-tun-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-tun-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-tun-form-cancel').addEventListener('click', close);

    box.querySelector('#btn-tun-form-save').addEventListener('click', async () => {
      const port    = parseInt(document.getElementById('tun-f-port').value, 10);
      const name    = document.getElementById('tun-f-name').value.trim();
      const remote  = document.getElementById('tun-f-remote').value.trim();
      const key     = document.getElementById('tun-f-key').value.trim();
      const forward = document.getElementById('tun-f-forward').value.trim();
      const prod    = document.getElementById('tun-f-prod').checked;

      if (!port || !name || !remote || !forward) {
        showManageBanner('tun-f-error', 'Puerto, nombre, remote y forward son requeridos', true);
        return;
      }

      const nuevo = { port, name, desc: '', remote, key, forward, prod };
      const updated = isEdit
        ? tunnelsManageSaved.map(t => t.port === tunnel.port ? nuevo : t)
        : [...tunnelsManageSaved, nuevo];

      const ok = await saveTunnelConfig(updated);
      if (ok) close();
    });
  }, { size: 'standard', title: tunnel ? `Editar: ${tunnel.name}` : 'Nuevo túnel' });
}

async function saveTunnelConfig(tunnels) {
  try {
    const res  = await fetch(`${API_BASE}/api/tunnels/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tunnels }),
    });
    const body = await res.json();
    if (!res.ok) { showTunnelBanner(`Error: ${body.error}`, true); return false; }
    showTunnelBanner('Configuración guardada', false);
    await loadTunnels();
    const mc = document.getElementById('tunnels-manage-container');
    if (mc && !mc.classList.contains('hidden')) {
      const data = await get('/api/tunnels/config').catch(() => []);
      renderManageTunnels(data);
    }
    return true;
  } catch {
    showTunnelBanner('Error al guardar', true);
    return false;
  }
}

async function toggleManageTunnels(force) {
  tunnelManageMode = force !== undefined ? force : !tunnelManageMode;
  const mc   = document.getElementById('tunnels-manage-container');
  const main = document.getElementById('tunnels-container');
  const btn  = document.getElementById('btn-tunnel-manage');

  if (tunnelManageMode) {
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

function showAdhocModal() {
  openEditModal((box, close) => {
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">Túnel ad-hoc</div>` +
        `<div class="manage-form-grid">` +
          `<div class="form-field"><label class="form-label" for="adhoc-port">Puerto local</label><input type="number" id="adhoc-port" class="form-input" placeholder="3311" min="1024" max="65535"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-name">Nombre (opcional)</label><input type="text" id="adhoc-name" class="form-input" placeholder="Mi túnel"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-remote">Remote (user@host)</label><input type="text" id="adhoc-remote" class="form-input" placeholder="ubuntu@10.145.2.26"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-key">Clave SSH</label><input type="text" id="adhoc-key" list="ssh-keys-list" class="form-input" placeholder=".ssh/srv-appstest.key"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-forward">Forward (host:port)</label><input type="text" id="adhoc-forward" class="form-input" placeholder="127.0.0.1:3306"></div>` +
        `</div>` +
        `<div class="manage-form-actions">` +
          `<span class="adhoc-status" id="adhoc-status"></span>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-adhoc-submit">Abrir túnel</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-adhoc-submit').addEventListener('click', () => submitAdhoc(close));
  }, { size: 'standard' });
}

async function submitAdhoc(close) {
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
      await loadTunnels();
      close();
    }
  } catch {
    status.textContent = 'Error de conexión';
  }

  document.getElementById('btn-adhoc-submit').disabled = false;
}

function toggleAdhocForm() {
  showAdhocModal();
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
