import { API_BASE } from '../core/constants.js';
import { buildAccordion, escHtml } from '../core/dom.js';

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

let activeProjectId = null;
let runtimeData = null;
let projectsGroupBy = 'client';
let registryData = null;
let registryHash = null;
let projectManageMode = false;
let projectNewMode = false;
let projectsBannerTimer = null;
let refreshApp = null;
let confirmDialogRef = null;

export function syncProjectsContext({ activeProjectId: nextActiveProjectId, runtimeData: nextRuntimeData } = {}) {
  if (nextActiveProjectId !== undefined) activeProjectId = nextActiveProjectId;
  if (nextRuntimeData !== undefined) runtimeData = nextRuntimeData;
}

export async function loadProjects() {
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

export async function setActiveProject(projectId, envName, btn) {
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
    if (refreshApp) await refreshApp();
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
      const confirmed = await confirmDialogRef(
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
    const confirmed = await confirmDialogRef(
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

export function initProjects({ onUpdate, confirmDialog } = {}) {
  refreshApp = onUpdate ?? null;
  confirmDialogRef = confirmDialog ?? null;
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
