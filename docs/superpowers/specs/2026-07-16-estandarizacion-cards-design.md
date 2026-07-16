# Estandarización de cards — anatomía común entre módulos

**Fecha:** 2026-07-16
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

VCC tiene 4 familias de card CSS distintas (`.infra-card`, `.project-card`, `.tunnel-card`,
`.ssl-card`) que evolucionaron por separado en sesiones distintas. Cada una define su propio
header, tipografía de título, posición de acciones y lenguaje de color por estado. El resultado:
cada tab (Inventario/Links/MCPs/Agentes, Proyectos, Túneles, SSL) se siente como una app
distinta en vez de partes de un mismo sistema.

`.infra-card` ya es la más reusada (Inventario, Links, MCPs, Agentes la comparten hoy) y la más
madura (glow por riesgo, altura pareja entre cards de una fila, botones edit/hide en hover). Se
toma como base del estándar — las otras 3 familias migran hacia ella, no al revés.

## Alcance

Definir y aplicar una anatomía común de card a las 4 familias existentes. Cambio de estructura
visual (CSS + ajustes mínimos de JS de render), no de funcionalidad — ningún módulo gana ni
pierde datos o acciones.

Fuera de alcance (YAGNI):
- Rediseño de contenido/información mostrada por card (eso ya se ajustó módulo por módulo en
  sesiones previas — Links 2026-07-15, Agentes 2026-07-15, etc.).
- Unificar `.ssl-card-metrics` (2 columnas label/valor) al estilo de barras de `.infra-metrics`
  — son datos de naturaleza distinta (vencimiento vs uso de recursos), forzar el mismo widget
  no aporta.
- Tocar Mapa Operativo (`.ops-node`) — no es una card de listado, es un nodo de grafo con su
  propio lenguaje visual ya establecido.
- Nueva familia de card genérica reutilizable como componente (`buildCard()` JS) — cada tab
  sigue generando su HTML propio, solo comparten las clases/estructura CSS. Extraer un builder
  común queda para si se repite la necesidad, no ahora.

## Anatomía estándar

```
┌─ card ───────────────────────────────────────────┐
│ [dot] TÍTULO (mono, 600, 0.8rem)   [badges] [✎][×] │ ← header
│ meta línea 1 (0.72rem, faint, mono si es técnico)  │
│ meta línea 2 ...                                   │
│ [sección opcional: métricas / notes / DB / desc]   │
│ [toggle detalles ▾] ← si el módulo tiene detail    │
├─────────────────────────────────────────────────┤
│ [footer opcional: acción primaria]                 │ ← solo si el módulo la necesita
└─────────────────────────────────────────────────┘
```

Reglas fijas del estándar:

1. **Acciones secundarias** (editar ✎ / ocultar ×) siempre en la esquina derecha del header,
   `margin-left: auto`, visibles en hover — mismo patrón ya usado por `.infra-edit-btn`/
   `.infra-hide-btn`.
2. **Borde-left de 3px** es el único lenguaje de color por estado/severidad/riesgo. Reemplaza
   cualquier `border-color` completo o `background` tintado usado hoy para el mismo propósito
   (caso `tunnel-card.tunnel-prod`, que hoy tiñe todo el borde + fondo).
3. **Altura pareja por fila de grid** — el contenedor grid de cada tab no debe tener
   `align-items: start` (mismo fix ya aplicado en Túneles 2026-07-16, ver memoria de proyecto)
   salvo que el módulo tenga una razón explícita para alturas libres.
4. **Título**: mono, weight 600, una sola línea con `text-overflow: ellipsis`, tamaño único
   `0.8rem` — hoy varía 0.78rem (`infra-id`) / 0.85rem (`tunnel-card-name`) / los tamaños propios
   de `.project-card-name` y `.ssl-card-domain`.
5. **Meta lines** (IP, empresa, rol, descripción corta, etc.): `0.72rem`, color `--text-muted` o
   `--text-faint` según jerarquía, `overflow-wrap: break-word` para URLs/valores largos sin
   espacios.
