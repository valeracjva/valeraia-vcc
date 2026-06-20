// === Partículas cursor ===
const canvas = document.getElementById('particles');
const ctx    = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

window.addEventListener('mousemove', (e) => {
  for (let i = 0; i < 2; i++) {
    particles.push({
      x: e.clientX, y: e.clientY,
      vx: (Math.random() - 0.5) * 3,
      vy: -(Math.random() * 2 + 1.5),
      size: Math.random() * 2 + 2,
      life: 60, maxLife: 60,
    });
  }
});

function renderParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy -= 0.08; p.size *= 0.97;
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.shadowBlur = 8; ctx.shadowColor = '#00E676';
    ctx.fillStyle = '#00E676'; ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(p.size, 0.5), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    p.life--;
  }
  requestAnimationFrame(renderParticles);
}
requestAnimationFrame(renderParticles);

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

function renderProject(project) {
  const icon = RISK_ICONS[project.risk] ?? '';
  document.getElementById('project-name').textContent =
    project.id !== '—' ? project.id : project.name;
  document.getElementById('project-meta').textContent =
    `${project.env} · ${icon} ${project.risk}`.replace('  ', ' ');
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
      if (btn.dataset.tab === 'tuneles') loadTunnels();
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

let activeProjectId = null;
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

function renderProjects(projects) {
  const container = document.getElementById('projects-container');
  const groups = {};
  for (const p of projects) {
    const c = p.client || 'all';
    if (!groups[c]) groups[c] = [];
    groups[c].push(p);
  }

  container.innerHTML = '';
  const orderedClients = [
    ...CLIENT_ORDER,
    ...Object.keys(groups).filter(key => !CLIENT_ORDER.includes(key)),
  ];
  for (const clientKey of orderedClients) {
    if (!groups[clientKey]) continue;
    container.appendChild(renderClientGroup(clientKey, groups[clientKey]));
  }

  // auto-expand el grupo del proyecto activo
  if (activeProjectId) {
    const activeCard = container.querySelector(`[data-project-id="${activeProjectId}"]`);
    if (activeCard) {
      const projectsEl = activeCard.closest('.client-projects');
      if (projectsEl) {
        projectsEl.classList.remove('hidden');
        const toggle = projectsEl.closest('.client-group')?.querySelector('.toggle-arrow');
        if (toggle) toggle.textContent = '▼';
      }
    }
  }
}

function renderClientGroup(clientKey, projects) {
  const group = document.createElement('div');
  group.className = 'client-group';

  const header = document.createElement('div');
  header.className = 'client-header';

  const arrow = document.createElement('span');
  arrow.className = 'toggle-arrow';
  arrow.textContent = '▶';

  const label = document.createTextNode(` ${CLIENT_LABELS[clientKey] || clientKey} `);

  const count = document.createElement('span');
  count.className = 'client-count';
  count.textContent = `(${projects.length})`;

  header.appendChild(arrow);
  header.appendChild(label);
  header.appendChild(count);

  const projectsEl = document.createElement('div');
  projectsEl.className = 'client-projects hidden';

  header.addEventListener('click', () => {
    const open = !projectsEl.classList.contains('hidden');
    projectsEl.classList.toggle('hidden', open);
    header.querySelector('.toggle-arrow').textContent = open ? '▶' : '▼';
  });

  for (const p of projects) projectsEl.appendChild(renderProjectCard(p));

  group.appendChild(header);
  group.appendChild(projectsEl);
  return group;
}

function renderProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.projectId = project.id;

  const header = document.createElement('div');
  header.className = 'project-card-header';

  const nameEl = document.createElement('span');
  nameEl.className = 'project-card-name';
  nameEl.textContent = project.name || project.id;

  const typeEl = document.createElement('span');
  typeEl.className = 'project-type-badge';
  typeEl.textContent = project.type || '';

  header.appendChild(nameEl);
  header.appendChild(typeEl);

  const envList = document.createElement('div');
  envList.className = 'env-list';

  for (const env of (project.environments || [])) {
    envList.appendChild(renderEnvRow(project.id, env));
  }

  card.appendChild(header);
  card.appendChild(envList);
  return card;
}

