# Módulo Links — Inventario de repos/artículos/skills/MCPs pendientes

**Fecha:** 2026-07-08
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

Carlos acumula pestañas de Chrome con repos, artículos, skills y MCPs pendientes de revisar. Necesita un lugar para guardar esos links con metadata mínima (tipo, estado, favorito, nota) y cerrar las pestañas sin perder lo pendiente, reabriendo cada link solo cuando lo necesite.

## Alcance

Nuevo módulo "Links" dentro de VCC (`D:\Workspace-Repos\workspace-ui`), siguiendo el mismo patrón arquitectónico que los módulos existentes (Inventario, SSL, Túneles, MCPs): backend Express con persistencia en JSON plano + tab de frontend con cards.

Incluye:
- CRUD de links vía API REST.
- Tab de UI con cards, filtros y alta manual.
- Bookmarklet para captura de 1 click desde Chrome.

Fuera de alcance (YAGNI):
- Búsqueda de texto libre.
- Extensión de Chrome real (ícono, popup, permisos).
- Sincronización multi-dispositivo.
- Historial de cambios de estado.
- Favicon remoto (usar ícono genérico por tipo, no fetch a servicios externos).

## Modelo de datos

Persistencia en `links-inventory.json` (raíz del backend, gitignored — mismo patrón que `servers-config.json`, `ssl-watch.json`).

```json
{
  "links": [
    {
      "id": "uuid",
      "url": "string",
      "titulo": "string",
      "tipo": "Repo | Articulo | Skill | MCP | Otro",
      "tags": ["string"],
      "estado": "Pendiente | Revisado | Implementar | Descartado",
      "favorito": false,
      "nota": "string opcional",
      "fechaAgregado": "ISO date",
      "fechaActualizado": "ISO date"
    }
  ]
}
```

Reglas de validación (server-side, en el router):
- `url`: requerido, debe ser una URL válida (`http://` o `https://`).
- `titulo`: requerido, no vacío.
- `tipo`: uno de los 5 valores fijos; default `Otro` si no se envía.
- `estado`: uno de los 4 valores fijos; default `Pendiente` si no se envía (así el bookmarklet no necesita mandarlo).
- `tags`: array de strings, default `[]`.
- `favorito`: boolean, default `false`.
- `nota`: string opcional, default `""`.
- `id`: generado server-side (uuid), nunca aceptado desde el cliente en creación.
- `fechaAgregado`: generado server-side al crear, inmutable.
- `fechaActualizado`: actualizado server-side en cada `PATCH`/`PUT`.

## Backend

**Archivo:** `backend/routes/links.js` — router Express, mismo esqueleto que `backend/routes/inventory.js` (funciones `clean()`/`validate()` inline, lectura/escritura directa del JSON, sin ORM).

**Endpoints:**
- `GET /api/links` — lista completa. Filtros opcionales por query string (`?tipo=`, `?estado=`, `?favorito=true`) resueltos en el backend para que el frontend pueda pedir ya filtrado si conviene, aunque el filtrado principal va a vivir en el cliente (dataset chico).
- `POST /api/links` — crea un link nuevo. Body mínimo: `{ url, titulo }`. Usado tanto por el form manual como por el bookmarklet.
- `PATCH /api/links/:id` — actualiza campos parciales (estado, favorito, tags, nota, tipo). Usado por edición desde la card.
- `DELETE /api/links/:id` — elimina un link.

**Registro:** import + `app.use('/api/links', linksRouter)` en `backend/server.js`, mismo bloque donde están los demás routers (líneas ~11-25 imports, ~50-64 `app.use`).

**Bookmarklet:** endpoint `GET /links/bookmarklet` (o ruta estática) que sirve una página HTML mínima con el link arrastrable a la barra de marcadores. El `javascript:` del bookmarklet:

```js
javascript:(function(){
  fetch('http://localhost:<PUERTO>/api/links', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ url: location.href, titulo: document.title })
  }).then(()=>alert('Guardado en VCC ✓')).catch(()=>alert('VCC no está corriendo'));
})();
```

`<PUERTO>` se resuelve al puerto real configurado del backend VCC al generar la página (no hardcodear un valor que pueda desincronizarse).

Requiere que el backend VCC esté corriendo localmente en el momento del click; si no responde, el bookmarklet muestra alert de error, sin reintentos ni cola offline (fuera de alcance).

## Frontend

**Archivo:** `frontend/modules/tabs/links.js`, con `initLinks()` cableado desde `app.js` igual que el resto de los tabs.

**Registro de tab:**
- Botón `<button class="tab-btn nav-item" data-tab="links" title="Links">` en el sidebar de `frontend/index.html`.
- Panel `<div class="tab-panel hidden" id="tab-links">` en el mismo archivo.

**Cards:** reusan la clase base `.vcc-card` (no se crean tokens CSS nuevos, según regla ya establecida en el proyecto). Cada card muestra:
- Ícono genérico según `tipo` (uno por cada uno de los 5 valores, vía CSS/emoji o sprite ya existente — no fetch de favicon externo).
- Título (truncado si es largo) y URL truncada debajo.
- Tags como chips pequeños.
- Badge de `estado` con color propio por estado (mismo criterio visual que `.risk-critico`/`.risk-alto` en Inventario, pero con su propia paleta de 4 colores — no reusar semántica de riesgo).
- Botón ★ favorito, visible siempre (no solo en hover, a diferencia de editar/eliminar) dado que es una acción de uso frecuente.
- Botones ✎ editar / × eliminar con reveal en `:hover`, mismo patrón que Inventario/SSL/MCPs.
- Click en el cuerpo de la card (fuera de los botones) abre la URL en pestaña nueva (`target="_blank"`).

**Filtros (barra superior del tab):**
- Chips de `tipo` (multi-selección o single, a definir en el plan — default: single, con opción "Todos").
- Chips de `estado` (mismo criterio).
- Toggle "★ Solo favoritos".
- Filtrado 100% client-side sobre el dataset ya cargado (no se espera volumen que justifique paginación ni filtrado server-side).

**Alta manual:** botón "+ Agregar link" que abre un form (usando `formField`/`formSelect` de `core/dom.js`, no el modal JSON genérico — este caso tiene campos tipados, no JSON crudo) con: URL, título, tipo (select), tags (input libre separado por comas), nota (textarea corto). Estado queda en `Pendiente` por defecto y no se pide en el alta manual (se cambia después desde la card).

**Edición:** click en ✎ abre el mismo form pre-cargado, agregando ahora el select de `estado` y el toggle de favorito.

## Errores y casos borde

- URL duplicada: no se bloquea (puede haber notas distintas sobre el mismo link en momentos distintos), pero el form muestra un aviso no bloqueante si detecta la misma URL ya cargada.
- `links-inventory.json` inexistente al arrancar: el router lo crea vacío (`{ "links": [] }`), mismo patrón que otros JSON de config del proyecto.
- Bookmarklet sin backend corriendo: falla silenciosa con alert, sin reintento.

## Testing

- Test manual: crear, editar, marcar favorito, cambiar estado, eliminar un link desde la UI.
- Test manual del bookmarklet: con VCC corriendo, capturar una pestaña real de Chrome y verificar que aparece en el tab Links con estado Pendiente.
- No se requieren tests automatizados nuevos — el proyecto no tiene suite de tests para los tabs de frontend existentes (solo hay `frontend/test/activity-rail.test.js`, caso aislado); mantener consistencia no es parte de este alcance.
