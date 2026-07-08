# Módulo Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un módulo "Links" a VCC (`D:\Workspace-Repos\workspace-ui`) para guardar repos/artículos/skills/MCPs pendientes de revisar, con alta manual y captura de 1 click vía bookmarklet, siguiendo el patrón arquitectónico existente (JSON plano + router Express + tab de frontend con cards).

**Architecture:** Backend Express con persistencia en `links-inventory.json` (mismo patrón que `servers-config.json`), router CRUD en `backend/routes/links.js`. Frontend: nuevo tab con cards `.infra-card` (reuso de clases CSS existentes, cero tokens nuevos), módulo `frontend/modules/tabs/links.js` con filtros client-side. Bookmarklet servido como página estática en `frontend/links-bookmarklet.html`.

**Tech Stack:** Node.js + Express 4 (backend, ES modules, sin ORM), vanilla JS ES modules (frontend, sin framework), persistencia en JSON plano vía `fs/promises`.

## Global Constraints

- Persistencia en JSON plano (`links-inventory.json`), gitignored, mismo patrón que `servers-config.json` — no usar SQLite/MySQL.
- Reusar clases CSS existentes (`.infra-card`, `.infra-grid`, `.infra-risk-badge`, `.infra-edit-btn`, `.btn-tab`, `.manage-form`, etc.) — no crear tokens CSS nuevos (regla ya establecida en el proyecto para el módulo Inventario).
- `tipo`: `Repo | Articulo | Skill | MCP | Otro` (default `Otro`).
- `estado`: `Pendiente | Revisado | Implementar | Descartado` (default `Pendiente`).
- Colores de estado por variable CSS existente: Pendiente = `var(--text-faint)`, Revisado = `var(--info)`, Implementar = `var(--warning)`, Descartado = `var(--danger)`.
- Puerto del backend fijo en `SERVER.port = 8080` (`backend/config.js:27`) — el bookmarklet apunta a ese puerto hardcodeado, igual que el resto del proyecto no maneja puertos dinámicos.
- Sin tests automatizados nuevos: el router de links.js sigue el estilo de import directo de `inventory.js`/`ssl.js` (sin tests), no el estilo de factory con inyección de dependencias de `projects.js`/`registry.js` (que sí tiene tests) — verificación vía `curl` manual, consistente con el estilo de router elegido. Esta decisión ya está en el spec aprobado.
- Spec de referencia: `docs/superpowers/specs/2026-07-08-links-inventario-design.md`.

---

### Task 1: Path de datos + router backend CRUD

**Files:**
- Modify: `backend/config.js:12-24` (agregar `PATHS.linksInventory`)
- Create: `backend/routes/links.js`
- Modify: `backend/server.js:11-25` (import), `backend/server.js:50-64` (`app.use`)

**Interfaces:**
- Produces: endpoints `GET/POST /api/links`, `PATCH/DELETE /api/links/:id` — usados por el frontend en Task 4.
- Produces: forma del objeto link `{ id, url, titulo, tipo, tags, estado, favorito, nota, fechaAgregado, fechaActualizado }` — usada por el frontend en Task 4 y Task 5.

- [ ] **Step 1: Agregar el path de datos en `backend/config.js`**

Editar el bloque `PATHS` (línea 12-24) agregando la nueva clave junto a las demás rutas de `VCC_DATA`:

```js
export const PATHS = {
  handover:       path.join(WORKSPACE_ROOT, 'runtime', 'HANDOVER.md'),
  webContext:     path.join(WORKSPACE_ROOT, 'runtime', 'web-context.md'),
  index:          path.join(WORKSPACE_ROOT, 'knowledge', 'INDEX.md'),
  workspaceMap:   path.join(WORKSPACE_ROOT, 'WORKSPACE_MAP.md'),
  registry:       path.join(WORKSPACE_ROOT, 'global', 'projects-registry.json'),
  currentProject: path.join(WORKSPACE_ROOT, 'runtime', 'current-project.json'),
  recentProjects: path.join(WORKSPACE_ROOT, 'runtime', 'recent-projects.json'),
  sslWatch:        path.join(VCC_DATA, 'ssl-watch.json'),
  tunnelsConfig:   path.join(VCC_DATA, 'tunnels-config.json'),
  serverInventory: path.join(WORKSPACE_ROOT, 'global', 'servers', 'SERVER_INVENTORY.md'),
  serversConfig:   path.join(VCC_DATA, 'servers-config.json'),
  linksInventory:  path.join(VCC_DATA, 'links-inventory.json'),
};
```

