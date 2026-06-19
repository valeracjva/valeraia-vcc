// === Config ===
const API_BASE  = '';          // mismo origen — Express sirve frontend y API
const POLL_MS   = 30_000;

const RISK_ICONS = { bajo: '▲', medio: '▲▲', alto: '▲▲▲', crítico: '⬛' };
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

// === Render ===
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

// === Update principal ===
async function update() {
  try {
    const [status, handover] = await Promise.all([
      get('/api/status'),
      get('/api/handover'),
    ]);

    renderFreshness(status.freshness);
    renderHost(status.host?.value);
    renderPendientes(status.pendientes.handover);
    renderProject(parseProject(handover.sections));
    showError(false);
  } catch (err) {
    console.error('[VCC] update error:', err.message);
    showError(true);
  }
}

update();
setInterval(update, POLL_MS);
