// === Acordeón unificado ===
// Todas las vistas usan este helper para garantizar look&feel idéntico.
// storageKey: si se provee, el estado colapsado se persiste en localStorage.
// badge: texto adicional que aparece como tag al final del header (ej. riesgo).
function buildAccordion(label, count, bodyEl, { badge = null, startOpen = false, storageKey = null } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'vcc-accordion';

  const storKey  = storageKey ? `vcc-acc-${storageKey}` : null;
  const savedStr = storKey ? localStorage.getItem(storKey) : null;
  const isOpen   = savedStr !== null ? savedStr === 'open' : startOpen;

  const header = document.createElement('div');
  header.className = 'section-header';

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

// === Theme (aplicado antes del primer render para evitar flash) ===
(function () {
  const saved = localStorage.getItem('vcc-theme') ?? 'dark';
  document.documentElement.dataset.theme = saved;
})();

function initTheme() {
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

// === Config ===
const API_BASE = '';
const POLL_MS  = 30_000;

const RISK_ICONS     = { bajo: '▲', medio: '▲▲', alto: '▲▲▲', crítico: '⬛' };
const FRESHNESS_STATES = ['fresh', 'watch', 'stale', 'invalid'];

// === Fetch ===
async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
  return res.json();
}

// === Parseo de sección Proyecto activo ===
function parseProject(sections) {
  const raw = sections['Proyecto activo'] ?? '';
  const field = (name) => {
    const m = raw.match(new RegExp(`^- ${name}:\\s*(.+)`, 'm'));
    return m ? m[1].trim() : '—';
  };
  return {
    id:   field('Proyecto ID'),
    name: field('Nombre'),
    env:  field('Ambiente'),
    risk: field('Nivel de riesgo'),
  };
}

// === Render sidebar M1 ===
function renderFreshness(freshness) {
  const f = FRESHNESS_STATES.includes(freshness) ? freshness : 'stale';
  for (const id of ['freshness-dot', 'sidebar-dot']) {
    const el = document.getElementById(id);
    FRESHNESS_STATES.forEach(s => el.classList.remove(s));
    el.classList.add(f);
  }
  for (const id of ['freshness-label', 'sidebar-freshness']) {
    const el = document.getElementById(id);
    FRESHNESS_STATES.forEach(s => el.classList.remove(s));
    el.classList.add(f);
    el.textContent = f;
  }
}

function renderHost(hostValue) {
  document.getElementById('host').textContent       = hostValue ?? '—';
  document.getElementById('host-value').textContent = hostValue ?? '—';
  const fh = document.getElementById('footer-host');
  if (fh) fh.textContent = hostValue ?? '—';
}

function renderProject(project) {
  const icon = RISK_ICONS[project.risk] ?? '';
  document.getElementById('project-name').textContent =
    project.id !== '—' ? project.id : project.name;
  document.getElementById('project-meta').textContent =
    `${project.env} · ${icon} ${project.risk}`.replace('  ', ' ');
  const fp = document.getElementById('footer-project');
  if (fp) fp.textContent = project.id !== '—' ? `${project.id} · ${project.env}` : '—';
}

function tickFooterClock() {
  const el = document.getElementById('footer-time');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString('es-AR');
}

function renderPendientes(handoverCounts) {
  const map = [
    { elId: 'p1', countId: 'p1-count', key: 'P1', cls: 'p1-active' },
    { elId: 'p2', countId: 'p2-count', key: 'P2', cls: 'p2-active' },
    { elId: 'p3', countId: 'p3-count', key: 'P3', cls: 'p3-active' },
    { elId: 'p4', countId: 'p4-count', key: 'P4', cls: 'p4-active' },
  ];
  for (const { elId, countId, key, cls } of map) {
    const count = handoverCounts[key] ?? 0;
    const el    = document.getElementById(elId);
    document.getElementById(countId).textContent = count;
    ['p1-active','p2-active','p3-active','p4-active'].forEach(c => el.classList.remove(c));
    if (count > 0) el.classList.add(cls);
  }
}

function showError(visible) {
  document.getElementById('error-banner').classList.toggle('hidden', !visible);
}

function updateTunnelDots(tunnels) {
  for (const [port, active] of Object.entries(tunnels)) {
    const dot = document.getElementById(`tunnel-dot-${port}`);
    if (!dot) continue;
    dot.textContent = active ? '●' : '○';
    dot.classList.toggle('active',   active);
    dot.classList.toggle('inactive', !active);
  }
}

// === Tabs ===
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
      if (btn.dataset.tab === 'tuneles')   loadTunnels();
      if (btn.dataset.tab === 'proyectos') loadProjects();
      if (btn.dataset.tab === 'opsmap')    loadOpsMap();
      if (btn.dataset.tab === 'apis')      loadApis();
      if (btn.dataset.tab === 'mcp')       loadMcp();
    });
  });
}

// === M2 — Proyectos ===
const CLIENT_LABELS = {
  'digna-fincos': 'DIGNA / FINCOS',
  'fatapp':       'FATAPP',
  'nexo':         'NEXO',
  'nre':          'NRE',
  'all':          'WORKSPACE',
};
const CLIENT_ORDER = ['digna-fincos', 'fatapp', 'nexo', 'nre', 'all'];
const PROJECT_FIELDS = ['name', 'type', 'category', 'status', 'client', 'notes'];
const ENVIRONMENT_FIELDS = [
  'name', 'server', 'host', 'remotePath', 'riskLevel', 'url',
  'openScript', 'sshUser', 'sshKey', 'notes',
];

const ENV_RISK = {
  production:  { color: 'var(--danger)',    label: 'PROD' },
  critical:    { color: 'var(--danger)',    label: 'CRIT' },
  test:        { color: 'var(--warning)',   label: 'TEST' },
  development: { color: 'var(--text-faint)', label: 'DESA' },
  staging:     { color: 'var(--accent)',    label: 'STAGE' },
};

let activeProjectId  = null;
let runtimeData      = null;
let projectsGroupBy  = 'client';
let registryData = null;
let registryHash = null;
let projectManageMode = false;
let projectNewMode = false;
let projectsBannerTimer = null;

