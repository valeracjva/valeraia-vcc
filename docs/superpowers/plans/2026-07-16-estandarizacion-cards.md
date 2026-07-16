# Estandarización de cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar la anatomía visual de las 4 familias de card de VCC (`.infra-card`,
`.project-card`, `.tunnel-card`, `.ssl-card`) a un único estándar de header/título/acciones/
borde-por-estado, usando `.infra-card` como implementación de referencia.

**Architecture:** Cambios de CSS puro (`frontend/style.css`) más ajustes mínimos de clases en el
JS de render de cada tab (`frontend/modules/tabs/{projects,tunnels,ssl}.js`) — ningún cambio de
backend, modelo de datos ni funcionalidad. `.infra-card` no se toca (ya es la referencia).

**Tech Stack:** HTML/CSS/JS vanilla (ES modules), sin build step — los cambios de `style.css` y
`frontend/modules/tabs/*.js` se ven con solo recargar el navegador (`vcc` ya corriendo o
`cd D:\Workspace-Repos\workspace-ui\backend && npm start`).

## Global Constraints

- Título de card: mono, weight 600, `font-size: 0.8rem` único en las 4 familias (spec sección
  "Anatomía estándar", regla 4).
- Borde-left de 3px es el único lenguaje de color por estado/severidad — ninguna familia usa
  `border-color` completo ni `background` tintado para indicar estado (spec regla 2).
- Acciones secundarias (✎/×) siempre en la esquina derecha del header, `margin-left: auto`,
  visibles solo en hover (spec regla 1) — ya así en `.infra-card`, no tocar ese comportamiento.
- No modificar `frontend/opsmap-impact.js` ni nada de Mapa Operativo — fuera de alcance del spec.
- No modificar `.ssl-card-metrics` (2 columnas label/valor) — se mantiene tal cual, es
  información de otra naturaleza que las barras de `.infra-metrics` (spec, fuera de alcance).
- No crear un builder JS común de card — cada tab sigue generando su HTML propio (spec, fuera de
  alcance).
- Verificación de cada task: Playwright en vivo contra el backend corriendo en `localhost:8080`
  (no hay test automatizado de CSS/layout en este repo — el patrón de verificación de VCC para
  cambios visuales es siempre navegador real, ver memoria de proyecto VCC).

---

### Task 0: Confirmar que ningún grid usa `align-items: start`

**Contexto:** el spec (regla 3) pide altura pareja por fila de grid en las 4 familias. Un grep
sobre `frontend/style.css` durante el brainstorming ya no encontró ningún `align-items: start`
en `.ssl-grid`, `.projects-flat`, `.client-projects`, `.infra-grid` ni `#tunnels-container` — el
fix de Túneles del 2026-07-16 (ver memoria de proyecto VCC, "Ronda de 5 pedidos") lo sacó del
único lugar donde estaba. Esta task solo re-verifica que sigue así antes de tocar nada, para no
asumir sobre memoria desactualizada.

**Files:**
- Ninguno se modifica en esta task (solo verificación).

- [ ] **Step 1: Grep de confirmación**

Run: `grep -n "align-items: start" frontend/style.css` (desde `D:\Workspace-Repos\workspace-ui`)

Expected: sin resultados (exit code 1 / lista vacía).

- [ ] **Step 2: Si aparece algún resultado**

Anotar el selector exacto y la línea — se resuelve como parte de la task de la familia
correspondiente (Task 2 Proyectos, Task 3 Túneles o Task 4 SSL), no acá. Si no aparece nada,
seguir directo a Task 1.

---

### Task 1: Unificar `.infra-card` como línea base documentada

**Contexto:** `.infra-card` ya cumple el estándar (header con dot+id+badges+✎/× a la derecha,
border-left de 3px por riesgo, título mono 600). Esta task no cambia su comportamiento — agrega
el comentario de referencia en el CSS para que las 3 tasks siguientes tengan un ancla clara, y
confirma el tamaño de fuente exacto que las demás van a igualar.

**Files:**
- Modify: `frontend/style.css:2038` (bloque `.infra-card`)

**Interfaces:**
- Produces: `0.8rem` como el tamaño de fuente de título estándar que consumen Task 2, 3 y 4.

