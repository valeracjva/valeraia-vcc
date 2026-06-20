# VCC Sesión 3 — M2 Proyectos + M3 Gobernanza — Spec

**Fecha:** 2026-06-19
**Proyecto:** ValeraIA Command Center (VCC)
**Sesión:** 3 de 4 (Fase 1 MVP)
**Relacionado:** `docs/superpowers/specs/2026-06-19-vcc-sesion2-frontend-m1-design.md`
**Estado:** Aprobado — listo para implementación

---

## Objetivo

Construir el área `<main>` del VCC con dos vistas navegables por tabs: M2 (catálogo de proyectos con acción abrir VS Code) y M3 (panel de gobernanza con ejecución de scripts en tiempo real vía WebSocket). Incluye estado real de túneles SSH en el sidebar.

---

## Archivos que se crean / modifican

```
workspace-ui/
├── frontend/
│   ├── index.html          ← +tabs nav, +tunnel dot IDs dinámicos
│   ├── style.css           ← +tabs, +project cards, +terminal panel, +tunnel dots
│   └── app.js              ← +WebSocket client, +tabs, +render M2, +render M3, +tunnel poll
├── backend/
│   ├── server.js           ← +http.Server capture, +WebSocket attach (ws package)
│   ├── config.js           ← +SCRIPTS map, +TUNNEL_PORTS
│   └── routes/
│       ├── projects.js     ← NEW: POST /:id/environments/:env/open-vscode
│       ├── govern.js       ← NEW: POST /run
│       └── tunnels.js      ← NEW: GET / (TCP check 3307-3310)
```

---

## Layout

```
┌─[header 48px]──────────────────────────────────────────────────┐
│  ◆ VCC  │  ROG-STRIX  │                             ● fresh   │
├─[sidebar 280px]────────┬─[main flex-1]──────────────────────────┤
│  ESTADO HANDOVER       │  [Proyectos]  [Gobernanza]  ← tabs    │
│  PROYECTO ACTIVO       │                                        │
│  PENDIENTES            │  <contenido del tab activo>            │
│  TÚNELES (dots reales) │                                        │
│  HOST                  │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

Los tabs viven en la parte superior del `<main>`. El tab activo muestra borde inferior en `--green`. Cambiar de tab no recarga datos ya cargados.

---

## Backend — nuevas rutas y dependencias

### Dependencia nueva

```
ws  (WebSocket server/client para Node.js)
npm install ws
```

### server.js — captura del http.Server

`app.listen()` devuelve un `http.Server`. Hay que capturarlo para adjuntar el WebSocket server:

```js
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// handler WebSocket (ver govern.js para el protocolo)
wss.on('connection', (ws) => { /* ... */ });

httpServer.listen(SERVER.port, SERVER.host, () => { /* startup log */ });
```

El WebSocket queda disponible en `ws://localhost:8080` — mismo puerto que la API y el frontend. No se abre un puerto adicional.

### config.js — adiciones

```js
export const SCRIPTS = {
  'workspace-health': 'scripts/workspace/governance/workspace-health.ps1',
  'compile-agents':   'scripts/workspace/governance/compile-agents-md.ps1',
  'web-context':      'scripts/workspace/governance/generate-web-context.ps1',
  'sync-status':      'scripts/workspace/sync/sync-status.ps1',
  'cierre':           'scripts/workspace/governance/close-session.ps1',
};

export const TUNNEL_PORTS = [3307, 3308, 3309, 3310];
```

El `cwd` para todos los scripts es `WORKSPACE_ROOT` (ya exportado desde config.js como la raíz de AI-Workspace).

### routes/tunnels.js — GET /

Chequea cada puerto de `TUNNEL_PORTS` vía `net.createConnection` con timeout 500ms. Devuelve:

```json
{
  "3307": true,
  "3308": false,
  "3309": false,
  "3310": false
}
```

`true` = conexión establecida (túnel activo), `false` = ECONNREFUSED o timeout.

### routes/projects.js — POST /:id/environments/:env/open-vscode

