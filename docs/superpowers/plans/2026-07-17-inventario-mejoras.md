# Inventario — campos configurables, buscador y concurrencia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inventario gana 3 mejoras independientes: campos de card configurables globalmente,
buscador de texto, y un límite de concurrencia en la recolección de métricas del backend para que
escalar el inventario no dispare cientos de conexiones SSH/WinRM simultáneas.

**Architecture:** Cambios de frontend puro para campos configurables (localStorage) y buscador
(mismo patrón que el buscador de Links, función pura `filterServers` + wiring). Cambio de backend
aislado en un módulo nuevo puro (`backend/lib/concurrency.js`) consumido por
`backend/routes/metrics.js`, sin cambiar la forma de la respuesta de `/api/metrics`.

**Tech Stack:** HTML/CSS/JS vanilla (ES modules) + Node.js/Express, tests con `node:test`.

## Global Constraints

- Campos configurables: global (una sola preferencia en `localStorage`, no por-servidor). Default
  todos visibles (`{ os: true, empresa: true, rol: true, ssh: true, metrics: true }`) — sin
  breaking change del comportamiento actual.
- El nombre del servidor, la IP y el badge de riesgo NO son configurables — son la identidad
  mínima de la card.
- Buscador: sin debounce (array en memoria), se combina en AND con "● Monitoreados" sin afectar
  el conteo de servers explícitamente ocultados (`×`).
- `mapWithConcurrency` no cambia la forma de la respuesta de `/api/metrics` ni el TTL de caché
  (60s) — solo cuántos fetches están en vuelo a la vez. Con `limit >= items.length` el
  comportamiento es idéntico al `Promise.allSettled` actual.
- No agregar dependencias npm nuevas para ninguna de las 3 mejoras.

---

### Task 1: `mapWithConcurrency()` + wiring en metrics.js (TDD)

**Files:**
- Create: `backend/lib/concurrency.js`
- Test: `backend/test/concurrency.test.js` (nuevo)
- Modify: `backend/routes/metrics.js:296-343` (`router.get('/')` y `pollAllServers`)

**Interfaces:**
- Produces: `mapWithConcurrency(items, limit, fn) -> Promise<PromiseSettledResult[]>` — mismo
  shape de resultado que `Promise.allSettled`, pero nunca despacha más de `limit` invocaciones de
  `fn` en vuelo a la vez.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/concurrency.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../lib/concurrency.js';

test('devuelve los resultados en el mismo orden que Promise.allSettled', async () => {
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
  assert.deepEqual(results, [
    { status: 'fulfilled', value: 10 },
    { status: 'fulfilled', value: 20 },
    { status: 'fulfilled', value: 30 },
    { status: 'fulfilled', value: 40 },
    { status: 'fulfilled', value: 50 },
  ]);
});

test('nunca despacha más de "limit" invocaciones en vuelo a la vez', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);

  await mapWithConcurrency(items, 3, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--;
    return n;
  });

  assert.ok(maxInFlight <= 3, `maxInFlight fue ${maxInFlight}, esperado <= 3`);
});

test('un rechazo individual no aborta el resto (mismo comportamiento que allSettled)', async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('falló el 2');
    return n;
  });

  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[0].value, 1);
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.message, 'falló el 2');
  assert.equal(results[2].status, 'fulfilled');
  assert.equal(results[2].value, 3);
});

test('limit mayor o igual a la cantidad de items se comporta igual que Promise.allSettled', async () => {
  const items = [1, 2, 3];
  const expected = await Promise.allSettled(items.map(n => Promise.resolve(n * 2)));
  const actual = await mapWithConcurrency(items, 10, async (n) => n * 2);
  assert.deepEqual(actual, expected);
});