function renderEnvRow(projectId, env) {
  const row = document.createElement('div');
  row.className = 'env-row';

  const chip = document.createElement('span');
  chip.className = 'env-chip';
  chip.textContent = env.name;

  const riskEl = document.createElement('span');
  riskEl.className = 'env-risk';
  if (env.riskLevel === 'production') {
    riskEl.classList.add('prod');
    riskEl.textContent = '▲▲▲ prod';
  } else if (env.riskLevel === 'critical') {
    riskEl.classList.add('crit');
    riskEl.textContent = '⬛ crítico';
  }

  row.appendChild(chip);
  row.appendChild(riskEl);

  if (env.host && env.remotePath) {
    const btn = document.createElement('button');
    btn.className = 'btn-vscode';
    btn.textContent = '⬡ VS Code';
    btn.addEventListener('click', () => openVSCode(projectId, env.name, btn));
    row.appendChild(btn);
  }

  return row;
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
  cancel.className = 'btn-project-secondary';
  cancel.textContent = 'Cancelar';
  cancel.addEventListener('click', () => { projectNewMode = false; renderProjectManagement(); });
  const save = document.createElement('button');
  save.className = 'btn-project-primary';
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
    cancel.className = 'btn-project-secondary';
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => details.remove());
    actions.appendChild(cancel);
  } else {
    const remove = document.createElement('button');
    remove.className = 'btn-project-danger';
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
  save.className = 'btn-project-primary';
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
  remove.className = 'btn-project-danger';
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
  save.className = 'btn-project-primary';
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
    addEnvironment.className = 'btn-project-secondary';
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

  const updated     = (sections['Metadata'] ?? '').match(/Actualizado:\s*(.+)/)?.[1]?.trim() ?? '—';
  const nextStep    = (sections['Proximo paso seguro'] ?? '').trim();
  const estado      = (sections['Estado actual'] ?? '').trim();
  const bloq        = (sections['Bloqueadores'] ?? '').trim();
  const resumen     = (sections['Resumen para IA entrante'] ?? '').trim();
  const pendientes  = parsePendientesDetail(sections);
  const hasBloq     = bloq.length > 0 && !/^ninguno$/i.test(bloq);

  const pRows = ['P1','P2','P3','P4'].flatMap(p =>
    pendientes[p].map(text =>
      `<li class="brief-p-item brief-${p.toLowerCase()}">` +
      `<span class="brief-p-tag">${p}</span>` +
      `<span class="brief-p-text">${escHtml(text)}</span></li>`
    )
  ).join('');

  panel.innerHTML =
    `<p class="briefing-updated">↻ ${escHtml(updated)}</p>` +
    `<div class="briefing-grid">` +

    `<div class="briefing-card highlight briefing-full">` +
    `<div class="briefing-card-label">▶ PRÓXIMO PASO</div>` +
    `<div class="briefing-card-body">${escHtml(nextStep)}</div>` +
    `</div>` +

    `<div class="briefing-card">` +
    `<div class="briefing-card-label">ESTADO ACTUAL</div>` +
    `<div class="briefing-card-body">${escHtml(estado)}</div>` +
    `</div>` +

    `<div class="briefing-card${hasBloq ? ' warn' : ''}">` +
    `<div class="briefing-card-label">${hasBloq ? '⚠ ' : ''}BLOQUEADORES</div>` +
    `<div class="briefing-card-body${hasBloq ? '' : ' muted'}">${hasBloq ? escHtml(bloq) : 'ninguno'}</div>` +
    `</div>` +

    `<div class="briefing-card briefing-full">` +
    `<div class="briefing-card-label">PENDIENTES ABIERTOS</div>` +
    `<ul class="brief-p-list">${pRows || '<li class="brief-p-item"><span class="brief-p-text" style="color:var(--muted)">sin pendientes</span></li>'}</ul>` +
    `</div>` +

    `<div class="briefing-card briefing-full">` +
    `<div class="briefing-card-label">RESUMEN PARA IA</div>` +
    `<div class="briefing-card-body">${escHtml(resumen)}</div>` +
    `</div>` +

    `</div>`;
}

// === M3 — Gobernanza ===
const GOVERN_SCRIPTS = [
  { id: 'workspace-health', name: 'workspace-health', desc: 'Diagnóstico completo' },
  { id: 'compile-agents',   name: 'compile-agents',   desc: 'Regenerar AGENTS.md'  },
  { id: 'web-context',      name: 'web-context',      desc: 'Generar bundle web AI' },
  { id: 'sync-status',      name: 'sync-status',      desc: 'Estado rclone + OneDrive' },
  { id: 'cierre',           name: 'cierre',            desc: 'Cerrar sesión'         },
];

