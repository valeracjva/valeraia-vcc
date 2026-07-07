# VCC Monitoring Core (Etapa 1, lado VCC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el backend de VCC (`workspace-ui/backend`) en un poller autónomo que vigila servidores aunque no haya navegador abierto, escribe heartbeat en los hosts con agente local, detecta transiciones de estado (fresh/watch/crítico) y notifica por Telegram con un bot propio; más un catch-up de lo ocurrido al reiniciar.

**Architecture:** Nuevo módulo `backend/monitoring-core/` (poller, heartbeat, state-tracker, telegram, catchup) orquestado por un `setInterval` propio del backend que reutiliza la lógica de conexión SSH/WinRM ya existente en `routes/metrics.js` (exportada, no duplicada). Nueva ruta `routes/monitoring-core.js` expone el resultado del catch-up a la UI. `server.js` arranca el poller al levantar el proceso.

**Tech Stack:** Node.js (ES modules), Express, `ssh2`, `child_process.execFile` (WinRM vía PowerShell), `node:test` para unit tests, `fetch` nativo de Node para la API de Telegram.

## Global Constraints

- Esta etapa vive en la PC de Carlos — no hay servidor dedicado todavía (etapa 2, fuera de alcance).
- El heartbeat/interruptor solo aplica a hosts con agente local ya desplegado: `srv-n001`/`srv-n003` (Windows, `projects/monitoreo/windows/`) y los hosts Linux de `projects/monitoreo/` (`srv-appstest`, `srv-appsprod`, `srv-web001`, `srv-fatapp-aws`).
- VCC alerta **solo en transición de estado** (fresh↔watch↔crítico), nunca en cada poll. `watch → fresh` no genera mensaje (recuperación parcial, no amerita ruido — decisión tomada en brainstorming).
- Bot de Telegram propio de VCC, independiente de los bots de DIGNA/Fincos y NRE.
- Catch-up al iniciar se muestra solo en la UI, nunca dispara Telegram.
- **Corrección respecto al spec original** (`docs/superpowers/specs/2026-07-07-vcc-monitoring-core-design.md`): el spec asumía un historial JSON estructurado en ambos lados. En la práctica: **Windows** sí tiene JSON estructurado por check (`C:\ProgramData\Monitoring\state\*.json`, campos `Status/Valor/Timestamp/DesdeTimestamp`); **Linux** solo tiene un log de texto plano (`/var/log/digna-monitoring/telegram-dispatcher.log`, líneas `[fecha] SENT/SUPPRESSED severity=... title=...`). El catch-up trata ambos casos de forma distinta (ver Tarea 7).
- No se toca ningún archivo de `projects/monitoreo/` (Linux) ni `projects/monitoreo/windows/` (Windows) en este plan — ese lado (consumir el heartbeat para silenciar sus propias alertas) es un plan separado, posterior a este, una vez que el formato de heartbeat esté estable en producción.

---

### Task 1: State tracker — detección de transición de estado

**Files:**
- Create: `backend/monitoring-core/state-tracker.js`
- Test: `backend/monitoring-core/state-tracker.test.js`

**Interfaces:**
- Produces: `checkTransition(serverId: string, currentState: 'fresh'|'watch'|'critico') -> { first: true } | { from: string, to: string } | null`, `commitState(serverId: string, currentState: string) -> void`, `_resetForTests() -> void`.

- [ ] **Step 1: Write the failing test**

```js
// backend/monitoring-core/state-tracker.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTransition, commitState, _resetForTests } from './state-tracker.js';

test('primera vez que se ve un servidor -> first:true, no transicion', () => {
  _resetForTests();
  const result = checkTransition('srv-a', 'fresh');
  assert.deepEqual(result, { first: true });
});

test('sin cambio de estado -> null', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  assert.equal(checkTransition('srv-a', 'fresh'), null);
});

test('cambio de estado -> from/to', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  const result = checkTransition('srv-a', 'critico');
  assert.deepEqual(result, { from: 'fresh', to: 'critico' });
});

test('commitState no se llama automaticamente dentro de checkTransition', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  checkTransition('srv-a', 'critico');
  // sin commitState explicito, el siguiente check sigue viendo 'fresh' como estado previo
  assert.deepEqual(checkTransition('srv-a', 'critico'), { from: 'fresh', to: 'critico' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/monitoring-core/state-tracker.test.js`
Expected: FAIL — `Cannot find module './state-tracker.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// backend/monitoring-core/state-tracker.js

// Ultimo estado conocido por servidor -- vive en memoria, se resetea en cada reinicio
// del backend (mismo gotcha que el cache de metrics.js y los tuneles SSH). Un reinicio
// "olvida" el ultimo estado y trata la primera lectura post-reinicio como baseline,
// no como transicion -- evita una alerta falsa al arrancar.
const lastKnownState = {};

// No muta lastKnownState -- el llamador decide cuando confirmar via commitState(),
// para poder reintentar la notificacion sin perder el estado previo si el envio falla.
export function checkTransition(serverId, currentState) {
  const previous = lastKnownState[serverId];
  if (previous === undefined) return { first: true };
  if (previous === currentState) return null;
  return { from: previous, to: currentState };
}

export function commitState(serverId, currentState) {
  lastKnownState[serverId] = currentState;
}

// Solo para tests -- limpia el estado en memoria entre casos.
export function _resetForTests() {
  for (const key of Object.keys(lastKnownState)) delete lastKnownState[key];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/monitoring-core/state-tracker.test.js`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/monitoring-core/state-tracker.js backend/monitoring-core/state-tracker.test.js && git commit -m "feat(monitoring-core): agregar state-tracker de transiciones"
