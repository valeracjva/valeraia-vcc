# VCC — Paridad funcional con el launcher PowerShell (4 gaps)

## Contexto

`AI-Workspace` está formalizándose como ValeraOS (ver ADR-010 en el workspace). Parte del
roadmap es retirar `launch-ai-workspace.ps1` (el launcher interactivo de PowerShell) sin
migrarlo al kernel — su reemplazo es VCC, decisión ya vigente desde ADR-009 (2026-06-18).

Antes de retirarlo hay que cerrar los gaps funcionales reales que el launcher cubre y VCC
todavía no. Se auditó el launcher completo (`scripts/launcher-infra/launch-ai-workspace.ps1`,
904 líneas) contra el estado actual de VCC (`D:\Workspace-Repos\workspace-ui`) y se
encontraron 4 gaps reales — el resto de las funciones del launcher (túneles, inventario,
health check SSH, abrir VS Code) ya están cubiertas por VCC con superset de funcionalidad.

**Corrección post-exploración:** se asumió inicialmente que abrir VS Code/Claude CLI/una
terminal SSH quedaba fuera de alcance por un límite navegador-vs-escritorio. Es falso: el
backend de VCC (Node) corre en la propia PC de Carlos, no en un servidor remoto — **ya**
spawnea procesos de escritorio reales (`backend/routes/projects.js:272`,
`POST /:id/environments/:env/open-vscode` hace `spawn('code', ['--remote', ...], {detached:
true})`, con botón real en el frontend). No hay límite técnico. Por eso el "Gap 3" original
(ssh/rdp de FortiGate) se resuelve con el mismo mecanismo, y se agrega un "Gap 4" nuevo
(abrir Claude CLI) que en el launcher original SÍ existía (`Start-ClaudeCLI`) y no se había
detectado en la primera pasada de la auditoría.

## Gap 1 — Guardar sesión

El launcher permite, al confirmar la apertura de un ambiente, escribir un "punto de
reanudación" en texto libre a `sessions/<projectId>/active.md` y regenerar
`runtime/context-bundle.md` vía `build-ai-context.ps1`. VCC no tiene equivalente — la tab
"Sesión actual" (Briefing) solo *lee* `HANDOVER.md`, nunca escribe notas de sesión.

### Diseño

- **Backend:** nueva ruta `POST /api/sessions/:projectId/save` (`backend/routes/sessions.js`,
  archivo nuevo).
  - Body: `{ environment: string, resumen: string }`.
  - Valida `projectId` y `environment` contra `global/projects-registry.json` (mismo patrón
    de validación que ya usa `projects.js`) — evita path traversal, ya que `projectId` define
    la carpeta destino.
  - Si `resumen` es vacío/whitespace: no escribe nada, responde `200 { skipped: true }`
    (paridad con el launcher: "Enter = mantener" no toca el archivo).
  - Si hay contenido: escribe `sessions/<projectId>/active.md` con el mismo template que usa
    hoy el launcher (`# Sesión activa — <projectId>` + fecha + resumen + ambiente activo).
  - Después spawnea `build-ai-context.ps1 -ProjectId <id> -Environment <env> -AIProfile
    claude-code -Json` **directamente** (child_process propio dentro de la ruta, no a través
    del runner `/api/govern/run`) — ese runner es un job global de un solo slot pensado para
    scripts largos con streaming por WebSocket a la tab Gobernanza; esta es una acción rápida
    que no debe bloquearse si hay un script de gobernanza corriendo, ni ocupar ese slot.
  - Devuelve `{ ok: true, bundlePath }` si el script sale con exit code 0, parseando su salida
    `-Json` (`{timestamp,bundlePath,lines,exitCode}`, ver contrato del script en
    `valeraia-kernel/core/governance/build-ai-context.ps1`).
  - Si el script sale con exit code 1 o 2: responde `500` con el mensaje de stderr. El
    `active.md` ya escrito **no se revierte** — mismo comportamiento que el launcher, que
    trata "guardar nota" y "regenerar bundle" como pasos independientes.
