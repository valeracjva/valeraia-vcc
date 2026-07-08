import { computeImpact } from '../../opsmap-impact.js';
import { get } from '../core/api.js';
import { escHtml } from '../core/dom.js';
import { syncProjectsContext } from './projects.js';

// === F2 — Mapa Operativo ===
let opsMapData = null;
let incidentMode = false;

function riskClass(value) {
  return String(value ?? 'bajo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

const OPS_TYPE_LABELS = {
  server: 'servidores',
  domain: 'dominios',
  environment: 'ambientes',
  project: 'proyectos',
  tunnel: 'túneles',
  mcp: 'MCPs',
};

function applyIncidentHighlight(impactResult) {
  const nodesEl = document.getElementById('opsmap-nodes');
  if (!nodesEl) return;
  const impactedIds = new Set(impactResult ? impactResult.impacted.map(n => n.id) : []);
  if (impactResult) impactedIds.add(impactResult.originId);
  nodesEl.querySelectorAll('.ops-node').forEach(el => {
    el.classList.remove('impacted', 'dimmed');
    if (!impactResult) return;
    if (impactedIds.has(el.dataset.nodeId)) el.classList.add('impacted');
    else el.classList.add('dimmed');
  });
}

function renderImpactPanel(origin, impactResult) {
  const detail = document.getElementById('opsmap-detail');
  if (!detail) return;

  const counts = Object.entries(impactResult.byType)
    .map(([type, list]) => `${list.length} ${OPS_TYPE_LABELS[type] ?? type}`)
    .join(' · ') || 'sin nodos impactados';

  const groups = Object.entries(impactResult.byType).map(([type, list]) => `
    <div class="opsmap-impact-group">
      <div class="opsmap-impact-group-label">${escHtml(OPS_TYPE_LABELS[type] ?? type)}</div>
      ${list.map(n => `<button class="opsmap-impact-item" data-node-id="${escHtml(n.id)}">${escHtml(n.label)}</button>`).join('')}
    </div>
  `).join('');

  detail.innerHTML = `
    <div class="opsmap-detail-kicker">Modo incidente</div>
    <div class="opsmap-detail-title">${escHtml(origin.label)}</div>
    <div class="opsmap-detail-sub">${escHtml(counts)}</div>
    ${impactResult.hasCritical ? '<div class="opsmap-impact-badge">Impacto crítico</div>' : ''}
    <div class="opsmap-impact-groups">${groups || '<p>No hay nodos impactados.</p>'}</div>
  `;

  detail.querySelectorAll('.opsmap-impact-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const node = (opsMapData?.nodes ?? []).find(n => n.id === btn.dataset.nodeId);
      if (node) {
        renderOpsDetail(node);
      }
    });
  });
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
    btn.dataset.nodeId = node.id;
    btn.style.left = `${Math.max(8, Math.min(92, x))}%`;
    btn.style.top = `${Math.max(8, Math.min(92, y))}%`;
    btn.innerHTML = `<strong>${escHtml(node.label)}</strong><span>${escHtml(node.sub)}</span>`;
    btn.addEventListener('click', () => {
      nodesEl.querySelectorAll('.ops-node').forEach(n => n.classList.remove('selected'));
      btn.classList.add('selected');
      const canAnalyzeImpact = incidentMode && (node.type === 'server' || node.type === 'domain') && data.nodes && data.links;
      if (canAnalyzeImpact) {
        const impactResult = computeImpact(node.id, data.nodes, data.links);
        applyIncidentHighlight(impactResult);
        renderImpactPanel(node, impactResult);
      } else {
        applyIncidentHighlight(null);
        renderOpsDetail(node);
      }
    });
    nodesEl.appendChild(btn);
    if (index === 0) btn.classList.add('selected');
  });

  renderOpsDetail(nodes[0]);
  const subtitle = document.getElementById('opsmap-subtitle');
  if (subtitle && current) subtitle.textContent = `${current.projectId}/${current.environment} · ${current.riskLevel ?? 'bajo'} · ${data.links?.length ?? 0} relaciones`;
}

export async function loadOpsMap(manual = false) {
  const container = document.getElementById('opsmap-container');
  if (!container) return;
  container.innerHTML = '<div class="opsmap-loading">Sincronizando mapa operativo...</div>';
  try {
    opsMapData = await get('/api/opsmap');
    syncProjectsContext({ runtimeData: { current: opsMapData.current, recent: opsMapData.recent ?? [] } });
    renderOpsMap(opsMapData);
  } catch (err) {
    container.innerHTML = `<div class="opsmap-loading error">No se pudo sincronizar el mapa: ${escHtml(err.message)}</div>`;
  }
}

export function initOpsMap() {
  document.getElementById('btn-opsmap-refresh')?.addEventListener('click', () => loadOpsMap(true));
  document.getElementById('opsmap-incident-toggle')?.addEventListener('change', (e) => {
    incidentMode = e.target.checked;
    if (!incidentMode) {
      applyIncidentHighlight(null);
      const nodesEl = document.getElementById('opsmap-nodes');
      const selectedBtn = nodesEl?.querySelector('.ops-node.selected');
      const selectedNode = selectedBtn
        ? (opsMapData?.nodes ?? []).find(n => n.id === selectedBtn.dataset.nodeId)
        : null;
      if (selectedNode) renderOpsDetail(selectedNode);
    }
  });
}
