# Modales unificados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ningún módulo de VCC edita ni crea registros inline en la vista — todo pasa por una
única cáscara de modal compartida (`openEditModal()`), con el mismo comportamiento y look que ya
usa Inventario (`.infra-edit-modal` / `.infra-edit-modal-box`).

**Architecture:** Un helper nuevo en `frontend/modules/core/dom.js` reemplaza las
implementaciones duplicadas de "crear overlay + box + Escape-only" que hoy viven sueltas en
`inventory.js` y `mcp.js`. Cada módulo (Inventario, MCPs, Links, SSL, Túneles, Proyectos) pasa a
usar ese helper para todo lo que hoy es inline. SSL y Túneles no tienen endpoints por-registro en
el backend — el modal arma el array completo en memoria con el registro tocado y lo manda al
mismo `PUT /config` bulk que ya existe, sin backend nuevo.

**Tech Stack:** HTML/CSS/JS vanilla (ES modules), sin build step. Verificación en vivo con
Playwright contra el backend corriendo en `localhost:8080` — no hay test automatizado de
DOM/interacción en este repo (los tests `node:test` cubren funciones puras de backend/frontend,
no flujos de UI).

## Global Constraints

- Ningún modal cierra con clic afuera del box — solo Escape o los botones Cancelar/Guardar/X
  (regla VCC ya vigente, documentada en memoria de proyecto y en el código existente de
  Inventario/MCPs/Links).
- La cáscara compartida vive en `openEditModal()` (`frontend/modules/core/dom.js`) — dos anchos:
  `standard` (920px, formularios grandes: Inventario, MCPs, Proyectos, Ambientes, Túneles) y
  `compact` (480px, formularios chicos: Links, Tipos de link, dominio SSL, motivo de archivado).
- SSL y Túneles no ganan endpoints de backend nuevos — siguen usando `PUT /config` con el array
  completo. No tocar `backend/routes/ssl.js` ni `backend/routes/tunnels.js`.
- No tocar el editor JSON raw de MCPs (`#mcp-json-editor-body`) ni de Inventario
  (`#json-editor-body`) — son herramientas crudas deliberadas, no formularios de alta/edición.
- No tocar `POST /api/tunnels/adhoc` ni el modelo de datos de túneles ad-hoc — solo cambia dónde
  se renderiza su formulario (modal en vez de inline).
- No rediseñar el modelo de datos de Proyectos/Ambientes — los endpoints por-registro (`PATCH
  /api/projects/:id`, `POST/PATCH/DELETE /api/projects/:id/environments/:env`) no cambian.
- `window.prompt()`/`alert()` nativos en SSL se reemplazan por los patrones estándar de VCC
  (modal compacto propio para el motivo de archivado, `.manage-banner` para errores).

---

### Task 1: Helper compartido `openEditModal()` + CSS del ancho compacto

**Files:**
- Modify: `frontend/modules/core/dom.js` (agregar función nueva al final del archivo)
- Modify: `frontend/style.css:2391-2396` (agregar modificador de ancho compacto)

**Interfaces:**
- Produces: `openEditModal(renderInto, { size = 'standard' } = {}) -> close` — `renderInto(box,
  close)` es una función que recibe el `<div>` box vacío y una función `close()` para cerrar el
  modal; el propio `openEditModal` devuelve `close` por si el llamador necesita cerrarlo desde
  afuera (no se usa en las tasks siguientes, pero mantiene paridad con el patrón de
  `showInventoryModal` actual). `size: 'compact'` agrega la clase `infra-edit-modal-compact` al
  box (480px); cualquier otro valor (incluido el default) usa el ancho estándar de 920px ya
  existente.

- [ ] **Step 1: Agregar `openEditModal()` a `core/dom.js`**

Al final de `frontend/modules/core/dom.js`, agregar:

```js
export function openEditModal(renderInto, { size = 'standard' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay infra-edit-modal';
  const box = document.createElement('div');
  box.className = size === 'compact'
    ? 'modal-box infra-edit-modal-box infra-edit-modal-compact'
    : 'modal-box infra-edit-modal-box';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // Regla VCC: los modales de edición nunca cierran con clic afuera -- solo Escape o los
  // botones Cancelar/Guardar/X (formularios largos, un clic accidental no debe perder lo tipeado).
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKeydown); overlay.remove(); };
  document.addEventListener('keydown', onKeydown);
  renderInto(box, close);
  return close;
}
```

- [ ] **Step 2: Agregar el modificador de ancho compacto en CSS**

En `frontend/style.css`, el bloque actual (línea 2391):

```css
.infra-edit-modal { align-items: flex-start; padding-top: 5vh; }
/* .modal-box.infra-edit-modal-box (2 clases) para ganarle en especificidad a .modal-box genérico
   (420px) -- con la misma especificidad (una clase c/u) gana el que aparece despues en el archivo. */
.modal-box.infra-edit-modal-box { width: min(920px, 96vw); max-height: 88vh; overflow-y: auto; }
/* Modal mas ancho -> permite 3-4 columnas reales en vez de 1-2 con el mismo minmax(220px) global */
.infra-edit-modal-box .manage-form-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
```

Agregar después de la última línea:

```css
/* Ancho compacto -- formularios chicos (2-4 campos: Links, Tipos, dominio SSL, motivo de
   archivado) no necesitan los 920px del estándar, quedan con espacio vacío de sobra. */
.modal-box.infra-edit-modal-box.infra-edit-modal-compact { width: min(480px, 92vw); }
.infra-edit-modal-compact .manage-form-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
```

- [ ] **Step 3: Verificar que no rompe nada existente**

Run (desde `D:\Workspace-Repos\workspace-ui`): `node --test frontend/test/*.test.js`

Expected: 17/17 pasan (ningún test cubre `core/dom.js` directamente, es un smoke check de que el
archivo sigue siendo JS válido y no rompió ningún import).

- [ ] **Step 4: Commit**

```bash
git add frontend/modules/core/dom.js frontend/style.css
git commit -m "feat(modals): openEditModal() compartido + ancho compacto para formularios chicos"
```

---

### Task 2: Inventario — Gestionar usa el modal en vez del formulario inline

**Files:**
- Modify: `frontend/modules/tabs/inventory.js:279-437` (`renderInventoryManage`, `showInventoryModal`, `showInventoryForm`)

**Interfaces:**
- Consumes: `openEditModal(renderInto, { size })` de Task 1.

**Contexto:** `showInventoryModal(srv)` ya existe y ya usa exactamente el patrón que
`openEditModal` reemplaza (overlay + box + Escape-only) — se reduce a una llamada al helper. El
verdadero cambio es que el botón "Editar"/"Agregar servidor" del panel Gestionar deja de llamar
`showInventoryForm(item, fc, onClose)` con `fc` = `#infra-form-container` (un `<div>` inline
dentro de la misma pantalla) y pasa a abrir el modal real, igual que el ✎ de la card.

- [ ] **Step 1: Reemplazar `showInventoryModal` para usar el helper**

En `frontend/modules/tabs/inventory.js`, el bloque actual (línea 424):

```js
function showInventoryModal(srv) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay infra-edit-modal';
  const box = document.createElement('div');
  box.className = 'modal-box infra-edit-modal-box';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // A pedido: NO cerrar al clickear afuera -- solo Escape o los botones Cancelar/Guardar
  // (formulario largo, un click afuera accidental no debe perder lo tipeado).
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKeydown); overlay.remove(); };
  document.addEventListener('keydown', onKeydown);
  showInventoryForm(srv, box, close);
}
```

Reemplazar por:

```js
function showInventoryModal(srv) {
  openEditModal((box, close) => showInventoryForm(srv, box, close));
}
```

- [ ] **Step 2: Importar `openEditModal`**

En `frontend/modules/tabs/inventory.js`, la línea 3 actual:

```js
import { buildAccordion, escHtml, formField, formPasswordField, formSelect, showManageBanner } from '../core/dom.js';
```

Cambiar a:

```js
import { buildAccordion, escHtml, formField, formPasswordField, formSelect, openEditModal, showManageBanner } from '../core/dom.js';
```

- [ ] **Step 3: Quitar el contenedor inline y usar el modal en Gestionar**

En `frontend/modules/tabs/inventory.js`, dentro de `renderInventoryManage()` (línea 279), el
bloque actual (línea 290-291):

```js
    `<button class="btn btn-solid btn-manage-add" id="btn-infra-add">＋ Agregar servidor</button>` +
    `<div id="infra-form-container"></div>` +
```

Reemplazar por (se elimina el `<div>` inline):

```js
    `<button class="btn btn-solid btn-manage-add" id="btn-infra-add">＋ Agregar servidor</button>` +
```

- [ ] **Step 4: Cambiar los handlers de "Agregar" y "Editar" para abrir el modal**

En la misma función, el bloque actual (línea 371-383):

```js
  container.querySelector('#btn-infra-add').addEventListener('click', () => {
    const fc = document.getElementById('infra-form-container');
    showInventoryForm(null, fc, () => { fc.innerHTML = ''; });
  });

  container.querySelectorAll('.btn-manage-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editId;
      const srv = infraAllServers.find(s => s.id === id);
      const fc = document.getElementById('infra-form-container');
      if (srv) showInventoryForm(srv, fc, () => { fc.innerHTML = ''; });
    });
  });
```

Reemplazar por:

```js
  container.querySelector('#btn-infra-add').addEventListener('click', () => {
    showInventoryModal(null);
  });

  container.querySelectorAll('.btn-manage-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editId;
      const srv = infraAllServers.find(s => s.id === id);
      if (srv) showInventoryModal(srv);
    });
  });
```

