# VCC — Paridad funcional con el launcher (4 gaps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 4 gaps funcionales reales entre el launcher PowerShell
(`launch-ai-workspace.ps1`) y VCC (guardar sesión, tab Agentes, conectar SSH a FortiGate,
abrir Claude CLI) para habilitar el retiro del launcher.

**Architecture:** Cada gap agrega una ruta Express nueva o extiende una existente
(`backend/routes/`), siguiendo el patrón ya establecido en el repo: factory
`createXRouter({ deps })` con defaults reales + `export default createXRouter()`, para que
los tests puedan inyectar fixtures (tmpdir, `spawnProcess` fake) sin tocar el filesystem/
procesos reales. La lógica pura (templates, parsers) vive separada en `backend/lib/` para
testear sin Express. El frontend sigue el patrón `initX()`/`loadX()`/`renderX()` ya usado en
`apis.js`/`mcp.js`, con clases CSS existentes (sin tokens nuevos).

**Tech Stack:** Node.js (Express, `node:child_process`, `node:test`), vanilla JS ES modules
(frontend), PowerShell 7 (`build-ai-context.ps1`, ya migrado al kernel ValeraOS).

## Global Constraints

- No crear clases CSS nuevas — reusar `.btn`, `.btn-ghost`, `.manage-banner`, `.env-block`,
  etc. ya existentes en `frontend/style.css`.
- Todas las rutas nuevas siguen el patrón `createXRouter({ ...deps })` con
  `export default createXRouter()` al final del archivo (mismo patrón que
  `backend/routes/projects.js`), para permitir inyección de dependencias en tests.
- Todo spawn de proceso de escritorio usa `{ detached: true, stdio: 'ignore' }` +
  `child.unref()`, igual que `open-vscode` en `backend/routes/projects.js:288-293`.
- Validar cualquier valor que llegue a un `spawn`/`execFile` contra un patrón de caracteres
  seguros (mismo criterio que `SAFE_OPEN_SCRIPT_PATTERN` / el check de `host` en
  `open-vscode`) — nunca interpolar input de usuario sin validar en un comando de shell.
- Tests con `node:test` (sin librería de test runner nueva), ejecutados con
  `node --test backend/test/<archivo>.test.js` o `node --test frontend/test/<archivo>.test.js`.

---

### Task 1: `build-ai-context` en config.js + `sessions.js` (Gap 1 — backend)

**Files:**
- Modify: `backend/config.js`
- Create: `backend/lib/session-template.js`
- Create: `backend/routes/sessions.js`
- Create: `backend/test/sessions-routes.test.js`
- Modify: `backend/server.js`

**Interfaces:**
- Produces: `buildActiveMd({ projectId, environment, resumen, fecha }) -> string` (pura,
  exportada de `session-template.js`).
- Produces: `createSessionsRouter({ readRegistryFn, sessionsRoot, buildScriptPath,
  execFileFn }) -> express.Router` con `POST /:projectId/save`.
- Consumes: `readRegistry` de `backend/lib/registry-store.js` (ya existe, `{ registry } =
  await readRegistry()`).

- [ ] **Step 1: Agregar `build-ai-context` a SCRIPTS y `sessionsRoot` a PATHS**

Editar `backend/config.js`, agregar dentro de `PATHS` (después de `recentProjects`):

```js
  sessionsRoot:   path.join(WORKSPACE_ROOT, 'sessions'),
```

Y agregar dentro de `SCRIPTS` (después de `'compile-agents'`):

```js
  'build-ai-context': process.env.VALERAIA_KERNEL
    ? path.join(process.env.VALERAIA_KERNEL, 'core', 'governance', 'build-ai-context.ps1')
    : 'scripts/workspace/context/build-ai-context.ps1',
```

- [ ] **Step 2: Escribir el test del template puro (falla primero)**

Crear `backend/test/session-template.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActiveMd } from '../lib/session-template.js';

test('buildActiveMd genera el template con todos los campos', () => {
  const md = buildActiveMd({
    projectId: 'fincos-one',
    environment: 'test',
    resumen: 'Terminé el hero estático, falta ajustar la imagen.',
    fecha: '2026-07-13 18:30',
  });

  assert.match(md, /^# Sesión activa — fincos-one/);
  assert.match(md, /Última sesión guardada: 2026-07-13 18:30/);
  assert.match(md, /## Punto de reanudación\nTerminé el hero estático, falta ajustar la imagen\./);
  assert.match(md, /- Proyecto {2}: fincos-one/);
  assert.match(md, /- Ambiente {2}: test/);
});
```