function renderGovern() {
  const grid = document.getElementById('govern-grid');
  if (!grid) return;
  for (const s of GOVERN_SCRIPTS) {
    const btn = document.createElement('button');
    btn.className = 'govern-btn';
    btn.dataset.script = s.id;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'govern-btn-name';
    nameSpan.textContent = s.name;
    const descSpan = document.createElement('span');
    descSpan.className = 'govern-btn-desc';
    descSpan.textContent = s.desc;
    btn.appendChild(nameSpan);
    btn.appendChild(descSpan);
    btn.addEventListener('click', () => runScript(s.id));
    grid.appendChild(btn);
  }
  document.getElementById('btn-clear').addEventListener('click', clearOutput);
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll('.govern-btn').forEach(b => b.disabled = disabled);
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

async function runScript(scriptId) {
  clearOutput();
  appendOutput(`$ ${scriptId}\n`);
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

async function update() {
  try {
    const [status, handover, tunnels] = await Promise.all([
      get('/api/status'),
      get('/api/handover'),
      get('/api/tunnels'),
    ]);

    const project = parseProject(handover.sections);
    activeProjectId = project.id !== '—' ? project.id : null;

    renderFreshness(status.freshness);
    renderHost(status.host?.value);
    renderPendientes(status.pendientes.handover);
    renderProject(project);
    updateTunnelDots(tunnels);
    renderBriefing(handover.sections);
    showError(false);

    // Refrescar tab túneles si está activo (sincroniza estado con sidebar)
    if (activeTab() === 'tuneles') loadTunnels();
  } catch (err) {
    console.error('[VCC] update error:', err.message);
    showError(true);
  }
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

function buildSSLRow(row) {
  const tr = document.createElement('tr');
  tr.innerHTML =
    `<td><div class="ssl-domain">${escHtml(row.domain)}</div><div class="ssl-label">${escHtml(row.label)}</div></td>` +
    `<td><span class="ssl-dot ${row.status}"></span><span class="ssl-status-${row.status}">${SSL_STATUS_LABEL[row.status] ?? row.status}</span></td>` +
    `<td class="ssl-status-${row.status}">${escHtml(sslDaysText(row))}</td>` +
    `<td style="color:var(--muted);font-size:0.72rem">${escHtml(sslExpiresText(row))}</td>`;
  return tr;
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
    // dentro del mismo estado: menor daysLeft primero (más urgente)
    const da = a.daysLeft ?? 9999;
    const db = b.daysLeft ?? 9999;
    return da - db;
  });

  const table = document.createElement('table');
  table.className = 'ssl-table';
  table.innerHTML = `<thead><tr><th>DOMINIO</th><th>ESTADO</th><th>DÍAS</th><th>VENCE</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  sorted.forEach(row => tbody.appendChild(buildSSLRow(row)));
  table.appendChild(tbody);
  return table;
}

function renderSSLByDomain(domains) {
  // Agrupar por dominio raíz
  const groups = {};
  for (const d of domains) {
    const root = rootDomain(d.domain);
    if (!groups[root]) groups[root] = [];
    groups[root].push(d);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ssl-groups';

  for (const [root, items] of Object.entries(groups).sort()) {
    const worst  = worstStatus(items);
    const isSingle = items.length === 1 && items[0].domain === root;

    const group = document.createElement('div');
    group.className = 'ssl-group';

    // Cabecera del grupo
    const header = document.createElement('div');
    header.className = 'ssl-group-header';
    header.innerHTML =
      `<span class="ssl-group-arrow">▶</span>` +
      `<span class="ssl-dot ${worst}" style="margin:0 6px 0 4px"></span>` +
      `<span class="ssl-group-root">${escHtml(root)}</span>` +
      `<span class="ssl-group-count">(${items.length})</span>`;

    // Contenido colapsable
    const body = document.createElement('div');
    body.className = 'ssl-group-body hidden';

    const table = document.createElement('table');
    table.className = 'ssl-table ssl-table-sub';
    table.innerHTML = `<thead><tr><th>DOMINIO</th><th>ESTADO</th><th>DÍAS</th><th>VENCE</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    // ordenar por estado dentro del grupo
    [...items].sort((a, b) => SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status])
              .forEach(row => tbody.appendChild(buildSSLRow(row)));
    table.appendChild(tbody);
    body.appendChild(table);

    header.addEventListener('click', () => {
      const open = !body.classList.contains('hidden');
      body.classList.toggle('hidden', open);
      header.querySelector('.ssl-group-arrow').textContent = open ? '▶' : '▼';
    });

    // Auto-expandir grupos con problemas
    if (worst === 'expired' || worst === 'crit') {
      body.classList.remove('hidden');
      header.querySelector('.ssl-group-arrow').textContent = '▼';
    }

    group.appendChild(header);
    if (!isSingle) group.appendChild(body);
    else {
      // Un solo dominio que es el root — mostrar directo sin expandir
      header.querySelector('.ssl-group-arrow').textContent = '—';
      header.style.cursor = 'default';
      header.removeEventListener('click', () => {});
      group.appendChild(body);
      body.classList.remove('hidden');
    }

    wrapper.appendChild(group);
  }
  return wrapper;
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
  container.appendChild(
    sslView === 'domain'
      ? renderSSLByDomain(data.domains)
      : renderSSLByExpiry(data.domains)
  );
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
    ok.className = danger ? 'btn-modal-ok danger' : 'btn-modal-ok';
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

  for (const t of tunnels) {
    const card = document.createElement('div');
    card.className = `tunnel-card${t.prod ? ' tunnel-prod' : ''}${t.adhoc ? ' tunnel-adhoc' : ''}`;
    card.dataset.port = t.port;

    const dot = document.createElement('span');
    dot.className   = `tunnel-card-dot ${t.active ? 'active' : 'inactive'}`;
    dot.textContent = t.active ? '●' : '○';

    const info = document.createElement('div');
    info.className = 'tunnel-card-info';
    info.innerHTML =
      `<div class="tunnel-card-name">` +
        escHtml(t.name) +
        (t.prod  ? ' <span class="badge-prod">PROD</span>'   : '') +
        (t.adhoc ? ' <span class="badge-adhoc">ad-hoc</span>' : '') +
      `</div>` +
      `<div class="tunnel-card-desc">${escHtml(t.desc || '')}</div>` +
      `<div class="tunnel-card-meta">:${t.port} → ${escHtml(t.remote)}</div>`;

    const btn = document.createElement('button');
    btn.className   = `btn-tunnel ${t.active ? 'close' : 'open'}`;
    btn.dataset.port = t.port;
    btn.textContent  = t.active ? 'Cerrar' : 'Abrir';
    btn.disabled     = !!tunnelsBusy[t.port];
    if (tunnelsBusy[t.port]) btn.textContent = '...';
    btn.addEventListener('click', () => toggleTunnel(t.port, t.active, t.prod));

    card.appendChild(dot);
    card.appendChild(info);
    card.appendChild(btn);
    c.appendChild(card);
  }
}