- [ ] **Step 1: Confirmar el tamaño actual de `.infra-id`**

Run (desde `D:\Workspace-Repos\workspace-ui`): `grep -n "\.infra-id {" -A 8 frontend/style.css`

Expected: bloque con `font-size: 0.78rem;`.

- [ ] **Step 2: Subir a 0.8rem y agregar el comentario de referencia**

En `frontend/style.css`, reemplazar el bloque `.infra-card {` (línea 2038) agregando un
comentario justo arriba, y el bloque `.infra-id {` (línea ~2065) cambiando el tamaño:

```css
/* ── Card estándar VCC — implementación de referencia ─────
   Anatomía: header (dot + título 0.8rem mono 600 + badges + ✎/× a la derecha)
   + meta lines (0.72rem) + sección opcional + footer opcional.
   Ver docs/superpowers/specs/2026-07-16-estandarizacion-cards-design.md
   Proyectos/Túneles/SSL migran a este mismo tamaño de título y regla de borde-left. ── */
.infra-card {
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  padding: 14px;
  transition: border-color 0.12s;
}
```

```css
.infra-id {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Verificar en vivo**

Con el backend corriendo (`vcc` o `npm start` en `backend/`), abrir `http://localhost:8080`,
tab Inventario. Confirmar que los títulos de card siguen en una sola línea con ellipsis y que
visualmente el cambio de 0.78→0.8rem es imperceptible salvo comparado con una regla — es el
punto de referencia, no debe romper nada.

- [ ] **Step 4: Commit**

```bash
git add frontend/style.css
git commit -m "docs(css): documentar infra-card como referencia del estándar de cards, título a 0.8rem"
```

---

### Task 2: Migrar `.project-card` (Proyectos)

**Files:**
- Modify: `frontend/style.css:1115-1121` (bloque `.project-card-name`)

**Interfaces:**
- Consumes: `0.8rem` (Task 1) como tamaño de título estándar.

- [ ] **Step 1: Cambiar el tamaño de `.project-card-name`**

En `frontend/style.css`, el bloque actual (línea 1115):

```css
.project-card-name {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
  flex: 1;
}
```

Cambiar a:

```css
.project-card-name {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

(se agregan `min-width:0` + `overflow`/`ellipsis` porque `.project-card-name` no los tenía —
sin `min-width:0` en un flex item, `text-overflow:ellipsis` no corta con nombres de proyecto
largos, mismo comportamiento que ya tiene `.infra-id`.)

- [ ] **Step 2: Verificar en vivo**

Recargar `http://localhost:8080`, tab Proyectos. Confirmar que los nombres de proyecto largos
(si los hay) truncan con ellipsis en vez de desbordar la card, y que el header (dot + nombre +
badge de tipo) se ve alineado igual que antes, solo con el título levemente más grande.

- [ ] **Step 3: Commit**

```bash
git add frontend/style.css
git commit -m "style(cards): unificar project-card-name a 0.8rem (estándar VCC)"
```

---

### Task 3: Migrar `.tunnel-card` (Túneles) — border-left por estado en vez de tinte completo

**Files:**
- Modify: `frontend/style.css:1831-1930` (bloque `.tunnel-card` y modificadores)

**Interfaces:**
- Consumes: `0.8rem` (Task 1). Clases JS existentes `tunnel-card`, `tunnel-prod`, `tunnel-adhoc`
  (definidas en `frontend/modules/tabs/tunnels.js:42`, no se tocan — solo cambia su CSS).

- [ ] **Step 1: Reemplazar el tinte de `.tunnel-prod` por border-left**

En `frontend/style.css`, el bloque actual (línea 1843):

```css
.tunnel-card.tunnel-prod {
  border-color: rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.02);
}
```

Reemplazar por:

```css
.tunnel-card.tunnel-prod {
  border-left: 3px solid var(--danger);
}
```

(`var(--danger)` es el mismo token que usa `.infra-card.risk-critico` — producción es el caso de
mayor severidad entre los túneles, coherente con el resto del sistema de color.)

- [ ] **Step 2: Dejar `.tunnel-adhoc` como está**

