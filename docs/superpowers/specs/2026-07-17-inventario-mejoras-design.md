# Inventario — campos configurables, buscador y límite de concurrencia en métricas

**Fecha:** 2026-07-17
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

Tres pedidos relacionados de Carlos sobre el módulo Inventario (`D:\Workspace-Repos\workspace-ui`),
surgidos después de arreglar el layout de card (nombre vs. badges, sesión anterior):

1. La card de Inventario muestra siempre OS/Empresa/Rol/SSH-WinRM-Puerto/Métricas — Carlos quiere
   poder ocultar campos que no necesita ver a diario, sin perder el dato (sigue existiendo en el
   servidor, solo no se renderiza).
2. Con 100+ servers el grid actual (scroll simple) se vuelve difícil de navegar para encontrar
   uno puntual.
3. `GET /api/metrics` y el poller interno (`pollAllServers`) disparan **todas** las conexiones
   SSH/WinRM en paralelo sin límite (`Promise.allSettled(ids.map(...))`, sin cap) — con 18
   servers hoy no es un problema real, pero a 100+ implica 100 conexiones simultáneas desde la
   misma PC cada 60s.

## Alcance

### 1. Campos configurables (global, no por-card)

Panel de configuración con checkboxes para: OS, Empresa, Rol, SSH/WinRM/Puerto, Métricas.
Default: todos visibles (idéntico al comportamiento actual, sin breaking change). Persistido en
`localStorage`, aplica a las 18+ cards a la vez — no hay configuración individual por servidor.

Fuera de alcance (YAGNI):
- Configuración por-card — la necesidad real es "no quiero ver X en ninguna card", no "este
  server en particular esconde el rol".
- Ocultar el nombre, la IP o el badge de riesgo — son la identidad mínima de la card, no se
  pueden apagar.

### 2. Buscador en Inventario

Mismo patrón que el buscador de Links (`frontend/modules/tabs/links.js`, sesión anterior): input
de texto en la toolbar, filtra client-side sobre los datos ya cargados, sin debounce, con botón
de limpiar (×). Busca sobre `id + ip + empresa + rol + os`, substring case-insensitive. Se
combina en AND con "● Monitoreados" y no interfiere con la agrupación (Empresa/OS/Sin
agrupar/Listado) — filtra los servers visibles antes de agruparlos/listarlos.