6. **Footer** es la única sección realmente opcional del estándar, reservada para una acción
   primaria tipo botón grande (hoy: Abrir/Cerrar túnel). Los módulos sin acción primaria no
   ganan un footer vacío.

## Mapeo por familia — qué cambia, qué se mantiene

### `.infra-card` (Inventario, Links, MCPs, Agentes) — implementación de referencia
- **Cambia:** nada estructural. Es la base; el resto migra a ella.
- **Se mantiene:** glow por riesgo crítico/alto, métricas con barras, accordion de detalles,
  todo lo ya construido en sesiones previas (rediseño Links 2026-07-15, Agentes con descripción
  2026-07-15).

### `.project-card` (Proyectos)
- **Cambia:** tamaño de título a `0.8rem` único; confirmar que ✎/acciones (si las hubiera)
  queden alineadas a la derecha del header igual que `.infra-card`.
- **Se mantiene:** accordion de body con notes completas, preview de `.project-card-desc`
  (agregada 2026-07-15), badge de ambiente, estado `is-active`.

### `.tunnel-card` (Túneles)
- **Cambia:** estado (prod/adhoc) pasa de `border-color`/`background` tintado completo a
  border-left de 3px, coherente con el resto — clase nueva de color según estado en vez de
  `.tunnel-prod`/`.tunnel-adhoc` tiñendo toda la card. Footer se formaliza como el uso de
  referencia de la sección opcional "footer" del estándar (ya era footer, ahora es un patrón
  documentado y no un caso aislado).
- **Se mantiene:** dot con texto (● activo/inactivo, texto no solo color), sección DB
  (`.tunnel-db-section`), footer con botón Abrir/Cerrar, altura mínima 180px si sigue haciendo
  falta tras el fix de `align-items`.

### `.ssl-card` (SSL)
- **Cambia:** tamaño de título (`.ssl-card-domain`) a `0.8rem` único. **Adenda 2026-07-16:** el
  border-left de 3px dejó de ser base (grey por defecto en toda card) y pasó a vivir solo en los
  modificadores `.ssl-status-*`, igualando el patrón de `.infra-card`/`.tunnel-card` (sin estado
  = sin rail, nunca un rail gris permanente). Cambio semántico, no visual — todo dominio siempre
  trae un status calculado por backend, así que no hubo diferencia observable.
- **Se mantiene:** métricas propias en 2 columnas (label izquierda / valor derecha — vencimiento
  y fecha, no son barras de uso de recurso), border-left por status ya coherente con el
  estándar, estado `error` con border dashed (caso ya distinguido a propósito).

### `.govern-card` (Gobernanza) — adenda 2026-07-16, familia que faltaba en el relevamiento original
- **Cambia:** `.govern-card-name` de `0.82rem`/`700` a `0.8rem`/`600`, igual al resto.
  Border-left de 3px `var(--accent)`, **fijo en las 7 cards** (no por estado — confirmado con
  Carlos: gobernanza no tiene señal de riesgo por script hoy, el resultado de la última
  ejecución no se guarda por card, solo se ve en el panel Output compartido — un borde por
  severidad real sería una feature nueva, no este ajuste de consistencia visual).
- **Se mantiene:** ícono en vez de dot en el header (apropiado — representa un script, no un
  servidor/dominio), footer con acción primaria "▶ Ejecutar" (mismo patrón de sección opcional
  que ya usa Túneles).

## Riesgo y verificación

- Bajo riesgo: cambios de CSS + ajustes puntuales de clases en el JS de render de cada tab, sin
  tocar backend ni modelo de datos.
- Verificación: Playwright en vivo por familia migrada — confirmar altura pareja en grid,
  posición de acciones en hover, y que ningún módulo pierda información que hoy muestra.
- Reinicio de backend no debería hacer falta (solo frontend) salvo que algún ajuste de JS de
  render toque un archivo servido con cache — verificar recarga simple del navegador primero.
