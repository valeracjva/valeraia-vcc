# M14 Modo Incidente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar "Modo Incidente" al tab Mapa Operativo de VCC: al activarlo y seleccionar un nodo `server` o `domain`, se calcula y resalta en el radar qué nodos dependen de él (downstream), y el panel lateral muestra un resumen agrupado por tipo.

**Architecture:** Toda la lógica nueva vive en el frontend, sin cambios de backend. Un módulo puro nuevo (`frontend/opsmap-impact.js`) calcula el impacto vía BFS no dirigido sobre un subconjunto de tipos de link del grafo que ya devuelve `/api/opsmap`. `frontend/app.js` importa esa función y la usa para resaltar nodos en el radar (clases CSS `impacted`/`dimmed`) y renderizar un panel de impacto alternativo al detalle normal.

**Tech Stack:** Vanilla JS (ESM, sin bundler), Node.js `node:test`/`node:assert` para unit tests, Express (sin cambios), CSS plano.

## Global Constraints

- Sin cambios de backend ni del endpoint `/api/opsmap` (spec: "sin cambios de backend").
- Impacto es **solo downstream** — no calcular upstream.
- Solo nodos `server` y `domain` disparan el análisis de impacto; otros tipos siguen mostrando detalle normal aunque el modo esté activo.
- Los links que tocan el nodo `workspace` (`contains`, `monitors`, `has-project`, `has-tunnel`, `current`) nunca se siguen en el cálculo de impacto.
- Nada de esto persiste en disco — es una vista derivada y efímera (spec: "Fuera de alcance: persistencia de incidentes").

---

### Task 1: Módulo puro `computeImpact` + tests

**Files:**
- Create: `frontend/package.json` (marca el directorio como ESM para que `node --test` pueda usar `import`/`export`; `frontend/` no tiene `package.json` propio hoy y no hay uno en la raíz del repo, así que Node trata los `.js` como CommonJS por defecto)
- Create: `frontend/opsmap-impact.js`
- Test: `frontend/test/opsmap-impact.test.js`

**Interfaces:**
- Produces: `computeImpact(nodeId: string, nodes: Array<{id, type, state, ...}>, links: Array<{from, to, type, label}>) -> { originId: string, impacted: Array<Node>, byType: Record<string, Array<Node>>, hasCritical: boolean }`
  - `impacted`: nodos alcanzables desde `nodeId` siguiendo únicamente links cuyo `type` esté en `{'runs-on', 'exposes', 'tunnel-to', 'uses-mcp', 'has-env'}`, tratados como no dirigidos, excluyendo al propio `nodeId`.
  - `byType`: `impacted` agrupado por `node.type`, mismo orden de aparición del BFS.
  - `hasCritical`: `true` si algún nodo de `impacted` tiene `state === 'critico'`.

- [ ] **Step 1: Crear `frontend/package.json` y el test que falla**

Crear `frontend/package.json`:

```json
{
  "name": "vcc-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

Crear `frontend/test/opsmap-impact.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeImpact } from '../opsmap-impact.js';

function fixtureGraph() {
  const nodes = [
    { id: 'workspace', type: 'workspace', label: 'ValeraIA', state: 'fresh' },
    { id: 'server:srv1', type: 'server', label: 'srv1', state: 'fresh' },
    { id: 'domain:example.com', type: 'domain', label: 'example.com', state: 'watch' },
    { id: 'env:proj1:prod', type: 'environment', label: 'prod', state: 'critico' },
    { id: 'project:proj1', type: 'project', label: 'proj1', state: 'fresh' },
    { id: 'tunnel:3309', type: 'tunnel', label: '3309', state: 'critico' },
    { id: 'mcp:laravel-dev-full', type: 'mcp', label: 'laravel-dev-full', state: 'fresh' },
    { id: 'server:srv2', type: 'server', label: 'srv2', state: 'fresh' },
    { id: 'domain:app.test', type: 'domain', label: 'app.test', state: 'watch' },
    { id: 'env:proj2:dev', type: 'environment', label: 'dev', state: 'fresh' },
    { id: 'project:proj2', type: 'project', label: 'proj2', state: 'fresh' },
    { id: 'domain:isolated.com', type: 'domain', label: 'isolated.com', state: 'idle' },
  ];

  const links = [
    { from: 'workspace', to: 'server:srv1', type: 'contains', label: 'inventario' },
    { from: 'workspace', to: 'server:srv2', type: 'contains', label: 'inventario' },
    { from: 'server:srv1', to: 'domain:example.com', type: 'exposes', label: 'expone' },
    { from: 'workspace', to: 'domain:example.com', type: 'monitors', label: 'monitorea SSL' },
    { from: 'workspace', to: 'domain:isolated.com', type: 'monitors', label: 'monitorea SSL' },
    { from: 'workspace', to: 'project:proj1', type: 'has-project', label: 'proyecto' },
    { from: 'project:proj1', to: 'env:proj1:prod', type: 'has-env', label: 'ambiente' },
    { from: 'env:proj1:prod', to: 'server:srv1', type: 'runs-on', label: 'corre en' },
    { from: 'env:proj1:prod', to: 'mcp:laravel-dev-full', type: 'uses-mcp', label: 'usa MCP' },
    { from: 'workspace', to: 'tunnel:3309', type: 'has-tunnel', label: 'tunel' },
    { from: 'tunnel:3309', to: 'server:srv1', type: 'tunnel-to', label: 'conecta' },
    { from: 'workspace', to: 'project:proj2', type: 'has-project', label: 'proyecto' },
    { from: 'project:proj2', to: 'env:proj2:dev', type: 'has-env', label: 'ambiente' },
    { from: 'env:proj2:dev', to: 'server:srv2', type: 'runs-on', label: 'corre en' },
    { from: 'server:srv2', to: 'domain:app.test', type: 'exposes', label: 'expone' },
  ];

  return { nodes, links };
}