test('array vacío devuelve array vacío sin invocar fn', async () => {
  let calls = 0;
  const results = await mapWithConcurrency([], 5, async () => { calls++; });
  assert.deepEqual(results, []);
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run (desde `D:\Workspace-Repos\workspace-ui`): `node --test backend/test/concurrency.test.js`

Expected: FAIL — `Cannot find module '../lib/concurrency.js'` (el archivo todavía no existe).

- [ ] **Step 3: Implementar `mapWithConcurrency`**

Crear `backend/lib/concurrency.js`:

```js
export async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...await Promise.allSettled(batch.map(fn)));
  }
  return results;
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `node --test backend/test/concurrency.test.js`

Expected: PASS — 5/5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/concurrency.js backend/test/concurrency.test.js
git commit -m "feat(metrics): mapWithConcurrency() — batches de tamaño fijo en vez de todo en paralelo"
```

- [ ] **Step 6: Conectar en `backend/routes/metrics.js`**

El bloque actual (línea 1, imports):

```js
import { Router } from 'express';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import { Client } from 'ssh2';
import { PATHS } from '../config.js';
```

Agregar el import nuevo al final del bloque:

```js
import { Router } from 'express';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import { Client } from 'ssh2';
import { PATHS } from '../config.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
```

El bloque actual (línea ~34):

```js
const router = Router();

const CACHE_TTL_MS = 60_000;
```

Agregar la constante de concurrencia junto a `CACHE_TTL_MS`:

```js
const router = Router();

const CACHE_TTL_MS = 60_000;
const METRICS_CONCURRENCY = 8;
```

El bloque actual de `router.get('/')` (línea 296-311):

```js
// GET /api/metrics — todos los servidores en paralelo
router.get('/', async (req, res) => {
  const force = req.query.force === '1';
  const now   = Date.now();

  const MONITORED = await getMonitoredServers();
  const ids = Object.keys(MONITORED);

  const results = await Promise.allSettled(
    ids.map((id) => fetchWithHistory(id, MONITORED[id], force, now))
  );

  res.json({
    metrics: results.map(r => r.status === 'fulfilled' ? r.value : { serverId: 'unknown', status: 'unreachable', error: r.reason?.message ?? 'unknown error' }),
    checkedAt: new Date().toISOString(),
  });
});
```

Reemplazar por:

```js
// GET /api/metrics — todos los servidores, en batches de METRICS_CONCURRENCY a la vez
router.get('/', async (req, res) => {
  const force = req.query.force === '1';
  const now   = Date.now();

  const MONITORED = await getMonitoredServers();
  const ids = Object.keys(MONITORED);

  const results = await mapWithConcurrency(
    ids, METRICS_CONCURRENCY, (id) => fetchWithHistory(id, MONITORED[id], force, now)
  );

  res.json({
    metrics: results.map(r => r.status === 'fulfilled' ? r.value : { serverId: 'unknown', status: 'unreachable', error: r.reason?.message ?? 'unknown error' }),
    checkedAt: new Date().toISOString(),
  });
});
```

El bloque actual de `pollAllServers` (línea 328-343):

```js
export async function pollAllServers(force = false) {
  const now = Date.now();
  const MONITORED = await getMonitoredServers();
  const ids = Object.keys(MONITORED);
  const results = await Promise.allSettled(
    ids.map((id) => fetchWithHistory(id, MONITORED[id], force, now))
  );
  return ids.map((id, i) => {
```

Reemplazar la línea de `Promise.allSettled` por `mapWithConcurrency` (el resto de la función, desde `return ids.map((id, i) => {` en adelante, no cambia):

```js
export async function pollAllServers(force = false) {
  const now = Date.now();
  const MONITORED = await getMonitoredServers();
  const ids = Object.keys(MONITORED);
  const results = await mapWithConcurrency(
    ids, METRICS_CONCURRENCY, (id) => fetchWithHistory(id, MONITORED[id], force, now)
  );
  return ids.map((id, i) => {
```

- [ ] **Step 7: Correr toda la suite backend**

Run: `node --test backend/test/*.test.js`

Expected: todos los tests pasan (48/48 + los 5 nuevos de `concurrency.test.js` = 53/53). No hay
test de integración existente para `metrics.js` — el smoke check es que la suite completa sigue
sin romperse (ningún otro archivo importa `metrics.js` de forma que rompa con este cambio).

- [ ] **Step 8: Verificar en vivo**

Con el backend corriendo, `curl http://localhost:8080/api/metrics` (o `?force=1`) y confirmar que
devuelve la misma cantidad de entradas en `metrics` que servers monitoreados hay — el número de
servers hoy (18) es menor que `METRICS_CONCURRENCY` (8)... en realidad 18 > 8, así que esto
dispara 3 batches (8+8+2) en vez de 1 batch de 18. Confirmar que la respuesta llega completa y
sin diferencias respecto al comportamiento anterior (mismos `serverId`, mismo `status`).

- [ ] **Step 9: Commit**

```bash
git add backend/routes/metrics.js
git commit -m "refactor(metrics): GET /api/metrics y pollAllServers usan mapWithConcurrency (batches de 8)"
```

---

### Task 2: Campos configurables (global, localStorage)

**Files:**
- Modify: `frontend/index.html` (toolbar + panel del tab Inventario)
- Modify: `frontend/style.css` (estilos del panel)
- Modify: `frontend/modules/tabs/inventory.js` (`buildServerCard`, `applyMetrics`, `initInventory`)

**Interfaces:**
- Produces: `getVisibleFields() -> { os, empresa, rol, ssh, metrics }` (todos boolean),
  `setVisibleFields(fields)` — usados por Task 2 exclusivamente (no consumidos por otras tasks).

- [ ] **Step 1: Agregar el botón y el panel al HTML**

En `frontend/index.html`, dentro del tab Inventario, el bloque actual (línea 354-374):

```html
      <div class="tab-panel hidden" id="tab-infra">
        <div class="ssl-toolbar view-toolbar">
          <div class="view-toolbar-start">
            <div class="btn-group infra-group-toggle">
              <button class="btn-tab btn-infra-group active" data-group="empresa">Empresa</button>
              <button class="btn-tab btn-infra-group" data-group="os">OS</button>
              <button class="btn-tab btn-infra-group" data-group="none">Sin agrupar</button>
              <button class="btn-tab btn-infra-group" data-group="list">Listado</button>
            </div>
          </div>
          <div class="view-toolbar-end">
            <span class="infra-counter" id="infra-counter"></span>
            <button class="btn btn-infra-monitored active" id="btn-infra-monitored">● Monitoreados</button>
            <button class="btn btn-success btn-ssl-refresh" id="btn-infra-metrics-refresh">↻ Métricas</button>
            <button class="btn btn-ssl-refresh" id="btn-infra-show-hidden" style="display:none">↺ Mostrar ocultos</button>
            <button class="btn btn-warning btn-ssl-manage"  id="btn-infra-manage">⚙ Gestionar</button>
          </div>
        </div>
        <div id="infra-container"></div>
        <div id="infra-manage-container" class="hidden"></div>
      </div>
```

Reemplazar por (agrega `#btn-infra-fields` en el toolbar y `#infra-fields-panel` después):

```html
      <div class="tab-panel hidden" id="tab-infra">
        <div class="ssl-toolbar view-toolbar">
          <div class="view-toolbar-start">
            <div class="btn-group infra-group-toggle">
              <button class="btn-tab btn-infra-group active" data-group="empresa">Empresa</button>
              <button class="btn-tab btn-infra-group" data-group="os">OS</button>
              <button class="btn-tab btn-infra-group" data-group="none">Sin agrupar</button>
              <button class="btn-tab btn-infra-group" data-group="list">Listado</button>
            </div>
          </div>
          <div class="view-toolbar-end">
            <span class="infra-counter" id="infra-counter"></span>
            <button class="btn btn-infra-monitored active" id="btn-infra-monitored">● Monitoreados</button>
            <button class="btn btn-success btn-ssl-refresh" id="btn-infra-metrics-refresh">↻ Métricas</button>
            <button class="btn btn-ssl-refresh" id="btn-infra-show-hidden" style="display:none">↺ Mostrar ocultos</button>
            <button class="btn btn-ssl-refresh" id="btn-infra-fields">👁 Vista</button>
            <button class="btn btn-warning btn-ssl-manage"  id="btn-infra-manage">⚙ Gestionar</button>
          </div>
        </div>
        <div class="infra-fields-panel hidden" id="infra-fields-panel"></div>
        <div id="infra-container"></div>
        <div id="infra-manage-container" class="hidden"></div>
      </div>
```

- [ ] **Step 2: CSS del panel**

En `frontend/style.css`, agregar cerca de `.view-toolbar-end` (buscar esa regla para ubicar la
sección correcta):

```css
.infra-fields-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 10px;
}
.infra-fields-panel.hidden { display: none; }
.infra-fields-panel-title {
  width: 100%;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 2px;
}
```

- [ ] **Step 3: `getVisibleFields`/`setVisibleFields`/`renderFieldsPanel` en `inventory.js`**

En `frontend/modules/tabs/inventory.js`, cerca de las otras constantes de localStorage (línea
15-16, `HIDDEN_SERVERS_KEY`/`HIDDEN_DISKS_KEY`), agregar:

```js
const VISIBLE_FIELDS_KEY = 'vcc-infra-visible-fields';
const DEFAULT_VISIBLE_FIELDS = { os: true, empresa: true, rol: true, ssh: true, metrics: true };
const FIELD_LABELS = { os: 'OS', empresa: 'Empresa', rol: 'Rol', ssh: 'SSH / WinRM / Puerto', metrics: 'Métricas (CPU/RAM/Disco)' };

function getVisibleFields() {
  try {
    const saved = JSON.parse(localStorage.getItem(VISIBLE_FIELDS_KEY) || '{}');
    return { ...DEFAULT_VISIBLE_FIELDS, ...saved };
  } catch {
    return { ...DEFAULT_VISIBLE_FIELDS };
  }
}

function setVisibleFields(fields) {
  localStorage.setItem(VISIBLE_FIELDS_KEY, JSON.stringify(fields));
}

function renderFieldsPanel() {
  const panel = document.getElementById('infra-fields-panel');
  if (!panel) return;
  const fields = getVisibleFields();
  panel.innerHTML =
    `<div class="infra-fields-panel-title">Campos visibles en las cards</div>` +
    Object.entries(FIELD_LABELS).map(([key, label]) =>
      `<label class="form-toggle-row"><input type="checkbox" class="infra-field-chk" data-field="${key}"${fields[key] ? ' checked' : ''}><span class="form-toggle-label">${label}</span></label>`
    ).join('');

  panel.querySelectorAll('.infra-field-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const updated = getVisibleFields();
      updated[chk.dataset.field] = chk.checked;
      setVisibleFields(updated);
      renderInventory(infraAllServers);
    });
  });
}
```

- [ ] **Step 4: Condicionar los campos en `buildServerCard`**

En `frontend/modules/tabs/inventory.js`, dentro de `buildServerCard(srv)`, el bloque actual
(línea 68-75, ya con la fila 2 de la sesión anterior):

```js
    `<div class="infra-card-row2">` +
      `<span class="infra-id" title="${escHtml(srv.id)}">${escHtml(srv.id)}</span>` +
      `<span class="infra-ip">${escHtml(srv.ip)}</span>` +
    `</div>` +
    `<div class="infra-os">${escHtml(srv.os)}</div>` +
    `<div class="infra-empresa">${escHtml(srv.empresa)}</div>` +
    `<div class="infra-rol">${escHtml(srv.rol)}</div>` +
    (srv.sshUser   ? `<div class="infra-ssh">${escHtml(srv.sshUser)}${srv.mysqlTunel ? ` · MySQL :${escHtml(String(srv.mysqlTunel))}` : ''}</div>` : '') +
    (srv.winrmUser ? `<div class="infra-ssh">WinRM: ${escHtml(srv.winrmUser)}</div>` : '') +
    (srv.puerto    ? `<div class="infra-ssh">Puerto ${escHtml(srv.puerto)}</div>` : '') +
    (srv.monitoreado ? `<div class="infra-metrics"><div class="metric-loading">actualizando…</div></div>` : '') +
```

Reemplazar por (la IP en la fila 2 no es configurable — solo lo que sigue):

```js
    `<div class="infra-card-row2">` +
      `<span class="infra-id" title="${escHtml(srv.id)}">${escHtml(srv.id)}</span>` +
      `<span class="infra-ip">${escHtml(srv.ip)}</span>` +
    `</div>` +
    (fields.os      ? `<div class="infra-os">${escHtml(srv.os)}</div>` : '') +
    (fields.empresa ? `<div class="infra-empresa">${escHtml(srv.empresa)}</div>` : '') +
    (fields.rol     ? `<div class="infra-rol">${escHtml(srv.rol)}</div>` : '') +
    (fields.ssh && srv.sshUser   ? `<div class="infra-ssh">${escHtml(srv.sshUser)}${srv.mysqlTunel ? ` · MySQL :${escHtml(String(srv.mysqlTunel))}` : ''}</div>` : '') +
    (fields.ssh && srv.winrmUser ? `<div class="infra-ssh">WinRM: ${escHtml(srv.winrmUser)}</div>` : '') +
    (fields.ssh && srv.puerto    ? `<div class="infra-ssh">Puerto ${escHtml(srv.puerto)}</div>` : '') +
    (fields.metrics && srv.monitoreado ? `<div class="infra-metrics"><div class="metric-loading">actualizando…</div></div>` : '') +
```

Y agregar la declaración de `fields` al principio de la función. El bloque actual (línea 49-57):

```js
function buildServerCard(srv) {
  const card = document.createElement('div');
  card.className = `infra-card risk-${srv.riesgo}`;
  card.dataset.server = srv.id;

  const riskColor = RISK_COLORS[srv.riesgo] ?? '#888';
  const riskLabel = RISK_LABELS[srv.riesgo] ?? srv.riesgo.toUpperCase();
  const hasDetails = srv.apps.length > 0 || srv.dominios.length > 0 || !!srv.notas;
```

Reemplazar por:

```js
function buildServerCard(srv) {
  const card = document.createElement('div');
  card.className = `infra-card risk-${srv.riesgo}`;
  card.dataset.server = srv.id;

  const fields = getVisibleFields();
  const riskColor = RISK_COLORS[srv.riesgo] ?? '#888';
  const riskLabel = RISK_LABELS[srv.riesgo] ?? srv.riesgo.toUpperCase();
  const hasDetails = srv.apps.length > 0 || srv.dominios.length > 0 || !!srv.notas;
```

- [ ] **Step 5: Corregir `applyMetrics` para respetar el campo métricas oculto**

**Bug real encontrado al diseñar este plan:** `applyMetrics` recrea `.infra-metrics` dentro de la
card si no la encuentra (`if (!metricsEl) { ... crear ... }`) — si `buildServerCard` no la
renderiza porque `fields.metrics` es `false`, `applyMetrics` la vuelve a insertar en cuanto llega
una métrica, dejando el toggle sin efecto real. En `frontend/modules/tabs/inventory.js`, el
bloque actual (línea 810-825):

```js
  // Vista card
  const card = document.querySelector(`.infra-card[data-server="${escHtml(m.serverId)}"]`);
  if (card) {
    const dot = card.querySelector(`.infra-conn-dot[data-conn="${escHtml(m.serverId)}"]`);
    if (dot) { dot.className = `infra-conn-dot ${cls}`; dot.title = tip; }
    let metricsEl = card.querySelector('.infra-metrics');
    if (!metricsEl) {
      metricsEl = document.createElement('div');
      metricsEl.className = 'infra-metrics';
      const toggle = card.querySelector('.infra-toggle');
      if (toggle) card.insertBefore(metricsEl, toggle);
      else card.appendChild(metricsEl);
    }
    metricsEl.innerHTML = metricsHtml;
    flashChangedBars(metricsEl, prev, base);
  }
```

Reemplazar por:

```js
  // Vista card
  const card = document.querySelector(`.infra-card[data-server="${escHtml(m.serverId)}"]`);
  if (card) {
    const dot = card.querySelector(`.infra-conn-dot[data-conn="${escHtml(m.serverId)}"]`);
    if (dot) { dot.className = `infra-conn-dot ${cls}`; dot.title = tip; }
    if (getVisibleFields().metrics) {
      let metricsEl = card.querySelector('.infra-metrics');
      if (!metricsEl) {
        metricsEl = document.createElement('div');
        metricsEl.className = 'infra-metrics';
        const toggle = card.querySelector('.infra-toggle');
        if (toggle) card.insertBefore(metricsEl, toggle);
        else card.appendChild(metricsEl);
      }
      metricsEl.innerHTML = metricsHtml;
      flashChangedBars(metricsEl, prev, base);
    }
  }
```

(el `dot` de conexión en el header sigue actualizándose siempre — es un indicador de estado de
la fila 1, no parte del bloque de métricas, no lo controla este toggle.)

- [ ] **Step 6: Wiring del botón en `initInventory`**

En `frontend/modules/tabs/inventory.js`, dentro de `initInventory` (después de la línea del
listener de `#btn-infra-show-hidden`, buscar ese bloque para ubicar el punto de inserción),
agregar:

```js
  // Panel de campos visibles
  document.getElementById('btn-infra-fields')?.addEventListener('click', () => {
    const panel = document.getElementById('infra-fields-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) renderFieldsPanel();
    panel.classList.toggle('hidden');
  });
```

- [ ] **Step 7: Verificar en vivo**

Con el backend corriendo, tab Inventario → "👁 Vista": confirmar que abre el panel con 5
checkboxes, todos tildados por default. Destildar "Métricas": confirmar que las 18 cards pierden
el bloque CPU/RAM/Disco de inmediato (sin recargar), y que **no vuelve a aparecer** cuando llega
la próxima actualización de métricas (confirma el fix de `applyMetrics`). Destildar "OS":
confirmar que la línea de OS desaparece de todas las cards. Recargar la página completa: confirmar
que la preferencia persiste (sigue sin mostrar Métricas/OS). Volver a tildar todo y confirmar que
vuelve al estado original.

- [ ] **Step 8: Commit**

```bash
git add frontend/index.html frontend/style.css frontend/modules/tabs/inventory.js
git commit -m "feat(inventory): campos de card configurables (OS/Empresa/Rol/SSH/Métricas), global vía localStorage"
```

---

### Task 3: Buscador en Inventario (TDD)

**Files:**
- Modify: `frontend/index.html` (input de búsqueda en la toolbar)
- Modify: `frontend/modules/tabs/inventory.js` (`filterServers`, `renderInventory`, `initInventory`)
- Test: `frontend/test/inventory-filter.test.js` (nuevo)

**Interfaces:**
- Produces: `filterServers(servers, texto) -> servers[]` — función pura, exportada, mismo patrón
  que `filterLinks` de la sesión anterior.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/test/inventory-filter.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterServers } from '../modules/tabs/inventory.js';

function fixtureServers() {
  return [
    { id: 'srv-appstest', ip: '10.145.2.26', empresa: 'DIGNA / Fincos', rol: 'Test multi-aplicación Laravel', os: 'Ubuntu 22.04' },
    { id: 'srv-n001', ip: '172.16.100.129', empresa: 'NRE Seguros', rol: 'Hyper-V (CLUSTER01)', os: 'Windows Server 2019 Datacenter' },
    { id: 'srv-proxy', ip: '172.16.102.235', empresa: 'NRE Seguros', rol: 'Apache Proxy', os: 'Ubuntu 22.04.5 LTS' },
  ];
}

test('sin texto devuelve todos los servers sin tocar el array', () => {
  const result = filterServers(fixtureServers(), '');
  assert.equal(result.length, 3);
});

test('texto matchea por id, case-insensitive', () => {
  const result = filterServers(fixtureServers(), 'PROXY');
  assert.deepEqual(result.map(s => s.id), ['srv-proxy']);
});

test('texto matchea por IP', () => {
  const result = filterServers(fixtureServers(), '172.16.100.129');
  assert.deepEqual(result.map(s => s.id), ['srv-n001']);
});

test('texto matchea por empresa', () => {
  const result = filterServers(fixtureServers(), 'nre seguros');
  assert.deepEqual(result.map(s => s.id).sort(), ['srv-n001', 'srv-proxy']);
});

test('texto matchea por rol', () => {
  const result = filterServers(fixtureServers(), 'hyper-v');
  assert.deepEqual(result.map(s => s.id), ['srv-n001']);
});

test('texto matchea por os', () => {
  const result = filterServers(fixtureServers(), 'windows');
  assert.deepEqual(result.map(s => s.id), ['srv-n001']);
});

test('texto sin coincidencias devuelve vacío', () => {
  const result = filterServers(fixtureServers(), 'zzz-no-existe');
  assert.equal(result.length, 0);
});

test('texto undefined no filtra', () => {
  const result = filterServers(fixtureServers());
  assert.equal(result.length, 3);
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run (desde `D:\Workspace-Repos\workspace-ui`): `node --test frontend/test/inventory-filter.test.js`

Expected: FAIL — `filterServers` no existe todavía / no está exportada.

- [ ] **Step 3: Implementar `filterServers` en `inventory.js`**

En `frontend/modules/tabs/inventory.js`, agregar cerca de `groupServers` (línea ~149, antes de
esa función):

```js
export function filterServers(servers, texto) {
  const needle = (texto ?? '').trim().toLowerCase();
  if (!needle) return servers;
  return servers.filter(s =>
    `${s.id} ${s.ip} ${s.empresa} ${s.rol} ${s.os}`.toLowerCase().includes(needle)
  );
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `node --test frontend/test/inventory-filter.test.js`

Expected: PASS — 8/8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/inventory.js frontend/test/inventory-filter.test.js
git commit -m "feat(inventory): filterServers acepta texto opcional (id/IP/empresa/rol/OS)"
```

- [ ] **Step 6: Input de búsqueda en la UI**

En `frontend/index.html`, dentro del tab Inventario, el bloque actual (tras el Step 1 de Task 2,
`.view-toolbar-start`):

```html
          <div class="view-toolbar-start">
            <div class="btn-group infra-group-toggle">
              <button class="btn-tab btn-infra-group active" data-group="empresa">Empresa</button>
              <button class="btn-tab btn-infra-group" data-group="os">OS</button>
              <button class="btn-tab btn-infra-group" data-group="none">Sin agrupar</button>
              <button class="btn-tab btn-infra-group" data-group="list">Listado</button>
            </div>
          </div>
```

Reemplazar por (reusa las clases `links-search-*` ya existentes de la sesión anterior — mismo
componente visual, sin duplicar CSS):

```html
          <div class="view-toolbar-start">
            <div class="btn-group infra-group-toggle">
              <button class="btn-tab btn-infra-group active" data-group="empresa">Empresa</button>
              <button class="btn-tab btn-infra-group" data-group="os">OS</button>
              <button class="btn-tab btn-infra-group" data-group="none">Sin agrupar</button>
              <button class="btn-tab btn-infra-group" data-group="list">Listado</button>
            </div>
            <div class="links-search-wrap">
              <input type="text" class="form-input links-search-input" id="infra-search" placeholder="Buscar...">
              <button class="links-search-clear hidden" id="infra-search-clear" title="Limpiar búsqueda">×</button>
            </div>
          </div>
```

- [ ] **Step 7: Estado + wiring en `inventory.js`**

En `frontend/modules/tabs/inventory.js`, agregar la variable de módulo junto a
`infraFilterMonitored` (línea 18):

```js
let infraFilterMonitored = true;
let infraFilterTexto     = '';
```

En `renderInventory(servers)`, el bloque actual (línea 214-219):

```js
function renderInventory(servers) {
  const c = document.getElementById('infra-container');
  const hidden = getHidden();
  const pool   = infraFilterMonitored ? servers.filter(s => s.monitoreado) : servers;
  const visible = pool.filter(s => !hidden.has(s.id));
  const hiddenCount = pool.length - visible.length;
```

Reemplazar por (el buscador filtra DESPUÉS de restar los ocultados por `×`, así `hiddenCount`
sigue reflejando solo lo ocultado manualmente, no lo que el texto de búsqueda excluye):

```js
function renderInventory(servers) {
  const c = document.getElementById('infra-container');
  const hidden = getHidden();
  const pool      = infraFilterMonitored ? servers.filter(s => s.monitoreado) : servers;
  const notHidden = pool.filter(s => !hidden.has(s.id));
  const hiddenCount = pool.length - notHidden.length;
  const visible = filterServers(notHidden, infraFilterTexto);
```

En `initInventory`, agregar el wiring (junto al resto de listeners de filtro, después del bloque
de `#btn-infra-show-hidden`):

```js
  const infraSearchInput = document.getElementById('infra-search');
  const infraSearchClear = document.getElementById('infra-search-clear');
  infraSearchInput?.addEventListener('input', (e) => {
    infraFilterTexto = e.target.value;
    infraSearchClear?.classList.toggle('hidden', infraFilterTexto === '');
    renderInventory(infraAllServers);
  });
  infraSearchClear?.addEventListener('click', () => {
    infraFilterTexto = '';
    if (infraSearchInput) infraSearchInput.value = '';
    infraSearchClear.classList.add('hidden');
    infraSearchInput?.focus();
    renderInventory(infraAllServers);
  });
```

- [ ] **Step 8: Verificar en vivo**

Tab Inventario: escribir un nombre real de server (ej. `"proxy"`) — confirmar que el grid se
reduce a ese resultado en cada tecla, el contador `#infra-counter` se actualiza, y el botón ×
aparece/limpia correctamente. Combinar con "● Monitoreados" activo y confirmar que el buscador
filtra dentro del subconjunto monitoreado (AND). Confirmar que buscar no afecta el contador de
"↺ Mostrar ocultos" (sigue mostrando solo lo ocultado manualmente, no lo filtrado por texto).

- [ ] **Step 9: Commit**

```bash
git add frontend/index.html frontend/modules/tabs/inventory.js
git commit -m "feat(inventory): input de búsqueda en la toolbar (reusa links-search-* de Links)"
```

---

### Task 4: Verificación final cruzada

**Files:**
- Ninguno de código — solo verificación.

- [ ] **Step 1: Suite completa**

Run (desde `D:\Workspace-Repos\workspace-ui`):
```
node --test backend/test/*.test.js
node --test frontend/test/*.test.js
```

Expected: 53/53 backend (48 + 5 nuevos de concurrency), 25/25 frontend (17 + 8 nuevos de
inventory-filter).

- [ ] **Step 2: Recorrido Playwright combinado**

Con el backend corriendo: abrir Inventario, combinar las 3 mejoras en un solo flujo — buscar un
server real, con "👁 Vista" ocultar Métricas y Empresa, confirmar que el resultado filtrado sigue
mostrando los campos correctos (sin Métricas/Empresa) y que recargar la página mantiene tanto la
config de campos (localStorage) como resetea el buscador (esperado — el texto de búsqueda no se
persiste, es estado de sesión). Confirmar `curl http://localhost:8080/api/metrics` sigue
devolviendo los 18 servers monitoreados con el mismo shape que antes del cambio de concurrencia.

- [ ] **Step 3: Commit final si Step 2 encontró algo**

Si el recorrido combinado detectó algo pendiente, resolverlo acá con su propio commit antes de
cerrar el plan.