1. Busca el proyecto por `id` y el ambiente por `name` en el registry.
2. Extrae `host` y `remotePath` del ambiente.
3. Valida que ambos existan; si no: `400 { error: 'host o remotePath no definido' }`.
4. Spawna:
   ```js
   spawn('code', ['--remote', `ssh-remote+${host}`, remotePath], { shell: true, detached: true, stdio: 'ignore' })
   ```
   `shell: true` es necesario en Windows porque `code` es un `.cmd`. `detached: true` + `stdio: 'ignore'` + `.unref()` para que el proceso no quede atado al servidor Node.
5. Devuelve `200 { ok: true }` inmediatamente (no espera que VS Code abra).
6. Si el spawn falla (error de sistema, no de VS Code): `500 { error: '...' }`.

**Proyectos sin remotePath** (ej: `infra-it`, `fortigate-nre`): el botón no aparece en el frontend. El frontend filtra ambientes que tengan `host` y `remotePath` definidos.

### routes/govern.js — POST /run + protocolo WebSocket

**POST /run:**

```json
Request:  { "script": "workspace-health" }
Response: { "jobId": "ws-1718900000000" }  // 202 Accepted
         { "error": "script desconocido" } // 400
         { "error": "ya hay un script corriendo" } // 409
```

Solo un script puede correr a la vez (variable de estado en el módulo). Si ya hay uno activo: `409`.

**Protocolo WebSocket (server → clients):**

Todos los clientes conectados reciben los mensajes del job activo:

```json
{ "type": "output", "jobId": "ws-xxx", "data": "línea de stdout/stderr\n" }
{ "type": "done",   "jobId": "ws-xxx", "exitCode": 0 }
{ "type": "error",  "jobId": "ws-xxx", "message": "spawn falló" }
```

El backend no distingue stdout de stderr en el output — ambos van al mismo stream `data`. El script se spawna con:

```js
spawn('pwsh', ['-NoProfile', '-File', fullScriptPath], {
  cwd: PATHS.workspaceRoot,
  stdio: ['ignore', 'pipe', 'pipe']
})
```

`stdout` y `stderr` del proceso se pasan línea por línea via `readline` y se emiten como mensajes `output`. Al cerrar el proceso: `done` con el exit code.

**El frontend no envía mensajes al servidor por WebSocket** — la conexión es de solo lectura desde el browser. El "stop" queda fuera del scope de Sesión 3.

---

## Frontend — M2 Proyectos

### Agrupación por cliente

| Clave registry | Label en VCC |
|---|---|
| `digna-fincos` | DIGNA / FINCOS |
| `fatapp` | FATAPP |
| `nexo` | NEXO |
| `nre` | NRE |
| `all` | WORKSPACE |

Orden de grupos: digna-fincos → fatapp → nexo → nre → all.

### Render de proyecto

```
▼ DIGNA / FINCOS  (9 proyectos)
  ┌─────────────────────────────────────────────────────┐
  │ fincos-one                               laravel    │
  │                                                     │
  │  [test · srv-appstest]  [⬡ VS Code]                │
  │  [desa · srv-appstest]  [⬡ VS Code]                │
  │  [prod · srv-appsprod ▲▲▲ crítico]  [⬡ VS Code]   │
  └─────────────────────────────────────────────────────┘
```

- Ambientes sin `host` + `remotePath`: se muestran sin botón VS Code.
- Badge de riesgo solo para `production` y `critical`: `▲ bajo` / `▲▲ medio` / `▲▲▲ alto` / `⬛ crítico`.
- `test` y `development` sin badge de riesgo (no es necesario).

### Estados del botón VS Code

- Normal: `⬡ VS Code`
- Clic enviado (1.5s): `⬡ abriendo…` (deshabilitado)
- Vuelve a normal tras 1.5s independientemente del resultado (el backend responde inmediatamente)

### Acordeón

- Todos los grupos comienzan colapsados excepto el grupo del proyecto activo (según `/api/status` → `projectId`). Si el proyecto activo no está en ningún grupo, todos colapsados.
- Clic en header del grupo: toggle expand/collapse.

---

## Frontend — M3 Gobernanza