- [ ] **Step 3: Correr el test y confirmar que falla**

Run: `node --test backend/test/session-template.test.js`
Expected: FAIL — `Cannot find module '../lib/session-template.js'`

- [ ] **Step 4: Implementar `session-template.js`**

Crear `backend/lib/session-template.js`:

```js
export function buildActiveMd({ projectId, environment, resumen, fecha }) {
  return `# Sesión activa — ${projectId}\n\n` +
    `## Estado\n` +
    `Última sesión guardada: ${fecha}\n\n` +
    `## Punto de reanudación\n` +
    `${resumen}\n\n` +
    `## Ambiente activo\n` +
    `- Proyecto  : ${projectId}\n` +
    `- Ambiente  : ${environment}\n` +
    `- Generado  : ${fecha}\n`;
}
```

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `node --test backend/test/session-template.test.js`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add backend/lib/session-template.js backend/test/session-template.test.js
git commit -m "feat(sessions): template puro de active.md (paridad con Save-Session del launcher)"
```

- [ ] **Step 7: Escribir el test de la ruta (falla primero)**

Crear `backend/test/sessions-routes.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express from 'express';

import { createSessionsRouter } from '../routes/sessions.js';

function registryFixture() {
  return {
    registry: {
      version: '1.0',
      workspaceRoot: 'C:\\AI-Workspace',
      reposRoot: 'E:\\Workspace-Repos',
      projects: [
        {
          id: 'alpha', name: 'Alpha', type: 'laravel', category: 'desarrollo',
          status: 'active', client: 'test',
          environments: [{ name: 'test', server: 'srv-alpha' }],
        },
      ],
    },
    hash: 'fakehash',
  };
}

async function withApi(run, { execFileFn } = {}) {
  const sessionsRoot = await mkdtemp(path.join(tmpdir(), 'vcc-sessions-'));
  const readRegistryFn = async () => registryFixture();
  const defaultExecFileFn = async () => ({
    stdout: JSON.stringify({ timestamp: '2026-07-13T18:30:00', bundlePath: 'runtime/context-bundle.md', lines: 42 }),
    stderr: '',
  });

  const app = express();
  app.use(express.json());
  app.use('/api/sessions', createSessionsRouter({
    readRegistryFn,
    sessionsRoot,
    buildScriptPath: 'fake-build-ai-context.ps1',
    execFileFn: execFileFn ?? defaultExecFileFn,
  }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, body) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    return { response, payload };
  }

  try {
    await run({ request, sessionsRoot });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(sessionsRoot, { recursive: true, force: true });
  }
}

test('POST /api/sessions/:id/save escribe active.md y regenera el bundle', async () => {
  await withApi(async ({ request, sessionsRoot }) => {
    const { response, payload } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'test',
      resumen: 'Nota de prueba',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.bundlePath, 'runtime/context-bundle.md');

    const written = await readFile(path.join(sessionsRoot, 'alpha', 'active.md'), 'utf8');
    assert.match(written, /Nota de prueba/);
  });
});

test('POST /api/sessions/:id/save con resumen vacío no escribe nada', async () => {
  await withApi(async ({ request, sessionsRoot }) => {
    const { response, payload } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'test',
      resumen: '   ',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.skipped, true);
    await assert.rejects(readFile(path.join(sessionsRoot, 'alpha', 'active.md'), 'utf8'));
  });
});

test('POST /api/sessions/:id/save con proyecto inexistente responde 404', async () => {
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/sessions/no-existe/save', {
      environment: 'test',
      resumen: 'algo',
    });
    assert.equal(response.status, 404);
  });
});

test('POST /api/sessions/:id/save con ambiente inexistente responde 404', async () => {
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'no-existe',
      resumen: 'algo',
    });
    assert.equal(response.status, 404);
  });
});

test('POST /api/sessions/:id/save responde 500 si el script falla, sin borrar el .md ya escrito', async () => {
  const failingExecFileFn = async () => {
    const err = new Error('script failed');
    err.code = 2;
    err.stderr = 'proyecto/ambiente no encontrado';
    throw err;
  };
  await withApi(async ({ request, sessionsRoot }) => {
    const { response, payload } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'test',
      resumen: 'Nota que debe sobrevivir al fallo del script',
    });
    assert.equal(response.status, 500);
    assert.match(payload.error, /proyecto\/ambiente no encontrado/);

    const written = await readFile(path.join(sessionsRoot, 'alpha', 'active.md'), 'utf8');
    assert.match(written, /Nota que debe sobrevivir al fallo del script/);
  }, { execFileFn: failingExecFileFn });
});
```