```

---

### Task 2: Exportar funciones reutilizables de `metrics.js`

**Files:**
- Modify: `backend/routes/metrics.js:11` (getMonitoredServers), `:54` (sshExec), `:156-192` (winrmExec → winrmExecRaw genérico), agregar `pollAllServers` al final antes del `export default router`.

**Interfaces:**
- Consumes: nada nuevo (refactor interno).
- Produces: `export async function getMonitoredServers()`, `export function sshExec(conf, cmd)`, `export function winrmExecRaw(conf, remoteScript, timeoutMs = 15000)`, `export async function pollAllServers(force = false) -> [{ serverId, conf, data }]`.

- [ ] **Step 1: Exportar `getMonitoredServers` y `sshExec`**

En `backend/routes/metrics.js:11`, cambiar:
```js
async function getMonitoredServers() {
```
por:
```js
export async function getMonitoredServers() {
```

En `backend/routes/metrics.js:54`, cambiar:
```js
function sshExec(conf, cmd) {
```
por:
```js
export function sshExec(conf, cmd) {
```

- [ ] **Step 2: Generalizar `winrmExec` a `winrmExecRaw` reutilizable**

En `backend/routes/metrics.js:156-192`, reemplazar la función completa:
```js
function winrmExec(conf) {
  return new Promise((resolve) => {
    // WinRM (autenticacion NTLM + spawn de powershell.exe + Invoke-Command real) es mas lento
    // que un exec SSH directo -- el timeout corto de timeoutMsForHost() cortaba el proceso
    // a mitad de la respuesta CLIXML antes de completar.
    const timeoutMs = 15_000;
    // -EncodedCommand (Base64 UTF-16LE) evita que Windows rompa el quoting/newlines
    // de un script multilinea pasado como argumento de proceso via -Command.
    const encoded = Buffer.from(WINRM_SCRIPT, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      {
        timeout: timeoutMs,
        env: {
          ...process.env,
          VCC_WINRM_HOST: conf.host,
          VCC_WINRM_USER: conf.user,
          VCC_WINRM_PASS: conf.password,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          // PowerShell serializa progreso/errores como CLIXML en stderr -- la primera linea es
          // solo el header ("#< CLIXML"), el mensaje real esta mas adelante. Se extrae el texto
          // legible de <ToString> si existe; si no, se recorta el bloque crudo (mas largo que
          // una sola linea) para no perder el error real en el ruido de progress records.
          const raw = stderr || err.message;
          const toStringMatch = raw.match(/<ToString>([\s\S]*?)<\/ToString>/);
          const msg = toStringMatch ? toStringMatch[1] : raw.replace(/<[^>]+>/g, ' ').trim();
          return resolve({ error: msg.slice(0, 300) });
        }
        resolve({ out: stdout.trim() });
      }
    );
  });
}
```
por:
```js
// Generico: ejecuta cualquier script PS remoto via WinRM con las mismas credenciales
// env VCC_WINRM_*. Reutilizado por metrics (WINRM_SCRIPT) y por monitoring-core/heartbeat.js
// y monitoring-core/catchup.js (scripts distintos, misma plumbing de conexion).
export function winrmExecRaw(conf, remoteScript, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    // -EncodedCommand (Base64 UTF-16LE) evita que Windows rompa el quoting/newlines
    // de un script multilinea pasado como argumento de proceso via -Command.
    const encoded = Buffer.from(remoteScript, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      {
        timeout: timeoutMs,
        env: {
          ...process.env,
          VCC_WINRM_HOST: conf.host,
          VCC_WINRM_USER: conf.user,
          VCC_WINRM_PASS: conf.password,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          // PowerShell serializa progreso/errores como CLIXML en stderr -- la primera linea es
          // solo el header ("#< CLIXML"), el mensaje real esta mas adelante. Se extrae el texto
          // legible de <ToString> si existe; si no, se recorta el bloque crudo (mas largo que
          // una sola linea) para no perder el error real en el ruido de progress records.
          const raw = stderr || err.message;
          const toStringMatch = raw.match(/<ToString>([\s\S]*?)<\/ToString>/);
          const msg = toStringMatch ? toStringMatch[1] : raw.replace(/<[^>]+>/g, ' ').trim();
          return resolve({ error: msg.slice(0, 300) });
        }
        resolve({ out: stdout.trim() });
      }
    );
  });
}

// WinRM (autenticacion NTLM + spawn de powershell.exe + Invoke-Command real) es mas lento
// que un exec SSH directo -- el timeout corto de timeoutMsForHost() cortaba el proceso
// a mitad de la respuesta CLIXML antes de completar. winrmExecRaw ya usa 15s por defecto.
function winrmExec(conf) {
  return winrmExecRaw(conf, WINRM_SCRIPT);
}
```

- [ ] **Step 3: Agregar `pollAllServers`**

Al final de `backend/routes/metrics.js`, antes de `export default router;`, agregar:
```js
// Usado por monitoring-core/poller.js para su propio ciclo de polling (no disparado por
// requests HTTP del frontend). Devuelve tambien `conf` por servidor -- heartbeat.js y
// catchup.js necesitan la config de conexion (ssh/winrm) para abrir su propio canal.
export async function pollAllServers(force = false) {
  const now = Date.now();
  const MONITORED = await getMonitoredServers();
  const ids = Object.keys(MONITORED);
  const results = await Promise.allSettled(
    ids.map((id) => fetchWithHistory(id, MONITORED[id], force, now))
  );
  return ids.map((id, i) => {
    const r = results[i];
    return {
      serverId: id,
      conf: MONITORED[id],
      data: r.status === 'fulfilled' ? r.value : { serverId: id, status: 'unreachable', error: r.reason?.message ?? 'unknown error' },
    };
  });
}
```

- [ ] **Step 4: Verificar que la ruta HTTP existente sigue funcionando**

Run: `cd "D:\Workspace-Repos\workspace-ui\backend" && node -e "import('./routes/metrics.js').then(m => console.log(typeof m.getMonitoredServers, typeof m.sshExec, typeof m.winrmExecRaw, typeof m.pollAllServers, typeof m.default))"`
Expected: `function function function function function` (las 4 exports nuevas + el router default)

- [ ] **Step 5: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/routes/metrics.js && git commit -m "refactor(metrics): exportar getMonitoredServers/sshExec/winrmExecRaw/pollAllServers para monitoring-core"
```

---

### Task 3: Exportar `healthState` de `opsmap.js`

**Files:**
- Modify: `backend/routes/opsmap.js:70`

**Interfaces:**
- Produces: `export function healthState(health: object|null) -> 'critico'|'watch'|'fresh'|null`.

- [ ] **Step 1: Exportar la función**

En `backend/routes/opsmap.js:70`, cambiar:
```js
function healthState(health) {
```
por:
```js
export function healthState(health) {
```
El resto de la función queda igual; sigue usándose sin cambios dentro del mismo archivo (línea 120).

- [ ] **Step 2: Verificar**

Run: `cd "D:\Workspace-Repos\workspace-ui\backend" && node -e "import('./routes/opsmap.js').then(m => console.log(typeof m.healthState))"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/routes/opsmap.js && git commit -m "refactor(opsmap): exportar healthState para monitoring-core"
```

---

### Task 4: Campo `localAgent` en Inventario

**Files:**
- Modify: `backend/routes/inventory.js:11-27` (validate), `:29-54` (clean)
- Test: `backend/routes/inventory.test.js`

**Interfaces:**
- Produces: `clean(s)` incluye `localAgent: boolean` en el objeto devuelto. `validate(s)` no rechaza `localAgent` (booleano opcional, no bloqueante).
- Consumes (por monitoring-core/poller.js en Task 8): campo `localAgent` en cada entrada de `servers-config.json`.

- [ ] **Step 1: Write the failing test**

```js
// backend/routes/inventory.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, clean } from './inventory.js';

test('clean() incluye localAgent=true cuando viene true', () => {
  const s = { id: 'srv-x', ip: '10.0.0.1', os: 'Ubuntu', empresa: 'NRE', riesgo: 'bajo', apps: [], dominios: [], localAgent: true };
  assert.equal(clean(s).localAgent, true);
});

test('clean() default localAgent=false cuando no viene', () => {
  const s = { id: 'srv-x', ip: '10.0.0.1', os: 'Ubuntu', empresa: 'NRE', riesgo: 'bajo', apps: [], dominios: [] };
  assert.equal(clean(s).localAgent, false);
});

test('validate() no rechaza localAgent booleano', () => {
  const s = { id: 'srv-x', ip: '10.0.0.1', os: 'Ubuntu', empresa: 'NRE', riesgo: 'bajo', apps: [], dominios: [], localAgent: true };
  assert.equal(validate(s), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/routes/inventory.test.js`
Expected: FAIL — `validate`/`clean` no son exports nombrados todavía (`SyntaxError` o `undefined is not a function`)

- [ ] **Step 3: Exportar `validate`/`clean` y agregar el campo**

En `backend/routes/inventory.js:11`, cambiar:
```js
function validate(s) {
```
por:
```js
export function validate(s) {
```

En `backend/routes/inventory.js:29`, cambiar:
```js
function clean(s) {
```
por:
```js
export function clean(s) {
```

Dentro de `clean()` (línea ~39, junto a `perfil`), agregar el campo:
```js
    perfil:     Array.isArray(s.perfil) ? s.perfil.map(p => String(p).trim()).filter(Boolean) : [],
    // localAgent: true si el host ya tiene el stack de monitoreo local desplegado
    // (Linux: projects/monitoreo/, Windows: projects/monitoreo/windows/) -- monitoring-core/poller.js
    // solo escribe heartbeat en hosts con este flag, el resto no tiene fallback local que coordinar.
    localAgent: s.localAgent === true,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/routes/inventory.test.js`
Expected: PASS — 3 tests

- [ ] **Step 5: Marcar `localAgent: true` en los 6 hosts que ya tienen agente desplegado**

Editar `servers-config.json` (ubicación real: junto al código en `D:\Workspace-Repos\workspace-ui\servers-config.json`, gitignored) — agregar `"localAgent": true` a las entradas de `srv-n001`, `srv-n003`, `srv-appstest`, `srv-appsprod`, `srv-web001`, `srv-fatapp-aws`. Esto es edición manual de datos, no de código — hacerlo vía la UI de VCC (✎ editar cada servidor) una vez que Task 9/10 estén desplegadas y el campo sea editable, o directamente en el JSON si se prefiere antes.

- [ ] **Step 6: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/routes/inventory.js backend/routes/inventory.test.js && git commit -m "feat(inventory): agregar campo localAgent para marcar hosts con agente de monitoreo local"
```

---

### Task 5: Heartbeat writer

**Files:**
- Create: `backend/monitoring-core/heartbeat.js`
- Test: `backend/monitoring-core/heartbeat.test.js`

**Interfaces:**
- Consumes: `sshExec(conf, cmd)`, `winrmExecRaw(conf, script, timeoutMs)` de `../routes/metrics.js` (Task 2).
- Produces: `export async function writeHeartbeat(serverId: string, conf: {type, host, user, key|password}) -> boolean`.

- [ ] **Step 1: Write the failing test**

```js
// backend/monitoring-core/heartbeat.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINRM_HEARTBEAT_SCRIPT, SSH_HEARTBEAT_CMD } from './heartbeat.js';

test('script WinRM escribe en la ruta esperada', () => {
  assert.match(WINRM_HEARTBEAT_SCRIPT, /C:\\ProgramData\\Monitoring\\vcc-heartbeat\.txt/);
});

test('comando SSH escribe en la ruta esperada', () => {
  assert.match(SSH_HEARTBEAT_CMD, /\/var\/lib\/monitoring-core\/vcc-heartbeat/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/monitoring-core/heartbeat.test.js`
Expected: FAIL — `Cannot find module './heartbeat.js'`

- [ ] **Step 3: Write implementation**

```js
// backend/monitoring-core/heartbeat.js
import { sshExec, winrmExecRaw } from '../routes/metrics.js';

// Mismo directorio State/Log que usan los agentes locales (ver MonitoringCore.psm1 /
// monitoring.env) -- el heartbeat vive junto a ellos para que el chequeo de frescura
// que hagan esos scripts (plan futuro, fuera de este) sea un simple stat/Get-Date.
export const WINRM_HEARTBEAT_SCRIPT = `
$ErrorActionPreference = 'Stop'
$pass = New-Object System.Security.SecureString
foreach ($ch in $env:VCC_WINRM_PASS.ToCharArray()) { $pass.AppendChar($ch) }
$cred = New-Object System.Management.Automation.PSCredential($env:VCC_WINRM_USER, $pass)
Invoke-Command -ComputerName $env:VCC_WINRM_HOST -Credential $cred -ScriptBlock {
  New-Item -ItemType Directory -Force -Path 'C:\\ProgramData\\Monitoring' | Out-Null
  Set-Content -Path 'C:\\ProgramData\\Monitoring\\vcc-heartbeat.txt' -Value (Get-Date -Format o) -Encoding UTF8
}
`.trim();

export const SSH_HEARTBEAT_CMD =
  'mkdir -p /var/lib/monitoring-core && date -u +%Y-%m-%dT%H:%M:%SZ > /var/lib/monitoring-core/vcc-heartbeat';

export async function writeHeartbeat(serverId, conf) {
  const result = conf.type === 'winrm'
    ? await winrmExecRaw(conf, WINRM_HEARTBEAT_SCRIPT)
    : await sshExec(conf, SSH_HEARTBEAT_CMD);
  if (result.error) {
    console.error(`[monitoring-core] heartbeat FAIL ${serverId}: ${result.error}`);
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/monitoring-core/heartbeat.test.js`
Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/monitoring-core/heartbeat.js backend/monitoring-core/heartbeat.test.js && git commit -m "feat(monitoring-core): agregar heartbeat writer via SSH/WinRM"
```

---

### Task 6: Cliente de Telegram (bot propio de VCC)

**Files:**
- Create: `backend/monitoring-core/telegram.js`
- Create: `backend/monitoring-core/telegram-config.json.template`
- Test: `backend/monitoring-core/telegram.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `export function buildTransitionMessage(serverId, fromState, toState) -> string|null`, `export async function notifyTransition(serverId, fromState, toState) -> void`.

- [ ] **Step 1: Write the failing test**

```js
// backend/monitoring-core/telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransitionMessage } from './telegram.js';

test('fresh -> critico genera mensaje con icono rojo', () => {
  const msg = buildTransitionMessage('srv-n001', 'fresh', 'critico');
  assert.match(msg, /🔴/);
  assert.match(msg, /srv-n001/);
});

test('critico -> fresh genera mensaje de recuperacion', () => {
  const msg = buildTransitionMessage('srv-n001', 'critico', 'fresh');
  assert.match(msg, /✅/);
});

test('fresh -> watch genera aviso temprano', () => {
  const msg = buildTransitionMessage('srv-n001', 'fresh', 'watch');
  assert.match(msg, /⚠️/);
});

test('watch -> fresh NO genera mensaje (recuperacion parcial silenciosa)', () => {
  assert.equal(buildTransitionMessage('srv-n001', 'watch', 'fresh'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/monitoring-core/telegram.test.js`
Expected: FAIL — `Cannot find module './telegram.js'`

- [ ] **Step 3: Write implementation**

```js
// backend/monitoring-core/telegram.js
import { readFile } from 'fs/promises';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'telegram-config.json');

const ICONS  = { fresh: '✅', watch: '⚠️', critico: '🔴' };
const LABELS = { fresh: 'normal', watch: 'atención', critico: 'crítico' };

// watch -> fresh no genera mensaje: es una recuperacion parcial (bajo del umbral critico
// pero sigue en atencion), no amerita interrumpir por Telegram -- decision tomada en
// brainstorming (ver spec 2026-07-07).
export function buildTransitionMessage(serverId, fromState, toState) {
  if (fromState === 'watch' && toState === 'fresh') return null;
  const icon = ICONS[toState] ?? 'ℹ️';
  return `${icon} ${serverId}: ${LABELS[fromState] ?? fromState} → ${LABELS[toState] ?? toState}`;
}

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export async function notifyTransition(serverId, fromState, toState) {
  const message = buildTransitionMessage(serverId, fromState, toState);
  if (!message) return;

  const config = await loadConfig();
  if (!config?.botToken || !config?.chatId) {
    console.error('[monitoring-core] telegram-config.json ausente o incompleto, no se envia:', message);
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: message }),
    });
    if (!res.ok) console.error('[monitoring-core] telegram send FAIL:', res.status, await res.text());
  } catch (err) {
    console.error('[monitoring-core] telegram send FAIL:', err.message);
  }
}
```

```json
// backend/monitoring-core/telegram-config.json.template
{
  "botToken": "REEMPLAZAR_CON_TOKEN_DE_BOTFATHER",
  "chatId": "REEMPLAZAR_CON_CHAT_ID"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/monitoring-core/telegram.test.js`
Expected: PASS — 4 tests

- [ ] **Step 5: Agregar `telegram-config.json` real al `.gitignore`**

En `.gitignore`, agregar bajo la sección de data files:
```
# Bot de Telegram propio de VCC -- credenciales, no versionar
backend/monitoring-core/telegram-config.json
```

- [ ] **Step 6: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/monitoring-core/telegram.js backend/monitoring-core/telegram.test.js backend/monitoring-core/telegram-config.json.template .gitignore && git commit -m "feat(monitoring-core): agregar cliente Telegram con bot propio de VCC"
```

**Nota operativa (no es un paso de código):** antes de que las notificaciones funcionen de verdad, Carlos debe crear el bot en BotFather, copiar `telegram-config.json.template` a `telegram-config.json` y completar `botToken`/`chatId` reales.

---

### Task 7: Catch-up al iniciar

**Files:**
- Create: `backend/monitoring-core/catchup.js`
- Test: `backend/monitoring-core/catchup.test.js`

**Interfaces:**
- Consumes: `sshExec(conf, cmd)`, `winrmExecRaw(conf, script)` de `../routes/metrics.js`.
- Produces: `export function parseLinuxLogTail(rawOutput: string) -> Array<{raw: string}>`, `export function parseWindowsStateJson(rawOutput: string) -> Array<{check: string, status: string, valor: string, timestamp: string}>`, `export async function readCatchupForHost(serverId, conf) -> { serverId, events: Array, error?: string }`.

- [ ] **Step 1: Write the failing test**

```js
// backend/monitoring-core/catchup.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinuxLogTail, parseWindowsStateJson } from './catchup.js';

test('parseLinuxLogTail devuelve una entrada por linea no vacia', () => {
  const raw = '[2026-07-07 14:32:10] SENT severity=CRITICAL title=Disco 92%\n[2026-07-07 15:10:00] SENT severity=RECOVERY title=Disco normalizado\n';
  const events = parseLinuxLogTail(raw);
  assert.equal(events.length, 2);
  assert.equal(events[0].raw, '[2026-07-07 14:32:10] SENT severity=CRITICAL title=Disco 92%');
});

test('parseLinuxLogTail con salida vacia devuelve array vacio', () => {
  assert.deepEqual(parseLinuxLogTail(''), []);
});

test('parseWindowsStateJson parsea un array de objetos Status/Valor/Timestamp', () => {
  const raw = JSON.stringify([
    { Status: 'critico', Valor: '92', Timestamp: '2026-07-07T14:32:10Z', DesdeTimestamp: '2026-07-07T14:32:10Z' },
  ]);
  const events = parseWindowsStateJson(raw);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'critico');
  assert.equal(events[0].valor, '92');
});

test('parseWindowsStateJson con JSON invalido devuelve array vacio', () => {
  assert.deepEqual(parseWindowsStateJson('no es json'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/monitoring-core/catchup.test.js`
Expected: FAIL — `Cannot find module './catchup.js'`

- [ ] **Step 3: Write implementation**

```js
// backend/monitoring-core/catchup.js
import { sshExec, winrmExecRaw } from '../routes/metrics.js';

// Rutas fijas, iguales en todos los hosts desplegados con el mismo template
// (ver monitoring.env / monitoring.psd1 de projects/monitoreo). Si algun host futuro
// usa una ruta distinta, este modulo necesitara leer la ruta desde servers-config.json
// en vez de asumirla -- no se generaliza ahora (YAGNI), solo aplica a los 6 hosts conocidos.
const LINUX_LOG_PATH = '/var/log/digna-monitoring/telegram-dispatcher.log';
const LINUX_TAIL_LINES = 50;

const WINRM_CATCHUP_SCRIPT = `
$ErrorActionPreference = 'Stop'
$pass = New-Object System.Security.SecureString
foreach ($ch in $env:VCC_WINRM_PASS.ToCharArray()) { $pass.AppendChar($ch) }
$cred = New-Object System.Management.Automation.PSCredential($env:VCC_WINRM_USER, $pass)
Invoke-Command -ComputerName $env:VCC_WINRM_HOST -Credential $cred -ScriptBlock {
  Get-ChildItem -Path 'C:\\ProgramData\\Monitoring\\state' -Filter '*.json' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-Content -Path $_.FullName -Raw | ConvertFrom-Json }
} | ConvertTo-Json -Compress -Depth 4
`.trim();

// Linux: telegram-dispatcher.log es texto plano ("[fecha] SENT severity=... title=..." o
// "SUPPRESSED ..."), no hay historial JSON estructurado -- se devuelve linea a linea sin
// parseo adicional, el frontend las muestra como lista simple.
export function parseLinuxLogTail(rawOutput) {
  return rawOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(raw => ({ raw }));
}

// Windows: cada check tiene su propio JSON con Status/Valor/Timestamp/DesdeTimestamp
// (ver Set-CheckState en MonitoringCore.psm1) -- estructura real, se mapea a un shape
// mas simple para la UI.
export function parseWindowsStateJson(rawOutput) {
  try {
    const parsed = JSON.parse(rawOutput);
    const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    return list.map(item => ({
      check: item.CheckName ?? null,
      status: item.Status,
      valor: item.Valor,
      timestamp: item.Timestamp,
    }));
  } catch {
    return [];
  }
}

export async function readCatchupForHost(serverId, conf) {
  if (conf.type === 'winrm') {
    const result = await winrmExecRaw(conf, WINRM_CATCHUP_SCRIPT);
    if (result.error) return { serverId, events: [], error: result.error };
    return { serverId, events: parseWindowsStateJson(result.out) };
  }
  const result = await sshExec(conf, `tail -n ${LINUX_TAIL_LINES} ${LINUX_LOG_PATH} 2>/dev/null || true`);
  if (result.error) return { serverId, events: [], error: result.error };
  return { serverId, events: parseLinuxLogTail(result.out) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/monitoring-core/catchup.test.js`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/monitoring-core/catchup.js backend/monitoring-core/catchup.test.js && git commit -m "feat(monitoring-core): agregar catch-up de historial local por host (Linux log tail / Windows state JSON)"
```

---

### Task 8: Poller — orquestador central

**Files:**
- Create: `backend/monitoring-core/poller.js`

**Interfaces:**
- Consumes: `pollAllServers()` (Task 2), `healthState()` (Task 3), `writeHeartbeat()` (Task 5), `notifyTransition()` (Task 6), `checkTransition()`/`commitState()` (Task 1), `PATHS.serversConfig` de `../config.js`.
- Produces: `export function startPoller() -> void`, `export async function pollOnce() -> void` (exportado para poder invocarlo manualmente en tests/manual verification sin esperar el interval).

- [ ] **Step 1: Write implementation**

No hay unit test aislado para este módulo — orquesta I/O real (SSH/WinRM/Telegram) que ya está testeado por partes en las Tasks 1-7. Se verifica end-to-end en Task 10.

```js
// backend/monitoring-core/poller.js
import { readFile } from 'fs/promises';
import { pollAllServers } from '../routes/metrics.js';
import { healthState } from '../routes/opsmap.js';
import { PATHS } from '../config.js';
import { writeHeartbeat } from './heartbeat.js';
import { checkTransition, commitState } from './state-tracker.js';
import { notifyTransition } from './telegram.js';

const POLL_INTERVAL_MS = 60_000;

async function localAgentHosts() {
  try {
    const { servers } = JSON.parse(await readFile(PATHS.serversConfig, 'utf8'));
    return new Set(servers.filter(s => s.localAgent === true).map(s => s.id));
  } catch {
    return new Set();
  }
}

export async function pollOnce() {
  const [results, agentHosts] = await Promise.all([pollAllServers(), localAgentHosts()]);

  for (const { serverId, conf, data } of results) {
    const current = healthState(data);
    if (!current) continue; // sin dato (no-config) -- nada que evaluar

    if (agentHosts.has(serverId)) {
      await writeHeartbeat(serverId, conf);
    }

    const transition = checkTransition(serverId, current);
    commitState(serverId, current);
    if (transition && !transition.first) {
      await notifyTransition(serverId, transition.from, transition.to);
    }
  }
}

let timer = null;

// Arranca el ciclo propio del backend -- independiente de que haya frontend abierto.
// Corre una vez de inmediato y despues cada POLL_INTERVAL_MS. Llamar una sola vez desde server.js.
export function startPoller() {
  if (timer) return;
  pollOnce().catch(err => console.error('[monitoring-core] poll FAIL:', err.message));
  timer = setInterval(() => {
    pollOnce().catch(err => console.error('[monitoring-core] poll FAIL:', err.message));
  }, POLL_INTERVAL_MS);
}
```

- [ ] **Step 2: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/monitoring-core/poller.js && git commit -m "feat(monitoring-core): agregar poller propio del backend (heartbeat + transicion + telegram)"
```

---

### Task 9: Ruta HTTP de catch-up

**Files:**
- Create: `backend/routes/monitoring-core.js`

**Interfaces:**
- Consumes: `readCatchupForHost()` (Task 7), `getMonitoredServers()` (Task 2), `PATHS.serversConfig`.
- Produces: `GET /api/monitoring-core/catchup -> { generatedAt, hosts: [{ serverId, events, error? }] }` (solo hosts con `localAgent: true`).

- [ ] **Step 1: Write implementation**

```js
// backend/routes/monitoring-core.js
import { Router } from 'express';
import { readFile } from 'fs/promises';
import { PATHS } from '../config.js';
import { getMonitoredServers } from './metrics.js';
import { readCatchupForHost } from '../monitoring-core/catchup.js';

const router = Router();

// GET /api/monitoring-core/catchup — se llama una vez al cargar la UI (no en cada refresh
// de 30s), muestra que paso en los hosts con agente local mientras VCC estuvo apagado.
router.get('/catchup', async (_req, res, next) => {
  try {
    const { servers } = JSON.parse(await readFile(PATHS.serversConfig, 'utf8'));
    const agentServerIds = servers.filter(s => s.localAgent === true).map(s => s.id);
    const monitored = await getMonitoredServers();

    const hosts = await Promise.all(
      agentServerIds
        .filter(id => monitored[id])
        .map(id => readCatchupForHost(id, monitored[id]))
    );

    res.json({ generatedAt: new Date().toISOString(), hosts });
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Verificar arranque sin errores de sintaxis**

Run: `cd "D:\Workspace-Repos\workspace-ui\backend" && node -e "import('./routes/monitoring-core.js').then(m => console.log(typeof m.default))"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/routes/monitoring-core.js && git commit -m "feat(monitoring-core): agregar ruta GET /api/monitoring-core/catchup"
```

---

### Task 10: Wiring en `server.js` + verificación end-to-end

**Files:**
- Modify: `backend/server.js:11-25` (imports), `:50-64` (mounts), `:86-100` (arranque)

**Interfaces:**
- Consumes: `startPoller()` (Task 8), router de `monitoring-core.js` (Task 9).

- [ ] **Step 1: Agregar imports**

En `backend/server.js`, después de la línea 25 (`import mcpRouter from './routes/mcp.js';`), agregar:
```js
import monitoringCoreRouter from './routes/monitoring-core.js';
import { startPoller } from './monitoring-core/poller.js';
```

- [ ] **Step 2: Montar la ruta**

Después de la línea `app.use('/api/mcp', mcpRouter);` (línea 64), agregar:
```js
app.use('/api/monitoring-core', monitoringCoreRouter);
```

- [ ] **Step 3: Arrancar el poller al levantar el servidor**

Dentro del callback de `httpServer.listen` (línea 86-100), después del bloque `for (const [label, filePath] of checks) { ... }` y antes del `console.log('');` final, agregar:
```js
  startPoller();
  console.log('  ✓ Monitoring core: poller propio iniciado (heartbeat + transición de estado + Telegram)');
```

- [ ] **Step 4: Verificación manual — arranque limpio**

Run: `cd "D:\Workspace-Repos\workspace-ui\backend" && npm install && node server.js`
Expected: log muestra `✓ Monitoring core: poller propio iniciado...` sin excepciones, y en la consola aparecen las líneas `[metrics] <id> OK` / `[monitoring-core] heartbeat FAIL/OK` para cada servidor monitoreado, disparadas por el poll inmediato de `startPoller()` — sin haber abierto el navegador.

- [ ] **Step 5: Verificación manual — endpoint de catch-up**

Con el backend corriendo, en otra terminal: `curl http://localhost:<puerto>/api/monitoring-core/catchup`
Expected: JSON con `hosts: [...]`, un elemento por cada servidor con `localAgent: true` en `servers-config.json` (requiere que Task 4 Step 5 ya se haya hecho para al menos un host, si no, `hosts: []`).

- [ ] **Step 6: Verificación manual — Telegram (requiere bot real ya configurado)**

Con `telegram-config.json` completo (Task 6, nota operativa) y al menos un servidor con `localAgent: true` y credenciales SSH/WinRM válidas: forzar temporalmente un umbral bajo en `opsmap.js:74` (`worst >= 85` → `worst >= 1`, solo para la prueba) o esperar una transición real, reiniciar el backend, confirmar que llega un mensaje al chat de Telegram configurado. **Revertir el cambio de umbral temporal antes de commitear.**

- [ ] **Step 7: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add backend/server.js && git commit -m "feat(monitoring-core): arrancar poller propio y montar ruta catchup en server.js"
```

---

### Task 11: Banner de catch-up en el frontend (Sesión actual)

**Files:**
- Modify: `frontend/modules/tabs/briefing.js`
- Modify: `frontend/app.js:142-173` (init)

**Interfaces:**
- Consumes: `GET /api/monitoring-core/catchup` (Task 9).
- Produces: `export async function loadCatchupBanner() -> void` (fetch una sola vez, guarda HTML en variable de módulo), `renderBriefing` ahora incluye ese HTML en cada render sin volver a pedirlo.

- [ ] **Step 1: Agregar `loadCatchupBanner` y consumir el resultado en `renderBriefing`**

En `frontend/modules/tabs/briefing.js`, agregar después del import existente (línea 1):
```js
// Se pide una sola vez al cargar la app (ver app.js init()), no en cada refresh de 30s --
// el catch-up es "que paso mientras VCC estaba apagado", no cambia mientras la sesion sigue activa.
let catchupHtml = '';

export async function loadCatchupBanner() {
  try {
    const res = await fetch('/api/monitoring-core/catchup');
    const data = await res.json();
    const withEvents = (data.hosts ?? []).filter(h => h.events?.length > 0 && !h.error);
    if (withEvents.length === 0) { catchupHtml = ''; return; }
    const items = withEvents.map(h =>
      `<div class="brief-catchup-host"><strong>${escHtml(h.serverId)}</strong>: ${h.events.length} evento(s) desde el último heartbeat</div>`
    ).join('');
    catchupHtml =
      `<div class="briefing-card briefing-full brief-catchup">` +
      `<div class="briefing-card-label">MIENTRAS VCC ESTABA APAGADO</div>` +
      `<div class="briefing-card-body">${items}</div>` +
      `</div>`;
  } catch {
    catchupHtml = '';
  }
}
```

En la misma función `renderBriefing`, dentro del `panel.innerHTML =` existente, agregar `catchupHtml` justo después del cierre de `brief-hero` (línea `` `</div>` + `` que cierra `briefing-full` del hero, antes de la card `ESTADO ACTUAL`):
```js
    `<div class="brief-hero briefing-full">` +
    `<div class="brief-hero-label">PRÓXIMO PASO</div>` +
    `<div class="brief-hero-text">${escHtml(nextStep || '—')}</div>` +
    `</div>` +

    catchupHtml +

    `<div class="briefing-card ok">` +
```

- [ ] **Step 2: Llamar `loadCatchupBanner()` una sola vez en `init()`**

En `frontend/app.js:5`, agregar `loadCatchupBanner` al import existente:
```js
import { renderBriefing, loadCatchupBanner } from './modules/tabs/briefing.js';
```

En `frontend/app.js`, dentro de `init()` (línea ~166), agregar la llamada junto a las otras cargas iniciales (antes de los `setInterval` finales, para que esté lista cuando `update()` haga el primer `renderBriefing`):
```js
  await update();
  await loadCatchupBanner();
  await loadProjects();
```

- [ ] **Step 3: Verificación manual con Playwright**

Con el backend corriendo y al menos un host `localAgent: true` con eventos en su log/state, navegar a `localhost:<puerto>`, ir a la tab "Sesión actual", confirmar que aparece la card "MIENTRAS VCC ESTABA APAGADO" con el conteo de eventos por host. Sin hosts con eventos, confirmar que la card no aparece (sin espacio vacío raro en el grid).

- [ ] **Step 4: Commit**

```bash
cd "D:\Workspace-Repos\workspace-ui" && git add frontend/modules/tabs/briefing.js frontend/app.js && git commit -m "feat(monitoring-core): mostrar banner de catch-up en Sesion actual"
```

---

## Fuera de este plan (siguiente plan, repo distinto)

- Cambios en `MonitoringCore.psm1` (Windows) y en `telegram-dispatcher.sh`/dispatcher Bash (Linux) para leer `vcc-heartbeat`/`vcc-heartbeat.txt` y silenciar su propio envío cuando está fresco (< 180s). Vive en `projects/monitoreo/windows/` y `projects/monitoreo/` dentro de `AI-Workspace`, repo/deploy distinto de `workspace-ui`.
- Creación real del bot de Telegram en BotFather (acción de Carlos).
- Poblar `localAgent: true` en los 6 hosts conocidos (Task 4 Step 5 deja la mecánica lista, falta la edición de datos real).
- Etapa 2 (servidor dedicado fuera de VPN).