async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE}/api/registry`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    registryData = await res.json();
    registryHash = res.headers.get('X-Registry-Hash') || res.headers.get('ETag')?.replaceAll('"', '') || null;
    document.getElementById('projects-hash').textContent = registryHash ? registryHash.slice(0, 12) : 'sin hash';
    renderProjects(registryData.projects);
    if (projectManageMode) renderProjectManagement();
  } catch (e) {
    console.error('[VCC] loadProjects error:', e.message);
    showProjectsBanner('No se pudo cargar el registry.', true);
  }
}

function showProjectsBanner(message, isError = false) {
  const banner = document.getElementById('projects-banner');
  clearTimeout(projectsBannerTimer);
  banner.textContent = message;
  banner.className = `projects-banner ${isError ? 'error' : 'ok'}`;
  projectsBannerTimer = setTimeout(() => banner.classList.add('hidden'), 6000);
}

async function projectWrite(method, path, payload, successMessage) {
  if (!registryHash) {
    showProjectsBanner('Registry sin hash. Recargá antes de guardar.', true);
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedHash: registryHash, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      showProjectsBanner('Registry cambió. Recargá antes de guardar.', true);
      return null;
    }
    if (!res.ok) {
      showProjectsBanner(body.error || `Error HTTP ${res.status}`, true);
      return null;
    }

    projectNewMode = false;
    await loadProjects();
    showProjectsBanner(successMessage);
    return body;
  } catch {
    showProjectsBanner('No se pudo conectar con el backend.', true);
    return null;
  }
}

function renderProjectsList(projects) {
  const STATUS_LABEL = { active: 'Activo', paused: 'Pausado', archived: 'Archivado' };
  const sorted = [...projects].sort((a, b) =>
    (CLIENT_LABELS[a.client] || a.client || '').localeCompare(CLIENT_LABELS[b.client] || b.client || '', 'es') ||
    (a.name || a.id).localeCompare(b.name || b.id, 'es')
  );

  const table = document.createElement('table');
  table.className = 'data-table projects-list-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>PROYECTO</th><th>CLIENTE</th><th>TIPO</th><th>ESTADO</th><th>AMBIENTES</th>` +
    `</tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const p of sorted) {
    const envs  = p.environments || [];
    const sc    = STATUS_COLORS[p.status] ?? 'var(--text-faint)';
    const tr    = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = p.notes || '';

    const envsHtml = envs.map(e => {
      const risk = ENV_RISK[e.riskLevel] || ENV_RISK.development;
      return `<span class="env-dot-chip" style="margin-right:4px">` +
        `<span class="env-dot" style="background:${risk.color}"></span>` +
        `<span style="color:${risk.color};font-size:0.65rem">${escHtml(e.name)}</span>` +
        `</span>`;
    }).join('');

    tr.innerHTML =
      `<td><span class="infra-dot" style="background:${sc};margin-right:6px"></span><strong style="font-size:0.76rem">${escHtml(p.name || p.id)}</strong></td>` +
      `<td>${escHtml(CLIENT_LABELS[p.client] || p.client || '—')}</td>` +
      `<td><code>${escHtml(p.type || '—')}</code></td>` +
      `<td style="color:${sc}">${escHtml(STATUS_LABEL[p.status] || p.status || '—')}</td>` +
      `<td>${envsHtml || '<span style="color:var(--text-faint)">—</span>'}</td>`;

    tr.addEventListener('click', () => {
      // Cambiar a vista por nombre y expandir la card del proyecto
      const btn = document.querySelector('.btn-projects-group[data-group="client"]');
      if (btn && projectsGroupBy !== 'client') {
        btn.click();
      }
    });

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}

function renderProjects(projects) {
  const container = document.getElementById('projects-container');
  container.innerHTML = '';

  if (projectsGroupBy === 'list') {
    container.appendChild(renderProjectsList(projects));
    return;
  }

  if (projectsGroupBy === 'name') {
    const sorted = [...projects].sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id, 'es')
    );
    const flat = document.createElement('div');
    flat.className = 'projects-flat';
    for (const p of sorted) flat.appendChild(renderProjectCard(p));
    container.appendChild(flat);
  } else {
    const groups = {};
    for (const p of projects) {
      const c = p.client || 'all';
      if (!groups[c]) groups[c] = [];
      groups[c].push(p);
    }
    const orderedClients = [
      ...CLIENT_ORDER,
      ...Object.keys(groups).filter(key => !CLIENT_ORDER.includes(key)),
    ];
    for (const clientKey of orderedClients) {
      if (!groups[clientKey]) continue;
      container.appendChild(renderClientGroup(clientKey, groups[clientKey]));
    }
  }

  // Marcar card del proyecto activo con color (sin auto-expand)
  if (activeProjectId) {
    const activeCard = container.querySelector(`[data-project-id="${activeProjectId}"]`);
    activeCard?.classList.add('is-active');
  }
}

function expandProjectCard(card) {
  const body   = card.querySelector('.project-card-body');
  const toggle = card.querySelector('.infra-toggle');
  if (!body || body.dataset.open === 'true') return;
  body.dataset.open = 'true';
  body.classList.remove('hidden');
  if (toggle) {
    toggle.dataset.open = 'true';
    const arrow = toggle.querySelector('.infra-arrow');
    if (arrow) arrow.textContent = '▼';
  }
}

function renderClientGroup(clientKey, projects) {
  const grid = document.createElement('div');
  grid.className = 'client-projects';
  for (const p of projects) grid.appendChild(renderProjectCard(p));

  return buildAccordion(
    CLIENT_LABELS[clientKey] || clientKey,
    projects.length,
    grid,
    { storageKey: `projects-${clientKey}` }
  );
}

const STATUS_COLORS = {
  active:   'var(--success)',
  paused:   'var(--warning)',
  archived: 'var(--text-faint)',
};

function renderProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.projectId = project.id;

  const envs = project.environments || [];
  const statusColor = STATUS_COLORS[project.status] ?? 'var(--text-faint)';

  // ── Líneas de info estáticas (siempre visibles) ───────────
  const header = document.createElement('div');
  header.className = 'project-card-header';
  header.innerHTML =
    `<span class="infra-dot" style="background:${statusColor}"></span>` +
    `<span class="project-card-name">${escHtml(project.name || project.id)}</span>` +
    `<span class="project-type-badge">${escHtml(project.type || '')}</span>`;
  card.appendChild(header);

  const clientEl = document.createElement('div');
  clientEl.className = 'project-client';
  clientEl.textContent = CLIENT_LABELS[project.client] || project.client || '—';
  card.appendChild(clientEl);

  if (project.category || project.status) {
    const catEl = document.createElement('div');
    catEl.className = 'project-category';
    catEl.textContent = [project.category, project.status].filter(Boolean).join(' · ');
    card.appendChild(catEl);
  }

  // ── Dots de environments (siempre visibles) ───────────────
  if (envs.length) {
    const envsRow = document.createElement('div');
    envsRow.className = 'project-envs-row';
    for (const env of envs) {
      const risk = ENV_RISK[env.riskLevel] || ENV_RISK.development;
      const chip = document.createElement('span');
      chip.className = 'env-dot-chip';
      chip.innerHTML =
        `<span class="env-dot" style="background:${risk.color}"></span>` +
        `<span style="color:${risk.color}">${escHtml(env.name)}</span>`;
      envsRow.appendChild(chip);
    }
    card.appendChild(envsRow);
  }

  // ── Toggle acordeón (mismo patrón que infra-toggle) ───────
  const toggleEl = document.createElement('div');
  toggleEl.className = 'infra-toggle';
  toggleEl.dataset.open = 'false';
  toggleEl.innerHTML =
    `<span class="infra-arrow">▶</span>` +
    `<span class="infra-toggle-label">${envs.length} ambiente${envs.length !== 1 ? 's' : ''}</span>`;
  card.appendChild(toggleEl);

  // ── Body con env blocks ───────────────────────────────────
  const body = document.createElement('div');
  body.className = 'project-card-body hidden';
  body.dataset.open = 'false';

  if (project.notes) {
    const notes = document.createElement('div');
    notes.className = 'project-card-notes';
    notes.textContent = project.notes;
    body.appendChild(notes);
  }
  for (const env of envs) body.appendChild(renderEnvBlock(project.id, env));

  toggleEl.addEventListener('click', () => {
    const open = toggleEl.dataset.open === 'true';
    toggleEl.dataset.open = String(!open);
    toggleEl.querySelector('.infra-arrow').textContent = open ? '▶' : '▼';
    body.dataset.open   = String(!open);
    body.classList.toggle('hidden', open);
  });

  card.appendChild(body);
  return card;
}

function renderEnvBlock(projectId, env) {
  const risk = ENV_RISK[env.riskLevel] || ENV_RISK.development;

  const block = document.createElement('div');
  block.className = 'env-block';
  block.style.borderLeftColor = risk.color;

  // Header: nombre + risk label
  const hdr = document.createElement('div');
  hdr.className = 'env-block-header';
  hdr.innerHTML =
    `<span class="env-block-name" style="color:${risk.color}">${escHtml(env.name.toUpperCase())}</span>` +
    `<span class="env-block-risk" style="color:${risk.color}">${risk.label}</span>`;
  block.appendChild(hdr);

  // Meta: campos disponibles
  const meta = document.createElement('div');
  meta.className = 'env-block-meta';

  if (env.host || env.serverIp) {
    meta.appendChild(envField('Host',
      [env.host, env.serverIp].filter(Boolean).join(' · ')));
  }
  if (env.remotePath) {
    meta.appendChild(envField('Path', env.remotePath, true));
  }
  if (env.laravelVersion) {
    const dbStr = env.database ? ` · ${env.database.engine}:${env.database.name}` : '';
    meta.appendChild(envField('Stack', `Laravel ${env.laravelVersion}${dbStr}`));
  } else if (env.database) {
    meta.appendChild(envField('DB', `${env.database.engine}:${env.database.name}`));
  }
  if (env.mcpProfile) {
    meta.appendChild(envField('MCP', env.mcpProfile));
  }

  block.appendChild(meta);

  // Footer: URL + VS Code
  const footer = document.createElement('div');
  footer.className = 'env-block-footer';

  if (env.url) {
    const link = document.createElement('span');
    link.className = 'env-block-url';
    link.textContent = env.url;
    footer.appendChild(link);
  }

  if (env.host && env.remotePath) {
    const btn = document.createElement('button');
    btn.className = 'btn-vscode';
    btn.textContent = '⬡ VS Code';
    btn.addEventListener('click', () => openVSCode(projectId, env.name, btn));
    footer.appendChild(btn);
  }

  // Botón Activar — siempre visible; deshabilitado si ya es el proyecto activo
  const isActive = runtimeData?.current?.projectId === projectId &&
                   runtimeData?.current?.environment === env.name;
  const btnActivar = document.createElement('button');
  btnActivar.className = 'btn-vscode btn-activate';
  btnActivar.textContent = isActive ? '✓ Activo' : '⊙ Activar';
  btnActivar.dataset.active = isActive ? 'true' : 'false';
  if (isActive) btnActivar.disabled = true;
  btnActivar.addEventListener('click', () => setActiveProject(projectId, env.name, btnActivar));
  footer.appendChild(btnActivar);

  if (footer.children.length) block.appendChild(footer);

  return block;
}

function envField(label, value, mono = false) {
  const el = document.createElement('div');
  el.className = 'env-block-field';
  el.innerHTML =
    `<span class="env-field-label">${escHtml(label)}</span>` +
    `<span class="env-field-value${mono ? ' mono' : ''}">${escHtml(value)}</span>`;
  return el;
}

async function openVSCode(projectId, envName, btn) {
  btn.disabled = true;
  btn.textContent = '⬡ abriendo…';
  try {
    await fetch(`${API_BASE}/api/projects/${projectId}/environments/${envName}/open-vscode`, {
      method: 'POST',
    });
  } catch { /* silencioso — VS Code puede haberse abierto igual */ }
  setTimeout(() => {
    btn.textContent = '⬡ VS Code';
    btn.disabled = false;
  }, 1500);
}

async function setActiveProject(projectId, envName, btn) {
  const wasActive = btn.dataset.active === 'true';
  if (wasActive) return;

  btn.disabled = true;
  btn.textContent = 'Activando…';
  try {
    const res = await fetch(`${API_BASE}/api/runtime/set-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, environment: envName }),
    });
    if (!res.ok) {
      btn.textContent = '✗ Error';
      setTimeout(() => { btn.textContent = '⊙ Activar'; btn.disabled = false; }, 2000);
      return;
    }
    btn.textContent = '✓ Activo';
    await update();
    // Siempre recargar Proyectos para actualizar botones Activar/Activo
    await loadProjects();
  } catch {
    btn.textContent = '✗ Error';
    setTimeout(() => { btn.textContent = '⊙ Activar'; btn.disabled = false; }, 2000);
  }
}

function managementField(label, field, value = '', { readOnly = false, required = false, textarea = false } = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = `project-form-field${textarea ? ' project-form-field-wide' : ''}`;
  wrapper.textContent = label;
  const input = document.createElement(textarea ? 'textarea' : 'input');
  input.className = 'project-input';
  input.dataset.field = field;
  input.value = value ?? '';
  input.readOnly = readOnly;
  input.required = required;
  if (readOnly) input.classList.add('readonly');
  wrapper.appendChild(input);
  return wrapper;
}

function projectMetadataGrid(project, isNew = false) {
  const grid = document.createElement('div');
  grid.className = 'project-form-grid';
  const idField = managementField('ID', 'id', project.id, { readOnly: true });
  const nameField = managementField('Nombre', 'name', project.name, { required: true });
  grid.appendChild(idField);
  grid.appendChild(nameField);
  grid.appendChild(managementField('Tipo', 'type', project.type, { required: true }));
  grid.appendChild(managementField('Categoría', 'category', project.category, { required: true }));
  grid.appendChild(managementField('Estado', 'status', project.status, { required: true }));
  grid.appendChild(managementField('Cliente', 'client', project.client, { required: true }));
  grid.appendChild(managementField('Notas', 'notes', project.notes, { textarea: true }));
  if (isNew) {
    const idInput = idField.querySelector('input');
    const nameInput = nameField.querySelector('input');
    idInput.placeholder = 'automático desde nombre';
    nameInput.addEventListener('input', () => {
      idInput.value = previewProjectId(nameInput.value);
    });
  }
  return grid;
}