- [ ] **Step 8: Correr el test y confirmar que falla**

Run: `node --test backend/test/sessions-routes.test.js`
Expected: FAIL — `Cannot find module '../routes/sessions.js'`

- [ ] **Step 9: Implementar `backend/routes/sessions.js`**

```js
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Router } from 'express';

import { PATHS, SCRIPTS, WORKSPACE_ROOT } from '../config.js';
import { readRegistry } from '../lib/registry-store.js';
import { buildActiveMd } from '../lib/session-template.js';

const execFileAsync = promisify(execFile);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendError(res, error) {
  const status = [400, 404].includes(error?.statusCode) ? error.statusCode : 500;
  res.status(status).json({ error: error.message || 'Error interno del servidor' });
}

function fechaActual() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

export function createSessionsRouter({
  readRegistryFn = readRegistry,
  sessionsRoot = PATHS.sessionsRoot,
  buildScriptPath = SCRIPTS['build-ai-context'],
  execFileFn = (...args) => execFileAsync(...args),
} = {}) {
  const router = Router();

  router.post('/:projectId/save', async (req, res) => {
    try {
      const { environment, resumen } = req.body ?? {};
      const { registry } = await readRegistryFn();
      const project = registry.projects.find(item => item.id === req.params.projectId);
      if (!project) throw new HttpError(404, `Proyecto '${req.params.projectId}' no encontrado`);
      const env = (project.environments ?? []).find(item => item.name === environment);
      if (!env) throw new HttpError(404, `Ambiente '${environment}' no encontrado`);

      if (!resumen || !resumen.trim()) {
        return res.json({ skipped: true });
      }

      const fecha = fechaActual();
      const md = buildActiveMd({ projectId: project.id, environment, resumen: resumen.trim(), fecha });
      const projectSessionDir = path.join(sessionsRoot, project.id);
      await mkdir(projectSessionDir, { recursive: true });
      await writeFile(path.join(projectSessionDir, 'active.md'), md, 'utf8');

      const scriptPath = path.isAbsolute(buildScriptPath)
        ? buildScriptPath
        : path.join(WORKSPACE_ROOT, buildScriptPath);

      try {
        const { stdout } = await execFileFn('pwsh', [
          '-NoProfile', '-NonInteractive', '-File', scriptPath,
          '-ProjectId', project.id, '-Environment', environment,
          '-AIProfile', 'claude-code', '-Json',
        ]);
        const result = JSON.parse(stdout.trim());
        res.json({ ok: true, bundlePath: result.bundlePath });
      } catch (scriptError) {
        throw new HttpError(500, scriptError.stderr || scriptError.message);
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createSessionsRouter();
```

- [ ] **Step 10: Correr los tests y confirmar que pasan**

Run: `node --test backend/test/sessions-routes.test.js`
Expected: PASS (5 tests)

- [ ] **Step 11: Montar la ruta en `server.js`**

Editar `backend/server.js`, agregar el import junto a los demás (después de
`import linksRouter from './routes/links.js';`):

```js
import sessionsRouter  from './routes/sessions.js';
```

Y el `app.use` junto a los demás (después de `app.use('/api/mcp', mcpRouter);`):

```js
app.use('/api/sessions', sessionsRouter);
```

- [ ] **Step 12: Commit**

```bash
git add backend/config.js backend/routes/sessions.js backend/test/sessions-routes.test.js backend/server.js
git commit -m "feat(sessions): endpoint POST /api/sessions/:id/save (Gap 1 — guardar sesión)"
```

---

### Task 2: Formulario "Guardar sesión" en Briefing (Gap 1 — frontend)

**Files:**
- Modify: `frontend/modules/tabs/briefing.js`
- Modify: `frontend/app.js`

**Interfaces:**
- Consumes: `POST /api/sessions/:projectId/save` (Task 1).
- Produces: `initBriefing()` exportado — debe llamarse una vez en `init()` de `app.js`.
- Modifica la firma de `renderBriefing(sections, project)` — `project` ahora es
  `{ id, environment }` (antes solo recibía `sections`).

