import { get, apiFetch } from '../core/api.js';
import { buildAccordion, escHtml, formField, openEditModal, showManageBanner } from '../core/dom.js';
import { loadState, saveState } from '../core/persist.js';

// === M9b — MCPs ===
const HIDDEN_MCPS_KEY = 'vcc-hidden-mcps';
const MCP_GROUPBY_KEY = 'vcc-mcp-groupby';
let mcpGroupBy = 'tipo';
let mcpAllData = { mcps: [], sshServers: [] };
let confirmDialogRef = null;

function getMcpHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_MCPS_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveMcpHidden(set) {
  localStorage.setItem(HIDDEN_MCPS_KEY, JSON.stringify([...set]));
}

function buildMcpCard(mcp) {
  const card = document.createElement('div');
  card.className = 'infra-card';
  card.style.borderLeft = mcp.enabled ? '3px solid var(--success)' : '3px solid var(--text-faint)';

  const dotColor   = mcp.enabled ? 'var(--success)' : 'var(--text-faint)';
  const badgeColor = mcp.enabled ? 'var(--success)' : 'var(--text-faint)';
  const badgeText  = mcp.enabled ? 'ON' : 'OFF';
  const cmdShort   = mcp.command.split(/[\\/]/).pop();
  const envCount   = Object.keys(mcp.env ?? {}).length;
  const argsFirst  = mcpArgLabel(mcp.args);

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<span class="infra-dot" style="background:${dotColor}"></span>` +
      `<span class="infra-id">${escHtml(mcp.name)}</span>` +
      `<span class="infra-risk-badge" style="color:${badgeColor};border-color:${badgeColor}">${badgeText}</span>` +
      `<button class="infra-edit-btn" title="Editar MCP"   data-edit-name="${escHtml(mcp.name)}">✎</button>` +
      `<button class="infra-hide-btn" title="Ocultar de la vista" data-hide-name="${escHtml(mcp.name)}">×</button>` +
    `</div>` +
    (mcp.description ? `<div class="infra-os agent-desc" title="${escHtml(mcp.description)}">${escHtml(mcp.description)}</div>` : '') +
    `<div class="infra-ip">${escHtml(cmdShort)}${argsFirst !== '—' ? ' · ' + escHtml(argsFirst) : ''}</div>` +
    (envCount ? `<div class="infra-empresa">${envCount} variable${envCount > 1 ? 's' : ''} de entorno</div>` : '');

  card.querySelector('.infra-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const name = e.currentTarget.dataset.editName;
    const target = mcpAllData.mcps.find(m => m.name === name);
    if (target) showMcpModal(target);
  });

  card.querySelector('.infra-hide-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const name = e.currentTarget.dataset.hideName;
    const hidden = getMcpHidden();
    hidden.add(name);
    saveMcpHidden(hidden);
    renderMcpView();
  });

  if (envCount) {
    const toggle = document.createElement('div');
    toggle.className = 'infra-toggle';
    toggle.dataset.open = 'false';
    toggle.innerHTML = `<span class="infra-arrow">▶</span><span class="infra-toggle-label">env vars</span>`;

    const details = document.createElement('div');
    details.className = 'infra-details hidden';
    details.innerHTML = `<div class="infra-detail-section">` +
      Object.entries(mcp.env).map(([k, v]) =>
        `<div class="infra-detail-item"><code>${escHtml(k)}</code><span class="infra-detail-desc"> = ${escHtml(v)}</span></div>`
      ).join('') +
      `</div>`;

    toggle.addEventListener('click', () => {
      const open = toggle.dataset.open === 'true';
      toggle.dataset.open = String(!open);
      toggle.querySelector('.infra-arrow').textContent = open ? '▶' : '▼';
      details.classList.toggle('hidden', open);
    });

    card.appendChild(toggle);
    card.appendChild(details);
  }

  return card;
}

function groupMcps(mcps, by) {
  if (by === 'none') return [{ label: null, mcps: mcps.slice().sort((a, b) => a.name.localeCompare(b.name)) }];
  const order = [], map = new Map();
  for (const mcp of mcps) {
    const raw = by === 'estado'
      ? (mcp.enabled ? 'Habilitados' : 'Deshabilitados')
      : mcp.command.split(/[\\/]/).pop().replace(/\.exe$/, '');
    const norm = raw.toLowerCase();
    if (!map.has(norm)) { map.set(norm, { label: raw, mcps: [] }); order.push(norm); }
    map.get(norm).mcps.push(mcp);
  }
  return order
    .sort((a, b) => a.localeCompare(b))
    .map(k => ({ label: map.get(k).label, mcps: map.get(k).mcps.sort((a, b) => a.name.localeCompare(b.name)) }));
}

function mcpArgLabel(args) {
  if (!args?.length) return '—';
  const first = args[0].split(/[\\/]/).pop();
  return args.length > 1 ? `${first} +${args.length - 1}` : first;
}

function renderMcpList(mcps) {
  const table = document.createElement('table');
  table.className = 'data-table infra-list-table';
  table.innerHTML =
    `<thead><tr><th>NOMBRE</th><th>COMANDO</th><th>ARGS</th><th>ENV</th><th>ESTADO</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const mcp of [...mcps].sort((a, b) => a.name.localeCompare(b.name))) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><strong style="font-size:0.76rem">${escHtml(mcp.name)}</strong></td>` +
      `<td><code>${escHtml(mcp.command.split(/[\\/]/).pop())}</code></td>` +
      `<td title="${escHtml((mcp.args ?? []).join('\n'))}">${escHtml(mcpArgLabel(mcp.args))}</td>` +
      `<td>${Object.keys(mcp.env ?? {}).length}</td>` +
      `<td style="color:${mcp.enabled ? 'var(--success)' : 'var(--text-faint)'}">${mcp.enabled ? '● ON' : '○ OFF'}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderMcpView() {
  const c = document.getElementById('mcp-container');
  if (!c) return;
  const { mcps } = mcpAllData;
  const hidden = getMcpHidden();
  const visible = mcps.filter(m => !hidden.has(m.name));
  const hiddenCount = mcps.length - visible.length;

  const counter = document.getElementById('mcp-counter');
  if (counter) counter.textContent = `${visible.length} de ${mcps.length}`;

  const showBtn = document.getElementById('btn-mcp-show-hidden');
  if (showBtn) {
    showBtn.style.display = hiddenCount > 0 ? '' : 'none';
    showBtn.textContent = `↺ Mostrar ocultos (${hiddenCount})`;
  }

  c.innerHTML = '';
  if (!visible.length) {
    c.innerHTML = `<div class="infra-loading">${mcps.length ? 'Todos los MCPs están ocultos.' : 'No se encontraron MCPs en ~/.mcp.json'}</div>`;
    return;
  }

  if (mcpGroupBy === 'list') {
    c.appendChild(renderMcpList(visible));
    return;
  }

  const groups = groupMcps(visible, mcpGroupBy);
  for (const group of groups) {
    const grid = document.createElement('div');
    grid.className = 'infra-grid';
    for (const mcp of group.mcps) grid.appendChild(buildMcpCard(mcp));

    if (group.label) {
      c.appendChild(buildAccordion(
        group.label,
        group.mcps.length,
        grid,
        { storageKey: `mcp-${mcpGroupBy}-${group.label}` }
      ));
    } else {
      c.appendChild(grid);
    }
  }
}

