# VCC — Fix de los 3 hallazgos críticos de la auditoría de diseño Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver los 3 hallazgos críticos de la auditoría de diseño de VCC (2026-07-19): colores de riesgo desincronizados de los design tokens en Inventario, estados vacío/cargando faltantes en Proyectos y Gobernanza, y CSS legacy muerto que sobrevivió a la migración de Proyectos/SSL al patrón `formField()`.

**Architecture:** Tres fixes independientes y de bajo riesgo sobre el mismo repo (`D:\Workspace-Repos\workspace-ui`, SPA vanilla JS sin build step). Sin cambios de backend, sin cambios de schema, sin endpoints nuevos.

**Tech Stack:** Vanilla JS (ES modules), `node:test` + `node:assert/strict` para unit tests, CSS plano (`frontend/style.css`), sin framework ni bundler.

## Global Constraints

- No modificar backend ni `~/.mcp.json` ni ningún archivo fuera de `frontend/` y `docs/superpowers/plans/`.
- Todo módulo de VCC reusa los tokens de color existentes (`var(--success)`, `var(--warning)`, `var(--danger)`, `var(--accent)`, etc. definidos en `frontend/style.css:1-110`) — nunca hex hardcodeado nuevo.
- El único caso ya aceptado en el repo de color "fuera de token" es `alto` = `#F97316` literal (mismo valor usado en `.infra-card.risk-alto`, `.cockpit-badge-risk.risk-alto`, `.api-risk.risk-alto`) — mantener ese precedente, no inventar un token nuevo para esto.
- Reusar la clase `.infra-loading` (ya usada en Inventario/Links) para cualquier mensaje de estado vacío/cargando nuevo — no crear una clase paralela.
- Correr tests con: `node --test frontend/test/*.test.js` desde `D:\Workspace-Repos\workspace-ui`.
- Frontend es estático (JS/CSS) — no hace falta reiniciar el backend para ver estos cambios, solo F5 en `localhost:8080`.
- Commits en `master` directo (mismo patrón que el resto de la historia de VCC en `git log`), uno por task.

---

### Task 1: Sincronizar `RISK_COLORS` de Inventario con los design tokens

**Contexto del bug:** `frontend/modules/tabs/inventory.js:7-12` define `RISK_COLORS` con hex propios (`#00E676`, `#FFD600`, `#FF6D00`, `#FF1744`) que **no coinciden** con los tokens que ya usa el border-left de la misma card (`frontend/style.css:2143-2146`: `var(--success)` `#22C55E`, `var(--warning)` `#F59E0B`, `#F97316`, `var(--danger)` `#EF4444`). Resultado real y verificable: el borde izquierdo de una card `risk-critico` es rojo `#EF4444`, pero el dot y el badge de esa misma card (pintados inline desde `RISK_COLORS` en `inventory.js:99-100` y `inventory.js:355`) son rojo `#FF1744` — dos rojos distintos en el mismo componente.

**Files:**
- Modify: `frontend/modules/tabs/inventory.js:7-12`
- Test: `frontend/test/inventory-risk-colors.test.js` (nuevo)

**Interfaces:**
- Produces: `RISK_COLORS` pasa de const privada a `export const RISK_COLORS` — mismo shape `{ bajo, moderado, alto, critico }`, mismos 4 keys, ahora con valores `'var(--xxx)'` o el hex literal ya usado por el resto de la app en vez de hex propios.

- [ ] **Step 1: Escribir el test que falla**

```javascript
// frontend/test/inventory-risk-colors.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RISK_COLORS } from '../modules/tabs/inventory.js';

test('RISK_COLORS usa los mismos tokens que .infra-card.risk-* en style.css', () => {
  assert.equal(RISK_COLORS.bajo, 'var(--success)');
  assert.equal(RISK_COLORS.moderado, 'var(--warning)');
  assert.equal(RISK_COLORS.alto, '#F97316');
  assert.equal(RISK_COLORS.critico, 'var(--danger)');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test frontend/test/inventory-risk-colors.test.js`