- [ ] **Step 5: Corregir el re-render tras guardar (bug real que aparece al sacar el contenedor inline)**

`showInventoryForm`'s save handler (línea 552 actual) decide si re-renderizar el panel Gestionar
mirando si `#infra-form-container` sigue existiendo en el DOM — con el contenedor eliminado en
el Step 3, esa condición nunca sería verdadera y el panel Gestionar dejaría de reflejar los
cambios después de guardar desde un modal abierto encima de Gestionar. En
`frontend/modules/tabs/inventory.js`, dentro de `showInventoryForm`, el bloque actual (línea
548-552):

```js
      const { servers } = await get('/api/inventory');
      infraAllServers = servers;
      renderInventory(servers);
      onClose();
      if (document.getElementById('infra-form-container')) renderInventoryManage();
```

Reemplazar por:

```js
      const { servers } = await get('/api/inventory');
      infraAllServers = servers;
      renderInventory(servers);
      onClose();
      const manageContainer = document.getElementById('infra-manage-container');
      if (manageContainer && !manageContainer.classList.contains('hidden')) renderInventoryManage();
```

- [ ] **Step 6: Verificar en vivo**

Con el backend corriendo (`http://localhost:8080`), tab Inventario → Gestionar → "＋ Agregar
servidor": confirmar que abre el modal ancho estándar (no un formulario inline en la página).
"Editar" sobre una fila de la tabla: confirmar que abre el mismo modal con los datos
precargados, que Guardar cierra el modal y refresca tanto la vista normal como la tabla de
Gestionar (que sigue abierta detrás). Confirmar que el ✎ de una card en la vista normal sigue
abriendo el modal igual que antes (no debería haber cambiado).

- [ ] **Step 7: Commit**

```bash
git add frontend/modules/tabs/inventory.js
git commit -m "refactor(inventory): Gestionar abre el modal de edición en vez del formulario inline"
```

---

### Task 3: MCPs — mismo tratamiento que Inventario

**Files:**
- Modify: `frontend/modules/tabs/mcp.js:1-2,186-187,196-321,364-376`

**Interfaces:**
- Consumes: `openEditModal(renderInto, { size })` de Task 1.

**Contexto:** MCP ya no tiene el bug de Task 2 Step 5 — `loadMcp()` (línea 186-187) ya chequea la
visibilidad de `#mcp-manage-container`, no la existencia de `#mcp-form-container`, así que no
hace falta un fix equivalente acá.

- [ ] **Step 1: Importar `openEditModal`**

En `frontend/modules/tabs/mcp.js`, la línea 2 actual:

```js
import { buildAccordion, escHtml, formField, showManageBanner } from '../core/dom.js';
```

Cambiar a:

```js
import { buildAccordion, escHtml, formField, openEditModal, showManageBanner } from '../core/dom.js';
```

- [ ] **Step 2: Reemplazar `showMcpModal` para usar el helper**

En `frontend/modules/tabs/mcp.js`, el bloque actual (línea 364-376):

```js
function showMcpModal(mcp) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay infra-edit-modal';
  const box = document.createElement('div');
  box.className = 'modal-box infra-edit-modal-box';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // Regla VCC: los modales nunca cierran con clic afuera -- solo Cancelar/Guardar/X o Escape.
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKeydown); overlay.remove(); };
  document.addEventListener('keydown', onKeydown);
  showMcpForm(mcp, box, close);
}
```

Reemplazar por:

```js
function showMcpModal(mcp) {
  openEditModal((box, close) => showMcpForm(mcp, box, close));
}
```

- [ ] **Step 3: Quitar el contenedor inline**

En `frontend/modules/tabs/mcp.js`, dentro de `renderMcpManage()`, el bloque actual (línea
207-208):

```js
    `<button class="btn btn-solid btn-manage-add" id="btn-mcp-add">＋ Agregar MCP</button>` +
    `<div id="mcp-form-container"></div>` +
```

Reemplazar por:

```js
    `<button class="btn btn-solid btn-manage-add" id="btn-mcp-add">＋ Agregar MCP</button>` +
```

- [ ] **Step 4: Cambiar los handlers de "Agregar" y "Editar" para abrir el modal**

En la misma función, el bloque actual (línea 310-323):

```js
  container.querySelector('#btn-mcp-add').addEventListener('click', () => {
    const fc = document.getElementById('mcp-form-container');
    showMcpForm(null, fc, () => { fc.innerHTML = ''; });
  });

  container.querySelectorAll('[data-edit-mcp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.editMcp;
      const mcp  = mcpAllData.mcps.find(m => m.name === name);
      if (!mcp) return;
      const fc = document.getElementById('mcp-form-container');
      showMcpForm(mcp, fc, () => { fc.innerHTML = ''; });
    });
  });
```

Reemplazar por:

```js
  container.querySelector('#btn-mcp-add').addEventListener('click', () => {
    showMcpModal(null);
  });

  container.querySelectorAll('[data-edit-mcp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.editMcp;
      const mcp  = mcpAllData.mcps.find(m => m.name === name);
      if (mcp) showMcpModal(mcp);
    });
  });
```

- [ ] **Step 5: Verificar en vivo**

Tab MCPs → Gestionar → "＋ Agregar MCP" y "Editar" sobre una fila: confirmar que ambos abren el
modal ancho estándar, que Guardar cierra el modal y refresca la tabla de Gestionar (que ya
funcionaba antes de este cambio, no debería regresionar). Confirmar que el ✎ de una card en la
vista normal sigue funcionando igual.

- [ ] **Step 6: Commit**

```bash
git add frontend/modules/tabs/mcp.js
git commit -m "refactor(mcp): Gestionar abre el modal de edición en vez del formulario inline"
```

---

### Task 4: Links — link y Tipo pasan a la cáscara compartida

**Files:**
- Modify: `frontend/modules/tabs/links.js:1-2,210-284,321-390`

**Interfaces:**
- Consumes: `openEditModal(renderInto, { size })` de Task 1.

**Contexto:** El formulario de link (`showLinksForm`) ya construye su propio `.modal-overlay` a
mano — con chrome distinto al de Inventario (420px, centrado, sin `infra-edit-modal`). Pasa a
usar el helper compartido, tamaño compacto. El formulario de Tipo (`showTipoForm`) hoy es inline
dentro del panel de gestión de tipos — pasa al mismo helper, compacto.

- [ ] **Step 1: Importar `openEditModal`**

En `frontend/modules/tabs/links.js`, la línea 2 actual:

```js
import { escHtml, formField, formSelect, showManageBanner } from '../core/dom.js';
```

Cambiar a:

```js
import { escHtml, formField, formSelect, openEditModal, showManageBanner } from '../core/dom.js';
```

- [ ] **Step 2: `showLinksForm` usa el helper en vez de armar su propio overlay**

En `frontend/modules/tabs/links.js`, la función actual (línea 210-284) empieza así:

```js
function showLinksForm(link) {
  const isEdit = link !== null;
  const container = document.getElementById('links-form-container');
  const tagsText = (link?.tags ?? []).join(', ');
  const tipoOptions = linksTipos.map(t => [t.nombre, t.nombre]);

  container.innerHTML =
    `<div class="modal-overlay" id="links-form-overlay">` +
      `<div class="modal-box manage-form">` +
        `<div class="manage-form-title">${isEdit ? 'Editar link' : 'Nuevo link'}</div>` +
        formField('URL', 'links-f-url', link?.url ?? '', 'https://...') +
        `<div class="manage-banner hidden" id="links-f-dup-warning"></div>` +
        formField('Título', 'links-f-titulo', link?.titulo ?? '', 'Título descriptivo') +
        `<div class="manage-form-grid">` +
          formSelect('Tipo', 'links-f-tipo', link?.tipo ?? (linksTipos[0]?.nombre ?? ''), tipoOptions) +
          formSelect('Estado', 'links-f-estado', link?.estado ?? 'Pendiente', [
            ['Pendiente', 'Pendiente'], ['Revisado', 'Revisado'], ['Implementar', 'Implementar'], ['Descartado', 'Descartado'],
          ]) +
        `</div>` +
        formField('Tags (separados por coma)', 'links-f-tags', tagsText, 'laravel, n8n') +
        `<label class="form-toggle-row">` +
          `<input type="checkbox" id="links-f-favorito"${link?.favorito ? ' checked' : ''}>` +
          `<span class="form-toggle-label">★ Favorito</span>` +
        `</label>` +
        `<label class="form-label" for="links-f-nota">Nota</label>` +
        `<textarea class="form-textarea" id="links-f-nota" rows="8" placeholder="Nota opcional">${escHtml(link?.nota ?? '')}</textarea>` +
        `<div class="manage-banner hidden" id="links-f-save-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-links-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-links-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>` +
    `</div>`;

  // Regla VCC: los modales nunca cierran con clic afuera -- solo Cancelar/Guardar/X o Escape.
  const close = () => { document.removeEventListener('keydown', onKeydown); container.innerHTML = ''; };
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKeydown);
  document.getElementById('btn-links-form-cancel').addEventListener('click', close);