- [ ] **Step 2: Agregar `links-inventory.json` al `.gitignore` del proyecto**

Revisar `.gitignore` en la raíz de `D:\Workspace-Repos\workspace-ui` y confirmar que `servers-config.json`/`tunnels-config.json` ya están ignorados con un patrón que cubra también `links-inventory.json` (ej. `*-config.json` no lo cubriría, agregar línea explícita `links-inventory.json` si no hay un patrón que lo alcance).

- [ ] **Step 3: Crear `backend/routes/links.js` con el CRUD completo**

```js
import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PATHS } from '../config.js';

const router = Router();

const VALID_TIPOS  = ['Repo', 'Articulo', 'Skill', 'MCP', 'Otro'];
const VALID_ESTADOS = ['Pendiente', 'Revisado', 'Implementar', 'Descartado'];

function isValidUrl(u) {
  try { const parsed = new URL(u); return parsed.protocol === 'http:' || parsed.protocol === 'https:'; }
  catch { return false; }
}

function validate(l) {
  if (!l || typeof l !== 'object')     return 'link inválido';
  if (!l.url?.trim())                  return 'url requerida';
  if (!isValidUrl(l.url.trim()))       return 'url inválida (debe ser http:// o https://)';
  if (!l.titulo?.trim())               return 'titulo requerido';
  if (l.tipo !== undefined && !VALID_TIPOS.includes(l.tipo))
    return `tipo inválido (${VALID_TIPOS.join('|')})`;
  if (l.estado !== undefined && !VALID_ESTADOS.includes(l.estado))
    return `estado inválido (${VALID_ESTADOS.join('|')})`;
  if (l.tags !== undefined && !Array.isArray(l.tags))
    return 'tags debe ser array';
  return null;
}

function clean(l, existing = null) {
  const now = new Date().toISOString();
  return {
    id:              existing?.id ?? randomUUID(),
    url:             l.url.trim(),
    titulo:          l.titulo.trim(),
    tipo:            VALID_TIPOS.includes(l.tipo) ? l.tipo : 'Otro',
    tags:            Array.isArray(l.tags) ? l.tags.map(t => String(t).trim()).filter(Boolean) : [],
    estado:          VALID_ESTADOS.includes(l.estado) ? l.estado : 'Pendiente',
    favorito:        l.favorito === true,
    nota:            (l.nota || '').trim(),
    fechaAgregado:   existing?.fechaAgregado ?? now,
    fechaActualizado: now,
  };
}

async function load() {
  try {
    const raw = await readFile(PATHS.linksInventory, 'utf8');
    return JSON.parse(raw).links;
  } catch (err) {
    if (err.code === 'ENOENT') { await save([]); return []; }
    throw err;
  }
}

async function save(links) {
  await writeFile(PATHS.linksInventory, JSON.stringify({ links }, null, 2), 'utf8');
}

// GET /api/links — soporta filtros opcionales por query string
router.get('/', async (req, res, next) => {
  try {
    const links = await load();
    const { tipo, estado, favorito } = req.query;
    let filtered = links;
    if (tipo)     filtered = filtered.filter(l => l.tipo === tipo);
    if (estado)   filtered = filtered.filter(l => l.estado === estado);
    if (favorito !== undefined) filtered = filtered.filter(l => l.favorito === (favorito === 'true'));
    res.json({ links: filtered, count: filtered.length });
  } catch (err) { next(err); }
});

// POST /api/links — crea un link nuevo (usado por form manual y bookmarklet)
router.post('/', async (req, res, next) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const links = await load();
    const entry = clean(req.body);
    links.push(entry);
    await save(links);
    res.status(201).json({ link: entry });
  } catch (err) { next(err); }
});

// PATCH /api/links/:id — actualiza campos parciales
router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const links = await load();
    const idx = links.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: `Link no encontrado: ${id}` });

    const merged = { ...links[idx], ...req.body };
    const err = validate(merged);
    if (err) return res.status(400).json({ error: err });

    links[idx] = clean(merged, links[idx]);
    await save(links);
    res.json({ link: links[idx] });
  } catch (err) { next(err); }
});

// DELETE /api/links/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const links = await load();
    const idx = links.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: `Link no encontrado: ${id}` });

    links.splice(idx, 1);
    await save(links);
    res.json({ deleted: id });
  } catch (err) { next(err); }
});

export default router;
```