function previewProjectId(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readFields(container, fields) {
  return Object.fromEntries(fields.map(field => [
    field,
    container.querySelector(`[data-field="${field}"]`)?.value.trim() ?? '',
  ]));
}

function requiredFieldsPresent(values, fields) {
  const missing = fields.find(field => !values[field]);
  if (missing) showProjectsBanner(`Campo obligatorio: ${missing}`, true);
  return !missing;
}

function renderNewProjectEditor() {
  const editor = document.createElement('section');
  editor.className = 'project-editor project-editor-new';
  editor.innerHTML = '<div class="project-editor-title">NUEVO PROYECTO</div>';
  editor.appendChild(projectMetadataGrid({ environments: [] }, true));

  const actions = document.createElement('div');
  actions.className = 'project-editor-actions';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost btn-project-secondary';
  cancel.textContent = 'Cancelar';
  cancel.addEventListener('click', () => { projectNewMode = false; renderProjectManagement(); });
  const save = document.createElement('button');
  save.className = 'btn btn-primary btn-project-primary';
  save.textContent = 'Crear proyecto';
  save.addEventListener('click', async () => {
    const values = readFields(editor, PROJECT_FIELDS);
    if (!requiredFieldsPresent(values, ['name', 'type', 'category', 'status', 'client'])) return;
    const project = { ...values, environments: [] };
    if (!project.notes) delete project.notes;
    await projectWrite('POST', '/api/projects', { project }, `Proyecto ${project.id} creado.`);
  });
  actions.append(cancel, save);
  editor.appendChild(actions);
  return editor;
}

function environmentEditor(project, environment = null) {
  const isNew = !environment;
  const original = environment || {};
  const details = document.createElement('details');
  details.className = 'environment-editor';
  details.open = isNew;

  const summary = document.createElement('summary');
  summary.innerHTML = isNew
    ? '<span class="environment-name">NUEVO AMBIENTE</span>'
    : `<span class="environment-name">${escHtml(environment.name)}</span><span class="environment-server">${escHtml(environment.server)}</span>`;
  details.appendChild(summary);

  const grid = document.createElement('div');
  grid.className = 'environment-form-grid';
  for (const field of ENVIRONMENT_FIELDS) {
    grid.appendChild(managementField(field, field, original[field], { required: ['name', 'server'].includes(field), textarea: field === 'notes' }));
  }
  details.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'environment-actions';
  if (isNew) {
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost btn-project-secondary';
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => details.remove());
    actions.appendChild(cancel);
  } else {
    const remove = document.createElement('button');
    remove.className = 'btn btn-danger btn-project-danger';
    remove.textContent = 'Eliminar ambiente';
    remove.addEventListener('click', async () => {
      const confirmed = await confirmDialog(
        'Eliminar ambiente',
        `Se eliminará ${project.id}/${environment.name}.`,
        true,
      );
      if (!confirmed) return;
      await projectWrite(
        'DELETE',
        `/api/projects/${encodeURIComponent(project.id)}/environments/${encodeURIComponent(environment.name)}`,
        {},
        `Ambiente ${environment.name} eliminado.`,
      );
    });
    actions.appendChild(remove);
  }

  const save = document.createElement('button');
  save.className = 'btn btn-primary btn-project-primary';
  save.textContent = isNew ? 'Agregar ambiente' : 'Guardar ambiente';
  save.addEventListener('click', async () => {
    const values = readFields(details, ENVIRONMENT_FIELDS);
    if (!requiredFieldsPresent(values, ['name', 'server'])) return;
    if (!!values.host !== !!values.remotePath) {
      showProjectsBanner('host y remotePath deben completarse juntos.', true);
      return;
    }

    if (isNew) {
      const clean = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
      await projectWrite(
        'POST',
        `/api/projects/${encodeURIComponent(project.id)}/environments`,
        { environment: clean },
        `Ambiente ${clean.name} agregado.`,
      );
      return;
    }

    const changes = {};
    for (const field of ENVIRONMENT_FIELDS) {
      if (values[field] !== String(original[field] ?? '')) changes[field] = values[field];
    }
    await projectWrite(
      'PATCH',
      `/api/projects/${encodeURIComponent(project.id)}/environments/${encodeURIComponent(environment.name)}`,
      { changes },
      `Ambiente ${environment.name} actualizado.`,
    );
  });
  actions.appendChild(save);
  details.appendChild(actions);
  return details;
}

