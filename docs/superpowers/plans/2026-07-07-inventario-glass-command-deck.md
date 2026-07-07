# Rediseño Inventario VCC — Glass Command Deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la vista de cards de Inventario del VCC (glassmorphism, glow por riesgo, barras de métrica con gradiente y flash animado, sparkline más presente, fondo ambiental sutil) sin tocar Listado, Gestión ni el modal de edición.

**Architecture:** Cambios puramente de presentación en `frontend/style.css` (sección M4/M13 — Inventario) + ajustes puntuales en `frontend/modules/tabs/inventory.js` (color con `color-mix()` en las barras, tamaño del sparkline SVG, y detección de cambio de valor para el flash de actualización). No hay cambios de backend ni de estructura de datos.

**Tech Stack:** Vanilla JS (ES modules), CSS (custom properties + `color-mix()`), Node `node:test` para regresión.

## Global Constraints

- Alcance: solo `.infra-card` + su toolbar (group-by, contador, botones Monitoreados/Métricas/Gestionar). No modificar Listado (`.infra-list-table`), panel de Gestión (`.manage-*`) ni el modal de edición (`.infra-edit-modal*`).
- No modificar el bloque compartido `.vcc-card, .infra-card, .project-card, .tunnel-card` (style.css:3867-3879) — es usado por Proyectos y Túneles también. Los overrides de Inventario van en reglas nuevas, más específicas o posteriores en el archivo, que solo targetean `.infra-card`.
- Respetar `@media (prefers-reduced-motion: reduce)` ya definido en `style.css:63-65` — es global, no requiere trabajo extra, pero ningún nuevo `@keyframes` debe asumir que siempre corre.
- Ambos temas (`:root` oscuro y `html[data-theme="light"]`) deben verse correctos — todo color nuevo va como custom property con variante en ambos bloques (style.css:8-61 y :68-96).
- `color-mix(in srgb, ...)` es soportado en Chromium/Edge/Firefox modernos — aceptable para esta herramienta interna (se abre siempre en navegador de escritorio actualizado).

---

### Task 1: Design tokens — superficie glass y patrón de puntos

**Files:**
- Modify: `frontend/style.css:33` (dark `:root`, después de `--accent-glow`)
- Modify: `frontend/style.css:91` (light `html[data-theme="light"]`, después de `--accent-glow`)

**Interfaces:**
- Produces: custom properties `--surface-glass` y `--dot-pattern`, consumidas por las Tasks 2 y 7.

- [ ] **Step 1: Agregar tokens al tema oscuro**

En `frontend/style.css`, dentro del bloque `:root { ... }`, inmediatamente después de la línea `--accent-glow: rgba(99, 102, 241, 0.15);` (línea 33), agregar:

```css
  --surface-glass: rgba(17, 24, 39, 0.72);
  --dot-pattern:   rgba(255, 255, 255, 0.035);
```

- [ ] **Step 2: Agregar tokens al tema claro**

Dentro de `html[data-theme="light"] { ... }`, inmediatamente después de `--accent-glow: rgba(80, 72, 204, 0.08);` (línea 91), agregar:

```css
  --surface-glass: rgba(245, 242, 237, 0.72);
  --dot-pattern:   rgba(0, 0, 0, 0.035);
```

- [ ] **Step 3: Verificar que no rompe nada**

Abrir el VCC en el navegador (`http://localhost:8080`, backend ya corriendo con `node server.js` en `backend/`), confirmar visualmente que la app carga igual que antes (los tokens nuevos todavía no se usan en ningún selector).

- [ ] **Step 4: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css
git commit -m "style(inventario): agregar tokens glass surface y dot pattern"
```

---

### Task 2: Cards — fondo glass + glow persistente por riesgo

**Files:**
- Modify: `frontend/style.css` — nueva sección al final del archivo (después del bloque "Tarjeta base compartida", style.css:3864-3879), para ganar en cascada por orden de aparición sin tocar el bloque compartido.

**Interfaces:**
- Consumes: `--surface-glass` (Task 1), `--danger`, `--warning` (ya existentes), keyframe `metric-pulse-glow` ya existente en `style.css:2189-2192` (se reutiliza el patrón, no la regla — el keyframe actual anima `box-shadow` de una barra, acá se crea uno análogo para la card).
- Produces: clases `.infra-card` (override), sin nuevas clases consumidas por JS.

- [ ] **Step 1: Agregar override de fondo glass y glow por riesgo**

Al final de `frontend/style.css` (después de la sección "Tarjeta base compartida", después de la línea `.tunnel-card:hover { border-color: var(--accent); }`), agregar una nueva sección:

```css
/* ── 16. Inventario — Glass Command Deck ──────────────────── */