- [ ] **Step 4: Registrar el router en `backend/server.js`**

Agregar el import junto a los demás (después de la línea 25):

```js
import linksRouter     from './routes/links.js';
```

Agregar el `app.use` junto a los demás (después de la línea 64, antes del bloque de `httpServer`):

```js
app.use('/api/links',    linksRouter);
```

- [ ] **Step 5: Levantar el backend y verificar manualmente con curl**

```bash
cd /d/Workspace-Repos/workspace-ui/backend && npm start
```

En otra terminal:

```bash
# Crear un link (debería devolver 201 con el link creado, estado=Pendiente, favorito=false)
curl -s -X POST http://localhost:8080/api/links -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/anthropics/claude-code","titulo":"claude-code repo"}'

# Listar (debería devolver el link recién creado)
curl -s http://localhost:8080/api/links

# Validación: url inválida debe devolver 400
curl -s -X POST http://localhost:8080/api/links -H "Content-Type: application/json" \
  -d '{"url":"no-es-url","titulo":"x"}'

# PATCH: marcar favorito (reemplazar :id por el id devuelto en el primer curl)
curl -s -X PATCH http://localhost:8080/api/links/:id -H "Content-Type: application/json" \
  -d '{"favorito":true}'

# DELETE
curl -s -X DELETE http://localhost:8080/api/links/:id
```

Expected: los 5 curls devuelven JSON coherente con lo esperado (201/200 con el objeto, 400 con `{"error":"url inválida..."}`, 200 con `{"deleted":"<id>"}` en el último). Verificar también que `links-inventory.json` se creó en `D:\Workspace-Repos\workspace-ui\` con la estructura `{ "links": [...] }`.

- [ ] **Step 6: Commit**

```bash
cd "/d/Workspace-Repos/workspace-ui" && git add backend/config.js backend/routes/links.js backend/server.js .gitignore && git commit -m "feat(links): CRUD backend para inventario de links"
```

---

### Task 2: Página del bookmarklet

**Files:**
- Create: `frontend/links-bookmarklet.html`

**Interfaces:**
- Consumes: `POST /api/links` (Task 1) con body `{ url, titulo }`.
- No produce interfaces consumidas por otros tasks (página standalone).

- [ ] **Step 1: Crear la página estática con el link arrastrable**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>VCC — Bookmarklet Links</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; line-height: 1.6; }
  .bookmarklet-btn {
    display: inline-block; padding: 10px 18px; background: #6366F1; color: white;
    border-radius: 6px; text-decoration: none; font-weight: 600; cursor: grab;
  }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <h1>VCC — Guardar en Links</h1>
  <p>Arrastrá este botón a la barra de marcadores de Chrome:</p>
  <p>
    <a class="bookmarklet-btn" href="javascript:(function(){fetch('http://localhost:8080/api/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:location.href,titulo:document.title})}).then(function(r){return r.ok?alert('Guardado en VCC ✓'):r.json().then(function(d){alert('Error: '+(d.error||r.status))})}).catch(function(){alert('VCC no está corriendo en localhost:8080')})})();">
      ＋ Guardar en VCC
    </a>
  </p>
  <p>Con la pestaña que querés guardar activa, hacé click en el botón de la barra de marcadores.
     Requiere que el backend de VCC (<code>npm start</code> en <code>backend/</code>) esté corriendo en <code>localhost:8080</code>.</p>
</body>
</html>
```

- [ ] **Step 2: Verificar que la página se sirve desde el static middleware**

Con el backend corriendo (Task 1, Step 5), abrir en el navegador:

```
http://localhost:8080/links-bookmarklet.html
```

Expected: la página carga (server.js:48 ya sirve todo `frontend/` como estático, no requiere ruta nueva). Arrastrar el botón "＋ Guardar en VCC" a la barra de marcadores de Chrome, navegar a cualquier página, hacer click en el marcador y verificar con `curl http://localhost:8080/api/links` que apareció un nuevo link con la URL y título de esa pestaña.

