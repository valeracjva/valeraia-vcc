import { get } from '../core/api.js';
import { escHtml } from '../core/dom.js';

function renderAgents(data) {
  const container = document.getElementById('agentes-container');
  if (!container) return;

  const agents = (data.agents ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const subtitle = document.getElementById('agentes-subtitle');
  if (subtitle) subtitle.textContent = `${agents.length} agentes · ~/.claude/agents/`;

  if (!agents.length) {
    container.innerHTML = '<div class="apis-loading">No se encontraron agentes.</div>';
    return;
  }

  container.innerHTML = `<div class="apis-groups" id="agentes-list"></div>`;
  const list = container.querySelector('#agentes-list');
  for (const agent of agents) {
    const row = document.createElement('article');
    row.className = 'api-row';
    row.innerHTML = `
      <div class="api-main">
        <div class="api-route"><code>${escHtml(agent.name)}</code></div>
      </div>
      <div class="api-meta">
        <span class="api-status safe">${escHtml(agent.category || 'sin categoría')}</span>
      </div>
    `;
    list.appendChild(row);
  }
}

export async function loadAgents() {
  const container = document.getElementById('agentes-container');
  if (!container) return;
  container.innerHTML = '<div class="apis-loading">Cargando agentes...</div>';
  try {
    const data = await get('/api/agents');
    renderAgents(data);
  } catch (err) {
    container.innerHTML = `<div class="apis-loading error">No se pudo cargar Agentes: ${escHtml(err.message)}</div>`;
  }
}

export function initAgents() {}