/* Fondo glass: sobreescribe el `background: var(--surface)` del bloque
   compartido (.vcc-card/.infra-card/.project-card/.tunnel-card) solo para
   .infra-card -- Proyectos y Túneles quedan sin cambios. */
.infra-card {
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: border-color 0.15s, transform 0.18s var(--ease), box-shadow 0.18s var(--ease);
}

/* Glow persistente por riesgo -- no depende de hover */
.infra-card.risk-critico {
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.18), 0 0 16px rgba(239, 68, 68, 0.14);
  animation: infra-card-glow-critical 2.4s ease-in-out infinite;
}
.infra-card.risk-alto {
  box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.16), 0 0 14px rgba(249, 115, 22, 0.10);
}

@keyframes infra-card-glow-critical {
  0%, 100% { box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.18), 0 0 12px rgba(239, 68, 68, 0.10); }
  50%      { box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.24), 0 0 20px rgba(239, 68, 68, 0.20); }
}
```

- [ ] **Step 2: Verificar visualmente**

Recargar `http://localhost:8080`, ir a Inventario. Confirmar: las cards ahora tienen fondo translúcido con blur, las de riesgo CRIT pulsan un halo rojo sutil, las de riesgo ALTO tienen halo naranja fijo. Cambiar a tema claro (botón "☀ Claro"/"☾ Oscuro" en el header) y confirmar que el glass también se ve bien ahí (no debe quedar ilegible).

- [ ] **Step 3: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css
git commit -m "style(inventario): fondo glass y glow persistente por nivel de riesgo"
```

---

### Task 3: Cards — elevación al hover

**Files:**
- Modify: `frontend/style.css` — misma sección nueva de Task 2 (sección 16).

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada consumido por JS.

- [ ] **Step 1: Agregar hover con elevación**

En la sección 16 creada en Task 2, agregar al final:

```css
.infra-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--accent);
}
/* El hover de riesgo CRIT/ALTO no debe perder su halo de color al pasar el mouse */
.infra-card.risk-critico:hover {
  box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--accent), 0 0 20px rgba(239, 68, 68, 0.22);
}
.infra-card.risk-alto:hover {
  box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--accent), 0 0 16px rgba(249, 115, 22, 0.16);
}
```

- [ ] **Step 2: Verificar visualmente**

Pasar el mouse sobre varias cards (una de cada nivel de riesgo). Confirmar que se elevan levemente y no "saltan" de forma brusca (debe sentirse suave, `transition` ya está declarada en Task 2 Step 1).

- [ ] **Step 3: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css
git commit -m "style(inventario): elevación suave al hover en cards"
```

---

### Task 4: Barras de métrica — más altas y con gradiente

**Files:**
- Modify: `frontend/style.css:2169-2183` (`.metric-bar-track`, `.metric-bar-fill`)
- Modify: `frontend/modules/tabs/inventory.js:670-691` (función `metricBar`)

**Interfaces:**
- Consumes: nada nuevo de otras tasks.
- Produces: `metricBar(label, pct, absText, sparkValues, hideCtx)` mantiene la misma firma — solo cambia el `background` inline que genera. Las Tasks 5 y 6 siguen llamando a esta función igual.

- [ ] **Step 1: Subir alto del track y ajustar radius**

En `frontend/style.css`, reemplazar el bloque `.metric-bar-track` (líneas 2169-2176):

```css
.metric-bar-track {
  flex: 1;
  min-width: 24px;
  height: 7px;
  background: var(--surface-3);
  border-radius: 3.5px;
  overflow: hidden;
}
```

- [ ] **Step 2: Ajustar radius del fill para que combine**

