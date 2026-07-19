import { API_BASE } from '../core/constants.js';
import { buildAccordion, escHtml, formField, formSelect, openEditModal } from '../core/dom.js';
import { loadState, saveState } from '../core/persist.js';

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
const PROJECTS_GROUPBY_KEY = 'vcc-projects-groupby';
let registryData = null;
let registryHash = null;
let projectsBannerTimer = null;
let refreshApp = null;
let confirmDialogRef = null;

export function syncProjectsContext({ activeProjectId: nextActiveProjectId, runtimeData: nextRuntimeData } = {}) {
  if (nextActiveProjectId !== undefined) activeProjectId = nextActiveProjectId;
  if (nextRuntimeData !== undefined) runtimeData = nextRuntimeData;
}

export async function loadProjects() {
  const container = document.getElementById('projects-container');
  container.innerHTML = '<div class="infra-loading">Cargando proyectos...</div>';
  try {
    const res = await fetch(`${API_BASE}/api/registry`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    registryData = await res.json();
    registryHash = res.headers.get('X-Registry-Hash') || res.headers.get('ETag')?.replaceAll('"', '') || null;
    document.getElementById('projects-hash').textContent = registryHash ? registryHash.slice(0, 12) : 'sin hash';
    renderProjects(registryData.projects);
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
    `<th>PROYECTO</th><th>CLIENTE</th><th>TIPO</th><th>ESTADO</th><th>AMBIENTES</th><th>ACCIONES</th>` +
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

    const actionsTd = document.createElement('td');
    actionsTd.appendChild(buildProjectActionButtons(p));
    tr.appendChild(actionsTd);

    tr.addEventListener('click', () => showProjectEditModal(p));

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}

function renderProjects(projects) {
  const container = document.getElementById('projects-container');
  container.innerHTML = '';

  if (!projects.length) {
    container.innerHTML = '<div class="infra-loading">No hay proyectos registrados todavía.</div>';
    return;
  }

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

// Mismas clases que el resto de VCC (btn-manage-edit / btn-manage-del) para Gestionar/Eliminar.
// Archivar no tiene precedente en otro tab — reusa el mismo look ghost que btn-manage-edit.
function buildProjectActionButtons(project) {
  const wrap = document.createElement('div');
  wrap.className = 'project-actions-row';
  wrap.style.position = 'relative';

  // Dropdown trigger (kebab menu)
  const trigger = document.createElement('button');
  trigger.className = 'project-menu-trigger';
  trigger.textContent = '⋮';
  trigger.title = 'Acciones del proyecto';
  trigger.setAttribute('aria-label', 'Menú de acciones del proyecto');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  // Dropdown menu
  const menu = document.createElement('div');
  menu.className = 'project-menu hidden';
  menu.setAttribute('role', 'menu');

  const isArchived = project.status === 'archived';
  const isActive = project.status === 'active';

  // Gestionar (editar)
    const manage = document.createElement('button');
    manage.className = 'project-menu-item';
    manage.setAttribute('role', 'menuitem');
    manage.textContent = 'Gestionar';
    manage.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      showProjectEditModal(project);
    });
    menu.appendChild(manage);

    // Activar/Desactivar
  if (!isArchived) {
    const toggleActive = document.createElement('button');
    toggleActive.className = 'project-menu-item';
    toggleActive.setAttribute('role', 'menuitem');
    toggleActive.textContent = isActive ? 'Desactivar' : 'Activar';
    toggleActive.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nextStatus = isActive ? 'paused' : 'active';
      const confirmed = await confirmDialogRef(
        isActive ? 'Desactivar proyecto' : 'Activar proyecto',
        isActive
          ? `${project.id} pasa a estado "paused" — sin trabajo en curso, no borra nada.`
          : `${project.id} vuelve a estado "active".`,
        false,
      );
      if (!confirmed) { closeMenu(); return; }
      closeMenu();
      await projectWrite(
        'PATCH',
        `/api/projects/${encodeURIComponent(project.id)}`,
        { changes: { status: nextStatus } },
        `Proyecto ${project.id} ${isActive ? 'desactivado' : 'activado'}.`,
      );
    });
    menu.appendChild(toggleActive);
  }

  // Archivar/Desarchivar
  const archive = document.createElement('button');
  archive.className = 'project-menu-item';
  archive.setAttribute('role', 'menuitem');
  archive.textContent = isArchived ? 'Desarchivar' : 'Archivar';
  archive.addEventListener('click', async (e) => {
    e.stopPropagation();
    const nextStatus = isArchived ? 'active' : 'archived';
    const confirmed = await confirmDialogRef(
      isArchived ? 'Desarchivar proyecto' : 'Archivar proyecto',
      isArchived
        ? `${project.id} vuelve a estado "active".`
        : `${project.id} pasa a estado "archived" — no borra nada, es reversible.`,
      false,
    );
    if (!confirmed) { closeMenu(); return; }
    closeMenu();
    await projectWrite(
      'PATCH',
      `/api/projects/${encodeURIComponent(project.id)}`,
      { changes: { status: nextStatus } },
      `Proyecto ${project.id} ${isArchived ? 'desarchivado' : 'archivado'}.`,
    );
  });
  menu.appendChild(archive);

  // Eliminar
  const del = document.createElement('button');
  del.className = 'project-menu-item project-menu-item--danger';
  del.setAttribute('role', 'menuitem');
  del.textContent = 'Eliminar';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = await confirmDialogRef(
      'Eliminar proyecto',
      `Escribí ${project.id} para confirmar la eliminación.`,
      true,
      project.id,
    );
    if (!confirmed) { closeMenu(); return; }
    closeMenu();
    await projectWrite('DELETE', `/api/projects/${encodeURIComponent(project.id)}`, {}, `Proyecto ${project.id} eliminado.`);
  });
  menu.appendChild(del);

  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  // Toggle dropdown
  function toggleMenu(e) {
    e.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden', isOpen);
    trigger.setAttribute('aria-expanded', String(!isOpen));
    trigger.classList.toggle('open', !isOpen);
  }

  function closeMenu() {
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('open');
  }

  trigger.addEventListener('click', toggleMenu);

  // Cerrar al click fuera
  document.addEventListener('click', closeMenu);

  // Cerrar con Escape
  function onKeydown(e) {
    if (e.key === 'Escape') {
      closeMenu();
      trigger.focus();
    }
  }
  document.addEventListener('keydown', onKeydown);

  // Cleanup si se destruye la card (opcional, para memoria)
  wrap._cleanup = () => {
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('keydown', onKeydown);
  };

  return wrap;
}

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
  header.appendChild(buildProjectActionButtons(project));
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

  if (project.notes) {
    const desc = document.createElement('div');
    desc.className = 'infra-os agent-desc project-card-desc';
    desc.title = project.notes;
    desc.textContent = project.notes;
    card.appendChild(desc);
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

async function openSsh(projectId, host, user, btn) {
  btn.disabled = true;
  btn.textContent = '⬡ conectando…';
  try {
    await fetch(`${API_BASE}/api/projects/${projectId}/open-ssh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, user }),
    });
  } catch { /* silencioso — la terminal puede haberse abierto igual */ }
  setTimeout(() => {
    btn.textContent = `⬡ Conectar SSH (${user}@${host})`;
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

function previewProjectId(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Mismo patrón que showInventoryForm (inventory.js): manage-form / formField / manage-form-actions
// con solo Cancelar+Guardar. Archivar/Eliminar viven afuera del modal (tarjeta o fila de
// Listado), igual que btn-manage-del en el resto de VCC — nunca adentro del form de edición.
function showProjectForm(project, container, onClose) {
  const isEdit = project !== null;
  const fc = container;

  fc.innerHTML =
    `<div class="manage-form">` +
      `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(project.id)}` : 'Nuevo proyecto'}</div>` +
      `<div class="manage-form-grid">` +
        formField('ID', 'proj-f-id', isEdit ? project.id : '', 'automático desde el nombre', true) +
        formField('Nombre', 'proj-f-name', project?.name || '', 'ej: Fincos Web') +
        formField('Tipo', 'proj-f-type', project?.type || '', 'ej: laravel') +
        formField('Categoría', 'proj-f-category', project?.category || '', 'ej: desarrollo') +
        formField('Estado', 'proj-f-status', project?.status || 'active', 'active / paused / archived / ...') +
        formField('Cliente', 'proj-f-client', project?.client || '', 'ej: digna-fincos') +
      `</div>` +
      `<label class="form-label" for="proj-f-notes">Notas</label>` +
      `<textarea class="form-textarea" id="proj-f-notes" rows="3" placeholder="Notas operativas">${escHtml(project?.notes || '')}</textarea>` +
      `<div class="manage-banner hidden" id="proj-form-error" style="margin-top:8px"></div>` +
      `<div class="manage-form-actions">` +
        `<button class="btn btn-ghost btn-modal-cancel" id="btn-proj-form-cancel">Cancelar</button>` +
        `<button class="btn btn-primary btn-modal-ok" id="btn-proj-form-save">${isEdit ? 'Guardar cambios' : 'Crear proyecto'}</button>` +
      `</div>` +
    `</div>`;

  if (!isEdit) {
    const idInput = document.getElementById('proj-f-id');
    const nameInput = document.getElementById('proj-f-name');
    nameInput.addEventListener('input', () => { idInput.value = previewProjectId(nameInput.value); });
  } else {
    fc.querySelector('#proj-form-error').before(buildEnvironmentsSection(project, onClose));
  }

  fc.querySelector('#btn-proj-form-cancel').addEventListener('click', onClose);

  const showFormErr = (msg) => {
    const el = document.getElementById('proj-form-error');
    el.textContent = msg;
    el.className = 'manage-banner manage-banner-error';
  };

  fc.querySelector('#btn-proj-form-save').addEventListener('click', async () => {
    const values = {
      name:     document.getElementById('proj-f-name').value.trim(),
      type:     document.getElementById('proj-f-type').value.trim(),
      category: document.getElementById('proj-f-category').value.trim(),
      status:   document.getElementById('proj-f-status').value.trim(),
      client:   document.getElementById('proj-f-client').value.trim(),
      notes:    document.getElementById('proj-f-notes').value.trim(),
    };
    if (!values.name || !values.type || !values.category || !values.status || !values.client) {
      showFormErr('Completá todos los campos obligatorios (Nombre, Tipo, Categoría, Estado, Cliente).');
      return;
    }

    if (!isEdit) {
      const payload = { ...values };
      if (!payload.notes) delete payload.notes;
      const result = await projectWrite('POST', '/api/projects', { project: { ...payload, environments: [] } }, `Proyecto ${values.name} creado.`);
      if (result) onClose();
      return;
    }

    const changes = {};
    for (const field of PROJECT_FIELDS) {
      if (values[field] !== String(project[field] ?? '')) changes[field] = values[field];
    }
    const result = await projectWrite(
      'PATCH',
      `/api/projects/${encodeURIComponent(project.id)}`,
      { changes },
      `Proyecto ${project.id} actualizado.`,
    );
    if (result) onClose();
  });
}

function buildEnvironmentsSection(project, closeParent) {
  const section = document.createElement('div');

  if (project.access && project.environments === undefined) {
    // Proyectos de infra sin "environments" (ej. fortigate-nre) — solo accesos de referencia.
    const title = document.createElement('label');
    title.className = 'form-label';
    title.textContent = 'Accesos';
    section.appendChild(title);
    for (const acc of project.access) {
      const row = document.createElement('div');
      row.className = 'env-block-field';
      if (acc.method === 'web') {
        row.innerHTML =
          `<span class="env-field-label">web</span>` +
          `<a class="env-field-value mono" href="${escHtml(acc.url)}" target="_blank" rel="noopener">${escHtml(acc.label || acc.url)}</a>`;
      } else if (acc.method === 'ssh') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-ghost';
        btn.textContent = `⬡ Conectar SSH (${acc.user}@${acc.host})`;
        btn.addEventListener('click', () => openSsh(project.id, acc.host, acc.user, btn));
        row.innerHTML = `<span class="env-field-label">ssh</span>`;
        row.appendChild(btn);
      } else {
        row.innerHTML =
          `<span class="env-field-label">${escHtml(acc.method)}</span>` +
          `<span class="env-field-value mono">${escHtml(acc.host || acc.url || '')}</span>`;
      }
      section.appendChild(row);
    }
    return section;
  }

  const header = document.createElement('div');
  header.className = 'project-environments-header';
  const title = document.createElement('label');
  title.className = 'form-label';
  title.textContent = 'Ambientes';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-sm';
  addBtn.textContent = '＋ Ambiente';
  addBtn.addEventListener('click', () => { closeParent(); showEnvironmentModal(project); });
  header.append(title, addBtn);
  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'environment-editor-list';
  for (const environment of (project.environments || [])) {
    const row = document.createElement('div');
    row.className = 'environment-summary-row';
    row.innerHTML =
      `<span class="environment-name">${escHtml(environment.name)}</span>` +
      `<span class="environment-server">${escHtml(environment.server)}</span>`;
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => { closeParent(); showEnvironmentModal(project, environment); });
    row.appendChild(editBtn);
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

function showProjectEditModal(project) {
  openEditModal((box, close) => showProjectForm(project, box, close), { size: 'standard', title: `Editar: ${project.id}` });
}

function showNewProjectModal() {
  openEditModal((box, close) => showProjectForm(null, box, close), { size: 'standard', title: 'Nuevo proyecto' });
}

function showEnvironmentModal(project, environment = null) {
  openEditModal((box, close) => {
    const isNew = !environment;
    const original = environment || {};

    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">${isNew ? 'Nuevo ambiente' : `Editar: ${escHtml(project.id)} / ${escHtml(environment.name)}`}</div>` +
        `<div class="manage-form-grid">` +
          ENVIRONMENT_FIELDS.map(field =>
            field === 'notes'
              ? ''
              : formField(field, `env-f-${field}`, original[field] ?? '', field)
          ).join('') +
        `</div>` +
        `<label class="form-label" for="env-f-notes">notes</label>` +
        `<textarea class="form-textarea" id="env-f-notes" rows="3">${escHtml(original.notes || '')}</textarea>` +
        `<div class="manage-banner hidden" id="env-form-error" style="margin-top:8px"></div>` +
        `<div class="manage-form-actions"${!isNew ? ' style="justify-content:space-between"' : ''}>` +
              (!isNew ? `<button class="btn btn-sm btn-danger" id="btn-env-form-del">Eliminar ambiente</button>` : '') +
              `<div style="display:flex;gap:8px;margin-left:auto">` +
                `<button class="btn btn-sm btn-ghost" id="btn-env-form-cancel">Cancelar</button>` +
                `<button class="btn btn-sm btn-primary" id="btn-env-form-save">${isNew ? 'Agregar ambiente' : 'Guardar ambiente'}</button>` +
              `</div>` +
            `</div>` +
          `</div>`;

    const showFormErr = (msg) => {
      const el = document.getElementById('env-form-error');
      el.textContent = msg;
      el.className = 'manage-banner manage-banner-error';
    };

    box.querySelector('#btn-env-form-cancel').addEventListener('click', close);

    if (!isNew) {
      box.querySelector('#btn-env-form-del').addEventListener('click', async () => {
        const confirmed = await confirmDialogRef(
          'Eliminar ambiente',
          `Se eliminará ${project.id}/${environment.name}.`,
          true,
        );
        if (!confirmed) return;
        const result = await projectWrite(
          'DELETE',
          `/api/projects/${encodeURIComponent(project.id)}/environments/${encodeURIComponent(environment.name)}`,
          {},
          `Ambiente ${environment.name} eliminado.`,
        );
        if (result) close();
      });
    }

    box.querySelector('#btn-env-form-save').addEventListener('click', async () => {
      const values = {};
      for (const field of ENVIRONMENT_FIELDS) values[field] = document.getElementById(`env-f-${field}`).value.trim();

      if (!values.name || !values.server) {
        showFormErr('Nombre y server son obligatorios.');
        return;
      }
      if (!!values.host !== !!values.remotePath) {
        showFormErr('host y remotePath deben completarse juntos.');
        return;
      }

      if (isNew) {
        const clean = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
        const result = await projectWrite(
          'POST',
          `/api/projects/${encodeURIComponent(project.id)}/environments`,
          { environment: clean },
          `Ambiente ${clean.name} agregado.`,
        );
        if (result) close();
        return;
      }

      const changes = {};
      for (const field of ENVIRONMENT_FIELDS) {
        if (values[field] !== String(original[field] ?? '')) changes[field] = values[field];
      }
      const result = await projectWrite(
        'PATCH',
        `/api/projects/${encodeURIComponent(project.id)}/environments/${encodeURIComponent(environment.name)}`,
        { changes },
        `Ambiente ${environment.name} actualizado.`,
      );
      if (result) close();
    });
  }, { size: 'standard' });
}

export function initProjects({ onUpdate, confirmDialog } = {}) {
  refreshApp = onUpdate ?? null;
  confirmDialogRef = confirmDialog ?? null;

  // Restaura el agrupamiento elegido la ultima vez -- antes siempre volvia a "Por cliente" al recargar.
  projectsGroupBy = loadState(PROJECTS_GROUPBY_KEY, 'client');
  const savedProjectsGroupBtn = document.querySelector(`.btn-projects-group[data-group="${projectsGroupBy}"]`);
  if (savedProjectsGroupBtn) {
    document.querySelectorAll('.btn-projects-group').forEach(b => b.classList.remove('active'));
    savedProjectsGroupBtn.classList.add('active');
  }

  document.getElementById('btn-project-add').addEventListener('click', () => {
    showNewProjectModal();
  });

  // Group-by toggle
  document.querySelectorAll('.btn-projects-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-projects-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      projectsGroupBy = btn.dataset.group;
      saveState(PROJECTS_GROUPBY_KEY, projectsGroupBy);
      if (registryData) renderProjects(registryData.projects);
    });
  });
}