Expected: FAIL — `RISK_COLORS.bajo` es `'#00E676'`, no `'var(--success)'` (y `RISK_COLORS` no está exportado, así que primero falla el import).

- [ ] **Step 3: Exportar y corregir `RISK_COLORS`**

En `frontend/modules/tabs/inventory.js`, reemplazar:

```javascript
// === M4 — Inventario Infra ===
const RISK_COLORS = {
  bajo:     '#00E676',
  moderado: '#FFD600',
  alto:     '#FF6D00',
  critico:  '#FF1744',
};
```

por:

```javascript
// === M4 — Inventario Infra ===
// Mismos tokens que .infra-card.risk-* en style.css (border-left) — alto queda
// en hex literal a propósito, mismo valor ya usado ahí y en cockpit/api-risk.
export const RISK_COLORS = {
  bajo:     'var(--success)',
  moderado: 'var(--warning)',
  alto:     '#F97316',
  critico:  'var(--danger)',
};
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test frontend/test/inventory-risk-colors.test.js`
Expected: PASS

- [ ] **Step 5: Correr la suite completa (nada más debería cambiar de comportamiento)**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde (el shape de `RISK_COLORS` no cambió, solo los valores).

- [ ] **Step 6: Verificación visual en vivo**

Abrir `localhost:8080` → Inventario, confirmar con F5 que el dot y el badge de una card `risk-critico`/`risk-alto`/`risk-moderado`/`risk-bajo` ahora tienen el MISMO color que el border-left de esa card (antes eran dos rojos/verdes/amarillos distintos).

- [ ] **Step 7: Commit**

```bash
git add frontend/modules/tabs/inventory.js frontend/test/inventory-risk-colors.test.js
git commit -m "fix(inventory): sincronizar RISK_COLORS con los tokens de .infra-card.risk-*"
```

---

### Task 2: Agregar estados vacío/cargando a Proyectos y Gobernanza

**Contexto del bug:** Todos los demás módulos con datos remotos (Inventario `frontend/modules/tabs/inventory.js:317` `Cargando inventario...`, Links `frontend/modules/tabs/links.js:144` `No hay links guardados todavía.`) muestran un mensaje mientras cargan y otro si la lista queda vacía, reusando `.infra-loading`. Proyectos (`renderProjects` en `frontend/modules/tabs/projects.js:146`) no tiene ninguno de los dos: si `projects` viene vacío, el `container` queda con `innerHTML = ''` sin ningún mensaje. Gobernanza (`initGovern` en `frontend/modules/tabs/govern.js:124`) tampoco: si `GOVERN_SCRIPTS` estuviera vacío, `#govern-grid` quedaría en blanco sin explicación.

**Files:**
- Modify: `frontend/modules/tabs/projects.js:43-55` (`loadProjects`) y `frontend/modules/tabs/projects.js:146-153` (`renderProjects`)
- Modify: `frontend/modules/tabs/govern.js:124-127` (`initGovern`)
- No test nuevo — son cambios de wiring de DOM directo sobre `innerHTML`, sin lógica pura para extraer (mismo criterio ya usado en el repo para tasks de wiring puro, ver `docs/superpowers/plans/2026-07-16-buscador-links.md` Task 2). Se verifica con el navegador en el Step de verificación en vivo.

**Interfaces:**
- Consumes: ninguna interfaz nueva de otro task.
- Produces: ningún export nuevo — cambio interno de renderizado.

- [ ] **Step 1: Loading state en `loadProjects()`**

En `frontend/modules/tabs/projects.js`, modificar `loadProjects`:

