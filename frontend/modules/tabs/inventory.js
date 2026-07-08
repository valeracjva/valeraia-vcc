import { get, apiFetch } from '../core/api.js';
import { buildAccordion, escHtml, formField, formPasswordField, formSelect, showManageBanner } from '../core/dom.js';

// === M4 — Inventario Infra ===
const RISK_COLORS = {
  bajo:     '#00E676',
  moderado: '#FFD600',
  alto:     '#FF6D00',
  critico:  '#FF1744',
};
const RISK_LABELS = {
  bajo: 'BAJO', moderado: 'MOD', alto: 'ALTO', critico: 'CRIT',
};
const HIDDEN_SERVERS_KEY = 'vcc-hidden-servers';
const HIDDEN_DISKS_KEY   = 'vcc-hidden-disks'; // { [serverId]: string[] de labels ocultos }
let infraGroupBy         = 'empresa';
let infraFilterMonitored = true;
let infraAllServers      = [];
const infraMetricsCache  = {}; // serverId → último resultado
let confirmDialogRef     = null;

function getHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_SERVERS_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveHidden(set) {
  localStorage.setItem(HIDDEN_SERVERS_KEY, JSON.stringify([...set]));
}

function getHiddenDisks() {
  try { return JSON.parse(localStorage.getItem(HIDDEN_DISKS_KEY) || '{}'); }
  catch { return {}; }
}
function saveHiddenDisks(map) {
  localStorage.setItem(HIDDEN_DISKS_KEY, JSON.stringify(map));
}
function hideDisk(serverId, label) {
  const map = getHiddenDisks();
  map[serverId] = [...new Set([...(map[serverId] || []), label])];
  saveHiddenDisks(map);
}
function unhideAllDisks(serverId) {
  const map = getHiddenDisks();
  delete map[serverId];
  saveHiddenDisks(map);
}

