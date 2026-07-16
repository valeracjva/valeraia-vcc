# Modales unificados — edición/creación deja de estar inline en las vistas

**Fecha:** 2026-07-16
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

VCC (`D:\Workspace-Repos\workspace-ui`) tiene 5 patrones distintos de edición/creación entre
módulos, relevados en esta sesión:

| Módulo | Patrón actual |
|---|---|
| Inventario | Dual: ✎ desde la card abre modal real (`showInventoryModal`); "Editar" desde el panel Gestionar usa un formulario inline embebido en la misma pantalla — dos implementaciones para lo mismo. |
| MCPs | Mismo dual que Inventario (`showMcpModal` + inline en Gestionar). |
| Links | El link en sí ya abre modal, pero con la cáscara genérica de 420px, no la de Inventario. El sub-formulario de "Tipos" (crear/editar tipo) es inline dentro del panel de gestión de tipos. |
| SSL | Edición inline fila-por-fila en la tabla, sin modal ni formulario separado — usa `window.prompt()`/`alert()` nativos en vez de los banners estándar de VCC. |
| Túneles | Tabla tipo planilla: todas las filas editables a la vez, un solo botón "Guardar" persiste la tabla completa (`PUT /config` con el array entero). |
| Proyectos | El más profundo: cada proyecto y cada ambiente tienen su formulario siempre visible y editable dentro de acordeones anidados — no es "click para editar", ya está todo abierto. |

Carlos quiere que ningún módulo tenga edición/creación inline en la vista — todo debe abrir un
modal, respetando el estilo visual y de comportamiento que ya usa Inventario (`showInventoryModal`
+ `.infra-edit-modal`/`.infra-edit-modal-box`).

## Alcance

Unificar los 5 patrones a una única cáscara de modal compartida, y migrar cada módulo a usarla.

Incluye:
- Helper compartido de modal en `frontend/modules/core/dom.js`.
- Migración de los 5 módulos (Inventario, MCPs, Links, SSL, Túneles) + Proyectos.
- Reemplazo de `window.prompt()`/`alert()` en SSL por los patrones estándar de VCC (banner,
  campo de texto en el propio modal).

Fuera de alcance (YAGNI):
- Cambios de backend — SSL y Túneles no tienen endpoints por-registro (`PUT /config` reemplaza
  el array entero) y **no se les agrega uno**. El modal arma el array completo en memoria con el
  registro tocado y lo manda al mismo endpoint bulk que ya existe. Esto es intencional: no hay
  necesidad real de un endpoint nuevo solo para cambiar la forma en que el frontend arma el
  payload.
- Editor JSON raw de MCPs (`#mcp-json-editor-body`) — es una herramienta deliberadamente cruda
  para power-users, no un formulario de alta/edición, no aplica el patrón de modal.
- Túnel ad-hoc como concepto — sigue siendo una sesión efímera con su propio endpoint
  (`POST /adhoc`), solo cambia a **presentarse** en la misma cáscara de modal por consistencia
  visual, no se fusiona con los túneles guardados.
- Rediseñar el modelo de datos de Proyectos/Ambientes — los endpoints por-registro (PATCH
  proyecto, POST/PATCH/DELETE ambiente) ya existen y no cambian, solo la UI que los dispara.

## Diseño

### Helper compartido — `openEditModal()`

Nueva función en `frontend/modules/core/dom.js`:

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
  // botones Cancelar/Guardar (formularios largos, un clic accidental no debe perder lo tipeado).
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKeydown); overlay.remove(); };
  document.addEventListener('keydown', onKeydown);
  renderInto(box, close);
  return close;
}
```

Reemplaza las implementaciones casi idénticas de `showInventoryModal` (inventory.js) y
`showMcpModal` (mcp.js) — ambas quedan como una llamada a `openEditModal`.

**Dos anchos, misma cáscara:** `.infra-edit-modal-box` sigue siendo `width: min(920px, 96vw)`
(estándar — formularios con muchos campos: Inventario, MCPs, Proyectos, Ambientes, Túneles).
Se agrega `.infra-edit-modal-compact` como modificador que reduce a `width: min(480px, 92vw)`
(Links, Tipos de link, dominio SSL) — mismo header/grid/acciones `.manage-form`, mismo
comportamiento de cierre, solo cambia el ancho para que formularios de 2-4 campos no queden con
espacio vacío de sobra.

### Módulo por módulo

**Inventario** (`frontend/modules/tabs/inventory.js`): el botón "Editar"/"Agregar" del panel
Gestionar deja de llamar `showInventoryForm(item, fc, onClose)` con `fc` = contenedor inline
(`#infra-form-container`) — pasa a llamar `openEditModal((box, close) => showInventoryForm(item,
box, close))`, igual que ya hace el ✎ de la card. Se elimina `#infra-form-container` del HTML de
`renderInventoryManage()` (ya no hace falta, el modal se monta en `document.body`).

**MCPs** (`frontend/modules/tabs/mcp.js`): mismo tratamiento — "Editar"/"Agregar MCP" del panel
Gestionar pasa a `openEditModal`, se elimina `#mcp-form-container` inline.

**Links** (`frontend/modules/tabs/links.js`):
- `showLinksForm` deja de construir su propio `<div class="modal-overlay">` a mano — pasa a
  `openEditModal(..., { size: 'compact' })`, reusando `showLinksForm` como la función que rellena
  el `box`.
- `showTipoForm` (hoy inline en `#tipo-form-container` dentro del panel de gestión de tipos) pasa
  a `openEditModal(..., { size: 'compact' })`.

