# VCC — Fix de 2 hallazgos "importantes" de la auditoría de diseño Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver 2 de los hallazgos "importantes" de la auditoría de diseño de VCC (2026-07-19): iconografía mezclada en Gobernanza (glifos geométricos + emojis a color en la misma lista) y foco de teclado insuficiente en los inputs de texto principales (varios redefinen `:focus` perdiendo cualquier indicador visible más allá de un cambio de borde).

**Architecture:** Dos fixes independientes y de bajo riesgo sobre el mismo repo (`D:\Workspace-Repos\workspace-ui`, SPA vanilla JS sin build step). Sin cambios de backend.

**Tech Stack:** Vanilla JS (ES modules), `node:test` + `node:assert/strict`, CSS plano (`frontend/style.css`).

## Global Constraints

- No modificar backend ni ningún archivo fuera de `frontend/` y `docs/superpowers/plans/`.
- Decisión ya validada con el usuario (no hace falta re-preguntar): Gobernanza se unifica a **glifos geométricos monocromáticos** (mismo lenguaje que `⬡ ⚙ ◈ ⇅ ◼` ya usa), no a emoji.
- Decisión ya validada con el usuario: el fix de foco de teclado se limita a **inputs de texto** (`.form-input`/`.form-textarea`, `.modal-confirm-input`, `.json-editor-area`, `.links-search-input`). Cards/chips/filas clicables sin `tabindex` quedan fuera de alcance — es un proyecto propio, no se toca acá.
- El anillo de foco a aplicar es el mismo que ya usa `.btn:focus-visible` (`frontend/style.css:3780-3783`): `box-shadow: 0 0 0 3px var(--accent-glow), 0 0 0 1px var(--accent);` — no inventar un estilo de foco nuevo, reusar ese exacto.
- Correr tests con: `node --test frontend/test/*.test.js` desde `D:\Workspace-Repos\workspace-ui`.
- Frontend es estático — no hace falta reiniciar el backend para ver estos cambios, solo F5 en `localhost:8080`.
- Commits en `master` directo (mismo patrón que el resto de la historia de VCC).

---

### Task 1: Unificar iconografía de Gobernanza a glifos geométricos

**Contexto del bug:** `frontend/modules/tabs/govern.js` (`GOVERN_SCRIPTS`, líneas 20-79) mezcla 5 glifos geométricos monocromáticos (`⬡ ⚙ ◈ ⇅ ◼`) con 2 emojis a color (`📚` en `knowledge-organizer`, `🧹` en `daily-maintenance`) como identificador visual primario de cada card. Es el único módulo de VCC que usa emoji a color como ícono — rompe la lectura mono/geométrica del resto de la lista.

**Files:**
- Modify: `frontend/modules/tabs/govern.js:1-79` (exportar `GOVERN_SCRIPTS`, reemplazar 2 iconos)
- Test: `frontend/test/govern-icons.test.js` (nuevo)

**Interfaces:**
- Produces: `GOVERN_SCRIPTS` pasa de const privada a `export const GOVERN_SCRIPTS` — mismo shape (array de `{id, icon, name, desc, scripts}`), mismos 7 elementos, solo cambian los valores de `icon` de `knowledge-organizer` (`'📚'` → `'▦'`) y `daily-maintenance` (`'🧹'` → `'↻'`).

- [ ] **Step 1: Escribir el test que falla**

```javascript
// frontend/test/govern-icons.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOVERN_SCRIPTS } from '../modules/tabs/govern.js';

test('todos los iconos de Gobernanza son glifos geométricos monocromáticos, ningún emoji a color', () => {
  // Emojis a color caen en el rango Misc Symbols and Pictographs (U+1F300–U+1FAFF) u
  // otros bloques de emoji Unicode — los glifos geométricos usados hoy (⬡⚙◈⇅◼▦↻) son
  // todos BMP (código < U+10000).
  for (const s of GOVERN_SCRIPTS) {
    const codePoint = s.icon.codePointAt(0);
    assert.ok(
      codePoint < 0x1F000,
      `${s.id} usa un ícono fuera del rango de glifos geométricos: ${s.icon} (U+${codePoint.toString(16).toUpperCase()})`
    );
  }
});

test('los 7 scripts de Gobernanza tienen los iconos esperados', () => {
  const icons = Object.fromEntries(GOVERN_SCRIPTS.map(s => [s.id, s.icon]));
  assert.deepEqual(icons, {
    'workspace-health':    '⬡',
    'compile-agents':      '⚙',
    'web-context':         '◈',
    'sync-status':         '⇅',
    'cierre':              '◼',
    'knowledge-organizer': '▦',
    'daily-maintenance':   '↻',
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test frontend/test/govern-icons.test.js`
Expected: FAIL — `GOVERN_SCRIPTS` no está exportado (falla el import), y aunque lo estuviera, `knowledge-organizer`/`daily-maintenance` todavía tendrían `📚`/`🧹`.

- [ ] **Step 3: Exportar `GOVERN_SCRIPTS` y reemplazar los 2 iconos**

En `frontend/modules/tabs/govern.js`, cambiar la declaración:

```javascript
const GOVERN_SCRIPTS = [
```

por:

```javascript
export const GOVERN_SCRIPTS = [
```

Y dentro del mismo array, cambiar los dos iconos:

```javascript
  {
    id: 'knowledge-organizer',
    icon: '📚',
```

por:

```javascript
  {
    id: 'knowledge-organizer',
    icon: '▦',
```

y:

```javascript
  {
    id: 'daily-maintenance',
    icon: '🧹',
```

por:

```javascript
  {
    id: 'daily-maintenance',
    icon: '↻',
```