function buildServerCard(srv) {
  const card = document.createElement('div');
  card.className = `infra-card risk-${srv.riesgo}`;
  card.dataset.server = srv.id;

  const riskColor = RISK_COLORS[srv.riesgo] ?? '#888';
  const riskLabel = RISK_LABELS[srv.riesgo] ?? srv.riesgo.toUpperCase();
  const hasDetails = srv.apps.length > 0 || srv.dominios.length > 0 || !!srv.notas;

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<span class="infra-dot" style="background:${riskColor}"></span>` +
      `<span class="infra-id">${escHtml(srv.id)}</span>` +
      `<span class="infra-risk-badge" style="color:${riskColor};border-color:${riskColor}">${riskLabel}</span>` +
      ((srv.perfil || []).map(p => `<span class="infra-perfil-badge">${escHtml(p)}</span>`).join('')) +
      (srv.monitoreado ? `<span class="infra-conn-dot pending" data-conn="${escHtml(srv.id)}" title="Esperando métricas…"></span>` : '') +
      `<button class="infra-edit-btn" title="Editar servidor" data-edit-id="${escHtml(srv.id)}">✎</button>` +
      `<button class="infra-hide-btn" title="Ocultar de la vista" data-hide-id="${escHtml(srv.id)}">×</button>` +
    `</div>` +
    `<div class="infra-ip">${escHtml(srv.ip)}</div>` +
    `<div class="infra-os">${escHtml(srv.os)}</div>` +
    `<div class="infra-empresa">${escHtml(srv.empresa)}</div>` +
    `<div class="infra-rol">${escHtml(srv.rol)}</div>` +
    (srv.sshUser   ? `<div class="infra-ssh">${escHtml(srv.sshUser)}${srv.mysqlTunel ? ` · MySQL :${escHtml(String(srv.mysqlTunel))}` : ''}</div>` : '') +
    (srv.winrmUser ? `<div class="infra-ssh">WinRM: ${escHtml(srv.winrmUser)}</div>` : '') +
    (srv.puerto    ? `<div class="infra-ssh">Puerto ${escHtml(srv.puerto)}</div>` : '') +
    (srv.monitoreado ? `<div class="infra-metrics"><div class="metric-loading">actualizando…</div></div>` : '') +
    // El toggle/details SIEMPRE se crea (aunque no haya apps/dominios/notas todavia) porque
    // "discos ocultos" se agrega de forma dinamica despues del primer fetch de metricas -- se
    // oculta con .infra-toggle-empty si al momento no hay nada que mostrar, y applyMetrics lo
    // revela cuando corresponda.
    `<div class="infra-toggle${hasDetails ? '' : ' infra-toggle-empty'}" data-open="false">` +
      `<span class="infra-arrow">▶</span>` +
      `<span class="infra-toggle-label">${buildToggleLabel(srv)}</span>` +
    `</div>` +
    `<div class="infra-details hidden">` +
      buildDetails(srv) +
      `<div class="infra-detail-disks"></div>` +
    `</div>`;

  const toggle  = card.querySelector('.infra-toggle');
  const details = card.querySelector('.infra-details');
  toggle.addEventListener('click', () => {
    const open = toggle.dataset.open === 'true';
    toggle.dataset.open = String(!open);
    toggle.querySelector('.infra-arrow').textContent = open ? '▶' : '▼';
    details.classList.toggle('hidden', open);
  });

  card.querySelector('.infra-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.editId;
    const target = infraAllServers.find(s => s.id === id);
    if (target) showInventoryModal(target);
  });

  card.querySelector('.infra-hide-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.hideId;
    const hidden = getHidden();
    hidden.add(id);
    saveHidden(hidden);
    renderInventory(infraAllServers);
  });

  return card;
}

function buildToggleLabel(srv) {
  const parts = [];
  if (srv.apps.length)     parts.push(`${srv.apps.length} app${srv.apps.length > 1 ? 's' : ''}`);
  if (srv.dominios.length) parts.push(`${srv.dominios.length} dominio${srv.dominios.length > 1 ? 's' : ''}`);
  if (srv.notas)           parts.push('notas');
  return parts.join(' · ');
}

function buildDetails(srv) {
  let html = '';
  if (srv.apps.length) {
    html += `<div class="infra-detail-section"><span class="infra-detail-label">Apps</span>`;
    html += srv.apps.map(a =>
      `<div class="infra-detail-item"><code>${escHtml(a.name)}</code>${a.desc ? `<span class="infra-detail-desc"> — ${escHtml(a.desc)}</span>` : ''}</div>`
    ).join('');
    html += `</div>`;
  }
  if (srv.dominios.length) {
    html += `<div class="infra-detail-section"><span class="infra-detail-label">Dominios</span>`;
    html += srv.dominios.map(d => `<div class="infra-detail-item">${escHtml(d)}</div>`).join('');
    html += `</div>`;
  }
  if (srv.notas) {
    html += `<div class="infra-detail-section"><span class="infra-detail-label">Notas</span>`;
    html += `<div class="infra-detail-item">${escHtml(srv.notas)}</div>`;
    html += `</div>`;
  }
  return html;
}

function groupServers(servers, by) {
  if (by === 'none') return [{ label: null, servers: servers.slice().sort((a, b) => a.id.localeCompare(b.id, 'es')) }];
  const order = [];
  const map = new Map(); // key: normalized string → { label, servers }
  for (const srv of servers) {
    const raw = by === 'os'
      ? (srv.os.toLowerCase().includes('windows') ? 'Windows' : 'Linux')
      : srv.empresa;
    const norm = raw.trim().toLowerCase();
    if (!map.has(norm)) { map.set(norm, { label: raw.trim(), servers: [] }); order.push(norm); }
    map.get(norm).servers.push(srv);
  }
  return order
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map(k => ({
      label: map.get(k).label,
      servers: map.get(k).servers.slice().sort((a, b) => a.id.localeCompare(b.id, 'es')),
    }));
}

const RIESGO_COLOR = {
  critico:  'var(--danger)',
  alto:     'var(--warning)',
  moderado: 'var(--accent-2)',
  bajo:     'var(--success)',
};

function renderInventoryList(servers) {
  const sorted = [...servers].sort((a, b) =>
    (a.empresa || '').localeCompare(b.empresa || '', 'es') ||
    a.id.localeCompare(b.id, 'es')
  );

  const table = document.createElement('table');
  table.className = 'data-table infra-list-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>SERVIDOR</th><th>EMPRESA</th><th>IP</th><th>OS</th><th>ROL</th><th>RIESGO</th><th>MÉTRICAS</th>` +
    `</tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const srv of sorted) {
    const rColor = RIESGO_COLOR[srv.riesgo] || 'var(--text-faint)';
    const monDot = srv.monitoreado
      ? `<span class="infra-conn-dot pending" id="conn-dot-${srv.id}" title="Actualizando…"></span>`
      : `<span style="color:var(--text-faint);font-size:0.7rem">—</span>`;

    const tr = document.createElement('tr');
    tr.dataset.serverId = srv.id;
    tr.innerHTML =
      `<td><strong style="font-size:0.76rem">${escHtml(srv.id)}</strong></td>` +
      `<td>${escHtml(srv.empresa || '—')}</td>` +
      `<td><code>${escHtml(srv.ip)}</code></td>` +
      `<td style="color:var(--text-faint)">${escHtml(srv.os || '—')}</td>` +
      `<td style="color:var(--text-faint);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(srv.rol || '')}">${escHtml(srv.rol || '—')}</td>` +
      `<td style="color:${rColor};font-weight:600">${escHtml(srv.riesgo || '—')}</td>` +
      `<td>${monDot} <span class="infra-metrics" id="metrics-${srv.id}"></span></td>`;

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}

function renderInventory(servers) {
  const c = document.getElementById('infra-container');
  const hidden = getHidden();
  const pool   = infraFilterMonitored ? servers.filter(s => s.monitoreado) : servers;
  const visible = pool.filter(s => !hidden.has(s.id));
  const hiddenCount = pool.length - visible.length;

  const showBtn = document.getElementById('btn-infra-show-hidden');
  if (showBtn) {
    showBtn.style.display = hiddenCount > 0 ? '' : 'none';
    showBtn.textContent = `↺ Mostrar ocultos (${hiddenCount})`;
  }

  const counter = document.getElementById('infra-counter');
  if (counter) counter.textContent = `${visible.length} de ${servers.length}`;

  c.innerHTML = '';
  if (visible.length === 0) {
    const msg = infraFilterMonitored
      ? 'No hay servidores monitoreados. Activá el monitoreo en Gestionar → editar servidor.'
      : 'Todos los servidores están ocultos.';
    c.innerHTML = `<div class="infra-loading">${msg}</div>`;
    return;
  }

  if (infraGroupBy === 'list') {
    c.appendChild(renderInventoryList(visible));
    for (const m of Object.values(infraMetricsCache)) applyMetrics(m);
    return;
  }

  const groups = groupServers(visible, infraGroupBy);

  for (const group of groups) {
    const grid = document.createElement('div');
    grid.className = 'infra-grid';
    for (const srv of group.servers) grid.appendChild(buildServerCard(srv));

    if (group.label) {
      c.appendChild(buildAccordion(
        group.label,
        group.servers.length,
        grid,
        { storageKey: `infra-${infraGroupBy}-${group.label}` }
      ));
    } else {
      c.appendChild(grid);
    }
  }
  // Re-aplicar métricas ya cacheadas sin hacer un nuevo request
  for (const m of Object.values(infraMetricsCache)) applyMetrics(m);
}

export async function loadInventory() {
  const c = document.getElementById('infra-container');
  c.innerHTML = '<div class="infra-loading">Cargando inventario...</div>';
  try {
    const { servers } = await get('/api/inventory');
    infraAllServers = servers;
    renderInventory(servers);
  } catch (err) {
    c.innerHTML = `<div class="infra-loading" style="color:var(--red)">Error al cargar inventario: ${escHtml(err.message)}</div>`;
  }
}

// === Gestión de inventario ===

function renderInventoryManage() {
  const container = document.getElementById('infra-manage-container');
  container.classList.remove('hidden');

  const servers = infraAllServers;
  let html =
    `<div class="manage-header">` +
      `<span class="manage-title">Gestión de inventario</span>` +
      `<button class="btn btn-ghost btn-manage-close" id="btn-infra-manage-close">Cerrar</button>` +
    `</div>` +
    `<div class="manage-banner hidden" id="infra-manage-banner"></div>` +
    `<button class="btn btn-solid btn-manage-add" id="btn-infra-add">＋ Agregar servidor</button>` +
    `<div id="infra-form-container"></div>` +
    `<table class="manage-table data-table">` +
      `<thead><tr>` +
        `<th>ID</th><th>IP</th><th>OS</th><th>Empresa</th><th>Riesgo</th><th title="Monitoreo activo">Monitor</th><th></th>` +
      `</tr></thead>` +
      `<tbody>`;

  for (const s of servers) {
    const color = RISK_COLORS[s.riesgo] ?? '#888';
    html +=
      `<tr data-manage-id="${escHtml(s.id)}">` +
        `<td><code>${escHtml(s.id)}</code></td>` +
        `<td>${escHtml(s.ip)}</td>` +
        `<td>${escHtml(s.os)}</td>` +
        `<td>${escHtml(s.empresa)}</td>` +
        `<td><span class="infra-risk-badge" style="color:${color};border-color:${color}">${RISK_LABELS[s.riesgo] ?? s.riesgo}</span></td>` +
        `<td class="manage-monitor-cell"><input type="checkbox" class="manage-monitor-chk" data-srv-id="${escHtml(s.id)}"${s.monitoreado ? ' checked' : ''}></td>` +
        `<td class="manage-actions">` +
          `<button class="btn btn-sm btn-ghost btn-manage-edit" data-edit-id="${escHtml(s.id)}">Editar</button>` +
          `<button class="btn btn-sm btn-danger btn-manage-del"  data-del-id="${escHtml(s.id)}">Eliminar</button>` +
        `</td>` +
      `</tr>`;
  }

  html +=
    `</tbody></table>` +
    `<div class="json-editor-section">` +
      `<button class="json-editor-toggle" id="btn-json-toggle">{ } Ver / editar JSON raw</button>` +
      `<div class="json-editor-body hidden" id="json-editor-body">` +
        `<div class="json-editor-hint">Editá directamente el JSON. Guardá para aplicar. El backend valida cada entrada.</div>` +
        `<textarea class="json-editor-area" id="json-editor-area" spellcheck="false" rows="20"></textarea>` +
        `<div class="json-editor-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-json-cancel">Descartar cambios</button>` +
          `<button class="btn btn-primary btn-modal-ok"  id="btn-json-save">Guardar JSON</button>` +
        `</div>` +
      `</div>` +
    `</div>`;
  container.innerHTML = html;

  // Cargar JSON en el editor al abrir
  const jsonArea   = container.querySelector('#json-editor-area');
  const jsonBody   = container.querySelector('#json-editor-body');
  let jsonSnapshot = '';

  container.querySelector('#btn-json-toggle').addEventListener('click', async () => {
    if (jsonBody.classList.contains('hidden')) {
      jsonSnapshot = JSON.stringify({ servers: infraAllServers }, null, 2);
      jsonArea.value = jsonSnapshot;
      jsonBody.classList.remove('hidden');
    } else {
      jsonBody.classList.add('hidden');
    }
  });

  container.querySelector('#btn-json-cancel').addEventListener('click', () => {
    jsonArea.value = jsonSnapshot;
  });

  container.querySelector('#btn-json-save').addEventListener('click', async () => {
    let parsed;
    try { parsed = JSON.parse(jsonArea.value); } catch (e) {
      showManageBanner('infra-manage-banner', `JSON inválido: ${e.message}`, true); return;
    }
    try {
      await apiFetch('/api/inventory/config', { method: 'PUT', body: parsed });
      const { servers } = await get('/api/inventory');
      infraAllServers = servers;
      renderInventory(servers);
      renderInventoryManage();
    } catch (err) {
      showManageBanner('infra-manage-banner', err.message, true);
    }
  });

  container.querySelector('#btn-infra-manage-close').addEventListener('click', () => {
    container.classList.add('hidden');
    document.getElementById('infra-container').classList.remove('hidden');
    document.getElementById('btn-infra-manage').textContent = '⚙ Gestionar';
  });

  container.querySelector('#btn-infra-add').addEventListener('click', () => {
    const fc = document.getElementById('infra-form-container');
    showInventoryForm(null, fc, () => { fc.innerHTML = ''; });
  });

  container.querySelectorAll('.btn-manage-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editId;
      const srv = infraAllServers.find(s => s.id === id);
      const fc = document.getElementById('infra-form-container');
      if (srv) showInventoryForm(srv, fc, () => { fc.innerHTML = ''; });
    });
  });

  container.querySelectorAll('.manage-monitor-chk').forEach(chk => {
    chk.addEventListener('change', async () => {
      const id  = chk.dataset.srvId;
      const srv = infraAllServers.find(s => s.id === id);
      if (!srv) return;
      try {
        await apiFetch(`/api/inventory/${encodeURIComponent(id)}`, { method: 'PUT', body: { ...srv, monitoreado: chk.checked } });
        srv.monitoreado = chk.checked;
        renderInventory(infraAllServers);
      } catch (err) {
        chk.checked = !chk.checked; // revertir si falla
        showManageBanner('infra-manage-banner', err.message, true);
      }
    });
  });

  container.querySelectorAll('.btn-manage-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delId;
      confirmDialogRef(
        `¿Eliminar ${id}?`,
        `Esta acción quitará el servidor del inventario VCC. No afecta el SERVER_INVENTORY.md.`,
        true
      ).then(async ok => {
        if (!ok) return;
        try {
          await apiFetch(`/api/inventory/${encodeURIComponent(id)}`, { method: 'DELETE' });
          const { servers } = await get('/api/inventory');
          infraAllServers = servers;
          renderInventory(servers);
          renderInventoryManage();
        } catch (err) {
          showManageBanner('infra-manage-banner', err.message, true);
        }
      });
    });
  });
}

function showInventoryModal(srv) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay infra-edit-modal';
  const box = document.createElement('div');
  box.className = 'modal-box infra-edit-modal-box';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // A pedido: NO cerrar al clickear afuera -- solo Escape o los botones Cancelar/Guardar
  // (formulario largo, un click afuera accidental no debe perder lo tipeado).
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKeydown); overlay.remove(); };
  document.addEventListener('keydown', onKeydown);
  showInventoryForm(srv, box, close);
}

function showInventoryForm(srv, container, onClose) {
  const isEdit = srv !== null;
  const fc = container;

  const appsText   = (srv?.apps    || []).map(a => a.desc ? `${a.name} — ${a.desc}` : a.name).join('\n');
  const dominiosText = (srv?.dominios || []).join('\n');

  fc.innerHTML =
    `<div class="manage-form">` +
      `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(srv.id)}` : 'Nuevo servidor'}</div>` +
      `<div class="manage-form-grid">` +
        formField('ID',        'infra-f-id',         isEdit ? srv.id : `srv-${Date.now().toString(36).slice(-4)}`, 'ej: srv-nuevo', isEdit) +
        formField('IP',        'infra-f-ip',         srv?.ip         || '', 'ej: 10.0.0.1') +
        formField('OS',        'infra-f-os',         srv?.os         || '', 'ej: Ubuntu 22.04') +
        formField('Empresa',   'infra-f-empresa',    srv?.empresa    || '', 'ej: DIGNA Seguros / Fincos') +
        formField('Rol',       'infra-f-rol',        srv?.rol        || '', 'ej: Producción Laravel') +
        formSelect('Riesgo',   'infra-f-riesgo',     srv?.riesgo     || 'bajo',
          [['bajo','Bajo'],['moderado','Moderado'],['alto','Alto'],['critico','Crítico']]) +
        formField('Acceso',    'infra-f-acceso',     srv?.acceso     || '', 'ej: VPN NRE') +
        formField('SSH usuario','infra-f-sshuser',   srv?.sshUser    || '', 'ej: ubuntu') +
        formField('SSH clave', 'infra-f-sshkey',     srv?.sshKey     || '', 'ej: .ssh/digna/srv.key') +
        formField('Perfil (coma-separado)', 'infra-f-perfil', (srv?.perfil || []).join(','), 'ej: hyper-v,iis / laravel,mysql') +
        formField('WinRM usuario', 'infra-f-winrmuser', srv?.winrmUser || '', 'ej: administrador') +
        formPasswordField('WinRM contraseña', 'infra-f-winrmpass', isEdit && srv?.winrmPassword ? '' : '', isEdit ? '(sin cambios si se deja vacío)' : 'contraseña') +
        formField('MySQL túnel','infra-f-mysqltun',  srv?.mysqlTunel || '', 'ej: local 3308 → 3306') +
        formField('Puerto',    'infra-f-puerto',     srv?.puerto     || '', 'ej: 1433') +
      `</div>` +
      `<label class="form-toggle-row">` +
        `<input type="checkbox" id="infra-f-monitoreado"${srv?.monitoreado ? ' checked' : ''}>` +
        `<span class="form-toggle-label">Incluir en monitoreo de métricas</span>` +
      `</label>` +
      (!isEdit ?
        `<label class="form-toggle-row">` +
          `<input type="checkbox" id="infra-f-mcpssh">` +
          `<span class="form-toggle-label">Agregar al mcp-ssh</span>` +
        `</label>` : '') +
      `<label class="form-label" for="infra-f-notas">Notas</label>` +
      `<input class="form-input" id="infra-f-notas" value="${escHtml(srv?.notas || '')}" placeholder="Notas operativas">` +
      `<label class="form-label" for="infra-f-apps">Apps (una por línea: <code>nombre — descripción</code>)</label>` +
      `<textarea class="form-textarea" id="infra-f-apps" rows="4">${escHtml(appsText)}</textarea>` +
      `<label class="form-label" for="infra-f-dominios">Dominios (uno por línea)</label>` +
      `<textarea class="form-textarea" id="infra-f-dominios" rows="3">${escHtml(dominiosText)}</textarea>` +
      `<div class="manage-banner hidden" id="infra-form-error" style="margin-top:8px"></div>` +
      `<div class="manage-form-actions">` +
        `<button class="btn btn-ghost btn-modal-cancel" id="btn-infra-form-cancel">Cancelar</button>` +
        `<button class="btn btn-primary btn-modal-ok"  id="btn-infra-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
      `</div>` +
    `</div>`;

  fc.querySelector('#btn-infra-form-cancel').addEventListener('click', onClose);

  fc.querySelector('#btn-infra-form-save').addEventListener('click', async () => {
    const id = isEdit ? srv.id : document.getElementById('infra-f-id').value.trim();

    const appsRaw = document.getElementById('infra-f-apps').value.trim();
    const apps = appsRaw ? appsRaw.split('\n').filter(Boolean).map(line => {
      const sep = line.indexOf(' — ');
      return sep > -1
        ? { name: line.slice(0, sep).trim(), desc: line.slice(sep + 3).trim() }
        : { name: line.trim(), desc: '' };
    }) : [];

    const dominios = document.getElementById('infra-f-dominios').value
      .split('\n').map(d => d.trim()).filter(Boolean);

    const payload = {
      monitoreado: document.getElementById('infra-f-monitoreado').checked,
      id,
      ip:         document.getElementById('infra-f-ip').value.trim(),
      os:         document.getElementById('infra-f-os').value.trim(),
      empresa:    document.getElementById('infra-f-empresa').value.trim(),
      rol:        document.getElementById('infra-f-rol').value.trim(),
      riesgo:     document.getElementById('infra-f-riesgo').value,
      acceso:     document.getElementById('infra-f-acceso').value.trim(),
      sshUser:    document.getElementById('infra-f-sshuser').value.trim() || null,
      sshKey:     document.getElementById('infra-f-sshkey').value.trim()  || null,
      perfil:     document.getElementById('infra-f-perfil').value.trim()
                    .split(',').map(p => p.trim()).filter(Boolean),
      winrmUser:  document.getElementById('infra-f-winrmuser').value.trim() || null,
      // Vacío = "no cambiar" en edición (el backend conserva el valor existente); en alta, vacío = sin credencial.
      winrmPassword: document.getElementById('infra-f-winrmpass').value.trim() || null,
      mysqlTunel: document.getElementById('infra-f-mysqltun').value.trim() || null,
      puerto:     document.getElementById('infra-f-puerto').value.trim()  || null,
      notas:      document.getElementById('infra-f-notas').value.trim()   || null,
      apps,
      dominios,
    };

    const showFormErr = (msg) => {
      const el = document.getElementById('infra-form-error');
      if (!el) { showManageBanner('infra-manage-banner', msg, true); return; }
      el.textContent = msg;
      el.className = 'manage-banner manage-banner-error';
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    try {
      if (isEdit) {
        await apiFetch(`/api/inventory/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
      } else {
        await apiFetch('/api/inventory', { method: 'POST', body: payload });
        if (document.getElementById('infra-f-mcpssh')?.checked) {
          try {
            await apiFetch(`/api/inventory/${encodeURIComponent(id)}/mcp-ssh`, { method: 'POST' });
          } catch (mcpErr) {
            showManageBanner('infra-manage-banner', `Servidor agregado, pero falló el mcp-ssh: ${mcpErr.message}`, true);
          }
        }
      }
      const { servers } = await get('/api/inventory');
      infraAllServers = servers;
      renderInventory(servers);
      onClose();
      if (document.getElementById('infra-form-container')) renderInventoryManage();
    } catch (err) {
      showFormErr(err.message);
    }
  });
}

