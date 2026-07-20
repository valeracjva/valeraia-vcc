import { FRESHNESS_STATES } from '../core/constants.js';
import { escHtml } from '../core/dom.js';
import { parsePendientesDetail } from './briefing.js';

export function renderCockpit(status, sections, tunnelData, runtime, { onActivateProject } = {}) {
  const panel = document.getElementById('tab-inicio');
  if (!panel) return;

  const freshness = FRESHNESS_STATES.includes(status.freshness) ? status.freshness : 'stale';
  const updated = (sections['Metadata'] ?? '').match(/Actualizado:\s*(.+)/)?.[1]?.trim() ?? '—';
  const tunnelMeta = { 3307: 'FatApp', 3308: 'appstest', 3309: 'appsprod', 3310: 'appsdesa' };

  const pendientesDetail = parsePendientesDetail(sections);
  const pRows = [
    ...pendientesDetail.P1.map((t) => ({ text: t, color: 'var(--danger)', dot: '●' })),
    ...pendientesDetail.P2.map((t) => ({ text: t, color: 'var(--warning)', dot: '●' })),
  ].slice(0, 5);

  const tunnelRows = Object.entries(tunnelMeta).map(([port, name]) => {
    const active = tunnelData[port] ?? false;
    const prod = port === '3309' ? `<span class="badge-prod">PROD</span>` : '';
    return `<div class="cockpit-tunnel">
      <span class="cockpit-t-dot ${active ? 'active' : 'inactive'}">●</span>
      <span class="cockpit-t-port">${port}</span>
      <span class="cockpit-t-name">${name}</span>
      ${prod}
    </div>`;
  }).join('');

  const current = runtime?.current ?? null;
  const recent = runtime?.recent ?? [];
  const cardList = [];
  if (current) cardList.push({ ...current, isActive: true });
  for (const r of recent) {
    if (cardList.length >= 3) break;
    if (r.projectId === current?.projectId && r.environment === current?.environment) continue;
    cardList.push({ ...r, isActive: false });
  }

  panel.innerHTML = `
    <div class="cockpit-grid">
      <div class="cockpit-widget cockpit-span4">
        <div class="cockpit-widget-label">PROYECTOS RECIENTES</div>
        <div class="cockpit-project-row" id="cockpit-proj-row"></div>
      </div>
      <div class="cockpit-widget">
        <div class="cockpit-widget-label">WORKSPACE</div>
        <div class="cockpit-freshness-row">
          <span class="dot ${freshness}"></span>
          <span class="cockpit-freshness-state ${freshness}">${freshness}</span>
        </div>
        <div class="cockpit-meta">
          <span class="cockpit-meta-host">${escHtml(status.host?.value ?? '—')}</span>
          <span class="cockpit-meta-time">${escHtml(updated)}</span>
        </div>
      </div>
      <div class="cockpit-widget">
        <div class="cockpit-widget-label">PENDIENTES CRÍTICOS</div>
        <div class="cockpit-p-items" id="cockpit-p-items"></div>
      </div>
      <div class="cockpit-widget cockpit-span2">
        <div class="cockpit-widget-label">TÚNELES SSH</div>
        <div class="cockpit-tunnel-list">${tunnelRows}</div>
      </div>
    </div>`;

  const projRow = panel.querySelector('#cockpit-proj-row');
  if (cardList.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'color:var(--text-faint);font-size:0.8rem';
    empty.textContent = 'Sin proyecto activo — activá uno desde Proyectos';
    projRow.appendChild(empty);
  } else {
    for (const c of cardList) {
      const riskKey = (c.riskLevel ?? 'bajo').toLowerCase().replace(/\s+/g, '-');
      const card = document.createElement('div');
      card.className = 'cockpit-proj-card' + (c.isActive ? ' is-active' : '');

      const name = document.createElement('div');
      name.className = 'cockpit-proj-card-name';
      name.textContent = c.name ?? c.projectId;

      const badges = document.createElement('div');
      badges.className = 'cockpit-proj-card-badges';

      const envBadge = document.createElement('span');
      envBadge.className = 'cockpit-badge cockpit-badge-env';
      envBadge.textContent = c.environment;

      const riskBadge = document.createElement('span');
      riskBadge.className = `cockpit-badge cockpit-badge-risk risk-${riskKey}`;
      riskBadge.textContent = c.riskLevel ?? 'bajo';

      badges.appendChild(envBadge);
      badges.appendChild(riskBadge);

      const footer = document.createElement('div');
      footer.className = 'cockpit-proj-card-footer';

      if (c.isActive) {
        const lbl = document.createElement('span');
        lbl.className = 'cockpit-proj-active-label';
        lbl.textContent = '● ACTIVO';
        footer.appendChild(lbl);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn-vscode btn-activate';
        btn.textContent = '⊙ Activar';
        btn.addEventListener('click', () => onActivateProject?.(c.projectId, c.environment, btn));
        footer.appendChild(btn);
      }

      card.appendChild(name);
      card.appendChild(badges);
      card.appendChild(footer);
      projRow.appendChild(card);
    }
  }

  const pItemsEl = panel.querySelector('#cockpit-p-items');
  if (pRows.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'cockpit-summary-text';
    empty.style.color = 'var(--text-faint)';
    empty.textContent = 'Sin pendientes críticos ni altos';
    pItemsEl.appendChild(empty);
  } else {
    for (const { text, color, dot } of pRows) {
      const row = document.createElement('div');
      row.className = 'cockpit-p-item';
      const dotEl = document.createElement('span');
      dotEl.style.color = color;
      dotEl.style.flexShrink = '0';
      dotEl.textContent = dot;
      const textEl = document.createElement('span');
      textEl.className = 'cockpit-p-item-text';
      textEl.textContent = text;
      row.appendChild(dotEl);
      row.appendChild(textEl);
      pItemsEl.appendChild(row);
    }
  }
}