- [ ] **Step 3: Commit**

```bash
cd "/d/Workspace-Repos/workspace-ui" && git add frontend/links-bookmarklet.html && git commit -m "feat(links): página de bookmarklet para captura de 1 click"
```

---

### Task 3: Nav + tab panel en `index.html`

**Files:**
- Modify: `frontend/index.html:86-89` (agregar botón de nav después de MCPs)
- Modify: `frontend/index.html:296` (agregar tab-panel después del panel de MCPs, antes de `tab-infra`)

**Interfaces:**
- Produces: elementos DOM `#tab-links`, `#links-container`, `#links-manage-container` (implícito, no se usa gestión separada), botones `#btn-links-refresh`, `#btn-links-add`, toggle `#btn-links-fav-only`, grupos `.btn-links-tipo`/`.btn-links-estado` — consumidos por `frontend/modules/tabs/links.js` en Task 4.

- [ ] **Step 1: Agregar el botón de navegación**

En `frontend/index.html`, después de la línea 89 (cierre del botón MCPs, antes de `</nav>` en línea 90):

```html
        <button class="tab-btn nav-item" data-tab="links" title="Links">
          <span class="nav-icon">⛓</span>
          <span class="nav-label">Links</span>
        </button>
```

- [ ] **Step 2: Agregar el tab-panel**

En `frontend/index.html`, después del cierre de `tab-mcp` (línea 296, antes de `<div class="tab-panel hidden" id="tab-infra">`):

```html
      <!-- Tab: Links -->
      <div class="tab-panel hidden" id="tab-links">
        <div class="ssl-toolbar view-toolbar">
          <div class="view-toolbar-start">
            <div class="btn-group infra-group-toggle" id="links-tipo-filters">
              <button class="btn-tab btn-links-tipo active" data-tipo="">Todos</button>
              <button class="btn-tab btn-links-tipo" data-tipo="Repo">Repo</button>
              <button class="btn-tab btn-links-tipo" data-tipo="Articulo">Artículo</button>
              <button class="btn-tab btn-links-tipo" data-tipo="Skill">Skill</button>
              <button class="btn-tab btn-links-tipo" data-tipo="MCP">MCP</button>
              <button class="btn-tab btn-links-tipo" data-tipo="Otro">Otro</button>
            </div>
            <div class="btn-group infra-group-toggle" id="links-estado-filters">
              <button class="btn-tab btn-links-estado active" data-estado="">Todos</button>
              <button class="btn-tab btn-links-estado" data-estado="Pendiente">Pendiente</button>
              <button class="btn-tab btn-links-estado" data-estado="Revisado">Revisado</button>
              <button class="btn-tab btn-links-estado" data-estado="Implementar">Implementar</button>
              <button class="btn-tab btn-links-estado" data-estado="Descartado">Descartado</button>
            </div>
            <button class="btn-tab" id="btn-links-fav-only">★ Solo favoritos</button>
          </div>
          <div class="view-toolbar-end">
            <span class="infra-counter" id="links-counter"></span>
            <button class="btn btn-ssl-refresh" id="btn-links-refresh">↻ Recargar</button>
            <button class="btn btn-solid" id="btn-links-add">＋ Agregar link</button>
          </div>
        </div>
        <div id="links-container"></div>
        <div id="links-form-container"></div>
      </div>
```

- [ ] **Step 3: Verificar visualmente**

Abrir `http://localhost:8080` en el navegador (con el backend corriendo), click en el nuevo ícono "Links" del sidebar. Expected: el tab cambia a un panel vacío con la toolbar de filtros visible (aunque `links-container` esté vacío — el módulo JS todavía no existe, eso es Task 4). Confirmar en la consola del navegador que no hay errores JS nuevos por el botón/panel agregado (el módulo `links.js` todavía no está importado, es esperado que no pase nada al tocar los botones).

- [ ] **Step 4: Commit**

```bash
cd "/d/Workspace-Repos/workspace-ui" && git add frontend/index.html && git commit -m "feat(links): nav item y tab panel para módulo Links"
```

---

### Task 4: Módulo frontend — carga y render de cards

**Files:**
- Create: `frontend/modules/tabs/links.js`