const GROUP_BY_KEY = 'vcc-infra-groupby';

export function initInventory({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;

  // Restaura la agrupacion elegida la ultima vez (empresa/os/sin agrupar/listado) --
  // antes siempre volvia a "Empresa" (default) al refrescar la pagina.
  const savedGroup = localStorage.getItem(GROUP_BY_KEY);
  if (savedGroup) {
    const savedBtn = document.querySelector(`.btn-infra-group[data-group="${savedGroup}"]`);
    if (savedBtn) {
      document.querySelectorAll('.btn-infra-group').forEach(b => b.classList.remove('active'));
      savedBtn.classList.add('active');
      infraGroupBy = savedGroup;
    }
  }

  // Group-by buttons
  document.querySelectorAll('.btn-infra-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-infra-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      infraGroupBy = btn.dataset.group;
      localStorage.setItem(GROUP_BY_KEY, infraGroupBy);
      renderInventory(infraAllServers);
    });
  });

  // Refresh métricas manual
  document.getElementById('btn-infra-metrics-refresh')?.addEventListener('click', () => loadMetrics(true));

  // Toggle monitoreados
  document.getElementById('btn-infra-monitored')?.addEventListener('click', () => {
    infraFilterMonitored = !infraFilterMonitored;
    const btn = document.getElementById('btn-infra-monitored');
    btn.classList.toggle('active', infraFilterMonitored);
    btn.textContent = infraFilterMonitored ? '● Monitoreados' : '○ Todos';
    renderInventory(infraAllServers);
  });

  // Mostrar ocultos
  document.getElementById('btn-infra-show-hidden')?.addEventListener('click', () => {
    localStorage.removeItem(HIDDEN_SERVERS_KEY);
    renderInventory(infraAllServers);
  });

  // Ocultar/restaurar discos individuales -- delegado a nivel documento (una sola vez) porque
  // metricsHtml se reemplaza entero via innerHTML en cada refresh de metricas (card y listado).
  document.addEventListener('click', (e) => {
    const hideBtn = e.target.closest('.metric-disk-hide');
    if (hideBtn) {
      hideDisk(hideBtn.dataset.server, hideBtn.dataset.label);
      const cached = infraMetricsCache[hideBtn.dataset.server];
      if (cached) applyMetrics(cached);
      return;
    }
    const restoreBtn = e.target.closest('.metric-disks-restore');
    if (restoreBtn) {
      const serverId = restoreBtn.dataset.server;
      if (serverId) {
        unhideAllDisks(serverId);
        const cached = infraMetricsCache[serverId];
        if (cached) applyMetrics(cached);
      }
    }
  });

  // Gestionar — swap igual que SSL y Proyectos
  document.getElementById('btn-infra-manage')?.addEventListener('click', () => {
    const mc   = document.getElementById('infra-manage-container');
    const main = document.getElementById('infra-container');
    const btn  = document.getElementById('btn-infra-manage');
    if (!mc.classList.contains('hidden')) {
      mc.classList.add('hidden');
      main.classList.remove('hidden');
      btn.textContent = '⚙ Gestionar';
      return;
    }
    renderInventoryManage();
    main.classList.add('hidden');
    mc.classList.remove('hidden');
    btn.textContent = '← Vista';
  });
}