Fuera de alcance (YAGNI):
- Paginación o virtualización del grid — el buscador resuelve el caso de uso real ("encontrar un
  server puntual entre 100"), paginar es trabajo extra sin beneficio adicional para ese caso.
- Carrusel — evaluado y descartado en la conversación: un dashboard operativo necesita
  escanear/comparar muchos servers a la vez, un carrusel oculta la mayoría en todo momento.

### 3. Límite de concurrencia en recolección de métricas

`GET /api/metrics` (`backend/routes/metrics.js`, función interna que arma
`Promise.allSettled(ids.map(...))`) y `pollAllServers()` (usado por el poller de
`monitoring-core`) pasan a despachar los fetches en **batches** de tamaño fijo en vez de todos a
la vez. Mismo comportamiento observable (mismo endpoint, misma forma de respuesta, mismo caché de
60s) — solo cambia cuántas conexiones SSH/WinRM están abiertas simultáneamente en un momento
dado.

Fuera de alcance (YAGNI):
- Hacer el tamaño de batch configurable vía UI o env var — un valor fijo razonable (8) alcanza
  para el problema real; exponerlo como configuración es complejidad sin necesidad probada.
- Cambiar el intervalo de polling (60s) o el TTL del caché — no es el problema que se está
  resolviendo.

## Diseño

### Campos configurables

**Estado:** `localStorage['vcc-infra-visible-fields']` = JSON `{ os: true, empresa: true, rol:
true, ssh: true, metrics: true }`. Si la key no existe, todos `true` (comportamiento actual).

**UI:** nuevo botón `👁 Vista` en `.view-toolbar-end` del tab Inventario (`frontend/index.html`),
entre `#btn-infra-show-hidden` y `#btn-infra-manage`. Al hacer click, muestra/oculta un panel
pequeño (`#infra-fields-panel`, similar a un dropdown, no un modal — no es un formulario de
alta/edición, es una preferencia de vista) con un checkbox por campo. Cambiar un checkbox
persiste en `localStorage` y llama `renderInventory(infraAllServers)` para re-renderizar
inmediato.

**`buildServerCard(srv)`** (`frontend/modules/tabs/inventory.js`) lee la config al construir cada
card y condiciona cada bloque:
```js
const fields = getVisibleFields(); // lee localStorage, default todos true
...
(fields.os      ? `<div class="infra-os">${escHtml(srv.os)}</div>` : '') +
(fields.empresa ? `<div class="infra-empresa">${escHtml(srv.empresa)}</div>` : '') +
(fields.rol     ? `<div class="infra-rol">${escHtml(srv.rol)}</div>` : '') +
(fields.ssh && srv.sshUser   ? `<div class="infra-ssh">...</div>` : '') +
(fields.ssh && srv.winrmUser ? `<div class="infra-ssh">WinRM: ...</div>` : '') +
(fields.ssh && srv.puerto    ? `<div class="infra-ssh">Puerto ...</div>` : '') +
(fields.metrics && srv.monitoreado ? `<div class="infra-metrics">...</div>` : '') +
```
El bloque de métricas oculto también implica no pintar el resultado de `applyMetrics()` en esa
card — `applyMetrics` ya hace `card.querySelector('.infra-metrics')` y no falla si no existe
(`?.`), así que ocultar el campo no rompe el polling ni el caché, solo el render.

### Buscador

**Estado:** `let infraFilterTexto = ''` (variable de módulo, mismo patrón que
`infraFilterMonitored`/`infraGroupBy`).

**UI:** input `#infra-search` + botón `#infra-search-clear` en `.view-toolbar-start` del tab
Inventario, después del grupo de botones de agrupación — mismo HTML/CSS que
`.links-search-wrap`/`.links-search-input`/`.links-search-clear` ya existentes (reusar las
clases, no duplicar CSS).

**Filtro:** nueva función exportada `filterServers(servers, texto)` en `inventory.js`, pura,
mismo patrón que `filterLinks`:
```js
export function filterServers(servers, texto) {
  const needle = (texto ?? '').trim().toLowerCase();
  if (!needle) return servers;
  return servers.filter(s =>
    `${s.id} ${s.ip} ${s.empresa} ${s.rol} ${s.os}`.toLowerCase().includes(needle)
  );
}
```
`renderInventory()` aplica `filterServers` sobre `pool` (ya filtrado por monitoreados) antes de
calcular `visible` (que sigue restando los ocultos por `hidden.add`).

### Límite de concurrencia

**Nuevo módulo puro** `backend/lib/concurrency.js`:
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
Chunkea en batches de `limit`, cada batch usa `Promise.allSettled` (mismo comportamiento de
"nunca rechaza" que ya tenía el código), los batches se esperan secuencialmente entre sí. Con
`limit >= items.length` el comportamiento es idéntico al `Promise.allSettled` actual (caso de
hoy, 18 servers).

`backend/routes/metrics.js`: `router.get('/')` y `pollAllServers()` reemplazan su
`Promise.allSettled(ids.map(...))` por `mapWithConcurrency(ids, METRICS_CONCURRENCY, ...)` con
`const METRICS_CONCURRENCY = 8;` como constante del módulo.

## Riesgo y verificación

- Campos configurables y buscador: bajo riesgo, frontend puro, mismo patrón ya probado en Links.
  Verificación: Playwright, togglear cada checkbox y confirmar que el campo aparece/desaparece en
  las 18 cards; buscar un server real y confirmar que filtra; combinar buscador + monitoreados.
- Límite de concurrencia: riesgo bajo — `mapWithConcurrency` es una función pura testeable con
  `node:test` (verificar que nunca despacha más de `limit` promesas "en vuelo" a la vez, que
  agrega todos los resultados en orden, que un rechazo no aborta el resto). Con 18 servers y
  límite 8, el comportamiento observable en `GET /api/metrics` no cambia (2 batches en vez de 1,
  mismo resultado final) — verificar con el test existente de integración si lo hay, o una
  llamada real a `/api/metrics` confirmando que devuelve los mismos 18 resultados que antes.
