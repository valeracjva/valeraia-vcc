# Buscador en Links

**Fecha:** 2026-07-16
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

El módulo Links (`D:\Workspace-Repos\workspace-ui`) solo permite filtrar por Tipo, Estado y
Favoritos. No hay forma de buscar por texto libre — si Carlos recuerda una palabra del título,
del dominio, de la nota o de un tag pero no el tipo/estado exacto, tiene que scrollear toda la
lista.

## Alcance

Agregar un input de búsqueda de texto libre a la toolbar de Links, filtrando client-side sobre
los datos ya cargados en memoria (`linksAllData`) — sin cambios de backend ni de modelo de datos.

Fuera de alcance (YAGNI):
- Búsqueda en backend / API — el dataset de links es chico, no justifica un endpoint de búsqueda.
- Debounce — es filtrado en memoria sobre un array, sin costo de red, no hace falta retrasar.
- Resaltado (highlight) del texto coincidente dentro de la card — no pedido, agrega complejidad
  de rendering sin necesidad clara.
- Búsqueda difusa/fuzzy — substring simple case-insensitive alcanza para este volumen de datos.

## Diseño

**UI:** input de texto `#links-search` (placeholder "Buscar...") al principio de
`.view-toolbar-start` en el tab Links (`frontend/index.html`), antes de `#links-tipo-filters`.

**Filtrado:** `filterLinks(links, { tipo, estado, favOnly, texto })` en
`frontend/modules/tabs/links.js` gana un parámetro `texto` opcional. Cuando está presente
(trim no vacío), filtra por substring case-insensitive sobre la concatenación de
`titulo + url + nota + tags.join(' ')`. Se combina en AND con los filtros existentes — mismo
pipeline de un solo `.filter()`, ningún filtro nuevo pisa a los demás.

**Momento:** filtra en cada evento `input` del campo de texto (sin debounce, sin botón de
buscar) — mismo patrón instantáneo que ya usan los botones de Tipo/Estado/Favoritos.

**Estado:** nueva variable de módulo `linksFilterTexto` (junto a las 3 que ya existen:
`linksFilterTipo`, `linksFilterEstado`, `linksFilterFavOnly`), inicializada en `''`.

**Contador:** `#links-counter` ("X de Y") sigue funcionando sin cambios — ya lee `visible.length`
después de aplicar todos los filtros.

## Riesgo y verificación

Bajo riesgo: cambio de frontend puro (HTML + JS), sin tocar backend. Verificación: test unitario
de `filterLinks()` con el nuevo parámetro `texto` (ya existe un test file para esta función según
el patrón del repo — confirmar si hay `frontend/test/links-filter.test.js` o similar antes de
crear uno nuevo) + verificación en vivo con Playwright escribiendo en el campo y confirmando que
la grilla y el contador reaccionan.