// === M13 — Métricas de servidores ===
function fmtGB(mb) {
  const gb = mb / 1024;
  return gb >= 10 ? gb.toFixed(0) : gb.toFixed(1);
}

function sparklineSvg(values, color) {
  if (!values || values.length < 2) return '';
  const w = 28, h = 14;
  const max = Math.max(100, ...values);
  const step = w / (values.length - 1);
  const linePts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`);
  const areaPts = [`0,${h}`, ...linePts, `${w},${h}`].join(' ');
  const gid = `spk-${Math.random().toString(36).slice(2, 8)}`;
  return (
    `<svg class="metric-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
      `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="0.45"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</linearGradient></defs>` +
      `<polygon points="${areaPts}" fill="url(#${gid})" stroke="none"/>` +
      `<polyline points="${linePts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

function metricBar(label, pct, absText, sparkValues, hideCtx) {
  const clamped = Math.min(100, Math.max(0, pct));
  const level = clamped >= 85 ? 'crit' : clamped >= 70 ? 'warn' : 'ok';
  const color = level === 'crit' ? 'var(--red)' : level === 'warn' ? 'var(--amber)' : 'var(--green)';
  // hideCtx = { serverId, label } -- solo se pasa en filas de disco, agrega el x para destildar
  // ese volumen puntual (localStorage, no toca servers-config.json, mismo patron que ocultar server).
  const hideBtn = hideCtx
    ? `<button class="metric-disk-hide" title="Ocultar este disco" data-server="${escHtml(hideCtx.serverId)}" data-label="${escHtml(hideCtx.label)}">×</button>`
    : '';
  return (
    `<div class="metric-row metric-${level}" title="${escHtml(label)}: ${escHtml(absText ?? '')}">` +
      `<span class="metric-label">${label}</span>` +
      `<div class="metric-bar-track">` +
        `<div class="metric-bar-fill" style="width:${clamped}%;background:linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, white 30%))"></div>` +
      `</div>` +
      `<span class="metric-value" style="color:${color}">${clamped}%</span>` +
      `<span class="metric-abs">${escHtml(absText ?? '')}</span>` +
      sparklineSvg(sparkValues, color) +
      hideBtn +
    `</div>`
  );
}

// Compara CPU/RAM contra el snapshot anterior y agrega un pulso de brillo breve
// a las barras que cambiaron -- da sensacion de dato vivo sin animar constantemente
// las que estan quietas. Disco no se compara (su "worst" puede cambiar de disco
// entre refreshes, no solo de valor, y generaria flashes falsos).
function flashChangedBars(metricsEl, prevBase, newBase) {
  if (!prevBase || prevBase.status !== 'ok' || !prevBase.cpu || !prevBase.ram) return;
  if (!newBase || !newBase.cpu || !newBase.ram) return;
  const rows = metricsEl.querySelectorAll('.metric-row');
  const changed = [
    prevBase.cpu.pct !== newBase.cpu.pct,
    prevBase.ram.pct !== newBase.ram.pct,
  ];
  rows.forEach((row, i) => {
    if (i > 1) return; // solo CPU (0) y RAM (1) -- DSK excluido por el motivo de arriba
    if (!changed[i]) return;
    const fill = row.querySelector('.metric-bar-fill');
    if (!fill) return;
    fill.classList.remove('metric-flash');
    void fill.offsetWidth; // fuerza reflow para poder re-disparar la animación si ya estaba
    fill.classList.add('metric-flash');
  });
}

// El desglose completo por disco vive dentro del acordeon (apps/dominios/notas), no en la vista
// principal de la card -- ahi solo se muestra una fila agregada (peor caso). Evita que 5 barras
// casi identicas sean el primer impacto visual de la card; el detalle sigue a un click de distancia.
// worstLabel se excluye del listado -- ya se muestra arriba, listarlo tambien aca es duplicado.
function updateDiskDetails(serverId, allDisks, hiddenLabels, worstLabel) {
  const card = document.querySelector(`.infra-card[data-server="${CSS.escape(serverId)}"]`);
  if (!card) return;
  const disksEl = card.querySelector('.infra-detail-disks');
  const showBreakdown = Array.isArray(allDisks) && allDisks.length > 1;

  if (disksEl) {
    if (showBreakdown) {
      const rows = allDisks
        .filter(d => !hiddenLabels.includes(d.label) && d.label !== worstLabel)
        .map(d => metricBar(d.label, d.pct, `${Math.round(d.totalGB * d.pct / 100)}/${d.totalGB} GB`, [], { serverId, label: d.label }))
        .join('');
      const restoreLine = hiddenLabels.length > 0
        ? `<div class="infra-detail-item">${hiddenLabels.length} disco(s) oculto(s) · <span class="metric-disks-restore" data-server="${escHtml(serverId)}">restaurar</span></div>`
        : '';
      disksEl.innerHTML = `<div class="infra-detail-section"><span class="infra-detail-label">Discos (${allDisks.length})</span>${rows}${restoreLine}</div>`;
    } else {
      disksEl.innerHTML = '';
    }
  }

  const toggle = card.querySelector('.infra-toggle');
  if (!toggle) return;
  const srv = infraAllServers.find(s => s.id === serverId);
  const baseParts = srv ? buildToggleLabel(srv) : '';
  const diskPart = showBreakdown
    ? `${allDisks.length} discos${hiddenLabels.length > 0 ? ` (${hiddenLabels.length} oculto/s)` : ''}`
    : '';
  const parts = [baseParts, diskPart].filter(Boolean);
  const labelEl = toggle.querySelector('.infra-toggle-label');
  if (labelEl) labelEl.textContent = parts.join(' · ');
  toggle.classList.toggle('infra-toggle-empty', parts.length === 0);
}

function applyMetrics(m) {
  const prev = infraMetricsCache[m.serverId];
  infraMetricsCache[m.serverId] = m;

  const base = m.status === 'stale' ? m.lastGood : m;
  const cls = m.status === 'ok' ? 'ok' : m.status === 'stale' ? 'warn' : m.status === 'unreachable' ? 'down' : 'warn';
  const tip = m.status === 'ok' ? 'Conectado'
    : m.status === 'stale' ? `Última métrica válida${m.error ? ': ' + m.error : ''}`
    : m.status === 'unreachable' ? `Sin acceso${m.error ? ': ' + m.error : ''}`
    : 'Error de datos';

  let metricsHtml = `<div class="metric-unreachable">— sin acceso</div>`;
  if (base?.status === 'ok' && base.cpu && base.ram && base.disk) {
    const hist = base.history || m.history || [];
    const cpuHist  = hist.map(h => h.cpu);
    const ramHist  = hist.map(h => h.ram);
    const diskHist = hist.map(h => h.disk);

    // load1 es null en servidores Windows (WinRM) -- no hay equivalente a load average de Linux.
    const cpuAbs  = base.cpu.load1 === null ? `${base.cpu.cores}c` : `${base.cpu.cores}c·${base.cpu.load1.toFixed(2)}`;
    const ramAbs  = `${fmtGB(base.ram.totalMB * base.ram.pct / 100)}/${fmtGB(base.ram.totalMB)} GB`;
    const diskAbs = `${Math.round(base.disk.totalGB * base.disk.pct / 100)}/${base.disk.totalGB} GB`;

    // base.disks trae TODOS los discos/filesystems reales del host. Con varios discos, mostrar
    // uno por fila en la vista principal es ruido (5 barras casi identicas) -- se muestra una
    // sola fila agregada (peor caso, el mas relevante para alertar) y el desglose completo por
    // volumen queda dentro del acordeon existente via updateDiskDetails().
    const hiddenDisks = getHiddenDisks()[m.serverId] || [];
    let diskRows;
    if (Array.isArray(base.disks) && base.disks.length > 0) {
      const visibles = base.disks.filter(d => !hiddenDisks.includes(d.label));
      let worstLabel = null;
      if (visibles.length > 1) {
        const worst = visibles.reduce((a, b) => (b.pct > a.pct ? b : a));
        worstLabel = worst.label;
        // Label fijo "DSK" (mismo ancho que CPU/RAM) -- "Disco (N)" se truncaba a "Disc…" con
        // el ancho fijo de .metric-label. El conteo y el peor disco ya quedan en abs/toggle.
        diskRows = metricBar(
          'DSK', worst.pct,
          `${worst.label} ${Math.round(worst.totalGB * worst.pct / 100)}/${worst.totalGB} GB`,
          diskHist
        );
      } else if (visibles.length === 1) {
        const only = visibles[0];
        worstLabel = only.label;
        diskRows = metricBar(only.label, only.pct, `${Math.round(only.totalGB * only.pct / 100)}/${only.totalGB} GB`, diskHist);
      } else {
        diskRows = `<div class="metric-unreachable">todos los discos ocultos</div>`;
      }
      // worstLabel se excluye del desglose del acordeon -- ya se muestra arriba, listarlo
      // tambien adentro es el mismo disco duplicado en dos lugares de la card.
      updateDiskDetails(m.serverId, base.disks, hiddenDisks, worstLabel);
    } else {
      diskRows = metricBar('DSK', base.disk.pct, diskAbs, diskHist);
      updateDiskDetails(m.serverId, null, [], null);
    }

    metricsHtml =
      metricBar('CPU', base.cpu.pct,  cpuAbs,  cpuHist) +
      metricBar('RAM', base.ram.pct,  ramAbs,  ramHist) +
      diskRows;

    if (m.status === 'stale') {
      metricsHtml += `<div class="metric-stale">última métrica válida · ${escHtml(m.error || 'sin actualización')}</div>`;
    }
  }

  // Vista card
  const card = document.querySelector(`.infra-card[data-server="${escHtml(m.serverId)}"]`);
  if (card) {
    const dot = card.querySelector(`.infra-conn-dot[data-conn="${escHtml(m.serverId)}"]`);
    if (dot) { dot.className = `infra-conn-dot ${cls}`; dot.title = tip; }
    let metricsEl = card.querySelector('.infra-metrics');
    if (!metricsEl) {
      metricsEl = document.createElement('div');
      metricsEl.className = 'infra-metrics';
      const toggle = card.querySelector('.infra-toggle');
      if (toggle) card.insertBefore(metricsEl, toggle);
      else card.appendChild(metricsEl);
    }
    metricsEl.innerHTML = metricsHtml;
    flashChangedBars(metricsEl, prev, base);
  }

  // Vista listado
  const dot2 = document.getElementById(`conn-dot-${m.serverId}`);
  if (dot2) { dot2.className = `infra-conn-dot ${cls}`; dot2.title = tip; }
  const metricsEl2 = document.getElementById(`metrics-${m.serverId}`);
  if (metricsEl2) metricsEl2.innerHTML = metricsHtml;
}

// Solo marca el dot como "pendiente" -- NO vacia el contenido de .infra-metrics. Las 14 cards
// se fetchean en paralelo pero resuelven en momentos distintos; vaciar todo de entrada hacia que
// la vista entera "parpadeara" a blanco antes de repoblarse junta. Dejar la metrica anterior
// visible hasta que llegue la nueva hace que cada card se actualice sola, de a poco.
function setMetricsLoadingState() {
  document.querySelectorAll('.infra-conn-dot').forEach(dot => {
    if (!dot.classList.contains('ok') && !dot.classList.contains('warn') && !dot.classList.contains('down')) {
      dot.className = 'infra-conn-dot pending';
      dot.title = 'Actualizando…';
    }
  });
}

function setMetricsFetchError(msg) {
  document.querySelectorAll('.infra-conn-dot').forEach(dot => {
    dot.className = 'infra-conn-dot down';
    dot.title = `Error al obtener métricas: ${msg}`;
  });
  document.querySelectorAll('.infra-metrics').forEach(el => {
    el.innerHTML = `<div class="metric-unreachable">error al cargar</div>`;
  });
}

function getMonitoredServerIds() {
  return infraAllServers.filter(s => s.monitoreado).map(s => s.id);
}

export async function loadMetrics(force = false) {
  const btn = document.getElementById('btn-infra-metrics-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '↻ …'; }

  setMetricsLoadingState();

  try {
    const ids = getMonitoredServerIds();
    await Promise.allSettled(ids.map(async (id) => {
      try {
        const metric = await get(`/api/infra-health/${encodeURIComponent(id)}${force ? '?force=1' : ''}`);
        applyMetrics(metric);
      } catch (err) {
        const prev = infraMetricsCache[id];
        if (prev?.status === 'ok' && prev.cpu && prev.ram && prev.disk) {
          applyMetrics({
            serverId: id,
            status: 'stale',
            error: err.message,
            history: prev.history || [],
            lastGood: prev,
          });
        } else {
          applyMetrics({
            serverId: id,
            status: 'unreachable',
            error: err.message,
            history: prev?.history || [],
          });
        }
      }
    }));
  } catch (err) {
    setMetricsFetchError(err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Métricas'; }
  }
}

export const METRICS_INTERVAL_MS = 60_000;