function renderProjectEditor(project) {
  const details = document.createElement('details');
  details.className = 'project-editor';
  details.dataset.projectId = project.id;

  const summary = document.createElement('summary');
  const environments = project.environments?.length ?? 0;
  summary.innerHTML =
    `<span class="project-editor-id">${escHtml(project.id)}</span>` +
    `<span class="project-editor-name">${escHtml(project.name)}</span>` +
    `<span class="project-editor-count">${environments} env</span>`;
  details.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'project-editor-content';
  content.appendChild(projectMetadataGrid(project));

  const metadataActions = document.createElement('div');
  metadataActions.className = 'project-editor-actions';
  const remove = document.createElement('button');
  remove.className = 'btn btn-danger btn-project-danger';
  remove.textContent = 'Eliminar proyecto';
  remove.addEventListener('click', async () => {
    const confirmed = await confirmDialog(
      'Eliminar proyecto',
      `Escribí ${project.id} para confirmar la eliminación.`,
      true,
      project.id,
    );
    if (!confirmed) return;
    await projectWrite(
      'DELETE',
      `/api/projects/${encodeURIComponent(project.id)}`,
      {},
      `Proyecto ${project.id} eliminado.`,
    );
  });

  const save = document.createElement('button');
  save.className = 'btn btn-primary btn-project-primary';
  save.textContent = 'Guardar metadata';
  save.addEventListener('click', async () => {
    const values = readFields(content, PROJECT_FIELDS);
    if (!requiredFieldsPresent(values, ['name', 'type', 'category', 'status', 'client'])) return;
    const changes = {};
    for (const field of PROJECT_FIELDS) {
      if (values[field] !== String(project[field] ?? '')) changes[field] = values[field];
    }
    await projectWrite(
      'PATCH',
      `/api/projects/${encodeURIComponent(project.id)}`,
      { changes },
      `Proyecto ${project.id} actualizado.`,
    );
  });
  metadataActions.append(remove, save);
  content.appendChild(metadataActions);

  if (project.access && project.environments === undefined) {
    const access = document.createElement('div');
    access.className = 'project-access-readonly';
    access.innerHTML = '<div class="project-subtitle">ACCESS · SOLO LECTURA</div>' +
      `<pre>${escHtml(JSON.stringify(project.access, null, 2))}</pre>`;
    content.appendChild(access);
  } else {
    const environmentsHeader = document.createElement('div');
    environmentsHeader.className = 'project-environments-header';
    environmentsHeader.innerHTML = '<span class="project-subtitle">AMBIENTES</span>';
    const addEnvironment = document.createElement('button');
    addEnvironment.className = 'btn btn-ghost btn-project-secondary';
    addEnvironment.textContent = '＋ Ambiente';
    environmentsHeader.appendChild(addEnvironment);

    const environmentList = document.createElement('div');
    environmentList.className = 'environment-editor-list';
    for (const environment of (project.environments || [])) {
      environmentList.appendChild(environmentEditor(project, environment));
    }
    addEnvironment.addEventListener('click', () => {
      const editor = environmentEditor(project);
      environmentList.prepend(editor);
      editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    content.append(environmentsHeader, environmentList);
  }

  details.appendChild(content);
  return details;
}

function renderProjectManagement() {
  const container = document.getElementById('projects-manage-container');
  container.innerHTML = '';
  if (!registryData) return;
  if (projectNewMode) container.appendChild(renderNewProjectEditor());
  for (const project of registryData.projects) container.appendChild(renderProjectEditor(project));
}

function toggleProjectManagement(force) {
  projectManageMode = force === undefined ? !projectManageMode : force;
  document.getElementById('projects-container').classList.toggle('hidden', projectManageMode);
  document.getElementById('projects-manage-container').classList.toggle('hidden', !projectManageMode);
  document.getElementById('btn-project-manage').textContent = projectManageMode ? '← Vista' : '⚙ Gestionar';
  if (projectManageMode) renderProjectManagement();
}

function initProjects() {
  document.getElementById('btn-project-manage').addEventListener('click', () => {
    projectNewMode = false;
    toggleProjectManagement();
  });
  document.getElementById('btn-project-add').addEventListener('click', () => {
    projectNewMode = true;
    toggleProjectManagement(true);
    renderProjectManagement();
    document.querySelector('.project-editor-new')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Group-by toggle
  document.querySelectorAll('.btn-projects-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-projects-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      projectsGroupBy = btn.dataset.group;
      if (registryData) renderProjects(registryData.projects);
    });
  });
}

// === F1 — Cockpit (pantalla Inicio) ===
function renderCockpit(status, sections, tunnelData, runtime) {
  const panel = document.getElementById('tab-inicio');
  if (!panel) return;

  const freshness = FRESHNESS_STATES.includes(status.freshness) ? status.freshness : 'stale';
  const updated   = (sections['Metadata'] ?? '').match(/Actualizado:\s*(.+)/)?.[1]?.trim() ?? '—';

  const tunnelMeta = { 3307: 'FatApp', 3308: 'appstest', 3309: 'appsprod', 3310: 'appsdesa' };

  // ── Pendientes: items reales de P1 y P2 ──────────────────
  const pendientesDetail = parsePendientesDetail(sections);
  const pRows = [
    ...pendientesDetail.P1.map(t => ({ text: t, color: 'var(--danger)',  dot: '●' })),
    ...pendientesDetail.P2.map(t => ({ text: t, color: 'var(--warning)', dot: '●' })),
  ].slice(0, 5); // máx 5 items

  // ── Túneles ───────────────────────────────────────────────
  const tunnelRows = Object.entries(tunnelMeta).map(([port, name]) => {
    const active = tunnelData[port] ?? false;
    const prod   = port === '3309' ? `<span class="badge-prod">PROD</span>` : '';
    return `<div class="cockpit-tunnel">
      <span class="cockpit-t-dot ${active ? 'active' : 'inactive'}">●</span>
      <span class="cockpit-t-port">${port}</span>
      <span class="cockpit-t-name">${name}</span>
      ${prod}
    </div>`;
  }).join('');

  // ── Fila de project cards ─────────────────────────────────
  const current = runtime?.current ?? null;
  const recent  = runtime?.recent  ?? [];

  // current primero, luego recientes sin repetir current, máx 3 total
  const cardList = [];
  if (current) cardList.push({ ...current, isActive: true });
  for (const r of recent) {
    if (cardList.length >= 3) break;
    if (r.projectId === current?.projectId && r.environment === current?.environment) continue;
    cardList.push({ ...r, isActive: false });
  }

  panel.innerHTML = `
    <div class="cockpit-grid">

      <div class="cockpit-widget cockpit-span4">
        <div class="cockpit-widget-label">PROYECTOS RECIENTES</div>
        <div class="cockpit-project-row" id="cockpit-proj-row"></div>
      </div>

      <div class="cockpit-widget">
        <div class="cockpit-widget-label">WORKSPACE</div>
        <div class="cockpit-freshness-row">
          <span class="dot ${freshness}"></span>
          <span class="cockpit-freshness-state ${freshness}">${freshness}</span>
        </div>
        <div class="cockpit-meta">
          <span class="cockpit-meta-host">${escHtml(status.host?.value ?? '—')}</span>
          <span class="cockpit-meta-time">${escHtml(updated)}</span>
        </div>
      </div>

      <div class="cockpit-widget">
        <div class="cockpit-widget-label">PENDIENTES CRÍTICOS</div>
        <div class="cockpit-p-items" id="cockpit-p-items"></div>
      </div>

      <div class="cockpit-widget cockpit-span2">
        <div class="cockpit-widget-label">TÚNELES SSH</div>
        <div class="cockpit-tunnel-list">${tunnelRows}</div>
      </div>

    </div>`;

  // ── Construir project cards via DOM (evita XSS por onclick inline) ──
  const projRow = panel.querySelector('#cockpit-proj-row');
  if (cardList.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'color:var(--text-faint);font-size:0.8rem';
    empty.textContent = 'Sin proyecto activo — activá uno desde Proyectos';
    projRow.appendChild(empty);
  } else {
    for (const c of cardList) {
      const riskKey = (c.riskLevel ?? 'bajo').toLowerCase().replace(/\s+/g, '-');
      const card = document.createElement('div');
      card.className = 'cockpit-proj-card' + (c.isActive ? ' is-active' : '');

      const name = document.createElement('div');
      name.className = 'cockpit-proj-card-name';
      name.textContent = c.name ?? c.projectId;

      const badges = document.createElement('div');
      badges.className = 'cockpit-proj-card-badges';

      const envBadge = document.createElement('span');
      envBadge.className = 'cockpit-badge cockpit-badge-env';
      envBadge.textContent = c.environment;

      const riskBadge = document.createElement('span');
      riskBadge.className = `cockpit-badge cockpit-badge-risk risk-${riskKey}`;
      riskBadge.textContent = c.riskLevel ?? 'bajo';

      badges.appendChild(envBadge);
      badges.appendChild(riskBadge);

      const footer = document.createElement('div');
      footer.className = 'cockpit-proj-card-footer';

      if (c.isActive) {
        const lbl = document.createElement('span');
        lbl.className = 'cockpit-proj-active-label';
        lbl.textContent = '● ACTIVO';
        footer.appendChild(lbl);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn-vscode btn-activate';
        btn.textContent = '⊙ Activar';
        btn.addEventListener('click', () => setActiveProject(c.projectId, c.environment, btn));
        footer.appendChild(btn);
      }

      card.appendChild(name);
      card.appendChild(badges);
      card.appendChild(footer);
      projRow.appendChild(card);
    }
  }

  // ── Pendientes críticos: items de texto via DOM ───────────
  const pItemsEl = panel.querySelector('#cockpit-p-items');
  if (pRows.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'cockpit-summary-text';
    empty.style.color = 'var(--text-faint)';
    empty.textContent = 'Sin pendientes críticos ni altos';
    pItemsEl.appendChild(empty);
  } else {
    for (const { text, color, dot } of pRows) {
      const row = document.createElement('div');
      row.className = 'cockpit-p-item';
      const dotEl = document.createElement('span');
      dotEl.style.color = color;
      dotEl.style.flexShrink = '0';
      dotEl.textContent = dot;
      const textEl = document.createElement('span');
      textEl.className = 'cockpit-p-item-text';
      textEl.textContent = text;
      row.appendChild(dotEl);
      row.appendChild(textEl);
      pItemsEl.appendChild(row);
    }
  }
}

// === F2 — Mapa Operativo ===
let opsMapData = null;

function riskClass(value) {
  return String(value ?? 'bajo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

function sslWorst(domains = []) {
  const order = { expired: 0, crit: 1, warn: 2, error: 3, ok: 4 };
  return [...domains].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))[0] ?? null;
}

function buildOpsNodes({ runtime, tunnels, ssl, servers }) {
  const current = runtime?.current ?? null;
  const recent = runtime?.recent ?? [];
  const activeTunnelCount = tunnels.filter(t => t.active).length;
  const sslSummary = ssl?.summary ?? {};
  const sslCritical = (sslSummary.expired ?? 0) + (sslSummary.crit ?? 0);
  const highRiskServers = servers.filter(s => ['alto', 'critico'].includes(riskClass(s.riesgo))).length;
  const currentServer = current?.serverIp
    ? servers.find(s => s.ip === current.serverIp || s.id === current.host)
    : null;

  const nodes = [
    {
      id: 'workspace', type: 'core', label: 'ValeraIA', sub: 'Workspace vivo', state: 'fresh',
      detail: 'Centro operativo. Cruza sesión activa, runtime, infraestructura, dominios y túneles.',
    },
  ];

  if (current) {
    nodes.push({
      id: 'current', type: 'project', label: current.projectId, sub: `${current.environment} · ${current.riskLevel ?? 'bajo'}`,
      state: riskClass(current.riskLevel), detail: `Proyecto activo en ${current.environment}. MCP: ${current.mcpProfile ?? '—'}.`,
    });
  }

  nodes.push({
    id: 'tunnels', type: 'tunnel', label: `${activeTunnelCount}/${tunnels.length}`, sub: 'Túneles SSH',
    state: activeTunnelCount > 0 ? 'active' : 'idle', detail: `${activeTunnelCount} túnel(es) activo(s).`,
  });
  nodes.push({
    id: 'ssl', type: 'domain', label: sslCritical ? `${sslCritical} críticos` : 'SSL OK', sub: `${ssl?.domains?.length ?? 0} dominios`,
    state: sslCritical ? 'critico' : ((sslSummary.warn ?? 0) > 0 ? 'watch' : 'fresh'),
    detail: sslCritical ? 'Hay certificados vencidos o críticos.' : 'Sin certificados críticos detectados.',
  });
  nodes.push({
    id: 'infra', type: 'server', label: `${servers.length}`, sub: 'Servidores',
    state: highRiskServers > 0 ? 'alto' : 'fresh', detail: `${highRiskServers} servidor(es) de riesgo alto/crítico.`,
  });

  for (const item of recent.slice(0, 3)) {
    if (item.projectId === current?.projectId && item.environment === current?.environment) continue;
    nodes.push({
      id: `recent-${item.projectId}-${item.environment}`, type: 'project', label: item.projectId,
      sub: item.environment, state: riskClass(item.riskLevel), detail: `Proyecto reciente: ${item.name ?? item.projectId}.`,
    });
  }

  for (const tunnel of tunnels.slice(0, 6)) {
    nodes.push({
      id: `tunnel-${tunnel.port}`, type: 'tunnel', label: String(tunnel.port), sub: tunnel.name,
      state: tunnel.active ? (tunnel.prod ? 'critico' : 'active') : 'idle',
      detail: `${tunnel.remote ?? '—'} → ${tunnel.forward ?? '—'}${tunnel.prod ? '. Requiere criterio de producción.' : ''}`,
    });
  }

  if (currentServer) {
    nodes.push({
      id: `server-${currentServer.id}`, type: 'server', label: currentServer.id, sub: currentServer.ip,
      state: riskClass(currentServer.riesgo), detail: currentServer.rol || 'Servidor asociado al proyecto activo.',
    });
  }

  const worst = sslWorst(ssl?.domains);
  if (worst) {
    nodes.push({
      id: `domain-${worst.domain}`, type: 'domain', label: worst.domain, sub: worst.status.toUpperCase(),
      state: worst.status === 'ok' ? 'fresh' : (worst.status === 'warn' ? 'watch' : 'critico'),
      detail: worst.daysLeft === null ? (worst.error ?? 'Sin datos de vencimiento') : `Vence en ${worst.daysLeft} día(s).`,
    });
  }

  return nodes;
}

function renderOpsDetail(node) {
  const detail = document.getElementById('opsmap-detail');
  if (!detail || !node) return;
  detail.innerHTML = `
    <div class="opsmap-detail-kicker">${escHtml(node.type)}</div>
    <div class="opsmap-detail-title">${escHtml(node.label)}</div>
    <div class="opsmap-detail-sub">${escHtml(node.sub)}</div>
    <p>${escHtml(node.detail)}</p>
    <div class="opsmap-detail-state state-${escHtml(node.state)}">${escHtml(node.state)}</div>
  `;
}

function prioritizeOpsNodes(data) {
  const nodes = data.nodes ?? buildOpsNodes(data);
  if (!data.nodes) return nodes;

  const byId = new Map(nodes.map(n => [n.id, n]));
  const selected = new Set(['workspace']);
  const currentEnvId = data.current?.projectId && data.current?.environment
    ? `env:${data.current.projectId}:${data.current.environment}`
    : null;
  const currentProjectId = data.current?.projectId ? `project:${data.current.projectId}` : null;
  if (currentProjectId) selected.add(currentProjectId);
  if (currentEnvId) selected.add(currentEnvId);

  for (const link of data.links ?? []) {
    if (selected.has(link.from) || selected.has(link.to)) {
      selected.add(link.from);
      selected.add(link.to);
    }
  }

  const priority = [...selected]
    .map(id => byId.get(id))
    .filter(Boolean);

  const important = nodes.filter(n =>
    !selected.has(n.id) && ['critico', 'critical', 'alto', 'active', 'watch'].includes(n.state)
  );
  const rest = nodes.filter(n => !selected.has(n.id) && !important.includes(n));
  return [...priority, ...important, ...rest].slice(0, 32);
}

function renderOpsMap(data) {
  const container = document.getElementById('opsmap-container');
  if (!container) return;

  const nodes = prioritizeOpsNodes(data);
  const summary = data.summary ?? {};
  const activeProdTunnels = summary.activeProdTunnels ?? data.tunnels?.filter(t => t.active && t.prod).length ?? 0;
  const sslCritical = summary.sslCritical ?? ((data.ssl?.summary?.expired ?? 0) + (data.ssl?.summary?.crit ?? 0));
  const current = data.current ?? data.runtime?.current;
  const missionState = summary.missionState ?? (activeProdTunnels > 0 || sslCritical > 0 ? 'attention' : 'nominal');
  const missionText = activeProdTunnels > 0
    ? 'Producción expuesta por túnel activo. Operar con confirmación explícita.'
    : sslCritical > 0
      ? 'Hay dominios críticos. Priorizar revisión SSL.'
      : `Workspace nominal. ${data.links ? `${data.links.length} relaciones derivadas disponibles.` : 'Próximo paso: operar según handover.'}`;

  container.innerHTML = `
    <div class="opsmap-shell">
      <section class="opsmap-radar" aria-label="Mapa operativo">
        <div class="opsmap-gridlines"></div>
        <div class="opsmap-core-pulse"></div>
        <div class="opsmap-link opsmap-link-h"></div>
        <div class="opsmap-link opsmap-link-v"></div>
        <div class="opsmap-nodes" id="opsmap-nodes"></div>
      </section>
      <aside class="opsmap-side">
        <div class="opsmap-mission ${missionState}">
          <div class="opsmap-mission-label">MISSION STATE</div>
          <div class="opsmap-mission-value">${missionState === 'nominal' ? 'NOMINAL' : 'ATTENTION'}</div>
          <p>${escHtml(missionText)}</p>
        </div>
        <div class="opsmap-stats">
          <div><span>${summary.servers ?? data.servers?.length ?? 0}</span><small>servidores</small></div>
          <div><span>${summary.domains ?? data.ssl?.domains?.length ?? 0}</span><small>dominios</small></div>
          <div><span>${summary.activeTunnels ?? data.tunnels?.filter(t => t.active).length ?? 0}</span><small>túneles activos</small></div>
        </div>
        <div class="opsmap-detail" id="opsmap-detail"></div>
      </aside>
    </div>
  `;

  const nodesEl = document.getElementById('opsmap-nodes');
  nodes.forEach((node, index) => {
    const btn = document.createElement('button');
    const angle = index === 0 ? 0 : ((index - 1) / Math.max(nodes.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = index === 0 ? 0 : 38 + ((index % 3) * 11);
    const x = index === 0 ? 50 : 50 + Math.cos(angle) * radius;
    const y = index === 0 ? 50 : 50 + Math.sin(angle) * radius;
    btn.className = `ops-node type-${node.type} state-${node.state}${index === 0 ? ' is-core' : ''}`;
    btn.style.left = `${Math.max(8, Math.min(92, x))}%`;
    btn.style.top = `${Math.max(8, Math.min(92, y))}%`;
    btn.innerHTML = `<strong>${escHtml(node.label)}</strong><span>${escHtml(node.sub)}</span>`;
    btn.addEventListener('click', () => {
      nodesEl.querySelectorAll('.ops-node').forEach(n => n.classList.remove('selected'));
      btn.classList.add('selected');
      renderOpsDetail(node);
    });
    nodesEl.appendChild(btn);
    if (index === 0) btn.classList.add('selected');
  });

  renderOpsDetail(nodes[0]);
  const subtitle = document.getElementById('opsmap-subtitle');
  if (subtitle && current) subtitle.textContent = `${current.projectId}/${current.environment} · ${current.riskLevel ?? 'bajo'} · ${data.links?.length ?? 0} relaciones`;
}

async function loadOpsMap() {
  const container = document.getElementById('opsmap-container');
  if (!container) return;
  container.innerHTML = '<div class="opsmap-loading">Sincronizando mapa operativo...</div>';
  try {
    opsMapData = await get('/api/opsmap');
    runtimeData = { current: opsMapData.current, recent: opsMapData.recent ?? [] };
    renderOpsMap(opsMapData);
  } catch (err) {
    container.innerHTML = `<div class="opsmap-loading error">No se pudo sincronizar el mapa: ${escHtml(err.message)}</div>`;
  }
}

// === M12 — Briefing ===
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parsePendientesDetail(sections) {
  const raw = sections['Pendientes'] ?? '';
  const items = { P1: [], P2: [], P3: [], P4: [] };
  let current = null;
  for (const line of raw.split('\n')) {
    const pMatch = line.match(/^### (P[1-4])\b/);
    if (pMatch) { current = pMatch[1]; continue; }
    const open = line.match(/^- \[ \] (.+)/);
    if (open && current) items[current].push(open[1].trim());
  }
  return items;
}

function renderBriefing(sections) {
  const panel = document.getElementById('tab-briefing');
  if (!panel) return;

  const updated    = (sections['Metadata'] ?? '').match(/Actualizado:\s*(.+)/)?.[1]?.trim() ?? '—';
  const nextStep   = (sections['Proximo paso seguro'] ?? '').trim();
  const estado     = (sections['Estado actual'] ?? '').trim();
  const bloq       = (sections['Bloqueadores'] ?? '').trim();
  const resumen    = (sections['Resumen para IA entrante'] ?? '').trim();
  const pendientes = parsePendientesDetail(sections);
  const hasBloq    = bloq.length > 0 && !/^ninguno$/i.test(bloq);

  // ── Chips de pendientes con color y label descriptivo ─────
  const pChipConfig = {
    P1: { label: 'Crítico',  cls: 'p1' },
    P2: { label: 'Alto',     cls: 'p2' },
    P3: { label: 'Normal',   cls: 'p3' },
    P4: { label: 'Bajo',     cls: 'p4' },
  };

  const pChips = ['P1','P2','P3','P4'].flatMap(p =>
    pendientes[p].map(text => {
      const { label, cls } = pChipConfig[p];
      return `<div class="brief-p-chip ${cls}">` +
        `<span class="brief-p-chip-tag">${label}</span>` +
        `<span class="brief-p-chip-text">${escHtml(text)}</span>` +
        `</div>`;
    })
  ).join('');

  // ── Resumen colapsable ────────────────────────────────────
  const resumenId = 'brief-resumen-body';
  const resumenHtml = resumen
    ? `<button class="brief-resumen-toggle" onclick="
        const b=document.getElementById('${resumenId}');
        const open=!b.classList.contains('hidden');
        b.classList.toggle('hidden',open);
        this.textContent=open?'▶ Resumen para IA':'▼ Resumen para IA';
       ">▶ Resumen para IA</button>
       <div class="brief-resumen-body hidden" id="${resumenId}">${escHtml(resumen)}</div>`
    : '';

  panel.innerHTML =
    `<div class="briefing-header">` +
      `<div class="briefing-header-title">Sesión actual</div>` +
      `<div class="briefing-header-desc">Contexto de la sesión IA activa — leído del handover generado al iniciar o cerrar sesión.</div>` +
      `<p class="briefing-updated">↻ ${escHtml(updated)}</p>` +
    `</div>` +
    `<div class="briefing-grid">` +

    `<div class="brief-hero briefing-full">` +
    `<div class="brief-hero-label">PRÓXIMO PASO</div>` +
    `<div class="brief-hero-text">${escHtml(nextStep || '—')}</div>` +
    `</div>` +

    `<div class="briefing-card ok">` +
    `<div class="briefing-card-label">ESTADO ACTUAL</div>` +
    `<div class="briefing-card-body">${escHtml(estado || '—')}</div>` +
    `</div>` +

    `<div class="briefing-card${hasBloq ? ' warn' : ''}">` +
    `<div class="briefing-card-label">${hasBloq ? '⚠ ' : ''}BLOQUEADORES</div>` +
    `<div class="briefing-card-body${hasBloq ? '' : ' muted'}">${hasBloq ? escHtml(bloq) : 'ninguno'}</div>` +
    `</div>` +

    `<div class="briefing-card briefing-full">` +
    `<div class="briefing-card-label">PENDIENTES ABIERTOS</div>` +
    `<div class="brief-p-chips">${pChips ||
      '<div class="briefing-card-body muted">sin pendientes abiertos</div>'
    }</div>` +
    `</div>` +

    (resumenHtml ? `<div class="briefing-card briefing-full">${resumenHtml}</div>` : '') +

    `</div>`;
}

// === M3 — Gobernanza ===
const GOVERN_SCRIPTS = [
  {
    id:   'workspace-health',
    icon: '⬡',
    name: 'workspace-health',
    desc: 'Diagnóstico completo del workspace. Verifica hardlinks entre CLAUDE.md y ~/.claude/, estado de sync OneDrive/rclone, archivos viejos y consistencia de configuración entre PCs.',
    scripts: ['scripts/workspace/governance/workspace-health.ps1'],
  },
  {
    id:   'compile-agents',
    icon: '⚙',
    name: 'compile-agents',
    desc: 'Regenera AGENTS.md para Codex compilando CLAUDE.md más todos los rules/*.md en un solo archivo. Ejecutar siempre después de editar CLAUDE.md o cualquier regla en rules/.',
    scripts: ['scripts/workspace/governance/compile-agents-md.ps1'],
  },
  {
    id:   'web-context',
    icon: '◈',
    name: 'web-context',
    desc: 'Genera el bundle de contexto web AI en runtime/web-context.md para continuar sesiones en Claude.ai o ChatGPT Web con el estado actual del workspace y el proyecto activo.',
    scripts: ['scripts/workspace/governance/generate-web-context.ps1'],
  },
  {
    id:   'sync-status',
    icon: '⇅',
    name: 'sync-status',
    desc: 'Muestra el estado de sincronización de rclone y OneDrive. Detecta desvíos, archivos sin sincronizar y estado de los remotes configurados. Útil antes de cambiar de PC.',
    scripts: ['scripts/workspace/sync/sync-status.ps1'],
  },
  {
    id:   'cierre',
    icon: '◼',
    name: 'cierre',
    desc: 'Cierre de sesión IA en 4 pasos secuenciales: regenera agentes, refresca índices del workspace, actualiza el HANDOVER y genera el bundle web. Ejecutar antes de cerrar Claude Code.',
    scripts: [
      'scripts/workspace/governance/compile-agents-md.ps1',
      'scripts/workspace/governance/refresh-workspace-indexes.ps1',
      'scripts/workspace/governance/update-handover.ps1',
      'scripts/workspace/governance/generate-web-context.ps1',
    ],
  },
];

function renderGovern() {
  const grid = document.getElementById('govern-grid');
  if (!grid) return;

  for (const s of GOVERN_SCRIPTS) {
    const card = document.createElement('div');
    card.className = 'govern-card';
    card.dataset.script = s.id;

    // Header
    const header = document.createElement('div');
    header.className = 'govern-card-header';
    const icon = document.createElement('span');
    icon.className = 'govern-card-icon';
    icon.textContent = s.icon;
    const name = document.createElement('span');
    name.className = 'govern-card-name';
    name.textContent = s.name;
    header.appendChild(icon);
    header.appendChild(name);

    // Descripción
    const desc = document.createElement('p');
    desc.className = 'govern-card-desc';
    desc.textContent = s.desc;

    // Scripts internos
    const scriptsBlock = document.createElement('div');
    scriptsBlock.className = 'govern-card-scripts';
    const scriptsLabel = document.createElement('div');
    scriptsLabel.className = 'govern-card-scripts-label';
    scriptsLabel.textContent = 'Scripts internos';
    scriptsBlock.appendChild(scriptsLabel);
    for (const path of s.scripts) {
      const code = document.createElement('code');
      code.className = 'govern-card-script-path';
      code.textContent = path.split('/').pop(); // solo el nombre del archivo
      code.title = path;                        // path completo en tooltip
      scriptsBlock.appendChild(code);
    }

    // Footer con botón
    const footer = document.createElement('div');
    footer.className = 'govern-card-footer';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn-primary govern-run-btn';
    runBtn.dataset.script = s.id;
    runBtn.textContent = '▶ Ejecutar';
    runBtn.addEventListener('click', () => runScript(s.id, s.scripts));
    footer.appendChild(runBtn);

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(scriptsBlock);
    card.appendChild(footer);
    grid.appendChild(card);
  }

  document.getElementById('btn-clear').addEventListener('click', clearOutput);
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll('.govern-run-btn').forEach(b => b.disabled = disabled);
}

function clearOutput() {
  document.getElementById('output-panel').innerHTML = '';
}

function appendOutput(text, className) {
  const panel = document.getElementById('output-panel');
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  panel.appendChild(span);
  panel.scrollTop = panel.scrollHeight;
}

async function runScript(scriptId, scriptPaths = []) {
  clearOutput();
  appendOutput(`$ ${scriptId}\n`, 'out-cmd');
  for (const p of scriptPaths) {
    appendOutput(`  → ${p}\n`, 'out-path');
  }
  appendOutput('\n');
  setButtonsDisabled(true);

  try {
    const res = await fetch(`${API_BASE}/api/govern/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: scriptId }),
    });
    if (!res.ok) {
      const err = await res.json();
      appendOutput((err.error || 'Error desconocido') + '\n', 'out-error');
      setButtonsDisabled(false);
    }
  } catch {
    appendOutput('Error al contactar el servidor\n', 'out-error');
    setButtonsDisabled(false);
  }
}

// === WebSocket ===
function connectWS() {
  const ws = new WebSocket(`ws://${location.host}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'output') {
      appendOutput(msg.data);
    } else if (msg.type === 'done') {
      if (msg.exitCode === 0) {
        appendOutput('✓ completado\n', 'out-success');
      } else {
        appendOutput(`✗ exitCode: ${msg.exitCode}\n`, 'out-error');
      }
      setButtonsDisabled(false);
    } else if (msg.type === 'error') {
      appendOutput(`✗ ${msg.message}\n`, 'out-error');
      setButtonsDisabled(false);
    }
  };

  ws.onerror  = () => showError(true);
  ws.onclose  = () => setTimeout(connectWS, 3000);
}

// === Update principal (polling 30s) ===
function activeTab() {
  const active = document.querySelector('.tab-btn.active');
  return active?.dataset.tab ?? null;
}

// Actualiza sidebar y footer desde el runtime (current-project.json)
function renderProjectFromRuntime(current) {
  const riskIcon = RISK_ICONS[current.riskLevel ?? 'bajo'] ?? '';
  document.getElementById('project-name').textContent = current.projectId;
  document.getElementById('project-meta').textContent =
    `${current.environment} · ${riskIcon} ${current.riskLevel ?? 'bajo'}`.replace('  ', ' ');
  const fp = document.getElementById('footer-project');
  if (fp) fp.textContent = `${current.projectId} · ${current.environment}`;
}

async function update() {
  try {
    const [status, handover, tunnels, runtime] = await Promise.all([
      get('/api/status'),
      get('/api/handover'),
      get('/api/tunnels'),
      get('/api/runtime/project').catch(() => null),
    ]);

    runtimeData = runtime;

    const project = parseProject(handover.sections);

    // Runtime tiene prioridad sobre handover para activeProjectId y sidebar
    if (runtime?.current?.projectId) {
      activeProjectId = runtime.current.projectId;
      renderProjectFromRuntime(runtime.current);
    } else {
      activeProjectId = project.id !== '—' ? project.id : null;
      renderProject(project);
    }

    renderFreshness(status.freshness);
    renderHost(status.host?.value);
    renderPendientes(status.pendientes.handover);
    updateTunnelDots(tunnels);
    renderCockpit(status, handover.sections, tunnels, runtime);
    renderBriefing(handover.sections);
    showError(false);

    // Refrescar tab si está activo
    if (activeTab() === 'tuneles')   loadTunnels();
    if (activeTab() === 'proyectos') loadProjects();
    if (activeTab() === 'opsmap')    loadOpsMap();
    if (activeTab() === 'apis')      loadApis();
  } catch (err) {
    console.error('[VCC] update error:', err.message);
    showError(true);
  }
}

function initOpsMap() {
  document.getElementById('btn-opsmap-refresh')?.addEventListener('click', () => loadOpsMap());
}

// === M15 — APIs VCC ===
let apisData = null;

function apiRiskLabel(risk) {
  return ({ bajo: 'BAJO', moderado: 'MOD', alto: 'ALTO' })[risk] ?? String(risk ?? '—').toUpperCase();
}

function renderApis(data) {
  const container = document.getElementById('apis-container');
  if (!container) return;

  const endpoints = data.endpoints ?? [];
  const byModule = new Map();
  for (const api of endpoints) {
    if (!byModule.has(api.module)) byModule.set(api.module, []);
    byModule.get(api.module).push(api);
  }

  const updated = data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('es-AR') : '—';
  const subtitle = document.getElementById('apis-subtitle');
  if (subtitle) subtitle.textContent = `${endpoints.length} endpoints · actualizado ${updated}`;

  container.innerHTML = `
    <div class="apis-hero">
      <div>
        <div class="apis-kicker">API SURFACE</div>
        <h2>Backend VCC local</h2>
        <p>Inventario operativo de rutas internas, propósito, riesgo y criterio de verificación. Las rutas de escritura o ejecución no se prueban automáticamente.</p>
      </div>
      <div class="apis-summary">
        <div><span>${data.summary?.total ?? endpoints.length}</span><small>total</small></div>
        <div><span>${data.summary?.safeCheck ?? 0}</span><small>safe check</small></div>
        <div><span>${data.summary?.writeOrExec ?? 0}</span><small>write/exec</small></div>
        <div><span>${data.summary?.highRisk ?? 0}</span><small>alto riesgo</small></div>
      </div>
    </div>
    <div class="apis-groups" id="apis-groups"></div>
  `;

  const groupsEl = document.getElementById('apis-groups');
  for (const [moduleName, apis] of [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
    const section = document.createElement('section');
    section.className = 'apis-group';
    const safeCount = apis.filter(a => a.safeCheck).length;
    section.innerHTML = `
      <div class="apis-group-header">
        <div>
          <h3>${escHtml(moduleName)}</h3>
          <span>${apis.length} endpoint${apis.length !== 1 ? 's' : ''} · ${safeCount} safe check</span>
        </div>
      </div>
      <div class="apis-list"></div>
    `;

    const list = section.querySelector('.apis-list');
    for (const api of apis) {
      const row = document.createElement('article');
      row.className = `api-row risk-${api.risk}`;
      row.innerHTML = `
        <div class="api-main">
          <div class="api-route">
            <span class="api-method method-${api.method.toLowerCase()}">${escHtml(api.method)}</span>
            <code>${escHtml(api.path)}</code>
          </div>
          <p>${escHtml(api.purpose)}</p>
        </div>
        <div class="api-meta">
          <span class="api-risk risk-${api.risk}">${escHtml(apiRiskLabel(api.risk))}</span>
          <span class="api-status ${api.safeCheck ? 'safe' : 'manual'}">${api.safeCheck ? 'health-safe' : 'manual'}</span>
        </div>
      `;
      list.appendChild(row);
    }
    groupsEl.appendChild(section);
  }
}

async function loadApis() {
  const container = document.getElementById('apis-container');
  if (!container) return;
  container.innerHTML = '<div class="apis-loading">Verificando catálogo de APIs...</div>';
  try {
    apisData = await get('/api/apis');
    renderApis(apisData);
  } catch (err) {
    container.innerHTML = `<div class="apis-loading error">No se pudo cargar APIs VCC: ${escHtml(err.message)}</div>`;
  }
}

function initApis() {
  document.getElementById('btn-apis-refresh')?.addEventListener('click', () => loadApis());
}

// === M9b — MCPs ===
const HIDDEN_MCPS_KEY = 'vcc-hidden-mcps';
let mcpGroupBy = 'tipo';
let mcpAllData = { mcps: [], sshServers: [] };

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
    `<div class="infra-ip">${escHtml(cmdShort)}</div>` +
    `<div class="infra-os">${escHtml(argsFirst)}</div>` +
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

async function loadMcp() {
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
    `<div id="mcp-form-container"></div>` +
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
    const fc = document.getElementById('mcp-form-container');
    showMcpForm(null, fc, () => { fc.innerHTML = ''; });
  });

  container.querySelectorAll('[data-edit-mcp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.editMcp;
      const mcp  = mcpAllData.mcps.find(m => m.name === name);
      if (!mcp) return;
      const fc = document.getElementById('mcp-form-container');
      showMcpForm(mcp, fc, () => { fc.innerHTML = ''; });
    });
  });

  container.querySelectorAll('[data-del-mcp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.delMcp;
      confirmDialog(
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
      confirmDialog(
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
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay infra-edit-modal';
  const box = document.createElement('div');
  box.className = 'modal-box infra-edit-modal-box';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  showMcpForm(mcp, box, close);
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
        await apiFetch(`/api/mcp/${encodeURIComponent(name)}`, { method: 'PUT', body: { command, args, env } });
      } else {
        await apiFetch('/api/mcp', { method: 'POST', body: { name, command, args, env, enabled } });
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

function initMcp() {
  document.getElementById('btn-mcp-refresh')?.addEventListener('click', () => loadMcp());

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
      renderMcpView();
    });
  });
}