**Contexto importante:** `renderBriefing` hoy hace `panel.innerHTML = ...` sobre
`#tab-briefing` completo, cada 30s (polling de `update()` en `app.js`). Si el formulario de
guardar sesión vive dentro de ese `innerHTML`, se borra el texto que el usuario esté
escribiendo cada 30 segundos. Por eso el formulario pasa a ser un bloque **estático**, creado
una sola vez por `initBriefing()`, y el contenido que sí cambia con el polling se mueve a un
contenedor hijo (`#briefing-dynamic`) que es lo único que `renderBriefing` reemplaza.

- [ ] **Step 1: Reestructurar `briefing.js` — contenedor dinámico + formulario estático**

Reemplazar el contenido completo de `frontend/modules/tabs/briefing.js`:

```js
import { escHtml } from '../core/dom.js';
import { apiFetch } from '../core/api.js';
import { showManageBanner } from '../core/dom.js';

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
```

- [ ] **Step 2: Agregar CSS mínimo para la fila de acciones**

`briefing-actions-row` es la única clase nueva imprescindible (layout de dos botones en
fila) — no hay una clase existente para "fila de botones" reutilizable en este contexto sin
arrastrar estilos ajenos. Agregar al final de `frontend/style.css`:

```css
.briefing-actions-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
```

(El textarea reusa `.form-input` ya existente; el banner reusa `.manage-banner` ya existente.)

- [ ] **Step 3: Wirear `initBriefing()` y pasar `project` a `renderBriefing()` en `app.js`**

En `frontend/app.js`, agregar `initBriefing` al import existente (línea 6):

```js
import { initBriefing, renderBriefing } from './modules/tabs/briefing.js';
```

En `init()` (junto a los demás `initX()`, después de `initProjects(...)`):

```js
  initBriefing();
```

Reemplazar la línea `renderBriefing(handover.sections);` (dentro de `update()`) por:

```js
    renderBriefing(handover.sections, {
      id: nextActiveProjectId,
      environment: runtime?.current?.environment ?? project.env,
    });
```

- [ ] **Step 4: Verificación manual en vivo (Playwright)**

Con el backend corriendo (`cd backend && npm start` — verificar que no haya otra instancia
en 8080 antes), navegar a `http://localhost:8080`, ir a la tab "Sesión actual", escribir un
texto en el textarea, click "Guardar sesión". Confirmar:
- El banner muestra "Sesión guardada. Bundle: ...".
- `sessions/<projectId activo>/active.md` tiene el texto escrito (revisar con `Read`).
- Esperar 30s sin tocar nada — confirmar que el textarea sigue vacío (se limpió al guardar,
  no por el polling) y que el resto de la tab (próximo paso, pendientes) se sigue refrescando.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/briefing.js frontend/app.js frontend/style.css
git commit -m "feat(briefing): formulario guardar sesión + botón Abrir Claude CLI (Gap 1 frontend)"
```

---

### Task 3: `GET /api/agents` (Gap 2 — backend)

**Files:**
- Create: `backend/lib/agent-catalog.js`
- Create: `backend/routes/agents.js`
- Create: `backend/test/agent-catalog.test.js`
- Create: `backend/test/agents-routes.test.js`
- Modify: `backend/server.js`

**Interfaces:**
- Produces: `parseAgentCategory(content) -> string | null` (pura).
- Produces: `createAgentsRouter({ agentsDir, readdirFn, readFileFn }) -> express.Router` con
  `GET /`.

- [ ] **Step 1: Escribir el test del parser puro (falla primero)**

Crear `backend/test/agent-catalog.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentCategory } from '../lib/agent-catalog.js';

test('parseAgentCategory extrae la categoría del frontmatter', () => {
  const content = '---\nname: laravel-dev\nversion: "2.0"\ncategory: aplicaciones\ndescription: |\n  algo\n---\n';
  assert.equal(parseAgentCategory(content), 'aplicaciones');
});

test('parseAgentCategory devuelve null si no hay categoría', () => {
  const content = '---\nname: x\n---\n';
  assert.equal(parseAgentCategory(content), null);
});