```

Reemplazar la función `showLinksForm` completa (línea 210-284, desde `function showLinksForm(link)
{` hasta la llave de cierre final) por:

```js
function showLinksForm(link) {
  openEditModal((container, close) => {
    const isEdit = link !== null;
    const tagsText = (link?.tags ?? []).join(', ');
    const tipoOptions = linksTipos.map(t => [t.nombre, t.nombre]);

    container.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">${isEdit ? 'Editar link' : 'Nuevo link'}</div>` +
        formField('URL', 'links-f-url', link?.url ?? '', 'https://...') +
        `<div class="manage-banner hidden" id="links-f-dup-warning"></div>` +
        formField('Título', 'links-f-titulo', link?.titulo ?? '', 'Título descriptivo') +
        `<div class="manage-form-grid">` +
          formSelect('Tipo', 'links-f-tipo', link?.tipo ?? (linksTipos[0]?.nombre ?? ''), tipoOptions) +
          formSelect('Estado', 'links-f-estado', link?.estado ?? 'Pendiente', [
            ['Pendiente', 'Pendiente'], ['Revisado', 'Revisado'], ['Implementar', 'Implementar'], ['Descartado', 'Descartado'],
          ]) +
        `</div>` +
        formField('Tags (separados por coma)', 'links-f-tags', tagsText, 'laravel, n8n') +
        `<label class="form-toggle-row">` +
          `<input type="checkbox" id="links-f-favorito"${link?.favorito ? ' checked' : ''}>` +
          `<span class="form-toggle-label">★ Favorito</span>` +
        `</label>` +
        `<label class="form-label" for="links-f-nota">Nota</label>` +
        `<textarea class="form-textarea" id="links-f-nota" rows="8" placeholder="Nota opcional">${escHtml(link?.nota ?? '')}</textarea>` +
        `<div class="manage-banner hidden" id="links-f-save-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-links-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-links-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>`;

    container.querySelector('#btn-links-form-cancel').addEventListener('click', close);

    // Aviso no bloqueante de URL duplicada (no impide guardar, solo informa)
    const urlInput  = container.querySelector('#links-f-url');
    const dupWarning = container.querySelector('#links-f-dup-warning');
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      const dup = val && linksAllData.some(l => l.url === val && l.id !== link?.id);
      dupWarning.textContent = dup ? 'Ya existe un link guardado con esta URL. Se puede guardar igual.' : '';
      dupWarning.classList.toggle('hidden', !dup);
    });

    container.querySelector('#btn-links-form-save').addEventListener('click', async () => {
      const url    = container.querySelector('#links-f-url').value.trim();
      const titulo = container.querySelector('#links-f-titulo').value.trim();
      const tipo   = container.querySelector('#links-f-tipo').value;
      const estado = container.querySelector('#links-f-estado').value;
      const tags   = container.querySelector('#links-f-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      const nota   = container.querySelector('#links-f-nota').value.trim();
      const favorito = container.querySelector('#links-f-favorito').checked;

      if (!url || !titulo) return;

      const body = { url, titulo, tipo, estado, tags, nota, favorito };
      try {
        if (isEdit) {
          await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'PATCH', body });
        } else {
          await apiFetch('/api/links', { method: 'POST', body });
        }
        close();
        await loadLinks();
      } catch (err) {
        showManageBanner('links-f-save-error', `Error al guardar: ${err.message}`, true);
      }
    });
  }, { size: 'compact' });
}
```

Nota sobre el cambio real de contenido: los `document.getElementById(...)` originales pasan a
`container.querySelector('#...')` (mismo elemento, ahora resuelto contra el `container` del
closure en vez de global — evita cualquier colisión de id con otro modal que pudiera estar
montado). El resto de la lógica (validación, payload, POST/PATCH, manejo de error) es idéntico al
original.

- [ ] **Step 4: `showTipoForm` pasa a modal compacto**

En `frontend/modules/tabs/links.js`, la función actual (línea 353-390):

```js
function showTipoForm(tipo) {
  const isEdit = tipo !== null;
  const container = document.getElementById('tipo-form-container');

  container.innerHTML =
    `<div class="manage-form">` +
      `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(tipo.nombre)}` : 'Nuevo tipo'}</div>` +
      formField('Nombre', 'tipo-f-nombre', tipo?.nombre ?? '', 'Tutorial, Video...') +
      formSelect('Color', 'tipo-f-color', tipo?.color ?? 'accent', COLOR_OPTIONS) +
      `<div class="manage-banner hidden" id="tipo-f-error"></div>` +
      `<div class="manage-form-actions">` +
        `<button class="btn btn-ghost btn-modal-cancel" id="btn-tipo-form-cancel">Cancelar</button>` +
        `<button class="btn btn-primary btn-modal-ok" id="btn-tipo-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
      `</div>` +
    `</div>`;

  const close = () => { container.innerHTML = ''; };
  container.querySelector('#btn-tipo-form-cancel').addEventListener('click', close);

  container.querySelector('#btn-tipo-form-save').addEventListener('click', async () => {
    const nombre = document.getElementById('tipo-f-nombre').value.trim();
    const color  = document.getElementById('tipo-f-color').value;
    if (!nombre) return;

    try {
      if (isEdit) {
        await apiFetch(`/api/links/tipos/${encodeURIComponent(tipo.nombre)}`, { method: 'PUT', body: { nombre, color } });
      } else {
        await apiFetch('/api/links/tipos', { method: 'POST', body: { nombre, color } });
      }
      close();
      await loadLinksTipos();
      renderTiposManage();
    } catch (err) {
      showManageBanner('tipo-f-error', err.message, true);
    }
  });
}
```

Reemplazar por:

```js
function showTipoForm(tipo) {
  openEditModal((container, close) => {
    const isEdit = tipo !== null;

    container.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(tipo.nombre)}` : 'Nuevo tipo'}</div>` +
        formField('Nombre', 'tipo-f-nombre', tipo?.nombre ?? '', 'Tutorial, Video...') +
        formSelect('Color', 'tipo-f-color', tipo?.color ?? 'accent', COLOR_OPTIONS) +
        `<div class="manage-banner hidden" id="tipo-f-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-tipo-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-tipo-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>`;

    container.querySelector('#btn-tipo-form-cancel').addEventListener('click', close);

    container.querySelector('#btn-tipo-form-save').addEventListener('click', async () => {
      const nombre = document.getElementById('tipo-f-nombre').value.trim();
      const color  = document.getElementById('tipo-f-color').value;
      if (!nombre) return;

      try {
        if (isEdit) {
          await apiFetch(`/api/links/tipos/${encodeURIComponent(tipo.nombre)}`, { method: 'PUT', body: { nombre, color } });
        } else {
          await apiFetch('/api/links/tipos', { method: 'POST', body: { nombre, color } });
        }
        close();
        await loadLinksTipos();
        renderTiposManage();
      } catch (err) {
        showManageBanner('tipo-f-error', err.message, true);
      }
    });
  }, { size: 'compact' });
}
```

- [ ] **Step 4: Quitar el contenedor inline de Tipos**

En `frontend/modules/tabs/links.js`, dentro de `renderTiposManage()` (línea ~290-301), el bloque
actual:

```js
    `<button class="btn btn-solid btn-manage-add" id="btn-tipo-add">＋ Agregar tipo</button>` +
    `<div id="tipo-form-container"></div>` +
```

Reemplazar por (se elimina el `<div>` inline — `showTipoForm` ya no lo necesita, abre su propio
modal):

```js
    `<button class="btn btn-solid btn-manage-add" id="btn-tipo-add">＋ Agregar tipo</button>` +
```

- [ ] **Step 5: Quitar `#links-form-container` y `#links-form-overlay` del HTML**

En `frontend/index.html`, dentro del tab Links, buscar `<div id="links-form-container"></div>`
(línea ~347) y eliminarla — ya no hace falta, `showLinksForm` ahora monta su modal directamente
en `document.body` vía `openEditModal`.

- [ ] **Step 6: Verificar en vivo**

Tab Links: "＋ Agregar link" y ✎ sobre un link existente abren el modal compacto (480px) en vez
del modal genérico anterior. El aviso de URL duplicada y el guardado siguen funcionando. Dentro
de "⚙ Tipos": "＋ Agregar tipo" y "Editar" sobre un tipo abren modal compacto en vez de inline.

- [ ] **Step 7: Commit**

```bash
git add frontend/modules/tabs/links.js frontend/index.html
git commit -m "refactor(links): link y tipo pasan a la cáscara de modal compartida (compact)"
```

---

### Task 5: SSL — de tabla inline a modal por dominio

**Files:**
- Modify: `frontend/modules/tabs/ssl.js:1-4,59-98,317-474,491-504`

**Interfaces:**
- Consumes: `openEditModal(renderInto, { size })` de Task 1.

**Contexto:** Es el módulo más alejado del estándar hoy — edición fila-por-fila inline en la
tabla, `window.prompt()`/`alert()` nativos. El backend sigue siendo el mismo `PUT /config` con el
array completo — el modal arma `domains.map(...)` con el dominio tocado (o `[...domains, nuevo]`
para alta) y llama a `saveConfig()`, sin cambios de backend.

- [ ] **Step 1: Importar lo que hace falta**

En `frontend/modules/tabs/ssl.js`, la línea 4 actual:

```js
import { buildAccordion, escHtml } from '../core/dom.js';
```

Cambiar a:

```js
import { buildAccordion, escHtml, formField, openEditModal, showManageBanner } from '../core/dom.js';
```

- [ ] **Step 2: El ✎ de la card abre el modal directamente (ya no navega a Gestionar)**

En `frontend/modules/tabs/ssl.js`, dentro de `buildSSLCard(row)`, el bloque actual (línea 88-91):

```js
  card.querySelector('.infra-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openSslManageAndFocus(row.domain);
  });
```

Reemplazar por:

```js
  card.querySelector('.infra-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showDomainModal(row);
  });
```

- [ ] **Step 3: Reemplazar `renderManageTable` — tabla de solo lectura + modal por fila**

En `frontend/modules/tabs/ssl.js`, el bloque completo actual (línea 317-448, desde `let
sslManageMode = false;` hasta el cierre de `renderManageTable`):