// === M10 — SSL ===
const SSL_STATUS_LABEL = { ok: 'OK', warn: 'WARN', crit: 'CRÍTICO', expired: 'VENCIDO', error: 'ERROR' };
const SSL_STATUS_ORDER = { expired: 0, crit: 1, warn: 2, ok: 3, error: 4 };

let sslView = 'expiry';
let sslData  = null;

function updateSSLBadge(summary) {
  const badge = document.getElementById('ssl-header-badge');
  const count = (summary.expired ?? 0) + (summary.crit ?? 0);
  if (count === 0) { badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  badge.classList.toggle('warn', (summary.expired ?? 0) === 0);
  badge.textContent = `SSL ⚠ ${count}`;
  badge.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.querySelector('[data-tab="ssl"]')?.classList.add('active');
    document.getElementById('tab-ssl').classList.remove('hidden');
  };
}

function sslDaysText(row) {
  if (row.daysLeft === null) return '—';
  return row.daysLeft <= 0 ? `${Math.abs(row.daysLeft)}d vencido` : `${row.daysLeft}d`;
}

function sslExpiresText(row) {
  if (row.expiresAt) return new Date(row.expiresAt).toLocaleDateString('es-AR');
  return row.error ?? '—';
}

function buildSSLCard(row) {
  const card = document.createElement('div');
  card.className = `ssl-card ssl-status-${row.status}`;
  card.innerHTML =
    `<div class="ssl-card-header">` +
      `<span class="ssl-dot ${row.status}"></span>` +
      `<span class="ssl-card-domain">${escHtml(row.domain)}</span>` +
    `</div>` +
    `<div class="ssl-card-label">${escHtml(row.label)}</div>` +
    `<div class="ssl-card-days ssl-status-${row.status}">${escHtml(sslDaysText(row))}</div>` +
    `<div class="ssl-card-date">${escHtml(sslExpiresText(row))}</div>`;
  return card;
}

