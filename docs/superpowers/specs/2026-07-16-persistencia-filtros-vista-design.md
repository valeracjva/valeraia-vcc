# Persistencia de filtros y vista por módulo — helper genérico reusable

**Fecha:** 2026-07-16
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

Carlos reportó que en Links, al recargar la página, el filtro de tipo/estado siempre vuelve a
"Todo" en vez de mantener la selección anterior. Al investigar se confirmó que **no es un bug
puntual de Links** — es un patrón repetido: cada módulo de `frontend/modules/tabs/` guarda su
estado de filtro/vista en variables de módulo (`let linksFilterTipo = ''`, etc.) que viven solo en
memoria y se resetean a su default en cada carga de página.

Relevamiento completo de lo que existe hoy:

**Ya persiste correctamente en `localStorage`** (no tocar):
- Tab activo del sidebar (`vcc-active-tab`, `core/shell.js`, commit `aa1aa0d` del 2026-07-06).
- `groupBy` de Inventario (`vcc-infra-groupby`) y Agentes (`vcc-agentes-groupby`).
- Campos visibles de card en Inventario (`vcc-infra-visible-fields`).
- Listas de "ocultos" en Inventario/SSL/MCPs (`vcc-*-hidden`).
- Estado del sidebar (collapsed/pinned) y theme.

**No persiste hoy** (el problema a resolver):
| Módulo | Variable(s) en memoria | Tipo |
|---|---|---|
| Links | `linksFilterTipo`, `linksFilterEstado`, `linksFilterFavOnly`, `linksFilterTexto` | 3 string + 1 bool |
| Inventario | `infraFilterTexto`, `infraFilterMonitored` | string + bool |
| MCPs | `mcpGroupBy` | string |
| SSL | `sslView` | string |
| Proyectos | `projectsGroupBy` | string |

Túneles, APIs y OpsMap no tienen un filtro/vista propio equivalente hoy — solo tienen un "modo
gestión" transitorio, que correctamente debe resetear al recargar (no es un filtro de
visualización, es un modo de edición).

Además de arreglar los 5 casos de arriba, Carlos pidió explícitamente que la solución sea un
**helper genérico reusable**, tanto por los módulos actuales como por cualquier módulo futuro —
no 5 parches puntuales repitiendo el mismo `try { JSON.parse(...) } catch {}` que ya se repite a
mano en Inventario/Agentes/SSL/MCP.

## Alcance

### Helper genérico — `frontend/modules/core/persist.js` (archivo nuevo)

Dos funciones puras, sin estado propio:

```js
export function loadState(key, fallback, storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function saveState(key, value, storage = globalThis.localStorage) {
  storage.setItem(key, JSON.stringify(value));
}
```

- Siempre serializa con `JSON.stringify`/`JSON.parse`, incluso para strings simples — evita casos
  especiales según el tipo de dato (sirve igual para boolean, string, u objeto combinado).
- Tercer parámetro opcional `storage` (default `globalThis.localStorage`) — permite inyectar un
  storage-fake en los tests unitarios sin necesitar jsdom ni parchear el global del browser.
- Si el JSON está corrupto o la key no existe, devuelve `fallback` — nunca rompe el render inicial
  del módulo.

### Convención de wiring — una key por módulo, combinada si hay más de un campo

Mismo patrón que ya usa `vcc-infra-visible-fields` (objeto combinado bajo una sola key) en vez de
una key por filtro individual — menos sprawl, un solo `loadState`/`saveState` por cambio.

| Módulo | Key | Shape |
|---|---|---|
| Links | `vcc-links-filters` | `{ tipo, estado, favOnly, texto }` |
| Inventario | `vcc-infra-filters` | `{ texto, monitored }` (key nueva, separada de `visible-fields`: son conceptos distintos — qué campos mostrar vs. qué filtro aplicar) |
| MCPs | `vcc-mcp-groupby` | string simple |
| SSL | `vcc-ssl-view` | string simple |
| Proyectos | `vcc-projects-groupby` | string simple |

Wiring en cada módulo:
- En `init*()`: `loadState(KEY, defaultValue)` siembra la(s) variable(s) de módulo al arrancar,
  antes del primer render.
- En cada handler de cambio de filtro (click de botón de tipo/estado/groupBy, input de texto,
  checkbox de favoritos/monitoreados): además de actualizar la variable en memoria y llamar al
  render existente, `saveState(KEY, valorActual)`.

Fuera de alcance (YAGNI):
- Túneles, APIs, OpsMap — no tienen un filtro/vista real que persistir hoy; el "modo gestión" de
  Túneles/Proyectos/MCPs/Links-tipos debe seguir reseteando al recargar (es edición, no vista).
- Persistir scroll position o cualquier otro estado de UI no mencionado — no pedido, no hay
  evidencia de que sea un problema real hoy.
- Un mecanismo de migración/versión de schema para el JSON persistido — si cambia el shape de un
  filtro en el futuro, `loadState` ya devuelve `fallback` ante cualquier estructura inesperada.

## Testing

- **`persist.js`** (TDD, pure functions): roundtrip `saveState` → `loadState` devuelve el mismo
  valor; key ausente devuelve `fallback`; JSON corrupto en el storage devuelve `fallback` sin
  tirar excepción; funciona igual con string/boolean/objeto. Todos los tests inyectan un
  storage-fake en memoria (objeto plano con `getItem`/`setItem`), sin depender de jsdom.
- **Wiring por módulo**: donde ya existen funciones puras de filtro testeadas (`filterLinks`,
  `filterServers`), no cambian de firma — el nuevo `loadState`/`saveState` solo envuelve la
  variable de módulo, no la lógica de filtrado en sí.
- **Verificación en vivo** (Playwright, un recorrido por módulo): aplicar un filtro no-default →
  recargar la página → confirmar que el filtro sigue aplicado y el resultado visible coincide.
  Repetir para los 5 módulos. Confirmar además que Túneles/Proyectos/MCPs siguen sin persistir su
  modo gestión (no se rompió el comportamiento intencional de reseteo).

## Riesgo / reinicio de servicios

Cambio 100% frontend (`frontend/modules/`), sin tocar `backend/`. No requiere reinicio de backend
ni afecta ningún endpoint.
