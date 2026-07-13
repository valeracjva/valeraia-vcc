# VCC — Paridad funcional con el launcher PowerShell (3 gaps)

## Contexto

`AI-Workspace` está formalizándose como ValeraOS (ver ADR-010 en el workspace). Parte del
roadmap es retirar `launch-ai-workspace.ps1` (el launcher interactivo de PowerShell) sin
migrarlo al kernel — su reemplazo es VCC, decisión ya vigente desde ADR-009 (2026-06-18).

Antes de retirarlo hay que cerrar los gaps funcionales reales que el launcher cubre y VCC
todavía no. Se auditó el launcher completo (`scripts/launcher-infra/launch-ai-workspace.ps1`,
904 líneas) contra el estado actual de VCC (`D:\Workspace-Repos\workspace-ui`) y se
encontraron 3 gaps reales — el resto de las funciones del launcher (túneles, inventario,
health check SSH) ya están cubiertas por VCC con superset de funcionalidad.

**Fuera de alcance explícito:** abrir VS Code o Claude CLI desde el launcher no se migra —
es un límite real navegador-vs-escritorio (VCC es una página web, no puede spawnear ventanas
de escritorio del sistema operativo del operador). Queda como acción manual documentada.

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
abrir en el navegador. `ssh` tiene la misma limitación navegador-vs-escritorio que VS Code/
Claude CLI (fuera de alcance, ver Contexto) — no se automatiza.

### Diseño

- Sin cambios de backend — el dato ya viaja tal cual en `GET /api/projects`.
- En `frontend/modules/tabs/projects.js`, reemplazar el bloque `<pre>${JSON crudo}</pre>` por
  un render estructurado de `project.access`:
  - método `web` → `<a href="${url}" target="_blank" rel="noopener">${label || url}</a>`.
  - método `ssh`/`rdp` → texto plano `${user}@${host}` con nota visual "acción manual" (sin
    botón, sin intento de automatizar).

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
- **Gap 3:** sin lógica nueva testeable con `node:test` (es render DOM puro). Verificación
  visual con Playwright: la card de `fortigate-nre` muestra el link `web` clickeable y el
  texto `ssh` sin botón.

No se agrega infraestructura de testing nueva.

## Fuera de alcance (explícito)

- Abrir VS Code o Claude CLI desde VCC (límite navegador-vs-escritorio, ver Contexto).
- Automatizar conexiones `ssh`/`rdp` desde el navegador (mismo límite, ver Gap 3).
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