```js
// === M10 — ABM Dominios ===
let sslManageMode = false;

function renderManageTable(domains) {
  const c = document.getElementById('ssl-manage-container');
  c.innerHTML = '';

  // Formulario agregar
  const addRow = document.createElement('div');
  addRow.className = 'ssl-add-row';
  addRow.innerHTML =
    `<input class="ssl-input" id="ssl-new-domain" placeholder="dominio.com.ar" />` +
    `<input class="ssl-input" id="ssl-new-label"  placeholder="Etiqueta" />` +
    `<input class="ssl-input" id="ssl-new-empresa" placeholder="Empresa" />` +
    `<input class="ssl-input" id="ssl-new-dnsadmin" placeholder="Admin DNS (opcional)" />` +
    `<button class="btn btn-sm btn-primary btn-ssl-action add" id="btn-ssl-add">+ Agregar</button>`;
  c.appendChild(addRow);

  document.getElementById('btn-ssl-add').addEventListener('click', async () => {
    const domain   = document.getElementById('ssl-new-domain').value.trim();
    const label    = document.getElementById('ssl-new-label').value.trim();
    const empresa  = document.getElementById('ssl-new-empresa').value.trim();
    const dnsAdmin = document.getElementById('ssl-new-dnsadmin').value.trim();
    if (!domain) return;
    await saveConfig([...domains, { domain, label: label || domain, empresa, dnsAdmin }]);
  });

  // Tabla editable
  const table = document.createElement('table');
  table.className = 'ssl-table data-table';
  table.innerHTML = `<thead><tr><th>DOMINIO</th><th>ETIQUETA</th><th>EMPRESA</th><th>ADMIN DNS</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  domains.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.dataset.domain = entry.domain;

    const tdDomain  = document.createElement('td');
    const tdLabel   = document.createElement('td');
    const tdEmpresa = document.createElement('td');
    const tdDns     = document.createElement('td');
    const tdActs    = document.createElement('td');
    tdActs.style.whiteSpace = 'nowrap';

    function viewMode() {
      const archivedTag = entry.archived ? ` <span class="ssl-status-archived" style="font-size:0.62rem;font-weight:700;letter-spacing:0.06em">● ARCHIVADO</span>` : '';
      tdDomain.innerHTML  = `<span class="ssl-domain">${escHtml(entry.domain)}</span>${archivedTag}`;
      tdLabel.innerHTML   = `<span class="ssl-label">${escHtml(entry.label)}</span>`;
      tdEmpresa.innerHTML = `<span style="color:var(--text-faint)">${escHtml(entry.empresa || '—')}</span>`;
      tdDns.innerHTML     = `<span style="color:var(--text-faint)">${escHtml(entry.dnsAdmin || '—')}</span>`;
      tdActs.innerHTML   = '';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm btn-ghost btn-ssl-action';
      btnEdit.textContent = 'Editar';
      btnEdit.addEventListener('click', editMode);

      const btnArchive = document.createElement('button');
      btnArchive.className = 'btn btn-sm btn-warning btn-ssl-action';
      btnArchive.textContent = entry.archived ? 'Desarchivar' : 'Archivar';
      btnArchive.title = entry.archived
        ? 'Volver a monitorear este dominio activamente'
        : 'Sacar de las alertas — para problemas con decisión tomada (ej: dominio no se renueva)';
      btnArchive.addEventListener('click', async () => {
        let archivedNote = entry.archivedNote ?? '';
        if (!entry.archived) {
          archivedNote = window.prompt('Motivo del archivado (opcional):', archivedNote) ?? archivedNote;
        }
        const updated = domains.map((d, i) =>
          i === idx ? { ...d, archived: !entry.archived, archivedNote: !entry.archived ? archivedNote : '' } : d
        );
        await saveConfig(updated);
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-sm btn-danger btn-ssl-action del';
      btnDel.textContent = 'Eliminar';
      btnDel.title = 'Eliminación definitiva del monitoreo';
      btnDel.addEventListener('click', async () => {
        const updated = domains.filter((_, i) => i !== idx);
        await saveConfig(updated);
      });

      tdActs.appendChild(btnEdit);
      tdActs.appendChild(btnArchive);
      tdActs.appendChild(btnDel);
    }

    function editMode() {
      tdDomain.innerHTML  = `<input class="ssl-input" value="${escHtml(entry.domain)}" id="edit-domain-${idx}" />`;
      tdLabel.innerHTML   = `<input class="ssl-input" value="${escHtml(entry.label)}"  id="edit-label-${idx}"  />`;
      tdEmpresa.innerHTML = `<input class="ssl-input" value="${escHtml(entry.empresa ?? '')}"  id="edit-empresa-${idx}"  />`;
      tdDns.innerHTML     = `<input class="ssl-input" value="${escHtml(entry.dnsAdmin ?? '')}" id="edit-dnsadmin-${idx}" />`;
      tdActs.innerHTML   = '';

      const btnSave = document.createElement('button');
      btnSave.className = 'btn btn-sm btn-success btn-ssl-action add';
      btnSave.textContent = 'Guardar';
      btnSave.addEventListener('click', async () => {
        const newDomain   = document.getElementById(`edit-domain-${idx}`).value.trim();
        const newLabel    = document.getElementById(`edit-label-${idx}`).value.trim();
        const newEmpresa  = document.getElementById(`edit-empresa-${idx}`).value.trim();
        const newDnsAdmin = document.getElementById(`edit-dnsadmin-${idx}`).value.trim();
        if (!newDomain) return;
        const updated = domains.map((d, i) =>
          i === idx ? { ...d, domain: newDomain, label: newLabel || newDomain, empresa: newEmpresa, dnsAdmin: newDnsAdmin } : d
        );
        await saveConfig(updated);
      });

      const btnCancel = document.createElement('button');
      btnCancel.className = 'btn btn-sm btn-ghost btn-ssl-action';
      btnCancel.textContent = 'Cancelar';
      btnCancel.addEventListener('click', viewMode);

      tdActs.appendChild(btnSave);
      tdActs.appendChild(btnCancel);
    }

    viewMode();
    tr.appendChild(tdDomain);
    tr.appendChild(tdLabel);
    tr.appendChild(tdEmpresa);
    tr.appendChild(tdDns);
    tr.appendChild(tdActs);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  c.appendChild(table);
}
```

Reemplazar el bloque completo por:

```js
// === M10 — ABM Dominios ===
let sslManageMode = false;
let sslManageDomains = [];

function renderManageTable(domains) {
  sslManageDomains = domains;
  const c = document.getElementById('ssl-manage-container');
  c.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-solid btn-manage-add';
  addBtn.textContent = '＋ Agregar dominio';
  addBtn.addEventListener('click', () => showDomainModal(null));
  c.appendChild(addBtn);

  const table = document.createElement('table');
  table.className = 'ssl-table data-table';
  table.innerHTML = `<thead><tr><th>DOMINIO</th><th>ETIQUETA</th><th>EMPRESA</th><th>ADMIN DNS</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  domains.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.dataset.domain = entry.domain;

    const archivedTag = entry.archived ? ` <span class="ssl-status-archived" style="font-size:0.62rem;font-weight:700;letter-spacing:0.06em">● ARCHIVADO</span>` : '';
    tr.innerHTML =
      `<td><span class="ssl-domain">${escHtml(entry.domain)}</span>${archivedTag}</td>` +
      `<td><span class="ssl-label">${escHtml(entry.label)}</span></td>` +
      `<td><span style="color:var(--text-faint)">${escHtml(entry.empresa || '—')}</span></td>` +
      `<td><span style="color:var(--text-faint)">${escHtml(entry.dnsAdmin || '—')}</span></td>` +
      `<td class="manage-actions"></td>`;

    const tdActs = tr.querySelector('.manage-actions');

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-sm btn-ghost btn-ssl-action';
    btnEdit.textContent = 'Editar';
    btnEdit.addEventListener('click', () => showDomainModal(entry));

    const btnArchive = document.createElement('button');
    btnArchive.className = 'btn btn-sm btn-warning btn-ssl-action';
    btnArchive.textContent = entry.archived ? 'Desarchivar' : 'Archivar';
    btnArchive.title = entry.archived
      ? 'Volver a monitorear este dominio activamente'
      : 'Sacar de las alertas — para problemas con decisión tomada (ej: dominio no se renueva)';
    btnArchive.addEventListener('click', () => {
      if (entry.archived) {
        const updated = sslManageDomains.map(d => d.domain === entry.domain ? { ...d, archived: false, archivedNote: '' } : d);
        saveConfig(updated);
        return;
      }
      showArchiveModal(entry);
    });

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm btn-danger btn-ssl-action del';
    btnDel.textContent = 'Eliminar';
    btnDel.title = 'Eliminación definitiva del monitoreo';
    btnDel.addEventListener('click', () => {
      const updated = sslManageDomains.filter(d => d.domain !== entry.domain);
      saveConfig(updated);
    });

    tdActs.appendChild(btnEdit);
    tdActs.appendChild(btnArchive);
    tdActs.appendChild(btnDel);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  c.appendChild(table);
}

function showDomainModal(entry) {
  openEditModal((box, close) => {
    const isEdit = entry !== null;
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(entry.domain)}` : 'Nuevo dominio'}</div>` +
        formField('Dominio', 'ssl-f-domain', entry?.domain ?? '', 'dominio.com.ar') +
        formField('Etiqueta', 'ssl-f-label', entry?.label ?? '', 'Etiqueta') +
        formField('Empresa', 'ssl-f-empresa', entry?.empresa ?? '', 'Empresa') +
        formField('Admin DNS', 'ssl-f-dnsadmin', entry?.dnsAdmin ?? '', '(opcional)') +
        `<div class="manage-banner hidden" id="ssl-f-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-ssl-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-ssl-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-ssl-form-cancel').addEventListener('click', close);

    box.querySelector('#btn-ssl-form-save').addEventListener('click', async () => {
      const domain   = document.getElementById('ssl-f-domain').value.trim();
      const label    = document.getElementById('ssl-f-label').value.trim();
      const empresa  = document.getElementById('ssl-f-empresa').value.trim();
      const dnsAdmin = document.getElementById('ssl-f-dnsadmin').value.trim();
      if (!domain) return;

      const updated = isEdit
        ? sslManageDomains.map(d => d.domain === entry.domain
            ? { ...d, domain, label: label || domain, empresa, dnsAdmin }
            : d)
        : [...sslManageDomains, { domain, label: label || domain, empresa, dnsAdmin }];

      const ok = await saveConfig(updated);
      if (ok) close();
      else showManageBanner('ssl-f-error', 'Error al guardar — revisá la consola', true);
    });
  }, { size: 'compact' });
}