// Extrae el dominio raíz (ej: "one.fincos.com.ar" → "fincos.com.ar")
function rootDomain(domain) {
  const parts = domain.split('.');
  const twoLevel = ['com', 'seg', 'org', 'net', 'edu', 'gob', 'int', 'mil'];
  if (parts.length >= 3 && parts.at(-1) === 'ar' && twoLevel.includes(parts.at(-2))) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

// Peor estado de un grupo
function worstStatus(domains) {
  return domains.reduce((worst, d) =>
    SSL_STATUS_ORDER[d.status] < SSL_STATUS_ORDER[worst] ? d.status : worst,
    'ok'
  );
}

function renderSSLByExpiry(domains) {
  const sorted = [...domains].sort((a, b) => {
    const so = SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status];
    if (so !== 0) return so;
    const da = a.daysLeft ?? 9999;
    const db = b.daysLeft ?? 9999;
    return da - db;
  });
  const grid = document.createElement('div');
  grid.className = 'ssl-grid';
  sorted.forEach(row => grid.appendChild(buildSSLCard(row)));
  return grid;
}

function renderSSLByDomain(domains) {
  const groups = {};
  for (const d of domains) {
    const root = rootDomain(d.domain);
    if (!groups[root]) groups[root] = [];
    groups[root].push(d);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ssl-groups';

  for (const [root, items] of Object.entries(groups).sort()) {
    const worst    = worstStatus(items);
    const isSingle = items.length === 1 && items[0].domain === root;

    const grid = document.createElement('div');
    grid.className = 'ssl-grid';
    [...items].sort((a, b) => SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status])
              .forEach(row => grid.appendChild(buildSSLCard(row)));

    if (isSingle) {
      wrapper.appendChild(grid);
    } else {
      // Auto-expandir dominios con problemas críticos
      const autoOpen = worst === 'expired' || worst === 'crit';
      wrapper.appendChild(buildAccordion(root, items.length, grid, {
        startOpen:  autoOpen,
        storageKey: `ssl-domain-${root}`,
      }));
    }
  }
  return wrapper;
}