test('server con env + domain + tunnel + mcp: impacto completo y crítico', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('server:srv1', nodes, links);

  const impactedIds = result.impacted.map(n => n.id).sort();
  assert.deepEqual(impactedIds, [
    'domain:example.com',
    'env:proj1:prod',
    'mcp:laravel-dev-full',
    'project:proj1',
    'tunnel:3309',
  ]);
  assert.equal(result.hasCritical, true);
  assert.equal(result.byType.domain.length, 1);
  assert.equal(result.byType.environment.length, 1);
  assert.equal(result.byType.project.length, 1);
  assert.equal(result.byType.tunnel.length, 1);
  assert.equal(result.byType.mcp.length, 1);
});

test('server sin nodos críticos: impacto sin badge crítico', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('server:srv2', nodes, links);

  const impactedIds = result.impacted.map(n => n.id).sort();
  assert.deepEqual(impactedIds, [
    'domain:app.test',
    'env:proj2:dev',
    'project:proj2',
  ]);
  assert.equal(result.hasCritical, false);
});

test('domain aislado: impacto vacío', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('domain:isolated.com', nodes, links);

  assert.deepEqual(result.impacted, []);
  assert.deepEqual(result.byType, {});
  assert.equal(result.hasCritical, false);
});

test('no cruza por workspace ni mezcla clusters', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('server:srv1', nodes, links);

  const impactedIds = new Set(result.impacted.map(n => n.id));
  assert.equal(impactedIds.has('workspace'), false);
  assert.equal(impactedIds.has('server:srv2'), false);
  assert.equal(impactedIds.has('domain:app.test'), false);
  assert.equal(impactedIds.has('env:proj2:dev'), false);
  assert.equal(impactedIds.has('project:proj2'), false);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && node --test test/opsmap-impact.test.js`
Expected: FAIL — `Cannot find module '../opsmap-impact.js'`

- [ ] **Step 3: Implementar `computeImpact`**

Crear `frontend/opsmap-impact.js`:

```javascript
const IMPACT_LINK_TYPES = new Set(['runs-on', 'exposes', 'tunnel-to', 'uses-mcp', 'has-env']);

export function computeImpact(nodeId, nodes, links) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adjacency = new Map();

  for (const link of links) {
    if (!IMPACT_LINK_TYPES.has(link.type)) continue;
    if (!adjacency.has(link.from)) adjacency.set(link.from, []);
    if (!adjacency.has(link.to)) adjacency.set(link.to, []);
    adjacency.get(link.from).push(link.to);
    adjacency.get(link.to).push(link.from);
  }

  const visited = new Set([nodeId]);
  const queue = [...(adjacency.get(nodeId) ?? [])];
  const impacted = [];

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) impacted.push(node);
    for (const next of adjacency.get(id) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  const byType = {};
  for (const node of impacted) {
    (byType[node.type] ??= []).push(node);
  }

  return {
    originId: nodeId,
    impacted,
    byType,
    hasCritical: impacted.some(n => n.state === 'critico'),
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && node --test test/opsmap-impact.test.js`
Expected: PASS — `tests 4`, `pass 4`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/opsmap-impact.js frontend/test/opsmap-impact.test.js
git commit -m "feat(vcc): computeImpact puro para modo incidente M14"
```

---

### Task 2: Toggle "Modo Incidente" en el toolbar

**Files:**
- Modify: `frontend/index.html:246-254`

**Interfaces:**
- Produces: elemento `<input type="checkbox" id="opsmap-incident-toggle">` que Task 4 escucha vía `addEventListener('change', ...)`.

- [ ] **Step 1: Agregar el checkbox al toolbar**

En `frontend/index.html`, reemplazar el bloque `.view-toolbar-end` del tab Mapa Operativo:

```html
          <div class="view-toolbar-end">
            <label class="opsmap-incident-toggle" for="opsmap-incident-toggle">
              <input type="checkbox" id="opsmap-incident-toggle">
              Modo Incidente
            </label>
            <button class="btn btn-success" id="btn-opsmap-refresh">↻ Sincronizar</button>
          </div>
```

- [ ] **Step 2: Verificar visualmente**

Run: `cd backend && npm start` (o el alias `vcc` si está disponible), abrir `http://localhost:8080`, ir al tab Mapa Operativo.
Expected: se ve el checkbox "Modo Incidente" sin estilo (checkbox de navegador) a la izquierda del botón "↻ Sincronizar". Sin errores en consola del navegador.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat(vcc): toggle Modo Incidente en toolbar de Mapa Operativo"
```

---

### Task 3: Estilos del modo incidente

**Files:**
- Modify: `frontend/style.css` (agregar bloque nuevo después de la sección `/* ── F2. Mapa Operativo — Command Center ─────────────────────────────── */`, cerca de `.opsmap-detail-state` ~línea 2825)

**Interfaces:**
- Consumes: nada (solo CSS).
- Produces: clases `.opsmap-incident-toggle`, `.ops-node.impacted`, `.ops-node.dimmed`, `.opsmap-impact-badge`, `.opsmap-impact-groups`, `.opsmap-impact-group-label`, `.opsmap-impact-item` — usadas por Task 4.

- [ ] **Step 1: Agregar los estilos**

En `frontend/style.css`, después del bloque que termina en (busca la línea con) `.opsmap-detail-state.state-critico { color: var(--danger); border-color: rgba(239,68,68,0.34); }`, agregar:

```css
.opsmap-incident-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  cursor: pointer;
}
.opsmap-incident-toggle input[type="checkbox"] {
  accent-color: var(--danger);
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.ops-node.impacted {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px rgba(239,68,68,0.35), 0 18px 34px rgba(0,0,0,0.24);
}
.ops-node.dimmed { opacity: 0.28; }

.opsmap-impact-badge {
  display: inline-block;
  margin: 8px 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(239,68,68,0.4);
  color: var(--danger);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.opsmap-impact-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.opsmap-impact-group-label {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 4px;
}
.opsmap-impact-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  margin-bottom: 4px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
}
.opsmap-impact-item:hover { border-color: var(--accent-2); }
```

- [ ] **Step 2: Verificar visualmente**

Run: recargar `http://localhost:8080` en el tab Mapa Operativo (con el servidor de Task 2 corriendo).
Expected: el checkbox "Modo Incidente" ahora tiene tilde en color rojo (`--danger`) cuando está marcado. Sin cambios visuales en el resto de la vista (las clases `impacted`/`dimmed`/`opsmap-impact-*` todavía no se usan hasta Task 4).

- [ ] **Step 3: Commit**

```bash
git add frontend/style.css
git commit -m "feat(vcc): estilos modo incidente (resaltado, badge, lista de impacto)"
```

---

### Task 4: Wiring en `app.js` — estado, resaltado y panel de impacto

**Files:**
- Modify: `frontend/app.js:1-1` (agregar import al inicio del archivo)
- Modify: `frontend/app.js:1112-1113` (agregar estado `incidentMode`)
- Modify: `frontend/app.js:1286-1309` (loop de creación de nodos y su click handler, dentro de `renderOpsMap`)
- Modify: `frontend/app.js:1652-1654` (`initOpsMap`)

**Interfaces:**
- Consumes: `computeImpact(nodeId, nodes, links)` de `./opsmap-impact.js` (Task 1); `escHtml(str)` ya definido en `app.js`.
- Produces: `applyIncidentHighlight(impactResult | null)`, `renderImpactPanel(origin, impactResult)` — funciones nuevas usadas solo dentro de este archivo.

- [ ] **Step 1: Agregar el import al inicio de `frontend/app.js`**

`frontend/app.js` no tiene imports hoy (es el punto de entrada del `type="module"`). Agregar como primera línea del archivo:

```javascript
import { computeImpact } from './opsmap-impact.js';
```

- [ ] **Step 2: Agregar el estado `incidentMode`**

En `frontend/app.js`, ubicar (línea 1113 aprox.):

```javascript
// === F2 — Mapa Operativo ===
let opsMapData = null;
```

Reemplazar por:

```javascript
// === F2 — Mapa Operativo ===
let opsMapData = null;
let incidentMode = false;
```

- [ ] **Step 3: Agregar `applyIncidentHighlight` y `renderImpactPanel`**

En `frontend/app.js`, ubicar la función `renderOpsDetail` (línea 1202 aprox.):

```javascript
function renderOpsDetail(node) {
  const detail = document.getElementById('opsmap-detail');
  if (!detail || !node) return;
  detail.innerHTML = `
    <div class="opsmap-detail-kicker">${escHtml(node.type)}</div>
    <div class="opsmap-detail-title">${escHtml(node.label)}</div>
    <div class="opsmap-detail-sub">${escHtml(node.sub)}</div>
    <p>${escHtml(node.detail)}</p>
    <div class="opsmap-detail-state state-${escHtml(node.state)}">${escHtml(node.state)}</div>
  `;
}
```

Justo debajo, agregar dos funciones nuevas:

```javascript
const OPS_TYPE_LABELS = {
  server: 'servidores',
  domain: 'dominios',
  environment: 'ambientes',
  project: 'proyectos',
  tunnel: 'túneles',
  mcp: 'MCPs',
};

function applyIncidentHighlight(impactResult) {
  const nodesEl = document.getElementById('opsmap-nodes');
  if (!nodesEl) return;
  const impactedIds = new Set(impactResult ? impactResult.impacted.map(n => n.id) : []);
  if (impactResult) impactedIds.add(impactResult.originId);
  nodesEl.querySelectorAll('.ops-node').forEach(el => {
    el.classList.remove('impacted', 'dimmed');
    if (!impactResult) return;
    if (impactedIds.has(el.dataset.nodeId)) el.classList.add('impacted');
    else el.classList.add('dimmed');
  });
}

function renderImpactPanel(origin, impactResult) {
  const detail = document.getElementById('opsmap-detail');
  if (!detail) return;

  const counts = Object.entries(impactResult.byType)
    .map(([type, list]) => `${list.length} ${OPS_TYPE_LABELS[type] ?? type}`)
    .join(' · ') || 'sin nodos impactados';

  const groups = Object.entries(impactResult.byType).map(([type, list]) => `
    <div class="opsmap-impact-group">
      <div class="opsmap-impact-group-label">${escHtml(OPS_TYPE_LABELS[type] ?? type)}</div>
      ${list.map(n => `<button class="opsmap-impact-item" data-node-id="${escHtml(n.id)}">${escHtml(n.label)}</button>`).join('')}
    </div>
  `).join('');

  detail.innerHTML = `
    <div class="opsmap-detail-kicker">Modo incidente</div>
    <div class="opsmap-detail-title">${escHtml(origin.label)}</div>
    <div class="opsmap-detail-sub">${escHtml(counts)}</div>
    ${impactResult.hasCritical ? '<div class="opsmap-impact-badge">Impacto crítico</div>' : ''}
    <div class="opsmap-impact-groups">${groups || '<p>No hay nodos impactados.</p>'}</div>
  `;

  detail.querySelectorAll('.opsmap-impact-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const node = (opsMapData?.nodes ?? []).find(n => n.id === btn.dataset.nodeId);
      if (node) {
        applyIncidentHighlight(null);
        renderOpsDetail(node);
      }
    });
  });
}
```

- [ ] **Step 4: Modificar el click handler de los nodos en `renderOpsMap`**

En `frontend/app.js`, ubicar dentro de `renderOpsMap` el bloque:

```javascript
  const nodesEl = document.getElementById('opsmap-nodes');
  nodes.forEach((node, index) => {
    const btn = document.createElement('button');
    const angle = index === 0 ? 0 : ((index - 1) / Math.max(nodes.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = index === 0 ? 0 : 38 + ((index % 3) * 11);
    const x = index === 0 ? 50 : 50 + Math.cos(angle) * radius;
    const y = index === 0 ? 50 : 50 + Math.sin(angle) * radius;
    btn.className = `ops-node type-${node.type} state-${node.state}${index === 0 ? ' is-core' : ''}`;
    btn.style.left = `${Math.max(8, Math.min(92, x))}%`;
    btn.style.top = `${Math.max(8, Math.min(92, y))}%`;
    btn.innerHTML = `<strong>${escHtml(node.label)}</strong><span>${escHtml(node.sub)}</span>`;
    btn.addEventListener('click', () => {
      nodesEl.querySelectorAll('.ops-node').forEach(n => n.classList.remove('selected'));
      btn.classList.add('selected');
      renderOpsDetail(node);
    });
    nodesEl.appendChild(btn);
    if (index === 0) btn.classList.add('selected');
  });
```

Reemplazar por:

```javascript
  const nodesEl = document.getElementById('opsmap-nodes');
  nodes.forEach((node, index) => {
    const btn = document.createElement('button');
    const angle = index === 0 ? 0 : ((index - 1) / Math.max(nodes.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = index === 0 ? 0 : 38 + ((index % 3) * 11);
    const x = index === 0 ? 50 : 50 + Math.cos(angle) * radius;
    const y = index === 0 ? 50 : 50 + Math.sin(angle) * radius;
    btn.className = `ops-node type-${node.type} state-${node.state}${index === 0 ? ' is-core' : ''}`;
    btn.dataset.nodeId = node.id;
    btn.style.left = `${Math.max(8, Math.min(92, x))}%`;
    btn.style.top = `${Math.max(8, Math.min(92, y))}%`;
    btn.innerHTML = `<strong>${escHtml(node.label)}</strong><span>${escHtml(node.sub)}</span>`;
    btn.addEventListener('click', () => {
      nodesEl.querySelectorAll('.ops-node').forEach(n => n.classList.remove('selected'));
      btn.classList.add('selected');
      const canAnalyzeImpact = incidentMode && (node.type === 'server' || node.type === 'domain') && data.nodes && data.links;
      if (canAnalyzeImpact) {
        const impactResult = computeImpact(node.id, data.nodes, data.links);
        applyIncidentHighlight(impactResult);
        renderImpactPanel(node, impactResult);
      } else {
        applyIncidentHighlight(null);
        renderOpsDetail(node);
      }
    });
    nodesEl.appendChild(btn);
    if (index === 0) btn.classList.add('selected');
  });
```

- [ ] **Step 5: Escuchar el toggle en `initOpsMap`**

En `frontend/app.js`, ubicar:

```javascript
function initOpsMap() {
  document.getElementById('btn-opsmap-refresh')?.addEventListener('click', () => loadOpsMap());
}
```

Reemplazar por:

```javascript
function initOpsMap() {
  document.getElementById('btn-opsmap-refresh')?.addEventListener('click', () => loadOpsMap());
  document.getElementById('opsmap-incident-toggle')?.addEventListener('change', (e) => {
    incidentMode = e.target.checked;
    if (!incidentMode) {
      applyIncidentHighlight(null);
      const nodesEl = document.getElementById('opsmap-nodes');
      const selectedBtn = nodesEl?.querySelector('.ops-node.selected');
      const selectedNode = selectedBtn
        ? (opsMapData?.nodes ?? []).find(n => n.id === selectedBtn.dataset.nodeId)
        : null;
      if (selectedNode) renderOpsDetail(selectedNode);
    }
  });
}
```

- [ ] **Step 6: Verificar manualmente en el navegador**

Run: con el server corriendo (`cd backend && npm start` o alias `vcc`), abrir `http://localhost:8080`, tab Mapa Operativo.

Expected (probar en orden):
1. Tildar "Modo Incidente".
2. Click en un nodo `server` (tipo servidor, ej. cualquiera del inventario): el nodo y sus dependientes quedan con borde rojo (`impacted`), el resto atenuado (`dimmed`); el panel lateral muestra "Modo incidente", el nombre del server, el conteo por tipo y la lista agrupada.
3. Click en un ítem de la lista del panel: se limpia el resaltado y se muestra el detalle normal de ese nodo (como antes de M14).
4. Click en un nodo `project` (no server/domain) estando el modo activo: muestra detalle normal, sin recalcular impacto.
5. Destildar "Modo Incidente": se limpia cualquier resaltado remanente y vuelve el comportamiento original.
6. Sin errores en la consola del navegador en ningún paso.

- [ ] **Step 7: Correr toda la suite de tests**

Run: `cd frontend && node --test test/`
Expected: PASS — `tests 4`, `pass 4`, `fail 0` (mismos tests de Task 1, sin regresiones).

- [ ] **Step 8: Commit**

```bash
git add frontend/app.js
git commit -m "feat(vcc): modo incidente M14 — resaltado de impacto y panel agrupado"
```
