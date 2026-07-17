# Persistencia de filtros y vista por módulo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un helper genérico y reusable (`loadState`/`saveState`) que persista en `localStorage` el estado de filtro/vista de Links, Inventario, MCPs, SSL y Proyectos — hoy se resetean a su default en cada recarga de página porque viven solo en variables de módulo en memoria.

**Architecture:** Un archivo nuevo, chico y puro (`frontend/modules/core/persist.js`) con dos funciones (`loadState`/`saveState`) que serializan siempre con JSON y aceptan un `storage` inyectable (default `globalThis.localStorage`) para ser testeables sin jsdom. Cada módulo de tab (`links.js`, `inventory.js`, `mcp.js`, `ssl.js`, `projects.js`) lo importa, siembra sus variables de filtro al iniciar y guarda en cada handler de cambio — sin tocar la lógica de filtrado en sí (`filterLinks`, `filterServers`, etc. no cambian de firma).

**Tech Stack:** JavaScript ESM vanilla (sin framework), `node --test` para unit tests, Playwright MCP para verificación en vivo.

## Global Constraints

- Cero cambios de backend — todo el trabajo es en `frontend/modules/`.
- No repetir el patrón manual `try { JSON.parse(localStorage...) } catch {}` en ningún módulo nuevo — todos pasan por `persist.js`.
- Una key de `localStorage` por módulo (objeto combinado si hay más de un filtro), no una key por filtro individual.
- Ningún modal ni el "modo gestión" (Túneles/Proyectos/MCPs/Links-tipos) cambia de comportamiento — deben seguir reseteando al recargar, no forman parte de este trabajo.
- Convención de naming ya usada en el repo: `vcc-<modulo>-<estado>`.

---

## Task 1: Helper genérico `persist.js`

**Files:**
- Create: `frontend/modules/core/persist.js`
- Test: `frontend/test/persist.test.js`

**Interfaces:**
- Produces: `loadState(key, fallback, storage = globalThis.localStorage)` → devuelve el valor deserializado o `fallback`. `saveState(key, value, storage = globalThis.localStorage)` → serializa y guarda, no devuelve nada. Ambas son las que importan las Tasks 2-6.

- [ ] **Step 1: Escribir los tests (fallan primero)**