(Nada más del array cambia — `desc` y `scripts` quedan idénticos, solo los 2 valores de `icon`.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test frontend/test/govern-icons.test.js`
Expected: PASS (ambos tests)

- [ ] **Step 5: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde — `GOVERN_SCRIPTS` solo ganó el `export`, ningún otro código lo importaba antes así que no hay call-sites que romper.

- [ ] **Step 6: Verificación visual en vivo**

Abrir `localhost:8080` → Gobernanza → F5. Confirmar que las 7 cards ahora muestran únicamente glifos geométricos (sin ningún emoji a color), coherente con el resto de la lista.

- [ ] **Step 7: Commit**

```bash
git add frontend/modules/tabs/govern.js frontend/test/govern-icons.test.js
git commit -m "fix(govern): unificar iconografía a glifos geométricos, sacar emoji a color"
```

---

### Task 2: Anillo de foco de teclado en inputs de texto principales

**Contexto del bug:** 4 reglas de `frontend/style.css` redefinen `:focus` sobre inputs de texto perdiendo cualquier indicador de foco más allá de un cambio de `border-color` (sutil, insuficiente para navegación por teclado): `.form-input:focus, .form-textarea:focus` (usado por todo formulario que pasa por `formField()`/`formSelect()` de `core/dom.js`), `.modal-confirm-input:focus` (input del modal de confirmación genérico), `.json-editor-area:focus` (editor JSON de Vault/config), `.links-search-input:focus` (buscador de Links). El propio `.btn:focus-visible` (`style.css:3780-3783`) ya resuelve esto bien con un anillo `box-shadow`, pero esa solución nunca se extendió a los inputs de texto.

**Files:**
- Modify: `frontend/style.css:2606-2609` (`.form-input:focus, .form-textarea:focus`)
- Modify: `frontend/style.css:2694` (`.modal-confirm-input:focus`)
- Modify: `frontend/style.css:3605` (`.json-editor-area:focus`)
- Modify: `frontend/style.css:3739-3742` (`.links-search-input:focus`)
- No test — CSS puro, se verifica con lectura del archivo + verificación visual (mismo criterio ya usado en el Task 3 del plan anterior, `2026-07-19-vcc-criticos-auditoria-diseno.md`, para cambios de CSS sin lógica).

**Interfaces:** ninguna — solo agrega una declaración `box-shadow` a 4 reglas `:focus` existentes, sin tocar ningún otro selector.

- [ ] **Step 1: `.form-input`/`.form-textarea`**

En `frontend/style.css`, reemplazar:

```css
.form-input:focus, .form-textarea:focus {
  outline: none;
  border-color: var(--accent);
}
```

por:

```css
.form-input:focus, .form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow), 0 0 0 1px var(--accent);
}
```

- [ ] **Step 2: `.modal-confirm-input`**

Reemplazar:

```css
.modal-confirm-input:focus { outline: none; border-color: var(--accent); }
```

por:

```css
.modal-confirm-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow), 0 0 0 1px var(--accent); }
```

- [ ] **Step 3: `.json-editor-area`**

Reemplazar:

```css
.json-editor-area:focus { border-color: var(--accent); }
```

por:

```css
.json-editor-area:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow), 0 0 0 1px var(--accent); }
```

(Esta regla no tenía `outline: none` propio — ya lo hereda de la regla base `.json-editor-area` en `style.css:3602`, no tocar esa línea.)

- [ ] **Step 4: `.links-search-input`**

Reemplazar:

```css
.links-search-input:focus {
  outline: none;
  border-color: var(--accent);
}
```

por:

```css
.links-search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow), 0 0 0 1px var(--accent);
}
```

- [ ] **Step 5: Confirmar que las 4 reglas quedaron con el mismo anillo**

Run: `grep -n "accent-glow" frontend/style.css`
Expected: además de las apariciones preexistentes, las 4 líneas nuevas de `box-shadow: 0 0 0 3px var(--accent-glow), 0 0 0 1px var(--accent);` aparecen en `style.css` dentro de las reglas `:focus` de los 4 selectors tocados.

- [ ] **Step 6: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde (cambio de CSS puro, no toca JS).

- [ ] **Step 7: Verificación visual en vivo**

Abrir `localhost:8080` → F5. Con el teclado (Tab), enfocar: un campo de un modal de edición (`.form-input`), el buscador de Links (`.links-search-input`), un modal de confirmación con input (`.modal-confirm-input`, ej. Eliminar con motivo en SSL si aplica) y el editor JSON de Vault (`.json-editor-area`). Confirmar que los 4 muestran el mismo anillo violeta visible alrededor del campo, no solo un cambio sutil de borde.

- [ ] **Step 8: Commit**

```bash
git add frontend/style.css
git commit -m "fix(style): agregar anillo de foco visible a inputs de texto principales"
```

---

## Self-Review

**Spec coverage:** los 2 hallazgos "importantes" seleccionados por el usuario (iconografía de Gobernanza, foco de teclado en inputs) tienen cada uno su task, con el alcance explícitamente acotado a lo que el usuario confirmó (glifos geométricos, solo inputs de texto — no cards/chips).

**Placeholder scan:** sin TBD/TODO, código completo y comandos exactos en cada step.

**Type consistency:** `GOVERN_SCRIPTS` mantiene el mismo shape consumido en `initGovern()` (`govern.js:124-160`, no tocado por este plan) — el `for (const s of GOVERN_SCRIPTS)` sigue leyendo `s.icon`/`s.name`/`s.desc`/`s.scripts` sin cambios.

**Ambigüedad:** ninguna — cada task tiene contenido exacto antes/después y los 2 emojis/4 selectors a tocar están enumerados explícitamente.
