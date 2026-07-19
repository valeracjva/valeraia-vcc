import { get } from '../core/api.js';
import { escHtml } from '../core/dom.js';

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
        <h2 class="apis-hero-title">Backend VCC local</h2>
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
    const safeCount = apis.filter((a) => a.safeCheck).length;
    section.innerHTML = `
      <div class="apis-group-header">
        <div>
          <h3 class="apis-group-title">${escHtml(moduleName)}</h3>
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

export async function loadApis(manual = false) {
  const container = document.getElementById('apis-container');
  if (!container) return;
  container.innerHTML = '<div class="apis-loading">Verificando catálogo de APIs...</div>';
  try {
    const apisData = await get('/api/apis');
    renderApis(apisData);
  } catch (err) {
    container.innerHTML = `<div class="apis-loading error">No se pudo cargar APIs VCC: ${escHtml(err.message)}</div>`;
  }
}

export function initApis() {
  document.getElementById('btn-apis-refresh')?.addEventListener('click', () => loadApis(true));
}