Crear `frontend/test/persist.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState } from '../modules/core/persist.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    _data: data,
  };
}

test('loadState devuelve fallback si la key no existe', () => {
  const storage = fakeStorage();
  assert.equal(loadState('vcc-test', 'default', storage), 'default');
});

test('saveState + loadState hacen roundtrip de un string', () => {
  const storage = fakeStorage();
  saveState('vcc-test', 'expiry', storage);
  assert.equal(loadState('vcc-test', 'default', storage), 'expiry');
});

test('saveState + loadState hacen roundtrip de un objeto combinado', () => {
  const storage = fakeStorage();
  const filtros = { tipo: 'Repo', estado: '', favOnly: true, texto: 'n8n' };
  saveState('vcc-links-filters', filtros, storage);
  assert.deepEqual(loadState('vcc-links-filters', {}, storage), filtros);
});

test('saveState + loadState hacen roundtrip de un boolean', () => {
  const storage = fakeStorage();
  saveState('vcc-test-bool', false, storage);
  assert.equal(loadState('vcc-test-bool', true, storage), false);
});

test('loadState devuelve fallback si el JSON guardado está corrupto', () => {
  const storage = fakeStorage({ 'vcc-test': '{not valid json' });
  assert.deepEqual(loadState('vcc-test', { a: 1 }, storage), { a: 1 });
});

test('loadState no explota si storage.getItem tira una excepción', () => {
  const storage = { getItem: () => { throw new Error('boom'); } };
  assert.equal(loadState('vcc-test', 'fallback', storage), 'fallback');
});
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `cd frontend && node --test test/persist.test.js`
Expected: FAIL — `Cannot find module '../modules/core/persist.js'`

- [ ] **Step 3: Implementar `persist.js`**

Crear `frontend/modules/core/persist.js`:

```js
export function loadState(key, fallback, storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveState(key, value, storage = globalThis.localStorage) {
  storage.setItem(key, JSON.stringify(value));
}
```

- [ ] **Step 4: Correr los tests para confirmar que pasan**

Run: `cd frontend && node --test test/persist.test.js`
Expected: PASS — 6/6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/core/persist.js frontend/test/persist.test.js
git commit -m "feat(core): loadState/saveState — helper genérico de persistencia en localStorage"
```

---

## Task 2: Wire Links — filtros tipo/estado/favoritos/texto

**Files:**
- Modify: `frontend/modules/tabs/links.js`

**Interfaces:**
- Consumes: `loadState(key, fallback, storage)`, `saveState(key, value, storage)` de `../core/persist.js` (Task 1).

- [ ] **Step 1: Import + key + siembra en `initLinks`**

En `frontend/modules/tabs/links.js`, agregar el import junto a los existentes (línea 2):

```js
import { escHtml, formField, formSelect, openEditModal, showManageBanner } from '../core/dom.js';
import { loadState, saveState } from '../core/persist.js';
```

Agregar la key después de las variables de módulo existentes (después de la línea 51, `let confirmDialogRef = null;`):

```js
const LINKS_FILTERS_KEY = 'vcc-links-filters';
```

En `initLinks` (línea 180), como primera línea del cuerpo de la función, sembrar las 4 variables desde `localStorage`:

```js
export function initLinks({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;

  // Restaura los filtros de la ultima visita -- antes siempre volvia a "Todo" al recargar.
  const savedFilters = loadState(LINKS_FILTERS_KEY, { tipo: '', estado: '', favOnly: false, texto: '' });
  linksFilterTipo = savedFilters.tipo;
  linksFilterEstado = savedFilters.estado;
  linksFilterFavOnly = savedFilters.favOnly;
  linksFilterTexto = savedFilters.texto;

  document.getElementById('btn-links-refresh')?.addEventListener('click', () => loadLinks());
```

- [ ] **Step 2: Reflejar el estado sembrado en los botones de estado/favoritos y en el input de búsqueda**

Los botones de tipo se regeneran en `renderTipoFilters()` (línea 151) y ya leen `linksFilterTipo` en cada render, así que no necesitan wiring adicional. Los de estado y el de favoritos son estáticos en el HTML — hay que marcarlos activos si el valor restaurado no es el default. Agregar, inmediatamente después del bloque de siembra del Step 1:

```js
  if (linksFilterEstado) {
    document.querySelectorAll('.btn-links-estado').forEach(b =>
      b.classList.toggle('active', b.dataset.estado === linksFilterEstado));
  }
  if (linksFilterFavOnly) {
    document.getElementById('btn-links-fav-only')?.classList.add('active');
  }
  const linksSearchInputInit = document.getElementById('links-search');
  if (linksSearchInputInit && linksFilterTexto) {
    linksSearchInputInit.value = linksFilterTexto;
    document.getElementById('links-search-clear')?.classList.remove('hidden');
  }
```

Nota: `renderLinksView()` ya se llama después vía `loadLinks()` (invocado desde `app.js` al iniciar), así que no hace falta forzar un render acá.

- [ ] **Step 3: Guardar en cada handler de cambio**

En el handler de tipo (línea ~191), después de `linksFilterTipo = btn.dataset.tipo;`:

```js
    linksFilterTipo = btn.dataset.tipo;
    saveState(LINKS_FILTERS_KEY, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly, texto: linksFilterTexto });
    renderLinksView();
```

En el handler de estado (línea ~199), después de `linksFilterEstado = btn.dataset.estado;`:

```js
      linksFilterEstado = btn.dataset.estado;
      saveState(LINKS_FILTERS_KEY, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly, texto: linksFilterTexto });
      renderLinksView();
```

En el handler de favoritos (línea ~204-208):

```js
  document.getElementById('btn-links-fav-only')?.addEventListener('click', (e) => {
    linksFilterFavOnly = !linksFilterFavOnly;
    e.currentTarget.classList.toggle('active', linksFilterFavOnly);
    saveState(LINKS_FILTERS_KEY, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly, texto: linksFilterTexto });
    renderLinksView();
  });
```

En el input de búsqueda (línea ~212) y el botón de limpiar (línea ~217):

```js
  searchInput?.addEventListener('input', (e) => {
    linksFilterTexto = e.target.value;
    searchClear?.classList.toggle('hidden', linksFilterTexto === '');
    saveState(LINKS_FILTERS_KEY, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly, texto: linksFilterTexto });
    renderLinksView();
  });
  searchClear?.addEventListener('click', () => {
    linksFilterTexto = '';
    if (searchInput) searchInput.value = '';
    searchClear.classList.add('hidden');
    searchInput?.focus();
    saveState(LINKS_FILTERS_KEY, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly, texto: linksFilterTexto });
    renderLinksView();
  });
```

- [ ] **Step 4: Correr la suite completa de frontend para confirmar que nada se rompió**

Run: `cd frontend && node --test test/`
Expected: PASS — todos los tests existentes siguen en verde (no se tocó `filterLinks`).

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/links.js
git commit -m "feat(links): persistir filtros de tipo/estado/favoritos/texto en localStorage"
```

---

## Task 3: Wire Inventario — filtro de texto y toggle "solo monitoreados"

**Files:**
- Modify: `frontend/modules/tabs/inventory.js`

**Interfaces:**
- Consumes: `loadState`, `saveState` de `../core/persist.js` (Task 1).

- [ ] **Step 1: Import + key**

Agregar el import junto a los existentes al inicio del archivo:

```js
import { loadState, saveState } from '../core/persist.js';
```

Agregar la key nueva junto a `GROUP_BY_KEY` (línea 595):

```js
const GROUP_BY_KEY = 'vcc-infra-groupby';
const INFRA_FILTERS_KEY = 'vcc-infra-filters';
```

- [ ] **Step 2: Siembra en `initInventory`**

En `initInventory` (línea 597), después del bloque existente que restaura `savedGroup` (después de la línea 610, antes de "// Group-by buttons"), agregar:

```js
  // Restaura filtro de texto y toggle "solo monitoreados" -- antes siempre volvian a
  // default (sin texto, monitoreados=true) al recargar.
  const savedFilters = loadState(INFRA_FILTERS_KEY, { texto: '', monitored: true });
  infraFilterTexto = savedFilters.texto;
  infraFilterMonitored = savedFilters.monitored;

  const infraMonitoredBtnInit = document.getElementById('btn-infra-monitored');
  if (infraMonitoredBtnInit) {
    infraMonitoredBtnInit.classList.toggle('active', infraFilterMonitored);
    infraMonitoredBtnInit.textContent = infraFilterMonitored ? '● Monitoreados' : '○ Todos';
  }
  const infraSearchInputInit = document.getElementById('infra-search');
  if (infraSearchInputInit && infraFilterTexto) {
    infraSearchInputInit.value = infraFilterTexto;
    document.getElementById('infra-search-clear')?.classList.remove('hidden');
  }
```

- [ ] **Step 3: Guardar en los handlers existentes**

En el toggle de monitoreados (línea 627-633):

```js
  document.getElementById('btn-infra-monitored')?.addEventListener('click', () => {
    infraFilterMonitored = !infraFilterMonitored;
    const btn = document.getElementById('btn-infra-monitored');
    btn.classList.toggle('active', infraFilterMonitored);
    btn.textContent = infraFilterMonitored ? '● Monitoreados' : '○ Todos';
    saveState(INFRA_FILTERS_KEY, { texto: infraFilterTexto, monitored: infraFilterMonitored });
    renderInventory(infraAllServers);
  });
```

En la búsqueda (línea 642-655):

```js
  infraSearchInput?.addEventListener('input', (e) => {
    infraFilterTexto = e.target.value;
    infraSearchClear?.classList.toggle('hidden', infraFilterTexto === '');
    saveState(INFRA_FILTERS_KEY, { texto: infraFilterTexto, monitored: infraFilterMonitored });
    renderInventory(infraAllServers);
  });
  infraSearchClear?.addEventListener('click', () => {
    infraFilterTexto = '';
    if (infraSearchInput) infraSearchInput.value = '';
    infraSearchClear.classList.add('hidden');
    infraSearchInput?.focus();
    saveState(INFRA_FILTERS_KEY, { texto: infraFilterTexto, monitored: infraFilterMonitored });
    renderInventory(infraAllServers);
  });
```

- [ ] **Step 4: Correr la suite completa de frontend**

Run: `cd frontend && node --test test/`
Expected: PASS — todos los tests existentes siguen en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/inventory.js
git commit -m "feat(inventory): persistir filtro de texto y toggle monitoreados en localStorage"
```

---

## Task 4: Wire MCPs — agrupamiento

**Files:**
- Modify: `frontend/modules/tabs/mcp.js`

**Interfaces:**
- Consumes: `loadState`, `saveState` de `../core/persist.js` (Task 1).

- [ ] **Step 1: Import + key**

Agregar el import al inicio del archivo (junto a los existentes):

```js
import { loadState, saveState } from '../core/persist.js';
```

Agregar la key junto a la variable de módulo (línea 6):

```js
let mcpGroupBy = 'tipo';
const MCP_GROUPBY_KEY = 'vcc-mcp-groupby';
```

- [ ] **Step 2: Siembra en `initMcp`**

En `initMcp` (línea 433), como primera línea del cuerpo:

```js
export function initMcp({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;

  // Restaura el agrupamiento elegido la ultima vez -- antes siempre volvia a "Tipo" al recargar.
  mcpGroupBy = loadState(MCP_GROUPBY_KEY, 'tipo');
  const savedMcpGroupBtn = document.querySelector(`.btn-mcp-group[data-group="${mcpGroupBy}"]`);
  if (savedMcpGroupBtn) {
    document.querySelectorAll('.btn-mcp-group').forEach(b => b.classList.remove('active'));
    savedMcpGroupBtn.classList.add('active');
  }

  document.getElementById('btn-mcp-refresh')?.addEventListener('click', () => loadMcp(true));
```

- [ ] **Step 3: Guardar en el handler de agrupamiento (línea 459-466)**

```js
  document.querySelectorAll('.btn-mcp-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-mcp-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mcpGroupBy = btn.dataset.group;
      saveState(MCP_GROUPBY_KEY, mcpGroupBy);
      renderMcpView();
    });
  });
```

- [ ] **Step 4: Correr la suite completa de frontend**

Run: `cd frontend && node --test test/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/mcp.js
git commit -m "feat(mcp): persistir agrupamiento elegido en localStorage"
```

---

## Task 5: Wire SSL — vista seleccionada

**Files:**
- Modify: `frontend/modules/tabs/ssl.js`

**Interfaces:**
- Consumes: `loadState`, `saveState` de `../core/persist.js` (Task 1).

- [ ] **Step 1: Import + key**

Agregar el import al inicio del archivo:

```js
import { loadState, saveState } from '../core/persist.js';
```

Agregar la key junto a la variable de módulo (línea 12):

```js
let sslView = 'expiry';
const SSL_VIEW_KEY = 'vcc-ssl-view';
```

- [ ] **Step 2: Siembra en `initSSL`**

En `initSSL` (línea 500), como primera línea del cuerpo:

```js
export function initSSL() {
  // Restaura la vista elegida la ultima vez -- antes siempre volvia a "Vencimiento" al recargar.
  sslView = loadState(SSL_VIEW_KEY, 'expiry');
  const savedSslViewBtn = document.querySelector(`.btn-ssl-view[data-view="${sslView}"]`);
  if (savedSslViewBtn) {
    document.querySelectorAll('.btn-ssl-view').forEach(b => b.classList.remove('active'));
    savedSslViewBtn.classList.add('active');
  }

  document.getElementById('btn-ssl-refresh').addEventListener('click', () => loadSSL(true));
```

- [ ] **Step 3: Guardar en el handler de vista (línea 509-517)**

```js
  document.querySelectorAll('.btn-ssl-view').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === sslView) return;
      sslView = btn.dataset.view;
      saveState(SSL_VIEW_KEY, sslView);
      document.querySelectorAll('.btn-ssl-view').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (sslData) renderSSLMonitor(sslData);
    });
  });
```

- [ ] **Step 4: Correr la suite completa de frontend**

Run: `cd frontend && node --test test/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/ssl.js
git commit -m "feat(ssl): persistir vista seleccionada en localStorage"
```

---

## Task 6: Wire Proyectos — agrupamiento

**Files:**
- Modify: `frontend/modules/tabs/projects.js`

**Interfaces:**
- Consumes: `loadState`, `saveState` de `../core/persist.js` (Task 1).

- [ ] **Step 1: Import + key**

Agregar el import al inicio del archivo:

```js
import { loadState, saveState } from '../core/persist.js';
```

Agregar la key junto a la variable de módulo (línea 29):

```js
let projectsGroupBy = 'client';
const PROJECTS_GROUPBY_KEY = 'vcc-projects-groupby';
```

- [ ] **Step 2: Siembra en `initProjects`**

En `initProjects` (línea 770), como primera línea del cuerpo:

```js
export function initProjects({ onUpdate, confirmDialog } = {}) {
  refreshApp = onUpdate ?? null;
  confirmDialogRef = confirmDialog ?? null;

  // Restaura el agrupamiento elegido la ultima vez -- antes siempre volvia a "Por cliente" al recargar.
  projectsGroupBy = loadState(PROJECTS_GROUPBY_KEY, 'client');
  const savedProjectsGroupBtn = document.querySelector(`.btn-projects-group[data-group="${projectsGroupBy}"]`);
  if (savedProjectsGroupBtn) {
    document.querySelectorAll('.btn-projects-group').forEach(b => b.classList.remove('active'));
    savedProjectsGroupBtn.classList.add('active');
  }

  document.getElementById('btn-project-manage').addEventListener('click', () => {
    toggleProjectManagement();
  });
```

- [ ] **Step 3: Guardar en el handler de agrupamiento (línea 781-788)**

```js
  document.querySelectorAll('.btn-projects-group').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-projects-group').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      projectsGroupBy = btn.dataset.group;
      saveState(PROJECTS_GROUPBY_KEY, projectsGroupBy);
      if (registryData) renderProjects(registryData.projects);
    });
  });
```

- [ ] **Step 4: Correr la suite completa de frontend**

Run: `cd frontend && node --test test/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/projects.js
git commit -m "feat(projects): persistir agrupamiento elegido en localStorage"
```

---

## Task 7: Verificación cruzada

**Files:** ninguno (solo verificación, sin cambios de código)

**Interfaces:** N/A — task de cierre.

- [ ] **Step 1: Correr toda la suite de backend y frontend**

Run: `cd backend && node --test test/`
Expected: PASS — mismo conteo que antes de este plan (sin regresión).

Run: `cd frontend && node --test test/`
Expected: PASS — incluye los 6 tests nuevos de `persist.test.js`.

- [ ] **Step 2: Verificación en vivo con Playwright — Links**

Con el backend corriendo (`node backend/server.js` o el proceso ya activo), navegar a VCC → tab Links. Aplicar filtro Tipo=Repo + escribir "n8n" en el buscador. Recargar la página (F5). Confirmar que el filtro de tipo sigue en "Repo" (botón activo) y el buscador sigue mostrando "n8n" con los mismos resultados filtrados que antes de recargar.

- [ ] **Step 3: Verificación en vivo con Playwright — Inventario**

Tab Inventario. Tocar "○ Todos" (sacar el filtro de monitoreados) + escribir un texto de búsqueda. Recargar. Confirmar que el botón sigue en "○ Todos" y el texto de búsqueda sigue aplicado.

- [ ] **Step 4: Verificación en vivo con Playwright — MCPs, SSL, Proyectos**

Para cada uno: cambiar el agrupamiento/vista a una opción no-default (ej. MCPs → "Listado", SSL → "Dominio", Proyectos → "Por nombre"). Recargar. Confirmar que el botón elegido sigue activo y la vista renderizada corresponde.

- [ ] **Step 5: Confirmar que el "modo gestión" sigue reseteando (no debe persistir)**

Abrir "⚙ Gestionar" en Túneles, Proyectos o MCPs. Recargar la página. Confirmar que la página vuelve a la vista normal (no al modo gestión) — este comportamiento no debía cambiar.

- [ ] **Step 6: Actualizar la memoria de proyecto VCC**

Sin commit de código en este step — es una nota para la sesión, no una tarea de git. (El cierre de memoria lo hace la sesión de Claude al terminar, no este plan.)