```javascript
export async function loadProjects() {
  const container = document.getElementById('projects-container');
  container.innerHTML = '<div class="infra-loading">Cargando proyectos...</div>';
  try {
    const res = await fetch(`${API_BASE}/api/registry`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    registryData = await res.json();
    registryHash = res.headers.get('X-Registry-Hash') || res.headers.get('ETag')?.replaceAll('"', '') || null;
    document.getElementById('projects-hash').textContent = registryHash ? registryHash.slice(0, 12) : 'sin hash';
    renderProjects(registryData.projects);
  } catch (e) {
    console.error('[VCC] loadProjects error:', e.message);
    showProjectsBanner('No se pudo cargar el registry.', true);
  }
}
```

(Único cambio real: las 2 líneas nuevas al principio que muestran el loading antes del `fetch`.)

- [ ] **Step 2: Empty state en `renderProjects()`**

En `frontend/modules/tabs/projects.js`, al principio de `renderProjects`, después de limpiar el container:

```javascript
function renderProjects(projects) {
  const container = document.getElementById('projects-container');
  container.innerHTML = '';

  if (!projects.length) {
    container.innerHTML = '<div class="infra-loading">No hay proyectos registrados todavía.</div>';
    return;
  }

  if (projectsGroupBy === 'list') {
```

(El resto de la función queda igual — solo se agrega el guard de 4 líneas antes del `if (projectsGroupBy === 'list')` ya existente.)

- [ ] **Step 3: Empty state defensivo en `initGovern()`**

En `frontend/modules/tabs/govern.js`, modificar el principio de `initGovern`:

```javascript
export function initGovern() {
  const grid = document.getElementById('govern-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!GOVERN_SCRIPTS.length) {
    grid.innerHTML = '<div class="infra-loading">No hay scripts de gobernanza configurados.</div>';
    return;
  }

  for (const s of GOVERN_SCRIPTS) {
```

(`GOVERN_SCRIPTS` es una lista hardcodeada de 7 elementos hoy, así que este guard no cambia el comportamiento visible actual — es defensivo para el día que la lista se vuelva dinámica.)

- [ ] **Step 4: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde (ningún test cubre `renderProjects`/`initGovern` hoy, así que esto solo confirma que no rompiste algo importado por otro archivo de test).

- [ ] **Step 5: Verificación visual en vivo**

Abrir `localhost:8080` → F5. En Proyectos: confirmar que durante la carga aparece brevemente "Cargando proyectos..." (se puede forzar con throttling de red en devtools). En Gobernanza: confirmar que las 7 cards siguen apareciendo igual que antes (el guard no debe activarse con datos reales).

- [ ] **Step 6: Commit**

```bash
git add frontend/modules/tabs/projects.js frontend/modules/tabs/govern.js
git commit -m "feat(projects,govern): agregar estados vacío/cargando faltantes"
```

---

### Task 3: Eliminar CSS legacy muerto de Proyectos y SSL

**Contexto del bug:** `frontend/style.css:1366-1398` (bloque `/* Project management / editors */`: `.project-editor-title`, `.project-form-grid`, `.project-form-field`, `.project-form-field-wide`, `.project-input`, `.project-input:focus`, `.project-input.readonly`) y `frontend/style.css:1869-1891` (bloque `/* SSL — ABM dominios */`: `.ssl-add-row`, `.ssl-input`, `.ssl-input:focus`) no tienen **ninguna** referencia en `frontend/modules/` — confirmado con grep antes de escribir este plan. Son remanentes de la UI inline pre-modal (Proyectos tenía acordeones siempre-editables, SSL tenía edición fila-por-fila con `window.prompt()`, ambos migrados a `openEditModal()`/`formField()` el 2026-07-16). Cada uno define su propio `:focus { outline: none; border-color: var(--accent); }` — exactamente el mismo estilo que ya provee `.form-input:focus` (`style.css:2662`), duplicado sin uso real. Esto es parte del pendiente ya anotado por Carlos ("sacar código legacy restante").