export async function loadMcp(manual = false) {
  const c = document.getElementById('mcp-container');
  if (!c) return;
  c.innerHTML = '<div class="infra-loading">Cargando MCPs...</div>';
  try {
    const [{ mcps }, { servers }] = await Promise.all([
      get('/api/mcp'),
      get('/api/mcp/ssh-servers'),
    ]);
    mcpAllData = { mcps, sshServers: servers };
    renderMcpView();
    const mc = document.getElementById('mcp-manage-container');
    if (mc && !mc.classList.contains('hidden')) renderMcpManage();
  } catch (err) {
    c.innerHTML = `<div class="infra-loading" style="color:var(--red)">Error al cargar MCPs: ${escHtml(err.message)}</div>`;
  }
}

// === Gestión de MCPs ===

function renderMcpManage() {
  const container = document.getElementById('mcp-manage-container');
  container.classList.remove('hidden');

  const { mcps, sshServers } = mcpAllData;

  let html =
    `<div class="manage-header">` +
      `<span class="manage-title">Gestión de MCPs</span>` +
      `<button class="btn btn-ghost btn-manage-close" id="btn-mcp-manage-close">Cerrar</button>` +
    `</div>` +
    `<div class="manage-banner hidden" id="mcp-manage-banner"></div>` +
    `<button class="btn btn-solid btn-manage-add" id="btn-mcp-add">＋ Agregar MCP</button>` +
    `<table class="manage-table data-table">` +
      `<thead><tr>` +
        `<th>NOMBRE</th><th>COMANDO</th><th>ESTADO</th><th></th>` +
      `</tr></thead>` +
      `<tbody>`;

  for (const m of mcps) {
    const color = m.enabled ? 'var(--success)' : 'var(--text-faint)';
    html +=
      `<tr>` +
        `<td><code>${escHtml(m.name)}</code></td>` +
        `<td>${escHtml(m.command.split(/[\\/]/).pop())}</td>` +
        `<td><span class="infra-risk-badge" style="color:${color};border-color:${color}">${m.enabled ? 'ON' : 'OFF'}</span></td>` +
        `<td class="manage-actions">` +
          `<button class="btn btn-sm btn-ghost btn-manage-edit" data-edit-mcp="${escHtml(m.name)}">Editar</button>` +
          `<button class="btn btn-sm btn-danger btn-manage-del"  data-del-mcp="${escHtml(m.name)}">Eliminar</button>` +
        `</td>` +
      `</tr>`;
  }

  html += `</tbody></table>`;

  // Sección mcp-ssh servidores
  html +=
    `<div class="manage-header" style="margin-top:24px">` +
      `<span class="manage-title">mcp-ssh — Servidores</span>` +
    `</div>` +
    `<table class="manage-table data-table">` +
      `<thead><tr>` +
        `<th>ALIAS</th><th>HOST</th><th>USUARIO</th><th>CLAVE</th><th></th>` +
      `</tr></thead>` +
      `<tbody>`;

  for (const s of sshServers) {
    html +=
      `<tr>` +
        `<td><code>${escHtml(s.alias)}</code></td>` +
        `<td>${escHtml(s.host)}</td>` +
        `<td>${escHtml(s.username)}</td>` +
        `<td style="color:var(--text-faint);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(s.keyPath)}">${escHtml(s.keyPath)}</td>` +
        `<td class="manage-actions">` +
          `<button class="btn btn-sm btn-danger btn-manage-del" data-del-ssh="${escHtml(s.alias)}">Eliminar</button>` +
        `</td>` +
      `</tr>`;
  }

  html += `</tbody></table>`;

  html +=
    `<div class="json-editor-section">` +
      `<button class="json-editor-toggle" id="btn-mcp-json-toggle">{ } Ver / editar JSON raw</button>` +
      `<div class="json-editor-body hidden" id="mcp-json-editor-body">` +
        `<div class="json-editor-hint">Editá directamente el JSON de ~/.mcp.json. Guardá para aplicar.</div>` +
        `<textarea class="json-editor-area" id="mcp-json-editor-area" spellcheck="false" rows="20"></textarea>` +
        `<div class="json-editor-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-mcp-json-cancel">Descartar cambios</button>` +
          `<button class="btn btn-primary btn-modal-ok"  id="btn-mcp-json-save">Guardar JSON</button>` +
        `</div>` +
      `</div>` +
    `</div>`;

  container.innerHTML = html;

  const mcpJsonArea = container.querySelector('#mcp-json-editor-area');
  const mcpJsonBody = container.querySelector('#mcp-json-editor-body');
  let mcpJsonSnapshot = '';

  container.querySelector('#btn-mcp-json-toggle').addEventListener('click', () => {
    if (mcpJsonBody.classList.contains('hidden')) {
      mcpJsonSnapshot = JSON.stringify({ mcpServers: Object.fromEntries(mcpAllData.mcps.map(m => [m.name, { command: m.command, args: m.args, ...(Object.keys(m.env ?? {}).length ? { env: m.env } : {}) }])) }, null, 2);
      mcpJsonArea.value = mcpJsonSnapshot;
      mcpJsonBody.classList.remove('hidden');
    } else {
      mcpJsonBody.classList.add('hidden');
    }
  });

  container.querySelector('#btn-mcp-json-cancel').addEventListener('click', () => {
    mcpJsonArea.value = mcpJsonSnapshot;
  });

  container.querySelector('#btn-mcp-json-save').addEventListener('click', async () => {
    let parsed;
    try { parsed = JSON.parse(mcpJsonArea.value); } catch (e) {
      showManageBanner('mcp-manage-banner', `JSON inválido: ${e.message}`, true); return;
    }
    try {
      await apiFetch('/api/mcp/config', { method: 'PUT', body: parsed });
      await loadMcp();
      renderMcpManage();
    } catch (err) {
      showManageBanner('mcp-manage-banner', err.message, true);
    }
  });

  container.querySelector('#btn-mcp-manage-close').addEventListener('click', () => {
    container.classList.add('hidden');
    document.getElementById('mcp-container').classList.remove('hidden');
    document.getElementById('btn-mcp-manage').textContent = '⚙ Gestionar';
  });

  container.querySelector('#btn-mcp-add').addEventListener('click', () => {
    showMcpModal(null);
  });

  container.querySelectorAll('[data-edit-mcp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.editMcp;
      const mcp  = mcpAllData.mcps.find(m => m.name === name);
      if (mcp) showMcpModal(mcp);
    });
  });

  container.querySelectorAll('[data-del-mcp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.delMcp;
      confirmDialogRef(
        `¿Eliminar MCP "${name}"?`,
        `Se quitará de ~/.mcp.json y de enabledMcpjsonServers. Requiere reiniciar Claude Code.`,
        true
      ).then(async ok => {
        if (!ok) return;
        try {
          await apiFetch(`/api/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' });
          await loadMcp();
        } catch (err) {
          showManageBanner('mcp-manage-banner', err.message, true);
        }
      });
    });
  });

  container.querySelectorAll('[data-del-ssh]').forEach(btn => {
    btn.addEventListener('click', () => {
      const alias = btn.dataset.delSsh;
      confirmDialogRef(
        `¿Eliminar servidor "${alias}" del mcp-ssh?`,
        `Se quitará del SERVERS en mcp-ssh/index.js. Requiere reiniciar Claude Code.`,
        true
      ).then(async ok => {
        if (!ok) return;
        try {
          await apiFetch(`/api/mcp/ssh-servers/${encodeURIComponent(alias)}`, { method: 'DELETE' });
          await loadMcp();
        } catch (err) {
          showManageBanner('mcp-manage-banner', err.message, true);
        }
      });
    });
  });
}

function showMcpModal(mcp) {
  openEditModal((box, close) => showMcpForm(mcp, box, close), { title: mcp ? `Editar: ${mcp.name}` : 'Nuevo MCP' });
}

function showMcpForm(mcp, container, onClose) {
  const isEdit   = mcp !== null;
  const argsText = (mcp?.args ?? []).join('\n');
  const envText  = Object.entries(mcp?.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');

  container.innerHTML =
    `<div class="manage-form">` +
      `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(mcp.name)}` : 'Nuevo MCP'}</div>` +
      `<div class="manage-form-grid">` +
        formField('Nombre',  'mcp-f-name',    isEdit ? mcp.name : '', 'ej: mi-mcp', isEdit) +
        formField('Comando', 'mcp-f-command', mcp?.command ?? '',     'ej: node') +
      `</div>` +
      `<label class="form-label" for="mcp-f-description">Descripción (opcional)</label>` +
      `<textarea class="form-textarea" id="mcp-f-description" rows="2" placeholder="Para qué sirve este MCP...">${escHtml(mcp?.description ?? '')}</textarea>` +
      `<label class="form-label" for="mcp-f-args">Args (uno por línea)</label>` +
      `<textarea class="form-textarea" id="mcp-f-args" rows="3" placeholder="C:\\ruta\\al\\index.js">${escHtml(argsText)}</textarea>` +
      `<label class="form-label" for="mcp-f-env">Variables de entorno (KEY=valor, una por línea)</label>` +
      `<textarea class="form-textarea" id="mcp-f-env" rows="4" placeholder="API_KEY=abc&#10;API_URL=https://...">${escHtml(envText)}</textarea>` +
      (!isEdit ?
        `<label class="form-toggle-row">` +
          `<input type="checkbox" id="mcp-f-enabled" checked>` +
          `<span class="form-toggle-label">Habilitar al guardar (enabledMcpjsonServers)</span>` +
        `</label>` : '') +
      `<div class="manage-form-actions">` +
        `<button class="btn btn-ghost btn-modal-cancel" id="btn-mcp-form-cancel">Cancelar</button>` +
        `<button class="btn btn-primary btn-modal-ok"  id="btn-mcp-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
      `</div>` +
    `</div>`;

  container.querySelector('#btn-mcp-form-cancel').addEventListener('click', onClose);

  container.querySelector('#btn-mcp-form-save').addEventListener('click', async () => {
    const name    = isEdit ? mcp.name : document.getElementById('mcp-f-name').value.trim();
    const command = document.getElementById('mcp-f-command').value.trim();
    const argsRaw = document.getElementById('mcp-f-args').value.trim();
    const envRaw  = document.getElementById('mcp-f-env').value.trim();
    const description = document.getElementById('mcp-f-description').value.trim();
    const enabled = !isEdit && document.getElementById('mcp-f-enabled').checked;

    if (!name || !command) {
      showManageBanner('mcp-manage-banner', 'Nombre y comando son requeridos', true);
      return;
    }

    const args = argsRaw ? argsRaw.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const env  = {};
    for (const line of (envRaw ? envRaw.split('\n') : [])) {
      const sep = line.indexOf('=');
      if (sep > 0) env[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }

    try {
      if (isEdit) {
        await apiFetch(`/api/mcp/${encodeURIComponent(name)}`, { method: 'PUT', body: { command, args, env, description } });
      } else {
        await apiFetch('/api/mcp', { method: 'POST', body: { name, command, args, env, enabled, description } });
      }
      onClose();
      await loadMcp();
      const msg = isEdit
        ? `"${name}" actualizado. Reiniciá Claude Code para aplicar los cambios.`
        : `"${name}" agregado. Reiniciá Claude Code para activarlo.`;
      showManageBanner('mcp-manage-banner', msg);
    } catch (err) {
      showManageBanner('mcp-manage-banner', err.message, true);
    }
  });
}

export function initMcp({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;

  // Restaura el agrupamiento elegido la ultima vez -- antes siempre volvia a "Tipo" al recargar.
  mcpGroupBy = loadState(MCP_GROUPBY_KEY, 'tipo');
  const savedMcpGroupBtn = document.querySelector(`.btn-mcp-group[data-group="${mcpGroupBy}"]`);
  if (savedMcpGroupBtn) {
    document.querySelectorAll('.btn-mcp-group').forEach(b => b.classList.remove('active'));
    savedMcpGroupBtn.classList.add('active');
  }

  document.getElementById('btn-mcp-refresh')?.addEventListener('click', () => loadMcp(true));

  document.getElementById('btn-mcp-show-hidden')?.addEventListener('click', () => {
    localStorage.removeItem(HIDDEN_MCPS_KEY);
    renderMcpView();
  });

  document.getElementById('btn-mcp-manage')?.addEventListener('click', () => {
    const mc   = document.getElementById('mcp-manage-container');
    const main = document.getElementById('mcp-container');
    const btn  = document.getElementById('btn-mcp-manage');
    if (!mc.classList.contains('hidden')) {
      mc.classList.add('hidden');
      main.classList.remove('hidden');
      btn.textContent = '⚙ Gestionar';
      return;
    }
    renderMcpManage();
    main.classList.add('hidden');
    mc.classList.remove('hidden');
    btn.textContent = '← Vista';
  });

  document.querySelectorAll('.btn-mcp-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-mcp-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mcpGroupBy = btn.dataset.group;
      saveState(MCP_GROUPBY_KEY, mcpGroupBy);
      renderMcpView();
    });
  });
}