function showTunnelError(msg) {
  const c = document.getElementById('tunnels-container');
  c.innerHTML =
    `<div class="tunnel-error-state">` +
    `<span style="color:var(--red)">${escHtml(msg)}</span>` +
    `<button class="btn-ssl-refresh" id="btn-tunnel-retry">↻ Reintentar</button>` +
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
  table.className = 'ssl-manage-table';
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
      `<td><button class="btn-ssl-action del" title="Eliminar">✕</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Fila para agregar
  const addRow = document.createElement('div');
  addRow.className = 'ssl-add-row';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-ssl-action add';
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
      `<td><button class="btn-ssl-action del" title="Eliminar">✕</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  });
  addRow.appendChild(addBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'btn-ssl-action add';
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
  const mc  = document.getElementById('tunnels-manage-container');
  const btn = document.getElementById('btn-tunnel-manage');

  if (tunnelManageMode) {
    // Cerrar adhoc si estaba abierto
    tunnelAdhocMode = false;
    document.getElementById('tunnels-adhoc-container').classList.add('hidden');
    document.getElementById('btn-tunnel-adhoc').textContent = '＋ Ad-hoc';

    const data = await get('/api/tunnels/config').catch(() => []);
    renderManageTunnels(data);
    mc.classList.remove('hidden');
    btn.textContent = '✕ Cerrar';
  } else {
    mc.classList.add('hidden');
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
      `<button class="btn-ssl-action add" id="btn-adhoc-submit">Abrir túnel</button>` +
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
    `<button class="btn-ssl-action add" id="btn-ssl-add">+ Agregar</button>`;
  c.appendChild(addRow);

  document.getElementById('btn-ssl-add').addEventListener('click', async () => {
    const domain = document.getElementById('ssl-new-domain').value.trim();
    const label  = document.getElementById('ssl-new-label').value.trim();
    if (!domain) return;
    await saveConfig([...domains, { domain, label: label || domain }]);
  });

  // Tabla editable
  const table = document.createElement('table');
  table.className = 'ssl-table';
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
      btnEdit.className = 'btn-ssl-action';
      btnEdit.textContent = 'Editar';
      btnEdit.addEventListener('click', editMode);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-ssl-action del';
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
      btnSave.className = 'btn-ssl-action add';
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
      btnCancel.className = 'btn-ssl-action';
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

function initTunnels() {
  document.getElementById('btn-tunnel-manage').addEventListener('click', () => toggleManageTunnels());
  document.getElementById('btn-tunnel-adhoc').addEventListener('click',  () => toggleAdhocForm());
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

function buildServerCard(srv) {
  const card = document.createElement('div');
  card.className = `infra-card risk-${srv.riesgo}`;
  card.dataset.server = srv.id;

  const riskColor = RISK_COLORS[srv.riesgo] ?? '#888';
  const riskLabel = RISK_LABELS[srv.riesgo] ?? srv.riesgo.toUpperCase();

  const hasDetails = srv.apps.length > 0 || srv.dominios.length > 0 || srv.containers;

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<span class="infra-dot" style="background:${riskColor}"></span>` +
      `<span class="infra-id">${escHtml(srv.id)}</span>` +
      `<span class="infra-risk-badge" style="color:${riskColor};border-color:${riskColor}">${riskLabel}</span>` +
    `</div>` +
    `<div class="infra-ip">${escHtml(srv.ip)}</div>` +
    `<div class="infra-os">${escHtml(srv.os)}</div>` +
    `<div class="infra-empresa">${escHtml(srv.empresa)}</div>` +
    `<div class="infra-rol">${escHtml(srv.rol)}</div>` +
    (srv.sshUser ? `<div class="infra-ssh">${escHtml(srv.sshUser)}${srv.mysqlTunel ? ` · MySQL :${srv.mysqlTunel.split(' ')[1]}` : ''}</div>` : '') +
    (srv.puerto  ? `<div class="infra-ssh">Puerto ${escHtml(srv.puerto)}</div>` : '') +
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

  return card;
}

function buildToggleLabel(srv) {
  const parts = [];
  if (srv.apps.length)    parts.push(`${srv.apps.length} app${srv.apps.length > 1 ? 's' : ''}`);
  if (srv.dominios.length) parts.push(`${srv.dominios.length} dominio${srv.dominios.length > 1 ? 's' : ''}`);
  if (srv.containers)      parts.push(`${srv.containers.total} contenedores`);
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
  if (srv.containers) {
    const { total, healthy, unhealthy } = srv.containers;
    const unhealthyColor = unhealthy > 0 ? 'var(--red)' : 'inherit';
    html +=
      `<div class="infra-detail-section"><span class="infra-detail-label">Docker</span>` +
      `<div class="infra-detail-item">${healthy} healthy` +
      (unhealthy > 0 ? ` · <span style="color:${unhealthyColor}">${unhealthy} unhealthy</span>` : '') +
      ` / ${total} total</div></div>`;
  }
  return html;
}

async function loadInventory() {
  const c = document.getElementById('infra-container');
  c.innerHTML = '<div class="infra-loading">Cargando inventario...</div>';
  try {
    const { servers } = await get('/api/inventory');
    c.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'infra-grid';
    grid.id = 'infra-grid';
    for (const srv of servers) grid.appendChild(buildServerCard(srv));
    c.appendChild(grid);
  } catch (err) {
    c.innerHTML = `<div class="infra-loading" style="color:var(--red)">Error al cargar inventario: ${escHtml(err.message)}</div>`;
  }
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
  const card = document.querySelector(`#infra-grid .infra-card[data-server="${escHtml(m.serverId)}"]`);
  if (!card) return;

  let metricsEl = card.querySelector('.infra-metrics');
  if (!metricsEl) {
    metricsEl = document.createElement('div');
    metricsEl.className = 'infra-metrics';
    // Insertar antes del toggle o al final
    const toggle = card.querySelector('.infra-toggle');
    if (toggle) card.insertBefore(metricsEl, toggle);
    else card.appendChild(metricsEl);
  }

  if (m.status !== 'ok') {
    metricsEl.innerHTML = `<div class="metric-unreachable">— sin acceso</div>`;
    return;
  }

  metricsEl.innerHTML =
    metricBar('CPU', m.cpu.pct) +
    metricBar('RAM', m.ram.pct) +
    metricBar('DSK', m.disk.pct);
}

async function loadMetrics() {
  try {
    const { metrics } = await get('/api/metrics');
    for (const m of metrics) applyMetrics(m);
  } catch { /* silencioso — las cards ya están visibles */ }
}

const METRICS_INTERVAL_MS = 60_000;

// === Init ===
async function init() {
  initTabs();
  initProjects();
  renderGovern();
  initSSL();
  initTunnels();
  connectWS();
  await update();
  await loadProjects();
  await Promise.all([loadSSL(), loadTunnels(), loadInventory()]);
  // Métricas después del inventario (cards deben existir)
  loadMetrics();
  setInterval(loadMetrics, METRICS_INTERVAL_MS);
  setInterval(update, POLL_MS);
}

init();
