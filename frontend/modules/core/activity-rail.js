import { escHtml } from './dom.js';

const ACTIVITY_RAIL_COLLAPSED_KEY = 'vcc-activity-rail-collapsed';
const ACTIVITY_RAIL_STATE_KEY = 'vcc-activity-rail-state';
const ACTIVITY_RAIL_TTL = 60 * 60 * 1000; // 1 hora — entradas más viejas se purgan al cargar
const PREVIEW_MAX_LINES = 4;
const ENTRY_LIMIT = 20;
const HEARTBEAT_INTERVAL = 60_000; // 60s — poll de métricas y conectividad
const HEARTBEAT_KEY = 'hb';

let activityState = restoreActivityState();

export function createActivityState() {
  return { jobs: [] };
}

function restoreActivityState() {
  try {
    const raw = localStorage.getItem(ACTIVITY_RAIL_STATE_KEY);
    if (!raw) return createActivityState();
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    const now = Date.now();
    const fresh = jobs.filter((job) => {
      const age = now - (job.updatedAt || job.startedAt || 0);
      return age < ACTIVITY_RAIL_TTL && job.status !== 'running';
    });
    return { jobs: fresh.slice(0, ENTRY_LIMIT) };
  } catch {
    return createActivityState();
  }
}

function persistActivityState() {
  try {
    const state = { jobs: activityState.jobs ?? [] };
    localStorage.setItem(ACTIVITY_RAIL_STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage lleno o deshabilitado — seguir sin persistir
  }
}

// ── Heartbeat operativo ─────────────────────────────────────────
// Cada 60s consulta el estado de servidores y túneles, y empuja
// eventos al rail solo cuando hay cambios detectados.
const hbState = { serverHealth: {}, tunnelActive: {} };
let hbTimer = null;

async function pushHeartbeatEvent() {
  try {
    const res = await fetch('/api/opsmap');
    if (!res.ok) return;
    const data = await res.json();
    const nodes = data?.nodes ?? [];

    // Servidores — detectar transiciones a crítico o recuperación
    const servers = nodes.filter((n) => n.type === 'server');
    for (const sv of servers) {
      const prev = hbState.serverHealth[sv.id];
      const curr = sv.state;
      if (!prev) {
        hbState.serverHealth[sv.id] = curr;
        continue;
      }
      if (prev === curr) continue;
      hbState.serverHealth[sv.id] = curr;

      if (curr === 'critico') {
        handleActivityEvent({
          type: 'note',
          entryId: `${HEARTBEAT_KEY}-crit-${sv.id}`,
          title: sv.label || sv.id,
          category: 'servidor',
          status: 'error',
          message: `crítico — ${sv.detail || 'sin datos'}`,
          details: [sv.sub || ''],
        });
      } else if (prev === 'critico' && (curr === 'fresh' || curr === 'watch')) {
        handleActivityEvent({
          type: 'note',
          entryId: `${HEARTBEAT_KEY}-rec-${sv.id}`,
          title: sv.label || sv.id,
          category: 'servidor',
          status: 'success',
          message: 'recuperado',
          details: [sv.detail || ''],
        });
      }
    }

    // Túneles — detectar cambios activo/inactivo
    const tunnelNodes = nodes.filter((n) => n.type === 'tunnel');
    for (const tn of tunnelNodes) {
      const prev = hbState.tunnelActive[tn.id];
      const active = tn.state === 'active' || tn.state === 'critico';
      if (prev === undefined) {
        hbState.tunnelActive[tn.id] = active;
        continue;
      }
      if (prev === active) continue;
      hbState.tunnelActive[tn.id] = active;
      if (active) {
        handleActivityEvent({
          type: 'note',
          entryId: `${HEARTBEAT_KEY}-tun-${tn.id}`,
          title: tn.label || tn.id,
          category: 'tunnel',
          status: 'success',
          message: 'conectado',
        });
      } else {
        handleActivityEvent({
          type: 'note',
          entryId: `${HEARTBEAT_KEY}-tun-${tn.id}`,
          title: tn.label || tn.id,
          category: 'tunnel',
          status: 'error',
          message: 'desconectado',
          details: [tn.detail || ''],
        });
      }
    }
  } catch {
    // Error de fetch — el rail no se contamina con errores de red internos
  }
}

function startHeartbeat() {
  if (hbTimer) return;
  setTimeout(pushHeartbeatEvent, 5000);
  hbTimer = setInterval(pushHeartbeatEvent, HEARTBEAT_INTERVAL);
}

function isCollapsed() {
  return localStorage.getItem(ACTIVITY_RAIL_COLLAPSED_KEY) === '1';
}

function setCollapsed(collapsed) {
  localStorage.setItem(ACTIVITY_RAIL_COLLAPSED_KEY, collapsed ? '1' : '0');
}

function moveJobToFront(jobs, nextJob) {
  return [nextJob, ...jobs.filter((job) => job.jobId !== nextJob.jobId)].slice(0, ENTRY_LIMIT);
}

function resolveEntryId(msg, now) {
  return msg.entryId || msg.jobId || `activity-${now}`;
}

function extractOutputLines(data) {
  return String(data ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function applyActivityEvent(state, msg) {
  const jobs = Array.isArray(state?.jobs) ? state.jobs : [];
  if (!msg || typeof msg !== 'object' || !msg.type) return { jobs };

  const now = Date.now();
  const entryId = resolveEntryId(msg, now);
  const current = jobs.find((job) => job.jobId === entryId);

  if (msg.type === 'job-started') {
    const nextJob = {
      jobId: entryId,
      script: msg.script || current?.script || msg.jobId || 'script',
      category: 'script',
      kind: 'job',
      status: 'running',
      startedAt: now,
      updatedAt: now,
      lineCount: 0,
      preview: [],
      message: '',
    };
    return { jobs: moveJobToFront(jobs, nextJob) };
  }

  if (msg.type === 'note') {
    const details = Array.isArray(msg.details)
      ? msg.details.map((line) => String(line).trim()).filter(Boolean).slice(-PREVIEW_MAX_LINES)
      : [];
    const base = current ?? {
      jobId: entryId,
      startedAt: now,
      lineCount: 0,
      preview: [],
      message: '',
    };
    const nextJob = {
      ...base,
      jobId: entryId,
      script: msg.title || base.script || msg.category || 'evento',
      category: msg.category || base.category || 'evento',
      kind: 'note',
      status: msg.status || base.status || 'info',
      updatedAt: now,
      startedAt: base.startedAt ?? now,
      endedAt: msg.status === 'running' ? undefined : now,
      message: msg.message ? String(msg.message) : (base.message || ''),
      preview: details.length ? details : (base.preview || []),
    };
    return { jobs: moveJobToFront(jobs, nextJob) };
  }

  if (msg.type === 'output') {
    if (!msg.jobId) return { jobs };
    const freshLines = extractOutputLines(msg.data);
    if (!freshLines.length) return { jobs };
    const base = current ?? {
      jobId: entryId,
      script: msg.jobId,
      category: 'script',
      kind: 'job',
      status: 'running',
      startedAt: now,
      updatedAt: now,
      lineCount: 0,
      preview: [],
      message: '',
    };
    const nextJob = {
      ...base,
      updatedAt: now,
      lineCount: (base.lineCount ?? 0) + freshLines.length,
      preview: [...(base.preview ?? []), ...freshLines].slice(-PREVIEW_MAX_LINES),
      message: freshLines.at(-1) ?? base.message ?? '',
    };
    return { jobs: moveJobToFront(jobs, nextJob) };
  }

  if (msg.type === 'done') {
    if (!msg.jobId) return { jobs };
    const base = current ?? {
      jobId: entryId,
      script: msg.jobId,
      category: 'script',
      kind: 'job',
      startedAt: now,
      lineCount: 0,
      preview: [],
      message: '',
    };
    const ok = msg.exitCode === 0;
    const nextJob = {
      ...base,
      status: ok ? 'success' : 'error',
      updatedAt: now,
      endedAt: now,
      message: ok ? 'completado' : `exitCode ${msg.exitCode ?? -1}`,
    };
    return { jobs: moveJobToFront(jobs, nextJob) };
  }

  if (msg.type === 'error') {
    if (!msg.jobId) return { jobs };
    const base = current ?? {
      jobId: entryId,
      script: msg.jobId,
      category: 'script',
      kind: 'job',
      startedAt: now,
      lineCount: 0,
      preview: [],
      message: '',
    };
    const nextJob = {
      ...base,
      status: 'error',
      updatedAt: now,
      endedAt: now,
      message: String(msg.message || 'error desconocido'),
    };
    return { jobs: moveJobToFront(jobs, nextJob) };
  }

  return { jobs };
}

function scheduleOverflowCheck(feed) {
  if (!feed) feed = document.getElementById('activity-rail-feed');
  if (!feed) return;
  // setTimeout para que el browser haya calculado layout post-expand
  setTimeout(() => {
    feed.querySelectorAll('.log-msg').forEach((el) => {
      const track = el.querySelector('.log-msg-track');
      const textSpan = track?.querySelector('.log-msg-text');
      if (textSpan && textSpan.scrollWidth > el.clientWidth) {
        el.dataset.overflow = 'true';
        // clonar texto para loop continuo: sale x izquierda, entra x derecha
        if (!track.querySelector('.log-msg-clone')) {
          const clone = textSpan.cloneNode(true);
          clone.classList.add('log-msg-clone');
          track.appendChild(clone);
        }
      } else if (textSpan) {
        delete el.dataset.overflow;
        const clone = track?.querySelector('.log-msg-clone');
        if (clone) clone.remove();
      }
    });
  }, 50);
}

function formatTime(value) {
  if (!value) return '\u2014';
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function statusLabel(status) {
  if (status === 'running') return 'CORRIENDO';
  if (status === 'success') return 'OK';
  if (status === 'error') return 'ERROR';
  if (status === 'info') return 'INFO';
  return (status || 'EVENTO').toUpperCase();
}

function renderLogEntry(job) {
  const escJid = escHtml(job.jobId || '');
  const label = escHtml(job.script || job.category || 'evento');
  const msg   = escHtml(job.message || (Array.isArray(job.preview) && job.preview[0]) || '');
  const st    = job.status || 'info';

  return `<div class="log-entry" data-jid="${escJid}" data-status="${st}">
  <div class="log-header">
    <span class="log-time">${formatTime(job.startedAt)}</span>
    <span class="log-dot dot-${st}"></span>
    <span class="log-label">${label}</span>
    <span class="log-status badge-${st}">${statusLabel(st)}</span>
  </div>
  <div class="log-body">
    <span class="log-msg"><span class="log-msg-track"><span class="log-msg-text">${msg}</span></span></span>
  </div>
</div>`;
}

function renderActivityRail() {
  const rail = document.getElementById('activity-rail');
  const feed = document.getElementById('activity-rail-feed');
  const count = document.getElementById('activity-count');
  const running = document.getElementById('activity-running');
  const collapseBtn = document.getElementById('btn-activity-collapse');
  const clearBtn = document.getElementById('btn-activity-clear');
  if (!rail || !feed || !count || !running || !collapseBtn) return;

  const jobs = activityState.jobs ?? [];
  const collapsed = isCollapsed();
  const runningCount = jobs.filter((job) => job.status === 'running').length;

  rail.classList.toggle('collapsed', collapsed);
  collapseBtn.textContent = collapsed ? '\u25C2' : '\u25B8';
  collapseBtn.title = collapsed ? 'Expandir activity rail' : 'Colapsar activity rail';
  count.textContent = jobs.length ? `${jobs.length} entrada${jobs.length === 1 ? '' : 's'}` : 'sin actividad';
  running.textContent = runningCount ? `${runningCount} corriendo` : 'idle';

  if (!jobs.length) {
    feed.innerHTML = '<div class="log-empty"><span class="log-empty-dot"></span> Rail en espera de eventos de monitoreo.</div>';
    if (clearBtn) clearBtn.textContent = '\u2715';
    return;
  }

  feed.innerHTML = jobs.map(renderLogEntry).join('');

  // Marquee: detecta overflow y activa scroll suave en mensajes largos
  scheduleOverflowCheck(feed);

  // Texto contextual del boton limpiar
  if (clearBtn) clearBtn.textContent = jobs.length ? '\u2715 Limpiar todas' : '\u2715';
}

export function initActivityRail() {
  const rail = document.getElementById('activity-rail');
  const clearBtn = document.getElementById('btn-activity-clear');
  const collapseBtn = document.getElementById('btn-activity-collapse');
  if (!rail || !clearBtn || !collapseBtn) return;

  if (rail.dataset.bound !== '1') {
    clearBtn.addEventListener('click', () => {
      if (!activityState.jobs?.length) return;
      activityState = createActivityState();
      persistActivityState();
      renderActivityRail();
    });
    collapseBtn.addEventListener('click', () => {
      setCollapsed(!isCollapsed());
      renderActivityRail();
      // re-checkear overflow post-expand (setTimeout 50ms interno)
      if (!isCollapsed()) scheduleOverflowCheck();
    });
    rail.dataset.bound = '1';
    startHeartbeat();
  }

  renderActivityRail();
}

export function handleActivityEvent(msg) {
  activityState = applyActivityEvent(activityState, msg);
  persistActivityState();
  renderActivityRail();
}

export function publishActivityNote(note) {
  handleActivityEvent({ type: 'note', ...note });
}