**Interfaces:**
- Consumes: `get('/api/links')` de `frontend/modules/core/api.js:3`, `apiFetch(url, {method, body})` de `frontend/modules/core/api.js:9`, `escHtml` de `frontend/modules/core/dom.js:51`.
- Consumes: DOM ids/clases de Task 3 (`#links-container`, `#links-counter`, `.btn-links-tipo`, `.btn-links-estado`, `#btn-links-fav-only`, `#btn-links-refresh`).
- Produces: `export function initLinks({ confirmDialog })`, `export async function loadLinks()` — consumidos por `app.js` en Task 6.
- Produces (interno, usado por Task 5): `let linksAllData`, función `renderLinksView()` reutilizada tras guardar/editar/eliminar un link.

- [ ] **Step 1: Crear el esqueleto del módulo con estado y helpers de color**

```js
import { get, apiFetch } from '../core/api.js';
import { escHtml } from '../core/dom.js';

const ESTADO_COLOR = {
  Pendiente:    'var(--text-faint)',
  Revisado:     'var(--info)',
  Implementar:  'var(--warning)',
  Descartado:   'var(--danger)',
};

let linksAllData = [];
let linksFilterTipo = '';
let linksFilterEstado = '';
let linksFilterFavOnly = false;
let confirmDialogRef = null;

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
```

- [ ] **Step 2: Función de filtrado (lógica pura, sin DOM)**

```js
export function filterLinks(links, { tipo, estado, favOnly }) {
  return links.filter(l =>
    (!tipo || l.tipo === tipo) &&
    (!estado || l.estado === estado) &&
    (!favOnly || l.favorito === true)
  );
}
```

- [ ] **Step 3: Test manual de la función pura antes de seguir con DOM**

Crear un archivo temporal de prueba (no se commitea, solo para verificar antes de escribir el render):

```bash
cd "/d/Workspace-Repos/workspace-ui/frontend" && node --input-type=module -e "
import { filterLinks } from './modules/tabs/links.js';
const links = [
  { tipo: 'Repo', estado: 'Pendiente', favorito: false },
  { tipo: 'Skill', estado: 'Revisado', favorito: true },
];
console.log(filterLinks(links, { tipo: '', estado: '', favOnly: false }).length === 2 ? 'OK: sin filtro' : 'FAIL');
console.log(filterLinks(links, { tipo: 'Repo', estado: '', favOnly: false }).length === 1 ? 'OK: por tipo' : 'FAIL');
console.log(filterLinks(links, { tipo: '', estado: '', favOnly: true }).length === 1 ? 'OK: solo favoritos' : 'FAIL');
"
```

Expected: imprime `OK: sin filtro`, `OK: por tipo`, `OK: solo favoritos`.

- [ ] **Step 4: Construcción de la card**

