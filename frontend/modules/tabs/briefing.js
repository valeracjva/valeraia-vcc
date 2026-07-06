import { escHtml } from '../core/dom.js';

export function parsePendientesDetail(sections) {
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

export function renderBriefing(sections) {
  const panel = document.getElementById('tab-briefing');
  if (!panel) return;

  const updated = (sections['Metadata'] ?? '').match(/Actualizado:\s*(.+)/)?.[1]?.trim() ?? '—';
  const nextStep = (sections['Proximo paso seguro'] ?? '').trim();
  const estado = (sections['Estado actual'] ?? '').trim();
  const bloq = (sections['Bloqueadores'] ?? '').trim();
  const resumen = (sections['Resumen para IA entrante'] ?? '').trim();
  const pendientes = parsePendientesDetail(sections);
  const hasBloq = bloq.length > 0 && !/^ninguno$/i.test(bloq);

  const pChipConfig = {
    P1: { label: 'Crítico', cls: 'p1' },
    P2: { label: 'Alto', cls: 'p2' },
    P3: { label: 'Normal', cls: 'p3' },
    P4: { label: 'Bajo', cls: 'p4' },
  };

  const pChips = ['P1', 'P2', 'P3', 'P4'].flatMap((p) =>
    pendientes[p].map((text) => {
      const { label, cls } = pChipConfig[p];
      return `<div class="brief-p-chip ${cls}">` +
        `<span class="brief-p-chip-tag">${label}</span>` +
        `<span class="brief-p-chip-text">${escHtml(text)}</span>` +
        `</div>`;
    })
  ).join('');

  const resumenId = 'brief-resumen-body';
  const resumenHtml = resumen
    ? `<button class="brief-resumen-toggle" onclick="
        const b=document.getElementById('${resumenId}');
        const open=!b.classList.contains('hidden');
        b.classList.toggle('hidden',open);
        this.textContent=open?'▶ Resumen para IA':'▼ Resumen para IA';
       ">▶ Resumen para IA</button>
       <div class="brief-resumen-body hidden" id="${resumenId}">${escHtml(resumen)}</div>`
    : '';

  panel.innerHTML =
    `<div class="briefing-header">` +
      `<div class="briefing-header-title">Sesión actual</div>` +
      `<div class="briefing-header-desc">Contexto de la sesión IA activa — leído del handover generado al iniciar o cerrar sesión.</div>` +
      `<p class="briefing-updated">↻ ${escHtml(updated)}</p>` +
    `</div>` +
    `<div class="briefing-grid">` +

    `<div class="brief-hero briefing-full">` +
    `<div class="brief-hero-label">PRÓXIMO PASO</div>` +
    `<div class="brief-hero-text">${escHtml(nextStep || '—')}</div>` +
    `</div>` +

    `<div class="briefing-card ok">` +
    `<div class="briefing-card-label">ESTADO ACTUAL</div>` +
    `<div class="briefing-card-body">${escHtml(estado || '—')}</div>` +
    `</div>` +

    `<div class="briefing-card${hasBloq ? ' warn' : ''}">` +
    `<div class="briefing-card-label">${hasBloq ? '⚠ ' : ''}BLOQUEADORES</div>` +
    `<div class="briefing-card-body${hasBloq ? '' : ' muted'}">${hasBloq ? escHtml(bloq) : 'ninguno'}</div>` +
    `</div>` +

    `<div class="briefing-card briefing-full">` +
    `<div class="briefing-card-label">PENDIENTES ABIERTOS</div>` +
    `<div class="brief-p-chips">${pChips || '<div class="briefing-card-body muted">sin pendientes abiertos</div>'}</div>` +
    `</div>` +

    (resumenHtml ? `<div class="briefing-card briefing-full">${resumenHtml}</div>` : '') +

    `</div>`;
}
