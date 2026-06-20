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

let activeProjectId = null;

async function loadProjects() {
  try {
    const data = await get('/api/registry');
    renderProjects(data.projects);
  } catch (e) {
    console.error('[VCC] loadProjects error:', e.message);
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
  for (const clientKey of CLIENT_ORDER) {
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

// === M12 — Briefing ===
function escHtml(str) {
  return str
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
  } catch (err) {
    console.error('[VCC] update error:', err.message);
    showError(true);
  }
}

// === Init ===
async function init() {
  initTabs();
  renderGovern();
  connectWS();
  await update();
  await loadProjects();
  setInterval(update, POLL_MS);
}

init();