- **Frontend:** en `frontend/modules/tabs/briefing.js`, agregar un textarea "Punto de
  reanudación" + botón "Guardar sesión". Al click, llama al endpoint y muestra confirmación o
  error inline (mismo patrón de banner que ya usan Inventario/Túneles/Proyectos).
- **Path del script:** agregar `'build-ai-context'` a `SCRIPTS` en `backend/config.js`, mismo
  patrón que las demás entradas (`process.env.VALERAIA_KERNEL ? path.join(...) : 'ruta
  legacy'`) — el script ya está migrado al kernel (`core/governance/build-ai-context.ps1`).

## Gap 2 — Tab Agentes

El launcher lista los 20 agentes de `~/.claude/agents/*.md` con su categoría (menú
Herramientas, opción `[6]`). VCC no tiene tab ni vista equivalente — solo la acción de
gobernanza `compile-agents` (que regenera `AGENTS.md`, no lista agentes).

### Diseño

- **Backend:** nueva ruta `GET /api/agents` (`backend/routes/agents.js`, archivo nuevo). Lee
  `~/.claude/agents/*.md`, parsea el frontmatter `category:` de las primeras ~20 líneas de
  cada archivo (mismo criterio que usa el launcher). Sin cache — 20 archivos chicos, leídos on
  demand en cada request.
  - Si el directorio no existe o está vacío: `200` con lista vacía (no es un error real, mismo
    criterio que el launcher con `$afs` vacío).
- **Frontend:** nueva tab `frontend/modules/tabs/agents.js` + entrada de nav junto a
  Gobernanza/MCPs. Cards con nombre + categoría, alcance de solo lectura — **paridad exacta**
  con el launcher, sin agregar descripción ni contenido del agente (decisión explícita:
  YAGNI, se puede sumar después si hace falta).

## Gap 3 — Link de FortiGate (categoría `infraestructura` con esquema `access`)

Del registry actual (18 proyectos), **solo `fortigate-nre`** usa el esquema `access` (lista de
`{method, url|host, user, label}` con métodos `web`/`ssh`) en vez de `environments`. El resto
de proyectos con `category: infraestructura` (`monitoreo`, `infra-it`) en realidad usan
`environments` como cualquier proyecto de desarrollo — no hay un gap de categorización real
más allá de este único caso.

VCC ya maneja el caso `project.access && project.environments === undefined` en el editor de
Proyectos (`frontend/modules/tabs/projects.js:657`), pero solo vuelca el `access` completo
como JSON crudo de solo lectura (`<pre>`).

De los dos métodos presentes en `fortigate-nre` (`web`, `ssh`): `web` es un link trivial de
abrir en el navegador. `ssh` se resuelve igual que el launcher original (`Start-InfraAction`,
caso `"ssh"`): spawnear una terminal local con el comando `ssh user@host`.

### Diseño

- **Backend:** nueva ruta `POST /api/projects/:id/open-ssh` (agregada a
  `backend/routes/projects.js`, mismo archivo que ya tiene `open-vscode`). Body:
  `{ host, user }` (vienen del `access` del proyecto, ya validado por `validateProject` al
  guardarse). Valida `host`/`user` contra el mismo patrón de caracteres seguros que ya usa
  `open-vscode` (`/^[A-Za-z0-9._-]+$/`). Spawnea `pwsh -NoExit -Command "ssh ${user}@${host}"`
  (`detached: true, stdio: 'ignore'`, mismo patrón que `open-vscode`). Responde `{ ok: true }`.
- **Frontend:** en `frontend/modules/tabs/projects.js`, reemplazar el bloque
  `<pre>${JSON crudo}</pre>` por un render estructurado de `project.access`:
  - método `web` → `<a href="${url}" target="_blank" rel="noopener">${label || url}</a>`.
  - método `ssh`/`rdp` → botón "Conectar SSH" que llama a `POST /api/projects/:id/open-ssh`
    (rdp queda documentado como manual si aparece — hoy no hay ningún registro con `rdp`, no
    se construye soporte especulativo para un caso sin dato real, YAGNI).

## Gap 4 — Abrir Claude CLI

