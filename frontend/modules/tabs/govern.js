import { API_BASE } from '../core/constants.js';

const governStreamSinks = new Set();

function emitGovernStreamEvent(msg) {
  for (const sink of governStreamSinks) {
    try {
      sink(msg);
    } catch (err) {
      console.error('[VCC] govern sink error:', err.message);
    }
  }
}

export function registerGovernStreamSink(sink) {
  governStreamSinks.add(sink);
  return () => governStreamSinks.delete(sink);
}

const GOVERN_SCRIPTS = [
  {
    id: 'workspace-health',
    icon: '⬡',
    name: 'workspace-health',
    desc: 'Diagnóstico completo del workspace. Verifica hardlinks entre CLAUDE.md y ~/.claude/, estado de sync OneDrive/rclone, archivos viejos y consistencia de configuración entre PCs.',
    scripts: ['scripts/workspace/governance/workspace-health.ps1'],
  },
  {
    id: 'compile-agents',
    icon: '⚙',
    name: 'compile-agents',
    desc: 'Regenera AGENTS.md para Codex compilando CLAUDE.md más todos los rules/*.md en un solo archivo. Ejecutar siempre después de editar CLAUDE.md o cualquier regla en rules/.',
    scripts: ['scripts/workspace/governance/compile-agents-md.ps1'],
  },
  {
    id: 'web-context',
    icon: '◈',
    name: 'web-context',
    desc: 'Genera el bundle de contexto web AI en runtime/web-context.md para continuar sesiones en Claude.ai o ChatGPT Web con el estado actual del workspace y el proyecto activo.',
    scripts: ['scripts/workspace/governance/generate-web-context.ps1'],
  },
  {
    id: 'sync-status',
    icon: '⇅',
    name: 'sync-status',
    desc: 'Muestra el estado de sincronización de rclone y OneDrive. Detecta desvíos, archivos sin sincronizar y estado de los remotes configurados. Útil antes de cambiar de PC.',
    scripts: ['scripts/workspace/sync/sync-status.ps1'],
  },
  {
    id: 'cierre',
    icon: '◼',
    name: 'cierre',
    desc: 'Cierre de sesión IA en 4 pasos secuenciales: regenera agentes, refresca índices del workspace, actualiza el HANDOVER y genera el bundle web. Ejecutar antes de cerrar Claude Code.',
    scripts: [
      'scripts/workspace/governance/compile-agents-md.ps1',
      'scripts/workspace/governance/refresh-workspace-indexes.ps1',
      'scripts/workspace/governance/update-handover.ps1',
      'scripts/workspace/governance/generate-web-context.ps1',
    ],
  },
];

function setButtonsDisabled(disabled) {
  document.querySelectorAll('.govern-run-btn').forEach((b) => { b.disabled = disabled; });
}

function clearOutput() {
  const panel = document.getElementById('output-panel');
  if (panel) panel.innerHTML = '';
}

function appendOutput(text, className) {
  const panel = document.getElementById('output-panel');
  if (!panel) return;
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  panel.appendChild(span);
  panel.scrollTop = panel.scrollHeight;
}

async function runScript(scriptId, scriptPaths = []) {
  clearOutput();
  appendOutput(`$ ${scriptId}\n`, 'out-cmd');
  for (const p of scriptPaths) appendOutput(`  → ${p}\n`, 'out-path');
  appendOutput('\n');
  setButtonsDisabled(true);

  try {
    const res = await fetch(`${API_BASE}/api/govern/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: scriptId }),
    });
    if (!res.ok) {
      const err = await res.json();
      appendOutput((err.error || 'Error desconocido') + '\n', 'out-error');
      setButtonsDisabled(false);
    }
  } catch {
    appendOutput('Error al contactar el servidor\n', 'out-error');
    setButtonsDisabled(false);
  }
}

export function initGovern() {
  const grid = document.getElementById('govern-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const s of GOVERN_SCRIPTS) {
    const card = document.createElement('div');
    card.className = 'govern-card';
    card.dataset.script = s.id;

    const header = document.createElement('div');
    header.className = 'govern-card-header';
    const icon = document.createElement('span');
    icon.className = 'govern-card-icon';
    icon.textContent = s.icon;
    const name = document.createElement('span');
    name.className = 'govern-card-name';
    name.textContent = s.name;
    header.appendChild(icon);
    header.appendChild(name);

    const desc = document.createElement('p');
    desc.className = 'govern-card-desc';
    desc.textContent = s.desc;

    const scriptsBlock = document.createElement('div');
    scriptsBlock.className = 'govern-card-scripts';
    const scriptsLabel = document.createElement('div');
    scriptsLabel.className = 'govern-card-scripts-label';
    scriptsLabel.textContent = 'Scripts internos';
    scriptsBlock.appendChild(scriptsLabel);
    for (const path of s.scripts) {
      const code = document.createElement('code');
      code.className = 'govern-card-script-path';
      code.textContent = path.split('/').pop();
      code.title = path;
      scriptsBlock.appendChild(code);
    }

    const footer = document.createElement('div');
    footer.className = 'govern-card-footer';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn-primary govern-run-btn';
    runBtn.dataset.script = s.id;
    runBtn.textContent = '▶ Ejecutar';
    runBtn.addEventListener('click', () => runScript(s.id, s.scripts));
    footer.appendChild(runBtn);

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(scriptsBlock);
    card.appendChild(footer);
    grid.appendChild(card);
  }

  const clearBtn = document.getElementById('btn-clear');
  if (clearBtn) clearBtn.onclick = clearOutput;
}

export function connectGovernWS() {
  const ws = new WebSocket(`ws://${location.host}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    emitGovernStreamEvent(msg);
    if (msg.type === 'output') {
      appendOutput(msg.data);
    } else if (msg.type === 'done') {
      if (msg.exitCode === 0) appendOutput('✓ completado\n', 'out-success');
      else appendOutput(`✗ exitCode: ${msg.exitCode}\n`, 'out-error');
      setButtonsDisabled(false);
    } else if (msg.type === 'error') {
      appendOutput(`✗ ${msg.message}\n`, 'out-error');
      setButtonsDisabled(false);
    }
  };

  ws.onerror = () => {
    const banner = document.getElementById('error-banner');
    banner?.classList.remove('hidden');
  };
  ws.onclose = () => setTimeout(connectGovernWS, 3000);
}
