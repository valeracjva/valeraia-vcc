import { get } from '../core/api.js';
import { escHtml, buildAccordion } from '../core/dom.js';

const GROUP_BY_KEY = 'vcc-agentes-groupby';
const CATEGORY_PALETTE = ['var(--accent)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--danger)'];

let agentesAll = [];
let agentesGroupBy = 'categoria';

function categoryColor(category) {
  if (!category) return 'var(--text-faint)';
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

function buildAgentCard(agent) {
  const card = document.createElement('div');
  card.className = 'infra-card';
  const color = categoryColor(agent.category);
  card.style.borderLeft = `4px solid ${color}`;
  card.style.boxShadow = `inset 3px 0 8px -4px color-mix(in srgb, ${color} 35%, transparent)`;

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<span class="infra-id">${escHtml(agent.name)}</span>` +
      `<span class="infra-risk-badge" style="color:${color};border-color:${color}">${escHtml(agent.category || 'sin categoría')}</span>` +
    `</div>` +
    (agent.description ? `<div class="infra-os agent-desc" title="${escHtml(agent.description)}">${escHtml(agent.description)}</div>` : '');

  return card;
}

function groupAgents(agents, by) {
  if (by === 'none') {
    return [{ label: null, agents: agents.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')) }];
  }
  const order = [];
  const map = new Map(); // key normalizado → { label, agents }
  for (const agent of agents) {
    const raw = agent.category || 'Sin categoría';
    const norm = raw.trim().toLowerCase();
    if (!map.has(norm)) { map.set(norm, { label: raw.trim(), agents: [] }); order.push(norm); }
    map.get(norm).agents.push(agent);
  }
  return order
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map(k => ({
      label: map.get(k).label,
      agents: map.get(k).agents.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')),
    }));
}

function renderAgentsList(agents) {
  const table = document.createElement('table');
  table.className = 'manage-table data-table';
  table.innerHTML =
    `<thead><tr><th>NOMBRE</th><th>CATEGORÍA</th><th>DESCRIPCIÓN</th></tr></thead>` +
    `<tbody>` +
    agents.map(agent => {
      const color = categoryColor(agent.category);
      return `<tr>` +
        `<td><code>${escHtml(agent.name)}</code></td>` +
        `<td><span class="infra-risk-badge" style="color:${color};border-color:${color}">${escHtml(agent.category || 'sin categoría')}</span></td>` +
        `<td style="color:var(--text-muted)">${escHtml(agent.description || '')}</td>` +
      `</tr>`;
    }).join('') +
    `</tbody>`;
  return table;
}

function renderAgents() {
  const c = document.getElementById('agentes-container');
  if (!c) return;

  const subtitle = document.getElementById('agentes-subtitle');
  if (subtitle) subtitle.textContent = `${agentesAll.length} agentes · ~/.claude/agents/`;

  c.innerHTML = '';
  if (!agentesAll.length) {
    c.innerHTML = '<div class="infra-loading">No se encontraron agentes.</div>';
    return;
  }

  if (agentesGroupBy === 'list') {
    c.appendChild(renderAgentsList(agentesAll.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))));
    return;
  }

  const groups = groupAgents(agentesAll, agentesGroupBy);
  for (const group of groups) {
    const grid = document.createElement('div');
    grid.className = 'infra-grid';
    for (const agent of group.agents) grid.appendChild(buildAgentCard(agent));

    if (group.label) {
      c.appendChild(buildAccordion(
        group.label,
        group.agents.length,
        grid,
        { storageKey: `agentes-${agentesGroupBy}-${group.label}` }
      ));
    } else {
      c.appendChild(grid);
    }
  }
}

export async function loadAgents() {
  const c = document.getElementById('agentes-container');
  if (!c) return;
  c.innerHTML = '<div class="infra-loading">Cargando agentes...</div>';
  try {
    const data = await get('/api/agents');
    agentesAll = data.agents ?? [];
    renderAgents();
  } catch (err) {
    c.innerHTML = `<div class="infra-loading" style="color:var(--danger)">No se pudo cargar Agentes: ${escHtml(err.message)}</div>`;
  }
}

export function initAgents() {
  const saved = localStorage.getItem(GROUP_BY_KEY);
  if (saved) {
    agentesGroupBy = saved;
    document.querySelectorAll('.btn-agentes-group').forEach(b => b.classList.remove('active'));
    document.querySelector(`.btn-agentes-group[data-group="${saved}"]`)?.classList.add('active');
  }

  document.querySelectorAll('.btn-agentes-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-agentes-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      agentesGroupBy = btn.dataset.group;
      localStorage.setItem(GROUP_BY_KEY, agentesGroupBy);
      renderAgents();
    });
  });

  document.getElementById('btn-agentes-refresh')?.addEventListener('click', () => loadAgents());
}