**Files:**
- Modify: `frontend/style.css:1366-1399` (borrar bloque completo)
- Modify: `frontend/style.css:1869-1892` (borrar bloque completo)
- No test — es CSS puro, se verifica con grep (cero referencias restantes) + verificación visual (nada debería cambiar, porque nada lo usaba).

**Interfaces:** ninguna — solo elimina reglas CSS sin selectors compartidos con otro código.

- [ ] **Step 1: Confirmar que nada más referencia estas clases (repetir el grep antes de tocar nada)**

Run: `grep -rn "project-editor-title\|project-form-grid\|project-form-field\|project-input\|ssl-add-row\|ssl-input" frontend/modules/`
Expected: sin resultados (0 matches) — si aparece algo, DETENERSE y no borrar esa clase específica.

- [ ] **Step 2: Borrar el bloque legacy de Proyectos**

En `frontend/style.css`, eliminar (dejando una sola línea en blanco entre el selector anterior y el siguiente):

```css
/* Project management / editors */
.project-editor-title { margin-bottom: 12px; color: var(--accent-2); font-weight: 600; font-size: 0.8rem; }

.project-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.project-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.project-form-field-wide { grid-column: 1 / -1; }

.project-input {
  font-family: var(--font-ui);
  font-size: 0.78rem;
  background: var(--bg);
  border: 1px solid var(--border-2);
  color: var(--text);
  border-radius: 4px;
  padding: 5px 8px;
  transition: border-color 0.12s;
}

.project-input:focus { outline: none; border-color: var(--accent); }
.project-input.readonly { color: var(--text-faint); cursor: default; }
```

- [ ] **Step 3: Borrar el bloque legacy de SSL**

En `frontend/style.css`, eliminar SOLO estas reglas (dejar `.ssl-group-*` antes y `.btn-ssl-action` después intactos, ambos siguen en uso):

```css
/* SSL — ABM dominios */
.ssl-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.ssl-input {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border-2);
  color: var(--text);
  border-radius: 4px;
  padding: 5px 8px;
  flex: 1;
  min-width: 0;
  transition: border-color 0.12s;
}

.ssl-input:focus { outline: none; border-color: var(--accent); }
```

- [ ] **Step 4: Confirmar que las clases ya no existen en el CSS**

Run: `grep -n "project-editor-title\|project-form-grid\|project-form-field\|project-input\|ssl-add-row\|ssl-input" frontend/style.css`
Expected: sin resultados (0 matches).

- [ ] **Step 5: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde (cambio de CSS puro, no toca JS).

- [ ] **Step 6: Verificación visual en vivo**

Abrir `localhost:8080` → F5. Abrir el modal de editar un Proyecto y el modal de editar un dominio SSL — confirmar que ambos siguen viéndose exactamente igual que antes del borrado (porque ya usaban `.form-input` de `formField()`, no las clases borradas).

- [ ] **Step 7: Commit**

```bash
git add frontend/style.css
git commit -m "chore(style): eliminar CSS legacy muerto de Proyectos y SSL (pre-modal)"
```

---

## Self-Review

**Spec coverage:** los 3 hallazgos críticos de la auditoría (RISK_COLORS desincronizado, estados vacío/cargando faltantes en Proyectos/Gobernanza, inputs legacy duplicando `:focus`) tienen cada uno su task. El hallazgo original asumía que `.project-input`/`.ssl-input` estaban "en uso duplicando estilos" — la investigación de código (no solo el informe del agente) encontró que en realidad están **muertos, sin ninguna referencia en JS** — el fix correcto es borrarlos, no migrarlos, que es lo que hace Task 3.

**Placeholder scan:** sin TBD/TODO, todo paso tiene código completo y comando exacto.

**Type consistency:** `RISK_COLORS` mantiene el mismo shape (`{bajo, moderado, alto, critico}`) consumido en `inventory.js:93,99,100,348,355` — solo cambian los valores, ningún call-site necesita tocarse.

**Ambigüedad:** ninguna — cada task tiene línea exacta de archivo y contenido exacto antes/después.
