# M14 — Modo Incidente (diseño)

## Contexto

M14 Mapa Operativo ya renderiza un grafo (`/api/opsmap`) con nodos (`workspace`, `server`,
`domain`, `tunnel`, `project`, `environment`, `mcp`) y links tipados (`contains`, `exposes`,
`monitors`, `has-tunnel`, `tunnel-to`, `has-project`, `has-env`, `runs-on`, `uses-mcp`, `current`).
El click en un nodo hoy solo muestra su detalle en el panel lateral.

Próximo paso (handover 2026-07-03): evolucionar M14 hacia **modo incidente** — seleccionar un
server o dominio y ver qué se ve impactado operativamente.

## Alcance

- Sin cambios de backend. Toda la lógica de impacto se calcula en el frontend a partir de
  `nodes`/`links` que ya trae `/api/opsmap`.
- Impacto = **solo downstream** (qué depende del nodo seleccionado), no upstream.
- Nodos que pueden ser origen de un incidente: **solo `server` y `domain`**. El resto de tipos
  de nodo, en modo incidente, siguen mostrando detalle normal sin disparar análisis de impacto.

## Regla de impacto

Se excluyen los links que tocan el nodo `workspace` (`contains`, `monitors`, `has-project`,
`has-tunnel`, `current`) — son de contención/monitoreo global; al ser `workspace` el hub del
grafo, incluirlos arrastraría prácticamente todos los nodos como "impactados".

Sobre el resto de los links (`runs-on`, `exposes`, `tunnel-to`, `uses-mcp`, `has-env`) se hace
un BFS **no dirigido** desde el nodo origen. Resultado: ambientes que corren en el server,
dominios que expone, túneles que conectan a él, proyectos dueños de esos ambientes, y MCPs que
usan esos ambientes.

```
computeImpact(nodeId, nodes, links) -> { impacted: Node[], byType: Record<type, Node[]> }
```

Función pura, sin DOM, testeable con fixtures.

## UI / interacción

- Switch **"Modo Incidente"** en el header del tab Mapa Operativo (junto a subtítulo/refresh).
- Modo activo + click en nodo `server`/`domain`: calcula impacto y aplica clases CSS:
  - `.ops-node.impacted` (borde/glow de alerta) a los nodos impactados y al origen.
  - `.ops-node.dimmed` (opacity baja) al resto.
- Modo activo + click en nodo de otro tipo (`project`, `tunnel`, `mcp`, `environment`): limpia
  el resaltado de impacto (si había uno) y muestra el detalle normal de ese nodo — no recalcula
  impacto.
- Panel lateral en vista de impacto (reemplaza el detalle normal mientras hay impacto activo):
  - Nombre/tipo del nodo origen.
  - Conteo por tipo: `"2 ambientes · 1 dominio · 1 túnel prod"`.
  - Lista agrupada por tipo, cada ítem clickeable → llama a `renderOpsDetail` de ese nodo
    puntual (esto sale de la "vista de impacto" y muestra el detalle simple de ese nodo,
    manteniendo el resaltado del radar hasta que se seleccione otro origen o se apague el modo).
  - Badge **"Impacto crítico"** si algún nodo impactado tiene `state === 'critico'` (ej. toca
    un túnel de producción o un server crítico).
- Apagar el switch: limpia clases `impacted`/`dimmed`, vuelve al comportamiento actual
  (click = detalle simple, sin cálculo de impacto).

## Testing

- Unit test de `computeImpact` con fixtures de grafo (sin DOM):
  - Server con envs + domains + tunnels asociados → impacto correcto.
  - Domain aislado sin envs/servers relacionados → impacto vacío (solo el nodo origen).
  - Verificar que los links que tocan `workspace` no se siguen (evitar explosión al grafo
    completo).
  - Verificar badge de impacto crítico cuando un nodo impactado tiene `state === 'critico'`.

## Fuera de alcance

- Persistencia de incidentes (no se guarda nada en disco/DB — es una vista derivada, efímera).
- Impacto upstream (qué depende de X hacia arriba en la jerarquía).
- Selección de origen en tipos de nodo distintos a `server`/`domain`.