### Grid de botones

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  workspace-health│ │  compile-agents  │ │  web-context     │
│  Diagnóstico     │ │  Regenerar       │ │  Generar bundle  │
│  completo        │ │  AGENTS.md       │ │  web AI          │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐
│  sync-status     │ │  cierre          │
│  Estado rclone   │ │  Cerrar sesión   │
│  + OneDrive      │ │  (close-session) │
└──────────────────┘ └──────────────────┘
```

Cuando hay un script corriendo: todos los botones reciben `disabled`. Al recibir `done` o `error`: se rehabilitan.

### Panel de output

```
OUTPUT ─────────────────────────────────────────── [Limpiar]
┌────────────────────────────────────────────────────────────┐
│ $ workspace-health                                         │
│ ✓ HANDOVER.md — fresh (2026-06-19 22:10)                  │
│ ✓ Hardlinks OK                                             │
│ ...                                                        │
└────────────────────────────────────────────────────────────┘
```

- Fondo `--bg`, texto `--green`, fuente `JetBrains Mono`, tamaño `0.8rem`
- Altura fija `320px`, `overflow-y: auto`, auto-scroll al final en cada línea nueva
- Al hacer clic en un script: limpia el panel y agrega la línea `$ nombre-script`
- Botón "Limpiar": vacía el panel
- Exit code ≠ 0: última línea en `--red`: `✗ exitCode: 1`
- Exit code = 0: última línea en `--green`: `✓ completado`

### WebSocket client

```js
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'output') appendOutput(msg.data);
  if (msg.type === 'done')   finalizeOutput(msg.exitCode);
  if (msg.type === 'error')  finalizeOutput(-1, msg.message);
};
ws.onerror = () => showError(true);
ws.onclose = () => { /* reconectar tras 3s */ };
```

La reconexión en `onclose` usa `setTimeout(connectWS, 3000)` — simple, sin backoff exponencial (Sesión 3 es local, no hay latencia).

---

## Sidebar — tunnel status en tiempo real

`GET /api/tunnels` → objeto `{ port: bool }`. El sidebar actualiza los 4 dots:

- `true` → clase `tunnel-dot--active` → color `--green`
- `false` → clase `tunnel-dot--inactive` → color `--muted`

Se pollea cada 30s junto con `/api/status` en el `update()` existente. No requiere WebSocket.

Los IDs de los dots en `index.html`: `tunnel-dot-3307`, `tunnel-dot-3308`, `tunnel-dot-3309`, `tunnel-dot-3310`.

---

## Decisiones

| Decisión | Resolución |
|---|---|
| WebSocket vs SSE | WebSocket (`ws` package) — elegido para extensibilidad futura (stop signal en S4) |
| Puerto WebSocket | Mismo que Express (8080) — sin puerto extra, adjunto al `http.Server` |
| Claude CLI por proyecto | Eliminado — Claude CLI siempre abre en workspace, no en proyecto |
| Stop script | Fuera de scope — Sesión 4 si se necesita |
| Reconexión WebSocket | setTimeout 3s, sin backoff — uso 100% local |
| Proyectos sin remotePath | No muestran botón VS Code, sí aparecen en la lista |
| Un script a la vez | 409 si ya hay uno corriendo — sin cola |
| Auth | Sin auth — uso 100% local |

---

## Criterio de completitud (Sesión 3 lista cuando…)

- [ ] Tabs "Proyectos" y "Gobernanza" navegan sin recargar la página
- [ ] M2 muestra los 19 proyectos agrupados por cliente en acordeón
- [ ] Clic "VS Code" abre VS Code con Remote SSH al ambiente seleccionado
- [ ] El grupo del proyecto activo comienza expandido
- [ ] M3 muestra 5 botones de gobernanza
- [ ] Clic en script: panel de output muestra líneas en tiempo real vía WebSocket
- [ ] Botones deshabilitados mientras corre un script, habilitados al terminar
- [ ] Exit code 0 → línea verde "✓ completado", ≠ 0 → línea roja "✗ exitCode: N"
- [ ] Sidebar muestra estado real de túneles (verde/gris) actualizado cada 30s
- [ ] WebSocket se reconecta automáticamente si se corta