function renderSSLByEmpresa(domains) {
  const map = new Map();
  for (const row of domains) {
    const key = row.empresa || 'Sin empresa';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ssl-groups';

  for (const [empresa, items] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const worst = worstStatus(items);
    const autoOpen = worst === 'expired' || worst === 'crit';

    const grid = document.createElement('div');
    grid.className = 'ssl-grid';
    [...items].sort((a, b) => SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status])
              .forEach(row => grid.appendChild(buildSSLCard(row)));

    wrapper.appendChild(buildAccordion(empresa, items.length, grid, {
      startOpen:  autoOpen,
      storageKey: `ssl-empresa-${empresa}`,
    }));
  }
  return wrapper;
}

// Vista listado compacto (tabla)
function renderSSLAsList(domains) {
  const sorted = [...domains].sort((a, b) => {
    const so = SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
  });

  const table = document.createElement('table');
  table.className = 'ssl-table data-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>DOMINIO</th><th>EMPRESA</th><th>ESTADO</th><th>DÍAS</th><th>VENCE</th>` +
    `</tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const row of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><code>${escHtml(row.domain)}</code></td>` +
      `<td style="color:var(--text-faint)">${escHtml(row.empresa || '—')}</td>` +
      `<td><span class="ssl-dot ${row.status}"></span> <span class="ssl-status-${row.status}">${SSL_STATUS_LABEL[row.status] ?? row.status}</span></td>` +
      `<td class="ssl-status-${row.status}">${escHtml(sslDaysText(row))}</td>` +
      `<td style="font-family:var(--font-mono);font-size:0.7rem">${escHtml(sslExpiresText(row))}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderSSLMonitor(data) {
  const container = document.getElementById('ssl-container');
  if (data.checkedAt) {
    const d = new Date(data.checkedAt);
    document.getElementById('ssl-checked-at').textContent =
      `verificado ${d.toLocaleTimeString('es-AR')}${data.cached ? ' (caché)' : ''}`;
  }
  updateSSLBadge(data.summary ?? {});
  container.innerHTML = '';
  let rendered;
  if (sslView === 'domain')   rendered = renderSSLByDomain(data.domains);
  else if (sslView === 'empresa') rendered = renderSSLByEmpresa(data.domains);
  else if (sslView === 'list')    rendered = renderSSLAsList(data.domains);
  else                            rendered = renderSSLByExpiry(data.domains);
  container.appendChild(rendered);
}

async function loadSSL(force = false) {
  const btn = document.getElementById('btn-ssl-refresh');
  btn.disabled = true;
  document.getElementById('ssl-container').innerHTML =
    '<div class="ssl-loading">Verificando certificados...</div>';
  try {
    sslData = await get(`/api/ssl${force ? '?force=1' : ''}`);
    renderSSLMonitor(sslData);
  } catch {
    document.getElementById('ssl-container').innerHTML =
      '<div class="ssl-loading" style="color:var(--red)">Error al verificar certificados</div>';
  } finally {
    btn.disabled = false;
  }
}

// === M6 — Túneles SSH ===
let tunnelsBusy    = {};
let tunnelManageMode = false;
let tunnelAdhocMode  = false;

// ── Modal de confirmación ─────────────────────────────────────────────────────

function confirmDialog(title, body, danger = false, expectedText = null) {
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

async function loadTunnels() {
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
    const ok = await confirmDialog(
      '⚠ Túnel PRODUCCIÓN',
      `Vas a abrir el túnel al puerto ${port}. Esto da acceso directo a la base de datos de producción. ¿Confirmás?`,
      true
    );
    if (!ok) return;
  }

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
    if (opError) showTunnelBanner(
      isActive ? 'No se pudo cerrar el túnel' : 'No se pudo abrir el túnel — ¿VPN activa?',
      true
    );
  } catch {
    showTunnelBanner('Error al actualizar estado de túneles', true);
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

// === M10 — ABM Dominios ===
let sslManageMode = false;

function renderManageTable(domains) {
  const c = document.getElementById('ssl-manage-container');
  c.innerHTML = '';

  // Formulario agregar
  const addRow = document.createElement('div');
  addRow.className = 'ssl-add-row';
  addRow.innerHTML =
    `<input class="ssl-input" id="ssl-new-domain" placeholder="dominio.com.ar" />` +
    `<input class="ssl-input" id="ssl-new-label"  placeholder="Etiqueta" />` +
    `<button class="btn btn-sm btn-primary btn-ssl-action add" id="btn-ssl-add">+ Agregar</button>`;
  c.appendChild(addRow);

  document.getElementById('btn-ssl-add').addEventListener('click', async () => {
    const domain = document.getElementById('ssl-new-domain').value.trim();
    const label  = document.getElementById('ssl-new-label').value.trim();
    if (!domain) return;
    await saveConfig([...domains, { domain, label: label || domain }]);
  });

  // Tabla editable
  const table = document.createElement('table');
  table.className = 'ssl-table data-table';
  table.innerHTML = `<thead><tr><th>DOMINIO</th><th>ETIQUETA</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  domains.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    const tdDomain = document.createElement('td');
    const tdLabel  = document.createElement('td');
    const tdActs   = document.createElement('td');
    tdActs.style.whiteSpace = 'nowrap';

    function viewMode() {
      tdDomain.innerHTML = `<span class="ssl-domain">${escHtml(entry.domain)}</span>`;
      tdLabel.innerHTML  = `<span class="ssl-label">${escHtml(entry.label)}</span>`;
      tdActs.innerHTML   = '';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm btn-ghost btn-ssl-action';
      btnEdit.textContent = 'Editar';
      btnEdit.addEventListener('click', editMode);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-sm btn-danger btn-ssl-action del';
      btnDel.textContent = 'Eliminar';
      btnDel.addEventListener('click', async () => {
        const updated = domains.filter((_, i) => i !== idx);
        await saveConfig(updated);
      });

      tdActs.appendChild(btnEdit);
      tdActs.appendChild(btnDel);
    }

    function editMode() {
      tdDomain.innerHTML = `<input class="ssl-input" value="${escHtml(entry.domain)}" id="edit-domain-${idx}" />`;
      tdLabel.innerHTML  = `<input class="ssl-input" value="${escHtml(entry.label)}"  id="edit-label-${idx}"  />`;
      tdActs.innerHTML   = '';

      const btnSave = document.createElement('button');
      btnSave.className = 'btn btn-sm btn-success btn-ssl-action add';
      btnSave.textContent = 'Guardar';
      btnSave.addEventListener('click', async () => {
        const newDomain = document.getElementById(`edit-domain-${idx}`).value.trim();
        const newLabel  = document.getElementById(`edit-label-${idx}`).value.trim();
        if (!newDomain) return;
        const updated = domains.map((d, i) =>
          i === idx ? { domain: newDomain, label: newLabel || newDomain } : d
        );
        await saveConfig(updated);
      });

      const btnCancel = document.createElement('button');
      btnCancel.className = 'btn btn-sm btn-ghost btn-ssl-action';
      btnCancel.textContent = 'Cancelar';
      btnCancel.addEventListener('click', viewMode);

      tdActs.appendChild(btnSave);
      tdActs.appendChild(btnCancel);
    }

    viewMode();
    tr.appendChild(tdDomain);
    tr.appendChild(tdLabel);
    tr.appendChild(tdActs);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  c.appendChild(table);
}