function showArchiveModal(entry) {
  openEditModal((box, close) => {
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">Archivar ${escHtml(entry.domain)}</div>` +
        `<label class="form-label" for="ssl-f-archive-note">Motivo del archivado (opcional)</label>` +
        `<textarea class="form-textarea" id="ssl-f-archive-note" rows="4" placeholder="Ej: dominio vencido, no se renueva">${escHtml(entry.archivedNote ?? '')}</textarea>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-ssl-archive-cancel">Cancelar</button>` +
          `<button class="btn btn-warning btn-modal-ok" id="btn-ssl-archive-confirm">Archivar</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-ssl-archive-cancel').addEventListener('click', close);
    box.querySelector('#btn-ssl-archive-confirm').addEventListener('click', async () => {
      const archivedNote = document.getElementById('ssl-f-archive-note').value.trim();
      const updated = sslManageDomains.map(d => d.domain === entry.domain ? { ...d, archived: true, archivedNote } : d);
      const ok = await saveConfig(updated);
      if (ok) close();
    });
  }, { size: 'compact' });
}
```

- [ ] **Step 4: `saveConfig` deja de usar `alert()` y devuelve si tuvo éxito**

En `frontend/modules/tabs/ssl.js`, el bloque actual (línea ~450-463):

```js
async function saveConfig(domains) {
  try {
    const res = await fetch(`${API_BASE}/api/ssl/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    renderManageTable(data.domains);
  } catch (e) {
    alert(`Error al guardar: ${e.message}`);
  }
}
```

Reemplazar por:

```js
async function saveConfig(domains) {
  try {
    const res = await fetch(`${API_BASE}/api/ssl/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    renderManageTable(data.domains);
    return true;
  } catch (e) {
    console.error('[VCC] saveConfig SSL error:', e.message);
    return false;
  }
}
```

Nota: el llamador (`showDomainModal`) ya maneja el caso de error mostrando
`ssl-f-error`; `btnArchive`/`btnDel` (alta directa sin modal de confirmación de error,
mismo comportamiento que ya tenían) ignoran el valor de retorno como antes — no es una
regresión, es el mismo nivel de manejo de errores que existía (silencioso salvo el ahora
removido `alert()`, reemplazado por el log de consola para no perder la traza).

- [ ] **Step 5: Simplificar/eliminar `openSslManageAndFocus` si quedó sin uso**

En `frontend/modules/tabs/ssl.js`, tras el Step 2, `openSslManageAndFocus` (línea ~493-504) ya no
tiene ningún llamador (era invocada solo desde el ✎ de la card, reemplazado en Step 2). Eliminar
la función completa:

```js
// Abre "Gestionar" (si no está abierto) y lleva la vista a la fila de un dominio puntual —
// evita que editar un dominio archivado implique buscarlo a mano en la tabla completa.
async function openSslManageAndFocus(domain) {
  if (!sslManageMode) toggleManageMode();
  else await loadManage();

  setTimeout(() => {
    const row = document.querySelector(`#ssl-manage-container tr[data-domain="${CSS.escape(domain)}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('ssl-row-flash');
    setTimeout(() => row.classList.remove('ssl-row-flash'), 1500);
  }, 150);
}
```

- [ ] **Step 6: Verificar en vivo**

Tab SSL, vista normal: ✎ en una card abre el modal de edición directamente (ya no navega a
Gestionar). Guardar un cambio de etiqueta: confirmar que persiste y que los demás dominios no se
tocan. "⚙ Gestionar": la tabla ahora es de solo lectura + botones; "＋ Agregar dominio" abre modal
vacío; "Editar" abre modal con datos; "Archivar" abre el modal de motivo (ya no
`window.prompt`); "Desarchivar" actúa directo sin modal (como antes); "Eliminar" actúa directo
(como antes). Confirmar que ningún `alert()` nativo aparece ante un error simulado (ej. apagar el
backend momentáneamente y reintentar guardar).

- [ ] **Step 7: Commit**

```bash
git add frontend/modules/tabs/ssl.js
git commit -m "refactor(ssl): tabla de dominios pasa a modal por-registro, sin prompt()/alert() nativos"
```

---

### Task 6: Túneles — tabla-planilla pasa a modal por túnel

**Files:**
- Modify: `frontend/modules/tabs/tunnels.js:1-4,268-336,392-475`

**Interfaces:**
- Consumes: `openEditModal(renderInto, { size })` de Task 1.

**Contexto:** Igual que SSL, no hay endpoint por-registro — el modal arma el array completo
(`tunnels` filtrados a los guardados, sin los ad-hoc) con el túnel tocado y llama al mismo `PUT
/config` existente. El túnel ad-hoc mantiene su propio endpoint (`POST /adhoc`), solo cambia a
presentarse en la cáscara de modal.

- [ ] **Step 1: Importar lo que hace falta**

En `frontend/modules/tabs/tunnels.js`, la línea 4 actual:

```js
import { escHtml } from '../core/dom.js';
```

Cambiar a:

```js
import { escHtml, openEditModal, showManageBanner } from '../core/dom.js';
```

- [ ] **Step 2: Reemplazar `renderManageTunnels` — tabla de solo lectura + modal**

En `frontend/modules/tabs/tunnels.js`, el bloque completo actual (línea 268-336, desde `function
inp(...)` hasta el cierre de `renderManageTunnels`):

```js
function inp(type, val, placeholder, cls = '') {
  return `<input type="${type}" class="ssl-input ${cls}" value="${escHtml(String(val ?? ''))}" placeholder="${escHtml(placeholder)}">`;
}

function renderManageTunnels(tunnels) {
  // Filtrar ad-hoc — solo se gestionan los presets guardados
  const saved = tunnels.filter(t => !t.adhoc);
  const mc    = document.getElementById('tunnels-manage-container');
  mc.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'ssl-manage-wrap';

  const table = document.createElement('table');
  table.className = 'ssl-manage-table data-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>Puerto</th><th>Nombre</th><th>Remote</th><th>Clave SSH</th>` +
    `<th>Forward</th><th>Prod</th><th></th>` +
    `</tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const t of saved) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${inp('number', t.port, '3308', 'port-inp')}</td>` +
      `<td>${inp('text', t.name, 'Nombre')}</td>` +
      `<td>${inp('text', t.remote, 'user@host')}</td>` +
      `<td><input type="text" list="ssh-keys-list" class="ssl-input" value="${escHtml(t.key)}" placeholder=".ssh/key"></td>` +
      `<td>${inp('text', t.forward, 'host:3306')}</td>` +
      `<td style="text-align:center"><input type="checkbox" ${t.prod ? 'checked' : ''}></td>` +
      `<td><button class="btn btn-sm btn-danger btn-ssl-action del" title="Eliminar">✕</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Fila para agregar
  const addRow = document.createElement('div');
  addRow.className = 'ssl-add-row';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-sm btn-primary btn-ssl-action add';
  addBtn.textContent = '＋ Agregar túnel';
  addBtn.addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${inp('number', '', '3311', 'port-inp')}</td>` +
      `<td>${inp('text', '', 'Nombre')}</td>` +
      `<td>${inp('text', '', 'user@host')}</td>` +
      `<td><input type="text" list="ssh-keys-list" class="ssl-input" value="" placeholder=".ssh/key"></td>` +
      `<td>${inp('text', '', 'host:3306')}</td>` +
      `<td style="text-align:center"><input type="checkbox"></td>` +
      `<td><button class="btn btn-sm btn-danger btn-ssl-action del" title="Eliminar">✕</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  });
  addRow.appendChild(addBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'btn btn-sm btn-success btn-ssl-action add';
  saveBtn.style.marginLeft = '0.5rem';
  saveBtn.textContent = '✓ Guardar';
  saveBtn.addEventListener('click', () => saveTunnelConfig(tbody));
  addRow.appendChild(saveBtn);

  wrap.appendChild(table);
  wrap.appendChild(addRow);
  mc.appendChild(wrap);
}

async function saveTunnelConfig(tbody) {
  const rows = [...tbody.querySelectorAll('tr')];
  const tunnels = rows.map(tr => {
    const [portEl, nameEl, remoteEl, keyEl, forwardEl, prodEl] = tr.querySelectorAll('input');
    return {
      port:    parseInt(portEl.value, 10),
      name:    nameEl.value.trim(),
      desc:    '',
      remote:  remoteEl.value.trim(),
      key:     keyEl.value.trim(),
      forward: forwardEl.value.trim(),
      prod:    prodEl.checked,
    };
  });

  try {
    const res  = await fetch(`${API_BASE}/api/tunnels/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tunnels }),
    });
    const body = await res.json();
    if (!res.ok) { showTunnelBanner(`Error: ${body.error}`, true); return; }
    showTunnelBanner('Configuración guardada', false);
    toggleManageTunnels(false);
    await loadTunnels();
  } catch {
    showTunnelBanner('Error al guardar', true);
  }
}
```

Reemplazar el bloque completo por:

```js
let tunnelsManageSaved = [];