```js
function buildLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'infra-card';
  card.style.borderLeft = `3px solid ${ESTADO_COLOR[link.estado]}`;

  const tagsHtml = link.tags.map(t =>
    `<span class="infra-risk-badge" style="color:var(--text-faint);border-color:var(--text-faint)">${escHtml(t)}</span>`
  ).join(' ');

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<button class="infra-edit-btn" style="opacity:1" title="Favorito" data-fav-id="${link.id}">${link.favorito ? '★' : '☆'}</button>` +
      `<span class="infra-id">${escHtml(truncate(link.titulo, 60))}</span>` +
      `<span class="infra-risk-badge" style="color:var(--accent);border-color:var(--accent)">${escHtml(link.tipo)}</span>` +
      `<span class="infra-risk-badge" style="color:${ESTADO_COLOR[link.estado]};border-color:${ESTADO_COLOR[link.estado]}">${escHtml(link.estado)}</span>` +
      `<button class="infra-edit-btn" title="Editar" data-edit-id="${link.id}">✎</button>` +
      `<button class="infra-hide-btn" title="Eliminar" data-del-id="${link.id}">×</button>` +
    `</div>` +
    `<div class="infra-ip">${escHtml(truncate(link.url, 70))}</div>` +
    (link.nota ? `<div class="infra-os">${escHtml(link.nota)}</div>` : '') +
    (tagsHtml ? `<div class="infra-empresa">${tagsHtml}</div>` : '');

  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    window.open(link.url, '_blank', 'noopener');
  });

  card.querySelector('[data-fav-id]').addEventListener('click', async (e) => {
    e.stopPropagation();
    await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'PATCH', body: { favorito: !link.favorito } });
    await loadLinks();
  });

  card.querySelector('[data-del-id]').addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialogRef(`¿Eliminar "${link.titulo}"?`, 'Esta acción no se puede deshacer.', true);
    if (!ok) return;
    await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'DELETE' });
    await loadLinks();
  });

  return card;
}
```

Nota: el botón `data-edit-id` se cablea en Task 5 (requiere el form, que todavía no existe) — dejar el listener de edición pendiente hasta el próximo task, no agregar un handler vacío ahora (evitar placeholder).

- [ ] **Step 5: Render de la vista y contador**

```js
function renderLinksView() {
  const c = document.getElementById('links-container');
  if (!c) return;
  const visible = filterLinks(linksAllData, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly });

  const counter = document.getElementById('links-counter');
  if (counter) counter.textContent = `${visible.length} de ${linksAllData.length}`;

  c.innerHTML = '';
  if (!visible.length) {
    c.innerHTML = `<div class="infra-loading">${linksAllData.length ? 'Ningún link coincide con los filtros.' : 'No hay links guardados todavía.'}</div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'infra-grid';
  for (const link of visible) grid.appendChild(buildLinkCard(link));
  c.appendChild(grid);
}

export async function loadLinks() {
  const c = document.getElementById('links-container');
  if (!c) return;
  c.innerHTML = '<div class="infra-loading">Cargando links...</div>';
  try {
    const { links } = await get('/api/links');
    linksAllData = links;
    renderLinksView();
  } catch (err) {
    c.innerHTML = `<div class="infra-loading" style="color:var(--danger)">Error al cargar links: ${escHtml(err.message)}</div>`;
  }
}
```

- [ ] **Step 6: `initLinks` — cablear filtros y refresh (sin alta/edición todavía)**

```js
export function initLinks({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;

  document.getElementById('btn-links-refresh')?.addEventListener('click', () => loadLinks());

  document.querySelectorAll('.btn-links-tipo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-links-tipo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      linksFilterTipo = btn.dataset.tipo;
      renderLinksView();
    });
  });

  document.querySelectorAll('.btn-links-estado').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-links-estado').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      linksFilterEstado = btn.dataset.estado;
      renderLinksView();
    });
  });

  document.getElementById('btn-links-fav-only')?.addEventListener('click', (e) => {
    linksFilterFavOnly = !linksFilterFavOnly;
    e.currentTarget.classList.toggle('active', linksFilterFavOnly);
    renderLinksView();
  });
}
```

- [ ] **Step 7: Commit**

```bash
cd "/d/Workspace-Repos/workspace-ui" && git add frontend/modules/tabs/links.js && git commit -m "feat(links): carga, filtros y render de cards del módulo Links"
```

---

### Task 4b: Wiring provisorio para probar visualmente antes del form

**Files:**
- Modify: `frontend/app.js:1-16` (imports), `frontend/app.js:143-176` (`init()`, `initTabs` onTabChange)

Este task existe para poder ver y probar Task 4 en el navegador real antes de escribir el form de alta/edición (Task 5). El import y el wireo final (con el botón "＋ Agregar link" ya funcionando) se vuelve a tocar en Task 6 — no es trabajo duplicado, es la misma línea evolucionando: acá se cablea lectura/filtros, en Task 6 se agrega la creación.

**Interfaces:**
- Consumes: `initLinks`, `loadLinks` de `frontend/modules/tabs/links.js` (Task 4).

- [ ] **Step 1: Importar el módulo en `app.js`**

Agregar junto a los demás imports de tabs (después de la línea 15):

```js
import { initLinks, loadLinks } from './modules/tabs/links.js';
```

- [ ] **Step 2: Cablear en `initTabs` onTabChange (dentro de `init()`)**

En el bloque `initTabs({ onTabChange: (tab) => { ... } })` (línea ~147-155), agregar una línea más:

```js
      if (tab === 'links') loadLinks();
```

- [ ] **Step 3: Inicializar el módulo**

Junto a las demás llamadas `init*` en `init()` (después de `initMcp({ confirmDialog });` en la línea 163):

```js
  initLinks({ confirmDialog });
```

- [ ] **Step 4: Verificación manual en el navegador**

Con el backend corriendo (`npm start` en `backend/`) y sirviendo `frontend/` como estático, abrir `http://localhost:8080`, ir al tab Links. Expected:
- Las cards de los links creados en Task 1 (curl) aparecen con badge de tipo, badge de estado con el color correcto, tags si tenían, botón ★ visible siempre.
- Click en los chips de tipo/estado filtra las cards sin recargar.
- Click en ★ togglea favorito y refresca la vista.
- Click en × pide confirmación y elimina.
- Click en el cuerpo de la card abre la URL en pestaña nueva.
- Click en ✎ no hace nada todavía (esperado — el form es Task 5).

- [ ] **Step 5: Commit**

```bash
cd "/d/Workspace-Repos/workspace-ui" && git add frontend/app.js && git commit -m "feat(links): wiring de lectura/filtros en app.js"
```

---

### Task 5: Form de alta y edición

**Files:**
- Modify: `frontend/modules/tabs/links.js` (agregar form modal + cablear botones "＋ Agregar link" y "✎ Editar")

**Interfaces:**
- Consumes: `formField`, `formSelect` de `frontend/modules/core/dom.js:58,72`, `apiFetch` de `frontend/modules/core/api.js:9`.
- Consumes: DOM id `#links-form-container` (Task 3), DOM id `#btn-links-add` (Task 3).
- Produces: nada nuevo consumido por otros tasks — es la última pieza funcional del módulo.

- [ ] **Step 1: Función que arma y muestra el form (crear o editar)**

Agregar al final de `frontend/modules/tabs/links.js` (después de `initLinks`):

```js
function showLinksForm(link) {
  const isEdit = link !== null;
  const container = document.getElementById('links-form-container');
  const tagsText = (link?.tags ?? []).join(', ');

  container.innerHTML =
    `<div class="modal-overlay" id="links-form-overlay">` +
      `<div class="modal-box manage-form">` +
        `<div class="manage-form-title">${isEdit ? 'Editar link' : 'Nuevo link'}</div>` +
        formField('URL', 'links-f-url', link?.url ?? '', 'https://...') +
        `<div class="manage-banner hidden" id="links-f-dup-warning"></div>` +
        formField('Título', 'links-f-titulo', link?.titulo ?? '', 'Título descriptivo') +
        `<div class="manage-form-grid">` +
          formSelect('Tipo', 'links-f-tipo', link?.tipo ?? 'Otro', [
            ['Repo', 'Repo'], ['Articulo', 'Artículo'], ['Skill', 'Skill'], ['MCP', 'MCP'], ['Otro', 'Otro'],
          ]) +
          formSelect('Estado', 'links-f-estado', link?.estado ?? 'Pendiente', [
            ['Pendiente', 'Pendiente'], ['Revisado', 'Revisado'], ['Implementar', 'Implementar'], ['Descartado', 'Descartado'],
          ]) +
        `</div>` +
        formField('Tags (separados por coma)', 'links-f-tags', tagsText, 'laravel, n8n') +
        `<label class="form-label" for="links-f-nota">Nota</label>` +
        `<textarea class="form-textarea" id="links-f-nota" rows="3" placeholder="Nota opcional">${link?.nota ?? ''}</textarea>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-links-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-links-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>` +
    `</div>`;

  const overlay = document.getElementById('links-form-overlay');
  const close = () => { container.innerHTML = ''; };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('btn-links-form-cancel').addEventListener('click', close);

  // Aviso no bloqueante de URL duplicada (no impide guardar, solo informa)
  const urlInput  = document.getElementById('links-f-url');
  const dupWarning = document.getElementById('links-f-dup-warning');
  urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    const dup = val && linksAllData.some(l => l.url === val && l.id !== link?.id);
    dupWarning.textContent = dup ? 'Ya existe un link guardado con esta URL. Se puede guardar igual.' : '';
    dupWarning.classList.toggle('hidden', !dup);
  });

  document.getElementById('btn-links-form-save').addEventListener('click', async () => {
    const url    = document.getElementById('links-f-url').value.trim();
    const titulo = document.getElementById('links-f-titulo').value.trim();
    const tipo   = document.getElementById('links-f-tipo').value;
    const estado = document.getElementById('links-f-estado').value;
    const tags   = document.getElementById('links-f-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const nota   = document.getElementById('links-f-nota').value.trim();

    if (!url || !titulo) return;

    const body = { url, titulo, tipo, estado, tags, nota };
    try {
      if (isEdit) {
        await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/api/links', { method: 'POST', body });
      }
      close();
      await loadLinks();
    } catch (err) {
      alert(`Error al guardar: ${err.message}`);
    }
  });
}
```

- [ ] **Step 2: Cablear el botón "✎ Editar" (pendiente desde Task 4, Step 4)**

En `buildLinkCard`, dentro de `frontend/modules/tabs/links.js`, agregar el listener que faltaba (justo después del bloque `card.querySelector('[data-del-id]')...` de Task 4 Step 4):

```js
  card.querySelector('[data-edit-id]').addEventListener('click', (e) => {
    e.stopPropagation();
    showLinksForm(link);
  });
```

- [ ] **Step 3: Cablear el botón "＋ Agregar link" en `initLinks`**

Dentro de `initLinks` (Task 4, Step 6), agregar una línea más:

```js
  document.getElementById('btn-links-add')?.addEventListener('click', () => showLinksForm(null));
```

- [ ] **Step 4: Verificación manual en el navegador**

Con el backend corriendo:
1. Click "＋ Agregar link" → completar URL + título (únicos requeridos) → Agregar. Expected: aparece la card nueva con estado Pendiente, tipo Otro si no se tocó el select.
2. Click ✎ en una card existente → cambiar estado a "Implementar" y agregar una tag → Guardar cambios. Expected: la card refleja el nuevo color de badge de estado y la tag nueva.
3. Intentar guardar con URL vacía → Expected: no se envía el request (validación client-side mínima ya cubierta por el `if (!url || !titulo) return;`), y si se fuerza vía backend con curl con URL inválida, debe devolver 400 (ya probado en Task 1).
4. Click fuera del modal (en el overlay) → Expected: cierra sin guardar.
5. Agregar un link con una URL que ya existe en el inventario → Expected: aparece el aviso "Ya existe un link guardado con esta URL..." debajo del campo URL, pero el botón "Agregar" sigue habilitado y guarda igual (no bloqueante).

- [ ] **Step 5: Commit**

```bash
cd "/d/Workspace-Repos/workspace-ui" && git add frontend/modules/tabs/links.js && git commit -m "feat(links): form de alta y edición de links"
```

---

### Task 6: Checklist final end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Reiniciar backend limpio y correr el flujo completo**

```bash
cd "/d/Workspace-Repos/workspace-ui/backend" && rm -f links-inventory.json && npm start
```

- [ ] **Step 2: Recorrer el checklist en el navegador (`http://localhost:8080`, tab Links)**

- [ ] Alta manual de 3 links con distintos `tipo` (Repo, Articulo, Skill).
- [ ] Marcar uno como favorito, verificar que el filtro "★ Solo favoritos" lo muestra solo a él.
- [ ] Cambiar el estado de uno a cada uno de los 4 valores desde el form de edición, verificar el color del badge en cada caso.
- [ ] Filtrar por tipo "Repo" y confirmar que solo aparece ese link.
- [ ] Eliminar un link y confirmar que desaparece y el contador baja.
- [ ] Abrir `http://localhost:8080/links-bookmarklet.html`, arrastrar el bookmarklet a la barra de marcadores, navegar a una página cualquiera (ej. `https://github.com`), click en el bookmarklet, volver al tab Links y hacer click en "↻ Recargar" — confirmar que aparece el nuevo link con esa URL/título y estado Pendiente.
- [ ] Apagar el backend, click en el bookmarklet desde una pestaña → confirmar que muestra el alert de error ("VCC no está corriendo...") en vez de fallar silenciosamente o colgarse.

- [ ] **Step 3: Confirmar que no rompió nada existente**

Recorrer rápidamente los tabs Inventario, MCPs y Túneles (los que comparten clases CSS `.infra-*` con Links) y confirmar visualmente que no cambiaron de aspecto — el riesgo principal es que un override de color/borde en Links se filtre a otro módulo por compartir clase sin scope.

- [ ] **Step 4: Cerrar el ciclo**

No hay commit en este task (es solo verificación). Si algún paso del checklist falla, volver al task correspondiente, corregir y volver a commitear ahí — no acumular fixes sueltos al final.
