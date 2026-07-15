import { escHtml } from '../core/dom.js';
import { apiFetch, get } from '../core/api.js';
import { showManageBanner } from '../core/dom.js';

// Se pide una sola vez al cargar la app (ver app.js init()), no en cada refresh de 30s --
// el catch-up es "que paso mientras VCC estaba apagado", no cambia mientras la sesion sigue activa.
let catchupHtml = '';

export async function loadCatchupBanner() {
  try {
    const data = await get('/api/monitoring-core/catchup');
    const withEvents = (data.hosts ?? []).filter(h => h.events?.length > 0 && !h.error);
    if (withEvents.length === 0) { catchupHtml = ''; return; }
    const items = withEvents.map(h =>
      `<div class="brief-catchup-host"><strong>${escHtml(h.serverId)}</strong>: ${h.events.length} registro(s) de estado disponible(s)</div>`
    ).join('');
    catchupHtml =
      `<div class="briefing-card briefing-full brief-catchup">` +
      `<div class="briefing-card-label">ESTADO REGISTRADO EN LOS HOSTS CON AGENTE LOCAL</div>` +
      `<div class="briefing-card-body">${items}</div>` +
      `</div>`;
  } catch {
    catchupHtml = '';
  }
}

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

function ensureShell() {
  const panel = document.getElementById('tab-briefing');
  if (!panel) return null;
  if (!panel.querySelector('#briefing-dynamic')) {
    panel.innerHTML =
      `<div id="briefing-dynamic"></div>` +
      `<div class="briefing-card briefing-full" id="briefing-actions-card">` +
      `<div class="briefing-card-label">ACCIONES DE SESIÓN</div>` +
      `<textarea class="form-input" id="briefing-resumen-input" rows="3" placeholder="Punto de reanudación (qué falta, dónde seguir)…"></textarea>` +
      `<div class="briefing-actions-row">` +
      `<button class="btn btn-success" id="briefing-save-session">Guardar sesión</button>` +
      `<button class="btn btn-ghost" id="briefing-open-claude">Abrir Claude CLI</button>` +
      `</div>` +
      `<div class="manage-banner hidden" id="briefing-session-banner"></div>` +
      `</div>`;
  }
  return panel;
}

export function renderBriefing(sections, project = { id: null, environment: null }) {
  const panel = ensureShell();
  if (!panel) return;
  panel.dataset.projectId = project.id ?? '';
  panel.dataset.environment = project.environment ?? '';

  const dynamic = panel.querySelector('#briefing-dynamic');

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

  dynamic.innerHTML =
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

    catchupHtml +

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

async function saveSession(btn) {
  const panel = document.getElementById('tab-briefing');
  const textarea = document.getElementById('briefing-resumen-input');
  const projectId = panel?.dataset.projectId;
  const environment = panel?.dataset.environment;

  if (!projectId || !environment) {
    showManageBanner('briefing-session-banner', 'No hay proyecto/ambiente activo — no se puede guardar.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const data = await apiFetch(`/api/sessions/${encodeURIComponent(projectId)}/save`, {
      method: 'POST',
      body: { environment, resumen: textarea.value },
    });
    if (data.skipped) {
      showManageBanner('briefing-session-banner', 'Sin cambios (resumen vacío).');
    } else {
      showManageBanner('briefing-session-banner', `Sesión guardada. Bundle: ${data.bundlePath}`);
      textarea.value = '';
    }
  } catch (err) {
    showManageBanner('briefing-session-banner', `Error al guardar: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar sesión';
  }
}

async function openClaudeCli(btn) {
  btn.disabled = true;
  btn.textContent = 'Abriendo…';
  try {
    await apiFetch('/api/projects/open-claude-cli', { method: 'POST' });
  } catch { /* silencioso — la terminal puede haberse abierto igual */ }
  setTimeout(() => {
    btn.textContent = 'Abrir Claude CLI';
    btn.disabled = false;
  }, 1500);
}

export function initBriefing() {
  ensureShell();
  document.getElementById('briefing-save-session')?.addEventListener('click', (e) => saveSession(e.target));
  document.getElementById('briefing-open-claude')?.addEventListener('click', (e) => openClaudeCli(e.target));
}