function renderManageTunnels(tunnels) {
  // Filtrar ad-hoc — solo se gestionan los presets guardados
  tunnelsManageSaved = tunnels.filter(t => !t.adhoc);
  const mc = document.getElementById('tunnels-manage-container');
  mc.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-solid btn-manage-add';
  addBtn.textContent = '＋ Agregar túnel';
  addBtn.addEventListener('click', () => showTunnelModal(null));
  mc.appendChild(addBtn);

  const table = document.createElement('table');
  table.className = 'manage-table data-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>Puerto</th><th>Nombre</th><th>Remote</th><th>Forward</th><th>Prod</th><th></th>` +
    `</tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const t of tunnelsManageSaved) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><code>${t.port}</code></td>` +
      `<td>${escHtml(t.name)}</td>` +
      `<td>${escHtml(t.remote)}</td>` +
      `<td>${escHtml(t.forward)}</td>` +
      `<td>${t.prod ? 'Sí' : '—'}</td>` +
      `<td class="manage-actions"></td>`;
    const tdActs = tr.querySelector('.manage-actions');

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-sm btn-ghost btn-manage-edit';
    btnEdit.textContent = 'Editar';
    btnEdit.addEventListener('click', () => showTunnelModal(t));

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm btn-danger btn-manage-del';
    btnDel.textContent = 'Eliminar';
    btnDel.addEventListener('click', async () => {
      const ok = await confirmDialogRef(`¿Eliminar el túnel "${t.name}" (puerto ${t.port})?`, 'Esta acción no se puede deshacer.', true);
      if (!ok) return;
      const updated = tunnelsManageSaved.filter(x => x.port !== t.port);
      await saveTunnelConfig(updated);
    });

    tdActs.appendChild(btnEdit);
    tdActs.appendChild(btnDel);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  mc.appendChild(table);
}

function showTunnelModal(tunnel) {
  openEditModal((box, close) => {
    const isEdit = tunnel !== null;
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(tunnel.name)}` : 'Nuevo túnel'}</div>` +
        `<div class="manage-form-grid">` +
          `<div class="form-field"><label class="form-label" for="tun-f-port">Puerto</label><input class="form-input" type="number" id="tun-f-port" value="${isEdit ? tunnel.port : ''}" placeholder="3311"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-name">Nombre</label><input class="form-input" id="tun-f-name" value="${escHtml(tunnel?.name ?? '')}" placeholder="Nombre"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-remote">Remote</label><input class="form-input" id="tun-f-remote" value="${escHtml(tunnel?.remote ?? '')}" placeholder="user@host"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-key">Clave SSH</label><input class="form-input" list="ssh-keys-list" id="tun-f-key" value="${escHtml(tunnel?.key ?? '')}" placeholder=".ssh/key"></div>` +
          `<div class="form-field"><label class="form-label" for="tun-f-forward">Forward</label><input class="form-input" id="tun-f-forward" value="${escHtml(tunnel?.forward ?? '')}" placeholder="host:3306"></div>` +
        `</div>` +
        `<label class="form-toggle-row">` +
          `<input type="checkbox" id="tun-f-prod"${tunnel?.prod ? ' checked' : ''}>` +
          `<span class="form-toggle-label">Producción</span>` +
        `</label>` +
        `<div class="manage-banner hidden" id="tun-f-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-tun-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-tun-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-tun-form-cancel').addEventListener('click', close);

    box.querySelector('#btn-tun-form-save').addEventListener('click', async () => {
      const port    = parseInt(document.getElementById('tun-f-port').value, 10);
      const name    = document.getElementById('tun-f-name').value.trim();
      const remote  = document.getElementById('tun-f-remote').value.trim();
      const key     = document.getElementById('tun-f-key').value.trim();
      const forward = document.getElementById('tun-f-forward').value.trim();
      const prod    = document.getElementById('tun-f-prod').checked;

      if (!port || !name || !remote || !forward) {
        showManageBanner('tun-f-error', 'Puerto, nombre, remote y forward son requeridos', true);
        return;
      }

      const nuevo = { port, name, desc: '', remote, key, forward, prod };
      const updated = isEdit
        ? tunnelsManageSaved.map(t => t.port === tunnel.port ? nuevo : t)
        : [...tunnelsManageSaved, nuevo];

      const ok = await saveTunnelConfig(updated);
      if (ok) close();
    });
  }, { size: 'standard' });
}

async function saveTunnelConfig(tunnels) {
  try {
    const res  = await fetch(`${API_BASE}/api/tunnels/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tunnels }),
    });
    const body = await res.json();
    if (!res.ok) { showTunnelBanner(`Error: ${body.error}`, true); return false; }
    showTunnelBanner('Configuración guardada', false);
    await loadTunnels();
    const mc = document.getElementById('tunnels-manage-container');
    if (mc && !mc.classList.contains('hidden')) {
      const data = await get('/api/tunnels/config').catch(() => []);
      renderManageTunnels(data);
    }
    return true;
  } catch {
    showTunnelBanner('Error al guardar', true);
    return false;
  }
}
```

- [ ] **Step 3: El ad-hoc pasa a la misma cáscara de modal**

En `frontend/modules/tabs/tunnels.js`, el bloque actual (línea 394-416):

```js
function renderAdhocForm() {
  const ac = document.getElementById('tunnels-adhoc-container');
  ac.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'tunnel-adhoc-form';
  form.innerHTML =
    `<div class="tunnel-adhoc-title">Túnel ad-hoc</div>` +
    `<div class="tunnel-adhoc-grid">` +
      `<label>Puerto local<input type="number" id="adhoc-port" class="ssl-input" placeholder="3311" min="1024" max="65535"></label>` +
      `<label>Nombre (opcional)<input type="text" id="adhoc-name" class="ssl-input" placeholder="Mi túnel"></label>` +
      `<label>Remote (user@host)<input type="text" id="adhoc-remote" class="ssl-input" placeholder="ubuntu@10.145.2.26"></label>` +
      `<label>Clave SSH<input type="text" id="adhoc-key" list="ssh-keys-list" class="ssl-input" placeholder=".ssh/srv-appstest.key"></label>` +
      `<label>Forward (host:port)<input type="text" id="adhoc-forward" class="ssl-input" placeholder="127.0.0.1:3306"></label>` +
    `</div>` +
    `<div class="tunnel-adhoc-actions">` +
      `<button class="btn btn-primary btn-ssl-action add" id="btn-adhoc-submit">Abrir túnel</button>` +
      `<span class="adhoc-status" id="adhoc-status"></span>` +
    `</div>`;

  form.querySelector('#btn-adhoc-submit').addEventListener('click', submitAdhoc);
  ac.appendChild(form);
}
```

Reemplazar por (mismos campos y comportamiento, dentro de `openEditModal` compacto en vez de un
`<div>` inline en `#tunnels-adhoc-container`):

```js
function showAdhocModal() {
  openEditModal((box) => {
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">Túnel ad-hoc</div>` +
        `<div class="manage-form-grid">` +
          `<div class="form-field"><label class="form-label" for="adhoc-port">Puerto local</label><input type="number" id="adhoc-port" class="form-input" placeholder="3311" min="1024" max="65535"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-name">Nombre (opcional)</label><input type="text" id="adhoc-name" class="form-input" placeholder="Mi túnel"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-remote">Remote (user@host)</label><input type="text" id="adhoc-remote" class="form-input" placeholder="ubuntu@10.145.2.26"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-key">Clave SSH</label><input type="text" id="adhoc-key" list="ssh-keys-list" class="form-input" placeholder=".ssh/srv-appstest.key"></div>` +
          `<div class="form-field"><label class="form-label" for="adhoc-forward">Forward (host:port)</label><input type="text" id="adhoc-forward" class="form-input" placeholder="127.0.0.1:3306"></div>` +
        `</div>` +
        `<div class="manage-form-actions">` +
          `<span class="adhoc-status" id="adhoc-status"></span>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-adhoc-submit">Abrir túnel</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-adhoc-submit').addEventListener('click', submitAdhoc);
  }, { size: 'standard' });
}
```

- [ ] **Step 4: Ajustar `submitAdhoc` y `toggleAdhocForm`**

En `frontend/modules/tabs/tunnels.js`, `submitAdhoc` (línea 418-448) queda **sin cambios de
lógica** (sigue leyendo los mismos ids `adhoc-port`/`adhoc-name`/etc. y escribiendo en
`adhoc-status`) — solo el bloque final que cerraba el formulario inline cambia. El bloque actual:

```js
    else {
      status.textContent = '✓ Abierto';
      toggleAdhocForm(false);
      await loadTunnels();
    }
```

Reemplazar por:

```js
    else {
      status.textContent = '✓ Abierto';
      await loadTunnels();
      document.querySelector('.modal-overlay.infra-edit-modal')?.remove();
    }
```

Y el bloque actual de `toggleAdhocForm` (línea 450-468):