`.tunnel-card.tunnel-adhoc { border-style: dashed; opacity: 0.9; }` (línea 1848) ya usa un
lenguaje distinto al de tinte de color (dashed = "no permanente"), no un color de severidad —
coherente con `.ssl-card.ssl-status-error` que también usa `border-left-style: dashed` para
"estado desconocido, no error confirmado". No se modifica.

- [ ] **Step 3: Unificar tamaño de título**

En `frontend/style.css`, el bloque `.tunnel-card-name` (línea 1919):

```css
.tunnel-card-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 7px;
}
```

Cambiar `font-size: 0.85rem;` a `font-size: 0.8rem;` (resto del bloque sin cambios).

- [ ] **Step 4: Verificar en vivo**

Recargar `http://localhost:8080`, tab Túneles SSH. Confirmar:
- El túnel de producción (`prod: true` en `tunnels-config.json`) ahora muestra borde-left rojo
  de 3px en vez de fondo/borde completo teñido.
- Los túneles ad-hoc siguen con borde dashed.
- Las cards de una misma fila mantienen altura pareja (Task 0 ya confirmó que no hay
  `align-items: start` interfiriendo).
- El footer con el botón Abrir/Cerrar sigue anclado abajo (`margin-top: auto` en
  `.tunnel-card-footer`, sin cambios).

- [ ] **Step 5: Commit**

```bash
git add frontend/style.css
git commit -m "style(cards): tunnel-card usa border-left por estado (no tinte completo) + título a 0.8rem"
```

---

### Task 4: Migrar `.ssl-card` (SSL) — título a 0.8rem

**Files:**
- Modify: `frontend/style.css:1696` (bloque `.ssl-card-domain`)

**Interfaces:**
- Consumes: `0.8rem` (Task 1).

- [ ] **Step 1: Cambiar el tamaño de `.ssl-card-domain`**

En `frontend/style.css`, el bloque actual (línea 1696):

```css
.ssl-card-domain { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 0.7rem; color: var(--text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
```

Cambiar `font-size: 0.7rem;` a `font-size: 0.8rem;` (resto de la línea sin cambios — ya tiene
`min-width:0`, `white-space:nowrap`, `overflow:hidden`, `text-overflow:ellipsis`, no hace falta
agregar nada más).

- [ ] **Step 2: Verificar en vivo**

Recargar `http://localhost:8080`, tab SSL, las 4 vistas (vencimiento/empresa/dominio/listado).
Confirmar que dominios largos (30+ caracteres, ya documentados como caso conocido en la memoria
de proyecto VCC) siguen truncando con ellipsis y no desbordan la card con el título más grande.
Confirmar que las métricas (Vence en / Fecha, 2 columnas) no se tocaron.

- [ ] **Step 3: Commit**

```bash
git add frontend/style.css
git commit -m "style(cards): unificar ssl-card-domain a 0.8rem (estándar VCC)"
```

---

### Task 5: Verificación final cruzada + actualizar memoria

**Files:**
- Ninguno de código — solo verificación y documentación de memoria (fuera de este repo, en
  `AI-Workspace`).

- [ ] **Step 1: Recorrido visual de las 4 familias en la misma sesión de navegador**

Con Playwright (o navegador manual), visitar en orden: Inventario, Links, MCPs, Agentes,
Proyectos, Túneles SSH, SSL. Confirmar:
- Todos los títulos de card se leen al mismo tamaño relativo.
- Las acciones ✎/× (donde existen) están en la esquina derecha del header en todos los módulos
  que las tienen.
- Ningún módulo perdió información que mostraba antes de este plan (comparar contra lo
  documentado en la memoria de proyecto VCC, sección de cada módulo).

- [ ] **Step 2: Correr la suite de tests backend (nada de esto debería tocar backend, es solo
  red de seguridad)**

Run (desde `D:\Workspace-Repos\workspace-ui\backend`): `npm test`

Expected: mismos resultados que antes de este plan (42/42 o el conteo vigente al momento de
correrlo) — ningún test de backend debería verse afectado por cambios de CSS.

- [ ] **Step 3: Commit final si hubo algún ajuste de Step 1**

Si el recorrido visual encontró algo (ej. Task 0 había detectado un `align-items: start`
pendiente y no se resolvió en su task correspondiente), resolverlo acá con su propio commit
antes de cerrar.
