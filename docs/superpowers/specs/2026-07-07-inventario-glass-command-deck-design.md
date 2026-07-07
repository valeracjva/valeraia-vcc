# Rediseño Inventario VCC — "Glass Command Deck"

## Alcance

Solo la vista de **cards** de Inventario (`frontend/modules/tabs/inventory.js` + estilos en
`frontend/style.css`, sección "M4 — Inventario Infra" y "M13 — Métricas") y su toolbar
(group-by, contador, botones Monitoreados/Métricas/Gestionar).

Fuera de alcance: vista Listado (tabla), panel de Gestión, modal de edición/alta de servidor.

## Motivación

El diseño actual (cards planas, barras de 4px, glow solo en hover) funciona pero es plano.
Carlos quiere mantener la estructura y el flujo actuales, sumando más densidad visual de datos
y efectos ambientales que refuercen la estética "centro de comando" que ya insinúa el resto del
VCC (sonar-ping en `.infra-conn-dot`, glows radiales en otros paneles).

## Diseño

### 1. Cards — contenedor
- `.infra-card` pasa a fondo semi-transparente + `backdrop-filter: blur(12px)` (glassmorphism),
  usando una variante rgba de `--surface` en vez del sólido actual.
- Glow permanente por nivel de riesgo (no solo al hover):
  - `risk-critico`: halo rojo pulsante — reutiliza el keyframe `metric-pulse-glow` ya existente
    (mismo patrón que usan las barras en estado crítico).
  - `risk-alto`: halo naranja estático, sin pulso.
  - `risk-moderado` / `risk-bajo`: sin halo (se mantiene solo el borde izquierdo de color, como hoy).
- Hover: `translateY(-2px)` + sombra elevada + brillo de borde (hoy solo cambia `border-color`).

### 2. Barras de métricas (CPU / RAM / DSK)
- `.metric-bar-track` sube de 4px a 7px de alto.
- `.metric-bar-fill` pasa de color sólido a gradiente lineal (color base → tono más claro del
  mismo color), manteniendo la lógica de nivel ok/warn/crit existente.
- Flash de actualización: `applyMetrics()` en `inventory.js` compara el valor nuevo contra el
  cacheado en `infraMetricsCache` antes de sobreescribirlo; si cambió, agrega la clase
  `.metric-flash` a la barra por ~600ms (un pulso de brillo vía CSS animation, se remueve con
  `setTimeout` o `animationend`). Si el valor es igual, no se anima nada (evita ruido visual
  constante en servidores estables).
- `.metric-spark` (sparkline): opacidad base sube de 0.9 a 1 y el tamaño crece levemente
  (28×14 → ~34×16) para que tenga más presencia; ya está siempre visible, no es un cambio de
  comportamiento, solo de tamaño/opacidad.

### 3. Ambiente
- Fondo sutil tipo grid/dot-pattern en `#infra-container` (CSS `background-image` con
  `radial-gradient`/`linear-gradient` repetido, opacidad muy baja), detrás de las cards.
  Mismo lenguaje visual que los glows radiales ya usados en otros paneles del VCC
  (ej. `.brief-hero`, `.cockpit-widget`), aplicado acá de forma más discreta para no competir
  con los datos.

### 4. Toolbar
- `.btn-infra-group.active` suma un glow leve (`box-shadow` con `--accent-glow`) consistente con
  el resto de botones activos del VCC, en vez del cambio de fondo plano actual.
- Transición de activación más suave (`transition` ya existe, se ajusta timing/easing).

## No incluido / decisiones descartadas
- Gauges circulares en vez de barras (opción B "Tactical Dense") — descartado, el usuario eligió
  la dirección A completa.
- Cambios a Listado, panel de Gestión o modal — explícitamente fuera de alcance.

## Testing / verificación
- Verificación visual manual con Playwright (screenshot antes/después de la pestaña Inventario)
  en tema claro y oscuro, con al menos un servidor en cada nivel de riesgo (bajo/moderado/alto/
  crítico) y con métricas cargadas.
- Confirmar que el flash de actualización no dispara en el primer render (solo en cambios reales
  de valor) y que no rompe el estado "stale"/"unreachable" existente.
- No hay tests automatizados de CSS en este proyecto; se valida a ojo + no debe romper
  `frontend/test/*.test.js` existentes (no tocan esta lógica pero se corren igual como red de
  seguridad).