El launcher (`Start-ClaudeCLI`) abre una terminal local con `claude` corriendo, con directorio
de trabajo en la raíz de `AI-Workspace` (no en el remotePath del ambiente — a diferencia de
VS Code, Claude Code opera sobre el propio AI-Workspace). VCC no tiene equivalente.

### Diseño

- **Backend:** nueva ruta `POST /api/projects/open-claude-cli` (sin `:id`, ya que no depende
  del proyecty/ambiente — mismo criterio que el launcher, que la ofrece como acción global
  `[C]` además de por-ambiente). Spawnea `pwsh -NoExit -Command "Set-Location '$WORKSPACE_ROOT';
  claude"` (`detached: true, stdio: 'ignore'`, mismo patrón que `open-vscode`/`open-ssh`).
  Responde `{ ok: true }`.
- **Frontend:** botón "Abrir Claude CLI" en la tab "Sesión actual" (Briefing) — mismo lugar
  donde vive el botón "Guardar sesión" del Gap 1, ya que ambas son acciones sobre la sesión
  activa de trabajo.

## Testing

Mismo patrón que ya usa VCC (funciones puras con `node:test`, verificación real con
Playwright antes de dar por cerrado — ver `frontend/test/opsmap-impact.test.js` como
precedente):

- **Gap 1:** test unitario del builder del template de `active.md` (función pura
  `{projectId, environment, resumen, fecha} → string`, sin mockear filesystem). Verificación
  en vivo con Playwright: guardar sesión real en un proyecto de prueba, confirmar que
  `sessions/<id>/active.md` cambió y `runtime/context-bundle.md` se regeneró (timestamp
  nuevo).
- **Gap 2:** test unitario del parser de `category:` en frontmatter (casos: con categoría, sin
  categoría, archivo vacío). Verificación en vivo: la tab muestra los ~20 agentes reales.
- **Gap 3:** test de la ruta `POST /api/projects/:id/open-ssh` con `spawnProcess` inyectado
  (mismo patrón que ya usa `backend/test/projects-routes.test.js` para `open-vscode`: fake que
  registra la llamada, sin spawnear un proceso real en el test) — casos: host/user válidos
  (200, spawn llamado con los args esperados), host con caracteres inválidos (400, spawn no
  llamado). Verificación visual con Playwright: la card de `fortigate-nre` muestra el link
  `web` clickeable y el botón "Conectar SSH".
- **Gap 4:** mismo patrón que Gap 3 para `POST /api/projects/open-claude-cli` con
  `spawnProcess` inyectado. Verificación en vivo: click en "Abrir Claude CLI" abre una
  terminal nueva con `claude` corriendo en `AI-Workspace`.

No se agrega infraestructura de testing nueva.

## Fuera de alcance (explícito)

- Automatizar `rdp` (sin dato real en el registry hoy — YAGNI, ver Gap 3).
- Cache de `/api/agents` (20 archivos chicos, no justifica la complejidad — YAGNI).
- Vistas de categoría separadas (Desarrollo/Infraestructura/Monitoreo/Chatbot) tipo el
  launcher — la tab Proyectos de VCC ya muestra `category` como texto en cada card y agrupa
  por empresa; no se encontró necesidad real de vistas separadas por categoría más allá del
  caso puntual de `fortigate-nre` (Gap 3).
- El retiro efectivo de `launch-ai-workspace.ps1` + `generate-open-scripts.ps1` +
  `open-*.ps1` + aliases del perfil — es el paso siguiente después de que estos 3 gaps estén
  mergeados a `master`, no parte de este spec.

## Hallazgo colateral (no bloqueante)

`backend/config.js` (`SCRIPTS['sync-status']`) todavía apunta a
`scripts/workspace/sync/sync-status.ps1` — ese script fue retirado y fusionado en
`workspace-health.ps1` en la sesión de migración del kernel (2026-07-13, ver
`[[project_valeraos_kernel]]`). Sigue funcionando porque el legacy quedó como shim que
redirige a `workspace-health`, pero conceptualmente esa entrada de `SCRIPTS` (y el botón
correspondiente en la tab Gobernanza, si existe) debería apuntar directo a `workspace-health`
o eliminarse. Fuera de alcance de este spec — anotar como pendiente suelto.