```js
function toggleAdhocForm(force) {
  tunnelAdhocMode = force !== undefined ? force : !tunnelAdhocMode;
  const ac  = document.getElementById('tunnels-adhoc-container');
  const btn = document.getElementById('btn-tunnel-adhoc');

  if (tunnelAdhocMode) {
    // Cerrar manage si estaba abierto
    tunnelManageMode = false;
    document.getElementById('tunnels-manage-container').classList.add('hidden');
    document.getElementById('btn-tunnel-manage').textContent = '⚙ Gestionar';

    renderAdhocForm();
    ac.classList.remove('hidden');
    btn.textContent = '✕ Cerrar';
  } else {
    ac.classList.add('hidden');
    btn.textContent = '＋ Ad-hoc';
  }
}
```

Reemplazar por (el botón de toolbar ya no alterna un estado "abierto/cerrado" de una sección
inline, simplemente dispara el modal cada vez):

```js
function toggleAdhocForm() {
  showAdhocModal();
}
```

- [ ] **Step 5: Actualizar `initTunnels`**

En `frontend/modules/tabs/tunnels.js`, dentro de `initTunnels` (línea ~471-475), la línea:

```js
  document.getElementById('btn-tunnel-adhoc').addEventListener('click',  () => toggleAdhocForm());
```

Queda igual (sigue llamando `toggleAdhocForm()`, que ahora abre el modal directo en vez de
alternar visibilidad). No requiere cambios adicionales.

- [ ] **Step 6: Eliminar `#tunnels-adhoc-container` del HTML si quedó sin uso**

En `frontend/index.html`, buscar `<div id="tunnels-adhoc-container" class="hidden"></div>`
(dentro del tab Túneles) y eliminarlo — ya no se usa, `showAdhocModal` monta su propio modal en
`document.body`.

- [ ] **Step 7: Verificar en vivo**

Tab Túneles → "⚙ Gestionar": tabla de solo lectura con Editar/Eliminar por fila. "＋ Agregar
túnel" y "Editar" abren modal estándar (920px, campos completos incluyendo el datalist de claves
SSH). Guardar un túnel: confirmar que los demás túneles conservan sus valores intactos (verificar
especialmente el que tiene `prod: true`, no debe perder ese flag al editar otro). "＋ Ad-hoc" abre
modal en vez de sección inline; "Abrir túnel" cierra el modal y el túnel aparece activo en la
vista normal.

- [ ] **Step 8: Commit**

```bash
git add frontend/modules/tabs/tunnels.js frontend/index.html
git commit -m "refactor(tunnels): tabla-planilla pasa a modal por-túnel, ad-hoc también modal"
```

---

### Task 7: Proyectos — de acordeones siempre-editables a modal por proyecto/ambiente

**Files:**
- Modify: `frontend/modules/tabs/projects.js:1-2,509-746`
- Modify: `frontend/index.html` (botón `btn-project-add`, línea ~187)

**Interfaces:**
- Consumes: `openEditModal(renderInto, { size })` de Task 1.

**Contexto:** El cambio de mayor superficie del plan. Los endpoints por-registro
(`projectWrite` — `PATCH /api/projects/:id`, `POST/PATCH/DELETE
/api/projects/:id/environments/:env`) no cambian. Lo que cambia es que
`renderProjectEditor`/`environmentEditor`/`renderNewProjectEditor` dejan de renderizar
formularios siempre abiertos dentro de `<details>` anidados — pasan a mostrar resúmenes de solo
lectura con un botón ✎ (o "＋ Ambiente"/"＋ Proyecto") que abre el modal correspondiente.
`projectNewMode` deja de existir como estado de render — el modal de alta se abre directo desde
el botón de toolbar, sin pasar por "modo Gestionar".

- [ ] **Step 1: Importar `openEditModal`**

En `frontend/modules/tabs/projects.js`, la línea 2 actual:

```js
import { buildAccordion, escHtml } from '../core/dom.js';
```

Cambiar a:

```js
import { buildAccordion, escHtml, openEditModal } from '../core/dom.js';
```

- [ ] **Step 2: `renderNewProjectEditor` se reemplaza por `showNewProjectModal`**

En `frontend/modules/tabs/projects.js`, la función actual (línea 509-534):

```js
function renderNewProjectEditor() {
  const editor = document.createElement('section');
  editor.className = 'project-editor project-editor-new';
  editor.innerHTML = '<div class="project-editor-title">NUEVO PROYECTO</div>';
  editor.appendChild(projectMetadataGrid({ environments: [] }, true));

  const actions = document.createElement('div');
  actions.className = 'project-editor-actions';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost btn-project-secondary';
  cancel.textContent = 'Cancelar';
  cancel.addEventListener('click', () => { projectNewMode = false; renderProjectManagement(); });
  const save = document.createElement('button');
  save.className = 'btn btn-primary btn-project-primary';
  save.textContent = 'Crear proyecto';
  save.addEventListener('click', async () => {
    const values = readFields(editor, PROJECT_FIELDS);
    if (!requiredFieldsPresent(values, ['name', 'type', 'category', 'status', 'client'])) return;
    const project = { ...values, environments: [] };
    if (!project.notes) delete project.notes;
    await projectWrite('POST', '/api/projects', { project }, `Proyecto ${project.id} creado.`);
  });
  actions.append(cancel, save);
  editor.appendChild(actions);
  return editor;
}
```

Reemplazar por:

```js
function showNewProjectModal() {
  openEditModal((box, close) => {
    box.innerHTML = '<div class="project-editor project-editor-new"><div class="project-editor-title">NUEVO PROYECTO</div></div>';
    const editor = box.querySelector('.project-editor-new');
    editor.appendChild(projectMetadataGrid({ environments: [] }, true));

    const actions = document.createElement('div');
    actions.className = 'project-editor-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost btn-project-secondary';
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', close);
    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-project-primary';
    save.textContent = 'Crear proyecto';
    save.addEventListener('click', async () => {
      const values = readFields(editor, PROJECT_FIELDS);
      if (!requiredFieldsPresent(values, ['name', 'type', 'category', 'status', 'client'])) return;
      const project = { ...values, environments: [] };
      if (!project.notes) delete project.notes;
      const result = await projectWrite('POST', '/api/projects', { project }, `Proyecto ${project.id} creado.`);
      if (result) close();
    });
    actions.append(cancel, save);
    editor.appendChild(actions);
  }, { size: 'standard' });
}
```

- [ ] **Step 3: `environmentEditor` pasa a fila-resumen + modal**

En `frontend/modules/tabs/projects.js`, la función actual (línea 536-621) construye un
`<details class="environment-editor">` con el formulario siempre visible. Reemplazar la función
completa por dos funciones — una que arma la fila resumen (para la lista) y otra que abre el
modal con el formulario real:

```js
function environmentSummaryRow(project, environment) {
  const row = document.createElement('div');
  row.className = 'environment-summary-row';
  row.innerHTML =
    `<span class="environment-name">${escHtml(environment.name)}</span>` +
    `<span class="environment-server">${escHtml(environment.server)}</span>`;
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-ghost btn-project-secondary';
  editBtn.textContent = '✎ Editar';
  editBtn.addEventListener('click', () => showEnvironmentModal(project, environment));
  row.appendChild(editBtn);
  return row;
}

function showEnvironmentModal(project, environment = null) {
  openEditModal((box, close) => {
    const isNew = !environment;
    const original = environment || {};

    box.innerHTML = `<div class="project-editor-title">${isNew ? 'NUEVO AMBIENTE' : `${escHtml(project.id)} / ${escHtml(environment.name)}`}</div>`;

    const grid = document.createElement('div');
    grid.className = 'environment-form-grid';
    for (const field of ENVIRONMENT_FIELDS) {
      grid.appendChild(managementField(field, field, original[field], { required: ['name', 'server'].includes(field), textarea: field === 'notes' }));
    }
    box.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'environment-actions';
    if (isNew) {
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost btn-project-secondary';
      cancel.textContent = 'Cancelar';
      cancel.addEventListener('click', close);
      actions.appendChild(cancel);
    } else {
      const remove = document.createElement('button');
      remove.className = 'btn btn-danger btn-project-danger';
      remove.textContent = 'Eliminar ambiente';
      remove.addEventListener('click', async () => {
        const confirmed = await confirmDialogRef(
          'Eliminar ambiente',
          `Se eliminará ${project.id}/${environment.name}.`,
          true,
        );
        if (!confirmed) return;
        const result = await projectWrite(
          'DELETE',
          `/api/projects/${encodeURIComponent(project.id)}/environments/${encodeURIComponent(environment.name)}`,
          {},
          `Ambiente ${environment.name} eliminado.`,
        );
        if (result) close();
      });
      actions.appendChild(remove);
    }

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-project-primary';
    save.textContent = isNew ? 'Agregar ambiente' : 'Guardar ambiente';
    save.addEventListener('click', async () => {
      const values = readFields(box, ENVIRONMENT_FIELDS);
      if (!requiredFieldsPresent(values, ['name', 'server'])) return;
      if (!!values.host !== !!values.remotePath) {
        showProjectsBanner('host y remotePath deben completarse juntos.', true);
        return;
      }

      if (isNew) {
        const clean = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
        const result = await projectWrite(
          'POST',
          `/api/projects/${encodeURIComponent(project.id)}/environments`,
          { environment: clean },
          `Ambiente ${clean.name} agregado.`,
        );
        if (result) close();
        return;
      }

      const changes = {};
      for (const field of ENVIRONMENT_FIELDS) {
        if (values[field] !== String(original[field] ?? '')) changes[field] = values[field];
      }
      const result = await projectWrite(
        'PATCH',
        `/api/projects/${encodeURIComponent(project.id)}/environments/${encodeURIComponent(environment.name)}`,
        { changes },
        `Ambiente ${environment.name} actualizado.`,
      );
      if (result) close();
    });
    actions.appendChild(save);
    box.appendChild(actions);
  }, { size: 'standard' });
}
```

