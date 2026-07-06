import { API_BASE, FRESHNESS_STATES, POLL_MS } from './modules/core/constants.js';
import { get, apiFetch } from './modules/core/api.js';
import { buildAccordion, escHtml, formField, formSelect, showManageBanner } from './modules/core/dom.js';
import { initSidebar, initTabs, initTheme, tickFooterClock, confirmDialog, openJsonModal, initJsonModal } from './modules/core/shell.js';
import { renderBriefing } from './modules/tabs/briefing.js';
import { renderCockpit } from './modules/tabs/cockpit.js';
import { initGovern, connectGovernWS } from './modules/tabs/govern.js';
import { initApis, loadApis } from './modules/tabs/apis.js';
import { initProjects, loadProjects, setActiveProject, syncProjectsContext } from './modules/tabs/projects.js';
import { initSSL, loadSSL } from './modules/tabs/ssl.js';
import { initTunnels, loadTunnels, updateTunnelDots } from './modules/tabs/tunnels.js';
import { initOpsMap, loadOpsMap } from './modules/tabs/opsmap.js';
import { initMcp, loadMcp } from './modules/tabs/mcp.js';
import { initInventory, loadInventory, loadMetrics, METRICS_INTERVAL_MS } from './modules/tabs/inventory.js';

const RISK_ICONS = { bajo: '▲', medio: '▲▲', alto: '▲▲▲', crítico: '⬛' };

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

    const project = parseProject(handover.sections);
    const nextActiveProjectId = runtime?.current?.projectId ?? (project.id !== '—' ? project.id : null);
    syncProjectsContext({ activeProjectId: nextActiveProjectId, runtimeData: runtime });

    // Runtime tiene prioridad sobre handover para activeProjectId y sidebar
    if (runtime?.current?.projectId) {
      renderProjectFromRuntime(runtime.current);
    } else {
      renderProject(project);
    }

    renderFreshness(status.freshness);
    renderHost(status.host?.value);
    renderPendientes(status.pendientes.handover);
    updateTunnelDots(tunnels);
    renderCockpit(status, handover.sections, tunnels, runtime, { onActivateProject: setActiveProject });
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

// === Init ===
async function init() {
  initTheme();
  initSidebar();
  initTabs({
    onTabChange: (tab) => {
      if (tab === 'tuneles') loadTunnels();
      if (tab === 'proyectos') loadProjects();
      if (tab === 'opsmap') loadOpsMap();
      if (tab === 'apis') loadApis();
      if (tab === 'mcp') loadMcp();
    },
  });
  initProjects({ onUpdate: update, confirmDialog });
  initGovern();
  initSSL();
  initTunnels({ confirmDialog, openJsonModal });
  initInventory({ confirmDialog });
  initOpsMap();
  initApis();
  initMcp({ confirmDialog });
  initJsonModal();
  connectGovernWS();
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