Reemplazar `.metric-bar-fill` (líneas 2178-2183):

```css
.metric-bar-fill {
  height: 100%;
  border-radius: 3.5px;
  transition: width 0.4s ease, box-shadow 0.3s ease;
  box-shadow: 0 0 5px currentColor;
}
```

(Sin cambios funcionales acá, solo el `border-radius` para que coincida con el track más grueso.)

- [ ] **Step 3: Cambiar el color sólido por gradiente en el JS**

En `frontend/modules/tabs/inventory.js`, dentro de `metricBar()` (línea ~683), la línea actual es:

```js
      `<div class="metric-bar-fill" style="width:${clamped}%;background:${color}"></div>` +
```

Reemplazar por:

```js
      `<div class="metric-bar-fill" style="width:${clamped}%;background:linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, white 30%))"></div>` +
```

- [ ] **Step 4: Verificar visualmente**

Recargar Inventario, confirmar que las barras CPU/RAM/DSK son visiblemente más gruesas y tienen un degradé sutil (más claro hacia la derecha) en vez de color plano. Probar en tema claro y oscuro.

- [ ] **Step 5: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css frontend/modules/tabs/inventory.js
git commit -m "style(inventario): barras de métrica más altas con gradiente"
```

---

### Task 5: Flash animado al actualizar una métrica

**Files:**
- Modify: `frontend/style.css` — sección 16 (agregar al final)
- Modify: `frontend/modules/tabs/inventory.js:731-818` (función `applyMetrics`)

**Interfaces:**
- Consumes: `infraMetricsCache` (objeto módulo-level ya existente, línea 20).
- Produces: nada consumido por otras tasks; efecto autocontenido.

**Contexto:** `applyMetrics(m)` guarda `m` en `infraMetricsCache[m.serverId]` en la primera línea (`infraMetricsCache[m.serverId] = m;`, línea 732) — eso pisa el valor anterior antes de poder compararlo. Hay que leer el valor previo ANTES de esa asignación.

- [ ] **Step 1: Capturar el valor previo antes de sobreescribir el cache**

En `frontend/modules/tabs/inventory.js`, la función `applyMetrics` empieza así (línea 731-732):

```js
function applyMetrics(m) {
  infraMetricsCache[m.serverId] = m;
```

Reemplazar por:

```js
function applyMetrics(m) {
  const prev = infraMetricsCache[m.serverId];
  infraMetricsCache[m.serverId] = m;
```

- [ ] **Step 2: Detectar cambio y disparar el flash después de pintar el HTML**

Al final de `applyMetrics`, después del bloque "Vista card" (justo antes del bloque "Vista listado", alrededor de la línea 812, después de `metricsEl.innerHTML = metricsHtml;`), agregar la lógica de flash. El bloque completo "Vista card" queda así (agregando las líneas nuevas marcadas):

```js
  // Vista card
  const card = document.querySelector(`.infra-card[data-server="${escHtml(m.serverId)}"]`);
  if (card) {
    const dot = card.querySelector(`.infra-conn-dot[data-conn="${escHtml(m.serverId)}"]`);
    if (dot) { dot.className = `infra-conn-dot ${cls}`; dot.title = tip; }
    let metricsEl = card.querySelector('.infra-metrics');
    if (!metricsEl) {
      metricsEl = document.createElement('div');
      metricsEl.className = 'infra-metrics';
      const toggle = card.querySelector('.infra-toggle');
      if (toggle) card.insertBefore(metricsEl, toggle);
      else card.appendChild(metricsEl);
    }
    metricsEl.innerHTML = metricsHtml;
    flashChangedBars(metricsEl, prev, base);
  }
```

Y agregar la función `flashChangedBars` cerca de `metricBar` (después de la función `metricBar`, antes de `updateDiskDetails`, alrededor de la línea 692):

```js
// Compara CPU/RAM contra el snapshot anterior y agrega un pulso de brillo breve
// a las barras que cambiaron -- da sensacion de dato vivo sin animar constantemente
// las que estan quietas. Disco no se compara (su "worst" puede cambiar de disco
// entre refreshes, no solo de valor, y generaria flashes falsos).
function flashChangedBars(metricsEl, prevBase, newBase) {
  if (!prevBase || prevBase.status !== 'ok' || !prevBase.cpu || !prevBase.ram) return;
  if (!newBase || !newBase.cpu || !newBase.ram) return;
  const rows = metricsEl.querySelectorAll('.metric-row');
  const changed = [
    prevBase.cpu.pct !== newBase.cpu.pct,
    prevBase.ram.pct !== newBase.ram.pct,
  ];
  rows.forEach((row, i) => {
    if (i > 1) return; // solo CPU (0) y RAM (1) -- DSK excluido por el motivo de arriba
    if (!changed[i]) return;
    const fill = row.querySelector('.metric-bar-fill');
    if (!fill) return;
    fill.classList.remove('metric-flash');
    void fill.offsetWidth; // fuerza reflow para poder re-disparar la animación si ya estaba
    fill.classList.add('metric-flash');
  });
}
```

- [ ] **Step 3: Agregar el keyframe y la clase CSS**

En la sección 16 de `frontend/style.css` (creada en Task 2), agregar:

```css
@keyframes metric-value-flash {
  0%   { filter: brightness(1); }
  30%  { filter: brightness(1.9); }
  100% { filter: brightness(1); }
}
.metric-bar-fill.metric-flash {
  animation: metric-value-flash 0.6s ease-out;
}
```

- [ ] **Step 4: Verificar visualmente**

Con el VCC abierto en Inventario, esperar al refresh automático de métricas (`METRICS_INTERVAL_MS = 60_000`, o forzar con el botón "↻ Métricas"). Confirmar que las barras CPU/RAM de servidores cuyo valor cambió hacen un pulso de brillo breve, y las que no cambiaron quedan quietas. Confirmar que en el primer render (`prev` es `undefined`) no hay flash (no debe tirar error tampoco — `flashChangedBars` corta temprano si `!prevBase`).

- [ ] **Step 5: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css frontend/modules/tabs/inventory.js
git commit -m "feat(inventario): flash animado en barras cuando cambia el valor"
```

---

### Task 6: Sparkline más grande y presente

**Files:**
- Modify: `frontend/modules/tabs/inventory.js:650-668` (función `sparklineSvg`)
- Modify: `frontend/style.css:2215-2223` (`.metric-spark`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `sparklineSvg` mantiene la misma firma `(values, color)`.

- [ ] **Step 1: Agrandar el viewBox del SVG**

En `frontend/modules/tabs/inventory.js`, función `sparklineSvg` (línea 650-652), la línea:

```js
  const w = 28, h = 14;
```

Reemplazar por:

```js
  const w = 34, h = 17;
```

- [ ] **Step 2: Ajustar tamaño y opacidad base en CSS**

En `frontend/style.css`, reemplazar el bloque `.metric-spark` (líneas 2215-2221):

```css
.metric-spark {
  width: 34px;
  height: 17px;
  flex-shrink: 0;
  opacity: 1;
  transition: transform 0.2s ease;
}
```

Y reemplazar la regla de hover (línea 2223):

```css
.metric-row:hover .metric-spark { transform: scale(1.08); }
```

- [ ] **Step 3: Verificar visualmente**

Confirmar que las sparklines se ven más grandes y presentes de entrada (no solo al hover), y que al pasar el mouse por la fila crecen levemente sin desbordar el layout de la card.

- [ ] **Step 4: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css frontend/modules/tabs/inventory.js
git commit -m "style(inventario): sparkline más grande y visible"
```

---

### Task 7: Fondo ambiental (dot pattern) en el grid de Inventario

**Files:**
- Modify: `frontend/style.css` — sección 16.

**Interfaces:**
- Consumes: `--dot-pattern` (Task 1).
- Produces: nada consumido por JS.

- [ ] **Step 1: Agregar el patrón de fondo**

En la sección 16 de `frontend/style.css`, agregar:

```css
#infra-container {
  position: relative;
  background-image: radial-gradient(circle, var(--dot-pattern) 1px, transparent 1px);
  background-size: 22px 22px;
}
```

- [ ] **Step 2: Verificar que no compite visualmente con las cards**

Recargar Inventario. El patrón debe notarse solo en los espacios entre cards y en el fondo general del panel — muy sutil, no debe "ensuciar" el texto ni las barras. Si se ve muy fuerte, es la única variable a ajustar: bajar `--dot-pattern` alpha (0.035 → 0.02) en `frontend/style.css` (Task 1, ambos temas).

- [ ] **Step 3: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css
git commit -m "style(inventario): fondo ambiental sutil tipo dot-grid"
```

---

### Task 8: Toolbar — glow en botón de agrupación activo

**Files:**
- Modify: `frontend/style.css:2310` (`.btn-infra-group.active`)

**Interfaces:**
- Consumes: `--accent-glow` (ya existente).
- Produces: nada consumido por JS.

- [ ] **Step 1: Agregar glow al estado activo**

En `frontend/style.css`, la línea actual (2310):

```css
.btn-infra-group.active { background: var(--accent); color: #fff; }
```

Reemplazar por:

```css
.btn-infra-group.active {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 0 10px var(--accent-glow), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  transition: background 0.18s var(--ease), color 0.18s var(--ease), box-shadow 0.18s var(--ease);
}
```

- [ ] **Step 2: Verificar visualmente**

Click en "Empresa" / "OS" / "Sin agrupar" / "Listado" en la toolbar de Inventario, confirmar que el botón activo tiene un glow leve alrededor, consistente con otros botones activos del VCC (ej. tabs del sidebar).

- [ ] **Step 3: Commit**

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css
git commit -m "style(inventario): glow en botón de agrupación activo"
```

---

### Task 9: Verificación final — ambos temas, los 4 niveles de riesgo, regresión de tests

**Files:**
- No modifica archivos de producto. Solo verificación.

**Interfaces:**
- Consumes: todo lo implementado en Tasks 1-8.

- [ ] **Step 1: Correr los tests existentes de frontend (regresión)**

```bash
cd "D:/Workspace-Repos/workspace-ui"
node --test frontend/test/
```

Expected: todos los tests en `frontend/test/activity-rail.test.js` y `frontend/test/opsmap-impact.test.js` pasan (no deberían verse afectados por cambios de CSS/inventory.js, pero corren como red de seguridad).

- [ ] **Step 2: Screenshot Playwright — tema oscuro**

Con el backend corriendo (`http://localhost:8080`), navegar a Inventario en tema oscuro (default) y tomar un screenshot de página completa. Confirmar visualmente:
- Cards con fondo glass/blur visible.
- Al menos una card `risk-critico` con halo rojo pulsante y una `risk-alto` con halo naranja fijo (si no hay servidores con esos niveles cargados en este momento, verificar igual con DevTools forzando la clase, o dejarlo documentado como pendiente de validar cuando existan).
- Barras CPU/RAM/DSK más gruesas con degradé.
- Sparklines visibles de entrada, sin recorte de layout.
- Patrón de puntos de fondo sutil, no invasivo.
- Botón de agrupación activo con glow.

- [ ] **Step 3: Screenshot Playwright — tema claro**

Click en el toggle de tema (header, "☀ Claro" / "☾ Oscuro"), repetir la verificación del Step 2. Confirmar que el glass y el dot-pattern también se ven bien sobre fondo claro (no quedan casi invisibles ni excesivamente oscuros).

- [ ] **Step 4: Verificar hover y flash en vivo**

Pasar el mouse sobre 2-3 cards de distinto riesgo (confirmar elevación suave). Forzar un refresh de métricas con el botón "↻ Métricas" dos veces seguidas y confirmar que las barras CPU/RAM de servidores con valores cambiados pulsan brevemente.

- [ ] **Step 5: Commit final si hubo ajustes de la verificación**

Si el Step 2 o 3 revelaron necesidad de ajuste (ej. opacidad del dot-pattern), aplicar el ajuste puntual en `frontend/style.css` y commitear:

```bash
cd "D:/Workspace-Repos/workspace-ui"
git add frontend/style.css
git commit -m "style(inventario): ajustes finos post-verificación visual"
```

Si no hubo ajustes, no crear un commit vacío — este paso queda documentado como completado sin cambios.