test('parseAgentCategory devuelve null con contenido vacío', () => {
  assert.equal(parseAgentCategory(''), null);
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `node --test backend/test/agent-catalog.test.js`
Expected: FAIL — `Cannot find module '../lib/agent-catalog.js'`

- [ ] **Step 3: Implementar `agent-catalog.js`**

```js
export function parseAgentCategory(content) {
  if (!content) return null;
  const match = content.match(/^category:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `node --test backend/test/agent-catalog.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Escribir el test de la ruta (falla primero)**

Crear `backend/test/agents-routes.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';

import { createAgentsRouter } from '../routes/agents.js';

async function withApi(run, { files } = {}) {
  const readdirFn = async () => Object.keys(files ?? {});
  const readFileFn = async (p) => {
    const name = p.split(/[\\/]/).pop();
    if (!(name in (files ?? {}))) throw new Error('ENOENT');
    return files[name];
  };

  const app = express();
  app.use('/api/agents', createAgentsRouter({ agentsDir: '/fake/agents', readdirFn, readFileFn }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request() {
    const response = await fetch(`${baseUrl}/api/agents`);
    const payload = await response.json();
    return { response, payload };
  }

  try {
    await run({ request });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('GET /api/agents lista agentes con nombre y categoría', async () => {
  await withApi(async ({ request }) => {
    const { response, payload } = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(
      payload.agents.sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: 'laravel-dev', category: 'aplicaciones' },
        { name: 'networking', category: 'red' },
      ],
    );
  }, {
    files: {
      'laravel-dev.md': '---\ncategory: aplicaciones\n---\n',
      'networking.md': '---\ncategory: red\n---\n',
      'ignorar.txt': 'no es .md, no debería listarse',
    },
  });
});

test('GET /api/agents con directorio vacío devuelve lista vacía (no es error)', async () => {
  await withApi(async ({ request }) => {
    const { response, payload } = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.agents, []);
  }, { files: {} });
});
```

Nota: el fixture de `readdirFn` en este test devuelve todos los nombres de `files`
(incluyendo `ignorar.txt`) a propósito — la implementación debe filtrar por `.md` ella
misma, no confiar en que el directorio ya venga filtrado.

- [ ] **Step 6: Correr el test y confirmar que falla**

Run: `node --test backend/test/agents-routes.test.js`
Expected: FAIL — `Cannot find module '../routes/agents.js'`

- [ ] **Step 7: Implementar `backend/routes/agents.js`**

```js
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';

import { parseAgentCategory } from '../lib/agent-catalog.js';

export function createAgentsRouter({
  agentsDir = path.join(os.homedir(), '.claude', 'agents'),
  readdirFn = readdir,
  readFileFn = readFile,
} = {}) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const entries = await readdirFn(agentsDir).catch(() => []);
      const mdFiles = entries.filter(name => name.endsWith('.md'));
      const agents = [];
      for (const fileName of mdFiles) {
        const content = await readFileFn(path.join(agentsDir, fileName), 'utf8').catch(() => '');
        agents.push({
          name: fileName.replace(/\.md$/, ''),
          category: parseAgentCategory(content),
        });
      }
      res.json({ agents });
    } catch (error) {
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
}

export default createAgentsRouter();
```

- [ ] **Step 8: Correr los tests y confirmar que pasan**

Run: `node --test backend/test/agents-routes.test.js`
Expected: PASS (2 tests)

- [ ] **Step 9: Montar la ruta en `server.js`**

Agregar import (junto a `sessionsRouter`):

```js
import agentsRouter    from './routes/agents.js';
```

Y el `app.use`:

```js
app.use('/api/agents',   agentsRouter);
```

- [ ] **Step 10: Commit**

```bash
git add backend/lib/agent-catalog.js backend/routes/agents.js backend/test/agent-catalog.test.js backend/test/agents-routes.test.js backend/server.js
git commit -m "feat(agents): endpoint GET /api/agents (Gap 2 — catálogo de agentes IA)"
```

---

### Task 4: Tab "Agentes" en el frontend (Gap 2 — frontend)

**Files:**
- Create: `frontend/modules/tabs/agents.js`
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`

**Interfaces:**
- Consumes: `GET /api/agents` (Task 3), respuesta `{ agents: [{name, category}] }`.
- Produces: `initAgents()`, `loadAgents()` exportados.

- [ ] **Step 1: Agregar el botón de nav + panel en `index.html`**

En `frontend/index.html`, agregar el botón de nav dentro del grupo `WORKSPACE` (después del
botón `data-tab="gobernanza"`, línea ~63, antes del `<div class="nav-divider">`):

```html
        <button class="tab-btn nav-item" data-tab="agentes" title="Agentes IA">
          <span class="nav-icon">◇</span>
          <span class="nav-label">Agentes IA</span>
        </button>
```

Y el panel (después del cierre del `<!-- Tab: APIs VCC -->` en la línea 278, antes de
`<!-- Tab: Inventario -->`):

```html
      <!-- Tab: Agentes IA -->
      <div class="tab-panel hidden" id="tab-agentes">
        <div class="view-toolbar apis-toolbar">
          <div class="view-toolbar-start">
            <span class="view-section-label">Agentes IA</span>
            <span class="apis-subtitle" id="agentes-subtitle">~/.claude/agents/</span>
          </div>
        </div>
        <div id="agentes-container"></div>
      </div>
```

- [ ] **Step 2: Implementar `frontend/modules/tabs/agents.js`**

```js
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
```

- [ ] **Step 3: Wirear en `app.js`**

Agregar el import (junto a `initApis, loadApis`):

```js
import { initAgents, loadAgents } from './modules/tabs/agents.js';
```

En `initTabs({ onTabChange: (tab) => { ... } })`, agregar junto a `if (tab === 'apis')
loadApis();`:

```js
      if (tab === 'agentes') loadAgents();
```

En `init()`, junto a `initApis();`:

```js
  initAgents();
```

- [ ] **Step 4: Verificación manual en vivo (Playwright)**

Con el backend corriendo, navegar a la tab "Agentes IA". Confirmar que se listan los ~20
agentes reales de `~/.claude/agents/` con su categoría, ordenados alfabéticamente.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/agents.js frontend/index.html frontend/app.js
git commit -m "feat(agents): tab Agentes IA en el frontend (Gap 2 frontend)"
```

---

### Task 5: `open-ssh` y `open-claude-cli` (Gap 3 + Gap 4 — backend)

**Files:**
- Modify: `backend/routes/projects.js`
- Modify: `backend/test/projects-routes.test.js`

**Interfaces:**
- Produces: `POST /api/projects/:id/open-ssh` (body `{ host, user }`).
- Produces: `POST /api/projects/open-claude-cli` (sin body).
- Consumes: `spawnProcess` ya inyectable en `createProjectsRouter` (usado por
  `open-vscode`, se reusa para ambas rutas nuevas).

- [ ] **Step 1: Escribir los tests de las 2 rutas nuevas (fallan primero)**

Agregar al final de `backend/test/projects-routes.test.js` (antes del último `test(...)` de
error 500, o al final del archivo):

```js
test('POST /api/projects/:id/open-ssh spawnea ssh con host/user válidos', async () => {
  const calls = [];
  const spawnProcess = (...args) => { calls.push(args); return { unref() {} }; };
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/projects/alpha/open-ssh', {
      host: '172.16.100.1',
      user: 'cvalera',
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(' '), /ssh cvalera@172\.16\.100\.1/);
  }, { spawnProcess });
});

test('POST /api/projects/:id/open-ssh rechaza host con caracteres inválidos', async () => {
  const calls = [];
  const spawnProcess = (...args) => { calls.push(args); return { unref() {} }; };
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/projects/alpha/open-ssh', {
      host: '172.16.100.1; rm -rf /',
      user: 'cvalera',
    });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  }, { spawnProcess });
});

test('POST /api/projects/open-claude-cli spawnea una terminal con claude', async () => {
  const calls = [];
  const spawnProcess = (...args) => { calls.push(args); return { unref() {} }; };
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/projects/open-claude-cli');
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(' '), /claude/);
  }, { spawnProcess });
});
```

Este archivo ya tiene `withApi` con un parámetro de opciones — hay que extenderlo para
aceptar `spawnProcess` y pasarlo a `createProjectsRouter`. Modificar la firma de `withApi` en
ese mismo archivo (línea 43):

```js
async function withApi(run, { currentProjectId = 'alpha', handoverProjectId = 'alpha', spawnProcess } = {}) {
```

Y la construcción del router (línea 56):

```js
  app.use('/api/projects', createProjectsRouter({ store, currentProjectPath, handoverPath, spawnProcess }));
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `node --test backend/test/projects-routes.test.js`
Expected: FAIL en los 3 tests nuevos — `404` en vez de `200`/`400` (las rutas no existen
todavía).

- [ ] **Step 3: Implementar las 2 rutas en `backend/routes/projects.js`**

Agregar dentro de `createProjectsRouter`, después de la ruta `open-vscode` (después del
cierre de `router.post('/:id/environments/:env/open-vscode', ...)`, antes de `return
router;`):

```js
  router.post('/:id/open-ssh', async (req, res) => {
    try {
      const { host, user } = req.body ?? {};
      requireString(host, 'host');
      requireString(user, 'user');
      if (!/^[A-Za-z0-9._-]+$/.test(host)) throw new HttpError(400, 'host contiene caracteres inválidos');
      if (!/^[A-Za-z0-9._-]+$/.test(user)) throw new HttpError(400, 'user contiene caracteres inválidos');

      const child = spawnProcess(
        'pwsh',
        ['-NoExit', '-Command', `ssh ${user}@${host}`],
        { detached: true, stdio: 'ignore' },
      );
      child.unref();
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/open-claude-cli', (req, res) => {
    const child = spawnProcess(
      'pwsh',
      ['-NoExit', '-Command', `Set-Location '${WORKSPACE_ROOT}'; claude`],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();
    res.json({ ok: true });
  });
```

**Importante — orden de rutas Express:** `/open-claude-cli` debe declararse en el router
raíz de `/api/projects`, no bajo `/:id/...` — como no tiene parámetro `:id`, y Express no
tiene otra ruta `POST /` en este router que pueda chocar (la única es `router.post('/',
...)` para crear proyectos, que es una ruta distinta), no hay colisión real, pero conviene
declararla después de las rutas con `:id` para mantener el archivo legible (todas las
acciones de "abrir algo" agrupadas).

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `node --test backend/test/projects-routes.test.js`
Expected: PASS (todos, incluidos los 3 nuevos)

- [ ] **Step 5: Commit**

```bash
git add backend/routes/projects.js backend/test/projects-routes.test.js
git commit -m "feat(projects): open-ssh y open-claude-cli (Gap 3 + Gap 4 — backend)"
```

---

### Task 6: Render de `access` + botones SSH/Claude CLI (Gap 3 + Gap 4 — frontend)

**Files:**
- Modify: `frontend/modules/tabs/projects.js`

**Interfaces:**
- Consumes: `POST /api/projects/:id/open-ssh`, `POST /api/projects/open-claude-cli`
  (Task 5).

- [ ] **Step 1: Reemplazar el bloque de `access` en el editor (JSON crudo → estructurado)**

En `frontend/modules/tabs/projects.js`, reemplazar (alrededor de la línea 657):

```js
  if (project.access && project.environments === undefined) {
    const access = document.createElement('div');
    access.className = 'project-access-readonly';
    access.innerHTML = '<div class="project-subtitle">ACCESS · SOLO LECTURA</div>' +
      `<pre>${escHtml(JSON.stringify(project.access, null, 2))}</pre>`;
    content.appendChild(access);
  } else {
```

Por:

```js
  if (project.access && project.environments === undefined) {
    const access = document.createElement('div');
    access.className = 'project-access-readonly';
    access.innerHTML = '<div class="project-subtitle">ACCESOS</div>';
    for (const acc of project.access) {
      const row = document.createElement('div');
      row.className = 'env-block-field';
      if (acc.method === 'web') {
        row.innerHTML =
          `<span class="env-field-label">web</span>` +
          `<a class="env-field-value mono" href="${escHtml(acc.url)}" target="_blank" rel="noopener">${escHtml(acc.label || acc.url)}</a>`;
      } else if (acc.method === 'ssh') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost btn-project-secondary';
        btn.textContent = `⬡ Conectar SSH (${acc.user}@${acc.host})`;
        btn.addEventListener('click', () => openSsh(acc.host, acc.user, btn));
        row.innerHTML = `<span class="env-field-label">ssh</span>`;
        row.appendChild(btn);
      } else {
        row.innerHTML =
          `<span class="env-field-label">${escHtml(acc.method)}</span>` +
          `<span class="env-field-value mono">${escHtml(acc.host || acc.url || '')}</span>`;
      }
      access.appendChild(row);
    }
    content.appendChild(access);
  } else {
```

- [ ] **Step 2: Implementar `openSsh()` junto a `openVSCode()`**

El bloque de `access` del Step 1 vive dentro de la misma función que ya recibe `project`
como parámetro (la función que contiene `if (project.access && project.environments ===
undefined)` — es la que renderiza el detalle/editor de un proyecto, ya tiene `project.id`
en scope). El `addEventListener` del Step 1 ya pasa `project.id` como primer argumento:

```js
        btn.addEventListener('click', () => openSsh(project.id, acc.host, acc.user, btn));
```

Agregar `openSsh` después de la función `openVSCode` existente (después de su cierre, línea
~394):

```js
async function openSsh(projectId, host, user, btn) {
  btn.disabled = true;
  btn.textContent = '⬡ conectando…';
  try {
    await fetch(`${API_BASE}/api/projects/${projectId}/open-ssh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, user }),
    });
  } catch { /* silencioso — la terminal puede haberse abierto igual */ }
  setTimeout(() => {
    btn.textContent = `⬡ Conectar SSH (${user}@${host})`;
    btn.disabled = false;
  }, 1500);
}
```

- [ ] **Step 3: Verificación manual en vivo (Playwright)**

Con el backend corriendo, ir a Proyectos → abrir el editor de `fortigate-nre` (Gestionar o
el acordeón de detalle, según dónde viva este bloque en la UI actual). Confirmar: el método
`web` se ve como link clickeable que abre `https://172.16.100.1` en pestaña nueva; el
método `ssh` se ve como botón "Conectar SSH (cvalera@172.16.100.1)". Click en el botón: no
hace falta confirmar que el SSH conecta de verdad (requiere estar en la red de NRE) — alcanza
con confirmar que no tira error 400/500 en la consola del navegador.

- [ ] **Step 4: Commit**

```bash
git add frontend/modules/tabs/projects.js
git commit -m "feat(projects): render accionable de access (web link + SSH) — Gap 3 frontend"
```

---

### Task 7: Verificación end-to-end de los 4 gaps

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Correr toda la suite de tests backend**

Run: `node --test backend/test/`
Expected: todos los tests PASS (incluye los preexistentes de `projects-routes.test.js` y
`registry-store.test.js` más los 4 archivos nuevos de esta sesión).

- [ ] **Step 2: Correr toda la suite de tests frontend**

Run: `node --test frontend/test/`
Expected: todos los tests PASS (preexistentes `activity-rail.test.js`,
`opsmap-impact.test.js` — sin tests frontend nuevos en este plan, ya que los 3 cambios de UI
son render DOM sin lógica pura nueva que testear con `node:test`).

- [ ] **Step 3: Levantar VCC y verificar los 4 gaps con Playwright, en una sola pasada**

```bash
cd backend && npm start
```

Con Playwright (`browser_navigate` a `http://localhost:8080`):
1. Tab "Sesión actual": escribir una nota, click "Guardar sesión", confirmar banner de éxito
   y que `sessions/<proyecto activo>/active.md` cambió.
2. Mismo tab: click "Abrir Claude CLI", confirmar que no tira error (una terminal nueva se
   abre en el sistema, fuera del alcance de Playwright verificar el contenido de esa
   ventana).
3. Tab "Agentes IA": confirmar que lista ~20 agentes con categoría.
4. Tab "Proyectos" → `fortigate-nre`: confirmar link `web` clickeable y botón SSH presente,
   sin errores de consola al hacer click.

- [ ] **Step 4: Actualizar el hallazgo colateral de `sync-status` (si se decide resolver ahora)**

Este punto quedó anotado como "fuera de alcance" en el spec — no es parte de este plan.
Confirmar que sigue anotado en `docs/superpowers/specs/2026-07-13-launcher-parity-gaps-design.md`
y no requiere acción acá.

- [ ] **Step 5: Commit final si hubo ajustes de la verificación**

```bash
git status
# Si hay cambios pendientes de la verificación (fixes menores encontrados en vivo):
git add -A
git commit -m "fix: ajustes encontrados en verificación end-to-end de los 4 gaps"
```

---

## Self-Review (completado durante la escritura del plan)

**Cobertura del spec:** Gap 1 (Tasks 1-2), Gap 2 (Tasks 3-4), Gap 3 (Tasks 5-6), Gap 4
(Tasks 5-6, comparte archivo con Gap 3 por tocar `projects.js`/`open-*`) — los 4 gaps del
spec corregido (`2026-07-13-launcher-parity-gaps-design.md`) tienen tarea. El hallazgo
colateral de `sync-status` queda fuera, tal como dice el spec.

**Placeholders:** el único bloque de código con una corrección intencional a mitad de task
(Task 6, Step 2) está marcado explícitamente como "código a corregir antes de commitear" con
el código final completo inmediatamente después — no es un placeholder sin resolver, es
parte deliberada del paso a paso TDD-manual para que quien ejecute entienda por qué
`projectId` tiene que venir del scope y no inventarse.

**Consistencia de tipos:** `createXRouter({ deps })` + `export default createXRouter()` es
idéntico en `sessions.js`, `agents.js` y las rutas nuevas de `projects.js` (que reusa la
factory ya existente). `spawnProcess` mantiene la misma firma `(command, args, options) ->
{ unref() }` en las 3 rutas que spawnean procesos (`open-vscode` ya existente, `open-ssh`,
`open-claude-cli`).