**SSL** (`frontend/modules/tabs/ssl.js`): la tabla deja de tener `editMode()`/`viewMode()` por
fila con inputs inline — cada fila solo tiene botones (Editar/Archivar/Eliminar), "Editar" abre
`openEditModal(..., { size: 'compact' })` con un formulario de 4 campos (dominio, etiqueta,
empresa, admin DNS). "＋ Agregar dominio" (hoy una fila fija arriba de la tabla) pasa al mismo
modal vacío. El botón Guardar del modal arma `domains.map(...)` con el registro tocado y llama
`saveConfig()` (sin cambios, sigue siendo el mismo `PUT /config`). El `window.prompt()` para el motivo de archivado se reemplaza por un modal compacto propio
(`openEditModal(..., { size: 'compact' })` con un solo campo textarea "Motivo del archivado" +
Cancelar/Confirmar) — **no** se reusa `confirmDialog()` de `core/shell.js` para esto: esa función
solo devuelve `true`/`false` (su campo de texto es un gate de confirmación tipo "escribí el
nombre para confirmar", no devuelve el valor tipeado), no sirve para capturar un motivo libre.
Los `alert()` de error se reemplazan por `.manage-banner` (patrón ya usado en el resto de VCC).

**Túneles** (`frontend/modules/tabs/tunnels.js`): `renderManageTunnels()` deja de renderizar una
tabla con inputs en cada fila — pasa a una tabla de solo-lectura (mismo patrón que la tabla de
Gestión de MCPs/Tipos: NOMBRE/PUERTO/REMOTE/... + botones Editar/Eliminar por fila). "Editar" y
"＋ Agregar túnel" abren `openEditModal(..., { size: 'standard' })` con el formulario de 6 campos
(puerto, nombre, remote, clave, forward, prod). Guardar arma el array completo (`tunnels.map(...)`
con el túnel tocado, o `[...tunnels, nuevo]` si es alta) y llama al mismo `PUT /config` existente
— **sin cambios de backend**. El túnel ad-hoc (`showAdhocForm` o equivalente) pasa a la misma
cáscara de modal en vez de su formulario inline propio, sin tocar `POST /adhoc`.

**Proyectos** (`frontend/modules/tabs/projects.js`, el cambio más grande):
- `renderProjectEditor(project)` deja de renderizar un `<details>` con el formulario de metadata
  siempre visible — pasa a mostrar solo resumen (id, nombre, cantidad de ambientes) + botón ✎ que
  abre `openEditModal(..., { size: 'standard' })` con `projectMetadataGrid(project)` dentro.
- `environmentEditor(project, environment)` deja de ser un `<details>` con formulario siempre
  editable — la lista de ambientes pasa a mostrar filas resumen (nombre, servidor) + botón ✎ por
  ambiente y un botón "＋ Ambiente" a nivel proyecto, ambos abren el mismo modal estándar con el
  `environment-form-grid` dentro.
- `renderNewProjectEditor()` (alta de proyecto nuevo) pasa de ser una sección siempre visible en
  el panel Gestionar a abrirse solo cuando se aprieta "＋ Proyecto", vía el mismo modal.
- Los endpoints (`PATCH /api/projects/:id`, `POST/PATCH/DELETE
  /api/projects/:id/environments/:env`) no cambian — solo el disparador pasa de "siempre
  visible" a "click en ✎ → modal".

## CSS

`frontend/style.css`: agregar `.infra-edit-modal-box.infra-edit-modal-compact { width: min(480px,
92vw); }` cerca de la regla existente `.modal-box.infra-edit-modal-box` (línea ~2394). Eliminar
las reglas de formulario inline que queden huérfanas tras la migración (ej. estilos específicos
de edición de fila en `.ssl-table` si ya no se usan, `.tunnel-adhoc-form`/`.tunnel-adhoc-grid` se
mantienen si el ad-hoc sigue usando esas clases dentro del modal).

## Riesgo y verificación

- **Inventario/MCPs/Links:** bajo riesgo — el modal ya existe y funciona, solo cambia qué
  disparador lo invoca. Verificación: Playwright, abrir editar desde Gestionar, confirmar que
  abre el modal ancho/compacto correcto y que Guardar sigue funcionando.
- **SSL/Túneles:** riesgo medio — cambia la interacción (de tabla-siempre-editable a modal
  por-registro) pero el guardado sigue siendo el mismo endpoint bulk existente, sin riesgo de
  pérdida de datos si se verifica que el array armado en el modal incluye a todos los registros
  no tocados intactos. Verificación: editar un túnel/dominio, confirmar que los demás no cambian;
  agregar uno nuevo, confirmar que aparece sin tocar los existentes.
- **Proyectos:** el de mayor riesgo — toca la pantalla de gestión más usada. Verificación:
  Playwright completo del flujo editar metadata, agregar ambiente, editar ambiente, eliminar
  ambiente, crear proyecto nuevo, confirmar que cada operación persiste correctamente y que el
  árbol de proyectos se re-renderiza con los datos actualizados tras cerrar el modal.
- Ningún módulo pierde funcionalidad (archivar en SSL, prod/adhoc en Túneles, eliminar en
  cualquiera) — solo cambia el contenedor visual del formulario.
- Reinicio de backend **no** debería hacer falta (cambios de frontend puro) salvo que se toque
  algún archivo del backend por error — si eso pasa, seguir el gotcha ya documentado (verificar
  túneles activos antes de reiniciar).