- [ ] **Step 4: `renderProjectEditor` pasa a resumen + ✎ en vez de metadata siempre visible**

En `frontend/modules/tabs/projects.js`, la función actual (línea 623-731). Los bloques de
metadata (líneas 636-679: `content.appendChild(projectMetadataGrid(project))` + botones
Eliminar/Guardar metadata) se reemplazan por un solo botón ✎ que abre el modal de metadata. El
bloque de ambientes (líneas 707-726) pasa a usar `environmentSummaryRow` en vez de
`environmentEditor`, y el botón "＋ Ambiente" abre `showEnvironmentModal(project)` directo en vez
de insertar un `<details>` nuevo en la lista.

Reemplazar la función completa por:

```js
function showProjectMetadataModal(project) {
  openEditModal((box) => {
    box.appendChild(projectMetadataGrid(project));

    const actions = document.createElement('div');
    actions.className = 'project-editor-actions';
    const remove = document.createElement('button');
    remove.className = 'btn btn-danger btn-project-danger';
    remove.textContent = 'Eliminar proyecto';
    remove.addEventListener('click', async () => {
      const confirmed = await confirmDialogRef(
        'Eliminar proyecto',
        `Escribí ${project.id} para confirmar la eliminación.`,
        true,
        project.id,
      );
      if (!confirmed) return;
      await projectWrite(
        'DELETE',
        `/api/projects/${encodeURIComponent(project.id)}`,
        {},
        `Proyecto ${project.id} eliminado.`,
      );
      document.querySelector('.modal-overlay.infra-edit-modal')?.remove();
    });

    const save = document.createElement('button');
    save.className = 'btn btn-primary btn-project-primary';
    save.textContent = 'Guardar metadata';
    save.addEventListener('click', async () => {
      const values = readFields(box, PROJECT_FIELDS);
      if (!requiredFieldsPresent(values, ['name', 'type', 'category', 'status', 'client'])) return;
      const changes = {};
      for (const field of PROJECT_FIELDS) {
        if (values[field] !== String(project[field] ?? '')) changes[field] = values[field];
      }
      const result = await projectWrite(
        'PATCH',
        `/api/projects/${encodeURIComponent(project.id)}`,
        { changes },
        `Proyecto ${project.id} actualizado.`,
      );
      if (result) document.querySelector('.modal-overlay.infra-edit-modal')?.remove();
    });
    actions.append(remove, save);
    box.appendChild(actions);
  }, { size: 'standard' });
}

function renderProjectEditor(project) {
  const details = document.createElement('details');
  details.className = 'project-editor';
  details.dataset.projectId = project.id;

  const environments = project.environments?.length ?? 0;
  const summary = document.createElement('summary');
  summary.innerHTML =
    `<span class="project-editor-id">${escHtml(project.id)}</span>` +
    `<span class="project-editor-name">${escHtml(project.name)}</span>` +
    `<span class="project-editor-count">${environments} env</span>`;
  details.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'project-editor-content';

  const metadataActions = document.createElement('div');
  metadataActions.className = 'project-editor-actions';
  const editMeta = document.createElement('button');
  editMeta.className = 'btn btn-ghost btn-project-secondary';
  editMeta.textContent = '✎ Editar metadata';
  editMeta.addEventListener('click', () => showProjectMetadataModal(project));
  metadataActions.appendChild(editMeta);
  content.appendChild(metadataActions);

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
        btn.addEventListener('click', () => openSsh(project.id, acc.host, acc.user, btn));
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
    const environmentsHeader = document.createElement('div');
    environmentsHeader.className = 'project-environments-header';
    environmentsHeader.innerHTML = '<span class="project-subtitle">AMBIENTES</span>';
    const addEnvironment = document.createElement('button');
    addEnvironment.className = 'btn btn-ghost btn-project-secondary';
    addEnvironment.textContent = '＋ Ambiente';
    addEnvironment.addEventListener('click', () => showEnvironmentModal(project));
    environmentsHeader.appendChild(addEnvironment);

    const environmentList = document.createElement('div');
    environmentList.className = 'environment-editor-list';
    for (const environment of (project.environments || [])) {
      environmentList.appendChild(environmentSummaryRow(project, environment));
    }
    content.append(environmentsHeader, environmentList);
  }

  details.appendChild(content);
  return details;
}
```

- [ ] **Step 5: `renderProjectManagement` deja de manejar `projectNewMode`**

En `frontend/modules/tabs/projects.js`, el bloque actual (línea 733-739):

```js
function renderProjectManagement() {
  const container = document.getElementById('projects-manage-container');
  container.innerHTML = '';
  if (!registryData) return;
  if (projectNewMode) container.appendChild(renderNewProjectEditor());
  for (const project of registryData.projects) container.appendChild(renderProjectEditor(project));
}
```

Reemplazar por:

```js
function renderProjectManagement() {
  const container = document.getElementById('projects-manage-container');
  container.innerHTML = '';
  if (!registryData) return;
  for (const project of registryData.projects) container.appendChild(renderProjectEditor(project));
}
```

- [ ] **Step 6: Eliminar el estado `projectNewMode` y actualizar `initProjects`**

En `frontend/modules/tabs/projects.js`, la declaración actual (línea 33):

```js
let projectNewMode = false;
```

Eliminarla — ya no se usa (Step 2-5 la retiraron de todos los sitios donde se leía/escribía).

En `initProjects` (línea 749-761), el bloque actual:

```js
export function initProjects({ onUpdate, confirmDialog } = {}) {
  refreshApp = onUpdate ?? null;
  confirmDialogRef = confirmDialog ?? null;
  document.getElementById('btn-project-manage').addEventListener('click', () => {
    projectNewMode = false;
    toggleProjectManagement();
  });
  document.getElementById('btn-project-add').addEventListener('click', () => {
    projectNewMode = true;
    toggleProjectManagement(true);
    renderProjectManagement();
    document.querySelector('.project-editor-new')?.scrollIntoView({ behavior: 'smooth' });
  });
```

Reemplazar por:

```js
export function initProjects({ onUpdate, confirmDialog } = {}) {
  refreshApp = onUpdate ?? null;
  confirmDialogRef = confirmDialog ?? null;
  document.getElementById('btn-project-manage').addEventListener('click', () => {
    toggleProjectManagement();
  });
  document.getElementById('btn-project-add').addEventListener('click', () => {
    showNewProjectModal();
  });
```

También revisar `projectWrite` (línea 66-93): en el bloque de éxito actual:

```js
    projectNewMode = false;
    await loadProjects();
    showProjectsBanner(successMessage);
    return body;
```

Reemplazar por (se quita la referencia a la variable eliminada):

```js
    await loadProjects();
    showProjectsBanner(successMessage);
    return body;
```

- [ ] **Step 7: Verificar en vivo**

Tab Proyectos → "＋ Proyecto" (toolbar, sin necesidad de entrar a Gestionar primero): abre modal
estándar directo. Crear un proyecto de prueba, confirmar que aparece en la lista. "⚙ Gestionar":
cada proyecto se ve como resumen (id/nombre/cantidad de ambientes) con botón "✎ Editar metadata"
y lista de ambientes en resumen con "✎ Editar" cada uno + "＋ Ambiente". Editar metadata de un
proyecto real (sin tocar datos, solo abrir y cancelar) para confirmar que no rompe nada. Abrir un
ambiente existente, confirmar que carga los valores actuales. Eliminar el proyecto de prueba
creado, confirmar que desaparece de la lista y que el modal se cierra solo.

- [ ] **Step 8: Commit**

```bash
git add frontend/modules/tabs/projects.js frontend/index.html
git commit -m "refactor(projects): metadata y ambientes pasan a modal en vez de acordeones siempre-editables"
```

---

### Task 8: Verificación final cruzada

**Files:**
- Ninguno de código — solo verificación.

- [ ] **Step 1: Recorrido Playwright completo**

Con el backend corriendo, recorrer en orden: Inventario (Gestionar → Editar/Agregar), MCPs
(Gestionar → Editar/Agregar), Links (link + Tipos), SSL (card ✎ directo + Gestionar → Editar/
Agregar/Archivar), Túneles (Gestionar → Editar/Agregar + Ad-hoc), Proyectos (＋ Proyecto,
Editar metadata, Ambientes). Confirmar en cada uno: el modal abre con la cáscara compartida
(top-anchored, ancho correcto según el tamaño del formulario), Escape lo cierra, clic afuera NO
lo cierra, Guardar persiste y refresca la vista de atrás.

- [ ] **Step 2: Suite completa**

Run (desde `D:\Workspace-Repos\workspace-ui`):
```
node --test backend/test/*.test.js
node --test frontend/test/*.test.js
```

Expected: mismos resultados que antes de este plan (47/47 backend, 17/17 frontend) — ningún test
debería verse afectado, son cambios de frontend puro sin tocar las funciones puras que cubren los
tests existentes.

- [ ] **Step 3: Grep de limpieza — confirmar que no quedan contenedores/funciones huérfanas**

Run: `grep -rn "infra-form-container\|mcp-form-container\|tipo-form-container\|links-form-container\|tunnels-adhoc-container\|openSslManageAndFocus\|projectNewMode\|renderNewProjectEditor\b" frontend/`

Expected: sin resultados (todo lo listado se eliminó en las tasks 2-7). Si aparece algo,
resolverlo antes de cerrar — es señal de un paso saltado.

- [ ] **Step 4: Commit final si Step 1 o Step 3 encontraron algo**

Si el recorrido o el grep detectaron algo pendiente, resolverlo acá con su propio commit antes
de cerrar el plan.