async function saveConfig(domains) {
  try {
    const res = await fetch(`${API_BASE}/api/ssl/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    renderManageTable(data.domains);
  } catch (e) {
    alert(`Error al guardar: ${e.message}`);
  }
}

async function loadManage() {
  const c = document.getElementById('ssl-manage-container');
  c.innerHTML = '<div class="ssl-loading">Cargando...</div>';
  try {
    const data = await get('/api/ssl/config');
    renderManageTable(data.domains);
  } catch {
    c.innerHTML = '<div class="ssl-loading" style="color:var(--red)">Error al cargar configuración</div>';
  }
}

function toggleManageMode() {
  sslManageMode = !sslManageMode;
  const monitor = document.getElementById('ssl-container');
  const manage  = document.getElementById('ssl-manage-container');
  const btnM    = document.getElementById('btn-ssl-manage');
  const btnR    = document.getElementById('btn-ssl-refresh');

  monitor.classList.toggle('hidden', sslManageMode);
  manage.classList.toggle('hidden', !sslManageMode);
  btnM.textContent = sslManageMode ? '← Monitor' : '⚙ Gestionar';
  btnR.classList.toggle('hidden', sslManageMode);

  if (sslManageMode) loadManage();
}

function initSSL() {
  document.getElementById('btn-ssl-refresh').addEventListener('click', () => loadSSL(true));
  document.getElementById('btn-ssl-manage').addEventListener('click', toggleManageMode);

  document.querySelectorAll('.btn-ssl-view').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === sslView) return;
      sslView = btn.dataset.view;
      document.querySelectorAll('.btn-ssl-view').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (sslData) renderSSLMonitor(sslData);
    });
  });
}

// === JSON Editor Modal ===
function openJsonModal({ title, value, onSave }) {
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

function initJsonModal() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('json-modal').classList.add('hidden');
  });
}

function initTunnels() {
  document.getElementById('btn-tunnel-manage').addEventListener('click', () => toggleManageTunnels());
  document.getElementById('btn-tunnel-adhoc').addEventListener('click',  () => toggleAdhocForm());

  document.getElementById('btn-tunnel-edit-config').addEventListener('click', async () => {
    const data = await get('/api/tunnels/config-raw').catch(() => null)
               ?? await get('/api/tunnels/config').catch(() => []);
    openJsonModal({
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
let infraGroupBy         = 'empresa';
let infraFilterMonitored = true;
let infraAllServers      = [];
const infraMetricsCache  = {}; // serverId → último resultado

function getHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_SERVERS_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveHidden(set) {
  localStorage.setItem(HIDDEN_SERVERS_KEY, JSON.stringify([...set]));
}

function buildServerCard(srv) {
  const card = document.createElement('div');
  card.className = `infra-card risk-${srv.riesgo}`;
  card.dataset.server = srv.id;

  const riskColor = RISK_COLORS[srv.riesgo] ?? '#888';
  const riskLabel = RISK_LABELS[srv.riesgo] ?? srv.riesgo.toUpperCase();
  const hasDetails = srv.apps.length > 0 || srv.dominios.length > 0;

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<span class="infra-dot" style="background:${riskColor}"></span>` +
      `<span class="infra-id">${escHtml(srv.id)}</span>` +
      `<span class="infra-risk-badge" style="color:${riskColor};border-color:${riskColor}">${riskLabel}</span>` +
      (srv.monitoreado ? `<span class="infra-conn-dot pending" data-conn="${escHtml(srv.id)}" title="Esperando métricas…"></span>` : '') +
      `<button class="infra-edit-btn" title="Editar servidor" data-edit-id="${escHtml(srv.id)}">✎</button>` +
      `<button class="infra-hide-btn" title="Ocultar de la vista" data-hide-id="${escHtml(srv.id)}">×</button>` +
    `</div>` +
    `<div class="infra-ip">${escHtml(srv.ip)}</div>` +
    `<div class="infra-os">${escHtml(srv.os)}</div>` +
    `<div class="infra-empresa">${escHtml(srv.empresa)}</div>` +
    `<div class="infra-rol">${escHtml(srv.rol)}</div>` +
    (srv.sshUser ? `<div class="infra-ssh">${escHtml(srv.sshUser)}${srv.mysqlTunel ? ` · MySQL :${srv.mysqlTunel.split(' ')[1]}` : ''}</div>` : '') +
    (srv.puerto  ? `<div class="infra-ssh">Puerto ${escHtml(srv.puerto)}</div>` : '') +
    (srv.notas   ? `<div class="infra-notas">${escHtml(srv.notas)}</div>` : '') +
    (srv.monitoreado ? `<div class="infra-metrics"><div class="metric-loading">actualizando…</div></div>` : '') +
    (hasDetails  ?
      `<div class="infra-toggle" data-open="false">` +
        `<span class="infra-arrow">▶</span>` +
        `<span class="infra-toggle-label">${buildToggleLabel(srv)}</span>` +
      `</div>` +
      `<div class="infra-details hidden">` +
        buildDetails(srv) +
      `</div>`
    : '');

  if (hasDetails) {
    const toggle  = card.querySelector('.infra-toggle');
    const details = card.querySelector('.infra-details');
    toggle.addEventListener('click', () => {
      const open = toggle.dataset.open === 'true';
      toggle.dataset.open = String(!open);
      toggle.querySelector('.infra-arrow').textContent = open ? '▶' : '▼';
      details.classList.toggle('hidden', open);
    });
  }

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

async function loadInventory() {
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
      confirmAction(
        `¿Eliminar ${id}?`,
        `Esta acción quitará el servidor del inventario VCC. No afecta el SERVER_INVENTORY.md.`,
        async () => {
          try {
            await apiFetch(`/api/inventory/${encodeURIComponent(id)}`, { method: 'DELETE' });
            const { servers } = await get('/api/inventory');
            infraAllServers = servers;
            renderInventory(servers);
            renderInventoryManage();
          } catch (err) {
            showManageBanner('infra-manage-banner', err.message, true);
          }
        }
      );
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
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
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

function formField(label, id, value, placeholder, readonly = false) {
  return `<div class="form-field">` +
    `<label class="form-label" for="${id}">${label}</label>` +
    `<input class="form-input" id="${id}" value="${escHtml(value)}" placeholder="${escHtml(placeholder)}"${readonly ? ' readonly' : ''}>` +
    `</div>`;
}

function formSelect(label, id, selected, options) {
  const opts = options.map(([v, l]) =>
    `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`
  ).join('');
  return `<div class="form-field">` +
    `<label class="form-label" for="${id}">${label}</label>` +
    `<select class="form-input" id="${id}">${opts}</select>` +
    `</div>`;
}

function showManageBanner(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `manage-banner${isError ? ' manage-banner-error' : ''}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

async function apiFetch(url, { method, body } = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function initInventory() {
  // Group-by buttons
  document.querySelectorAll('.btn-infra-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-infra-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      infraGroupBy = btn.dataset.group;
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
function metricBar(label, pct) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = clamped >= 85 ? 'var(--red)' : clamped >= 70 ? 'var(--amber)' : 'var(--green)';
  return (
    `<div class="metric-row">` +
      `<span class="metric-label">${label}</span>` +
      `<div class="metric-bar-track">` +
        `<div class="metric-bar-fill" style="width:${clamped}%;background:${color}"></div>` +
      `</div>` +
      `<span class="metric-value" style="color:${color}">${clamped}%</span>` +
    `</div>`
  );
}

function applyMetrics(m) {
  infraMetricsCache[m.serverId] = m;

  const cls = m.status === 'ok' ? 'ok' : m.status === 'unreachable' ? 'down' : 'warn';
  const tip = m.status === 'ok' ? 'Conectado'
    : m.status === 'unreachable' ? `Sin acceso${m.error ? ': ' + m.error : ''}`
    : 'Error de datos';
  const metricsHtml = m.status !== 'ok'
    ? `<div class="metric-unreachable">— sin acceso</div>`
    : metricBar('CPU', m.cpu.pct) + metricBar('RAM', m.ram.pct) + metricBar('DSK', m.disk.pct);

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
  }

  // Vista listado
  const dot2 = document.getElementById(`conn-dot-${m.serverId}`);
  if (dot2) { dot2.className = `infra-conn-dot ${cls}`; dot2.title = tip; }
  const metricsEl2 = document.getElementById(`metrics-${m.serverId}`);
  if (metricsEl2) metricsEl2.innerHTML = metricsHtml;
}

function setMetricsLoadingState() {
  document.querySelectorAll('.infra-conn-dot').forEach(dot => {
    dot.className = 'infra-conn-dot pending';
    dot.title = 'Actualizando…';
  });
  document.querySelectorAll('.infra-metrics').forEach(el => {
    el.innerHTML = '<div class="metric-loading">actualizando…</div>';
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

async function loadMetrics(force = false) {
  const btn = document.getElementById('btn-infra-metrics-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '↻ …'; }

  setMetricsLoadingState();

  try {
    const { metrics } = await get(`/api/metrics${force ? '?force=1' : ''}`);
    for (const m of metrics) applyMetrics(m);
  } catch (err) {
    setMetricsFetchError(err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Métricas'; }
  }
}

const METRICS_INTERVAL_MS = 60_000;

// === Init ===
async function init() {
  initTheme();
  initTabs();
  initProjects();
  renderGovern();
  initSSL();
  initTunnels();
  initInventory();
  initOpsMap();
  initApis();
  initMcp();
  initJsonModal();
  connectWS();
  tickFooterClock();
  setInterval(tickFooterClock, 10_000);
  await update();
  await loadProjects();
  await Promise.all([loadSSL(), loadTunnels(), loadInventory()]);
  // Métricas después del inventario (cards deben existir)
  loadMetrics();
  setInterval(loadMetrics, METRICS_INTERVAL_MS);
  setInterval(update, POLL_MS);
}

init();
