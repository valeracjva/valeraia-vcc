# VCC — Estandarización visual completa (iconos, títulos, inputs, botones, colores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la auditoría de estándar visual de VCC (2026-07-19, 7 dimensiones: modales/inputs/títulos/etiquetas/botones/colores/iconografía) resolviendo los hallazgos crítico/importante restantes: código muerto (`cockpit.js`), iconografía mezclada (emoji a color en sidebar/Vault/Túneles/Inventario), un `view-title` huérfano sin CSS, títulos de módulo (`apis.js`) sin clase propia, un hex de color duplicado sin token, inputs de Túneles fuera del helper compartido, y una colisión de CSS en botones legacy.

**Architecture:** 7 tasks, cada una acotada a un subconjunto de archivos, ejecutadas secuencialmente (no en paralelo — varias tocan `frontend/style.css` y `frontend/index.html` en más de una task). Sin cambios de backend.

**Tech Stack:** Vanilla JS (ES modules), `node:test` + `node:assert/strict`, CSS plano.

## Global Constraints

- No modificar backend ni ningún archivo fuera de `frontend/` y `docs/superpowers/plans/`.
- Reusar siempre los tokens de color existentes (`var(--accent)`, `var(--success)`, `var(--warning)`, `var(--danger)`, `var(--text-faint)`, `var(--accent-glow)`) — nunca hex hardcodeado nuevo.
- Iconografía: unificar a glifos geométricos monocromáticos Unicode BMP (mismo lenguaje que el sidebar `◈ ◉ ⊞ ⚙ ◇ ⊡ ⇌ ◎ ⌁ ◫ ⊕ ⛓` y Gobernanza `⬡ ⚙ ◈ ⇅ ◼ ▦ ↻`) — nunca emoji a color.
- Glifos nuevos ya decididos para este plan (no reusar en otro contexto sin motivo): `⚿` (llave/secreto), `◐` (mostrar/ver), `◑` (ocultar), `✓` (guardar/confirmar inline), `⊗` (eliminar inline, distinto de `✕` que ya se usa para cerrar/cancelar).
- Correr tests con: `node --test frontend/test/*.test.js` desde `D:\Workspace-Repos\workspace-ui`.
- Frontend estático — no hace falta reiniciar backend, solo F5 en `localhost:8080`.
- Commits en `master` directo (mismo patrón que el resto de la historia de VCC).
- Las tasks se ejecutan EN ORDEN (1→7) porque varias tocan los mismos archivos (`style.css`, `index.html`) en distintas tasks — no despachar implementadores en paralelo.

---

### Task 1: Eliminar `cockpit.js` (código muerto confirmado)

**Contexto:** `cockpit.js` no tiene ninguna entrada en el sidebar (`frontend/index.html` no lo referencia en absoluto — cero matches de "cockpit") ni ningún contenedor DOM propio. Solo se importa y se llama desde `app.js:7,130`, sin ningún elemento donde renderizar — es código inalcanzable. Tiene su propio badge de riesgo duplicado (`.cockpit-badge-risk`) que la auditoría marcó como inconsistente con `.infra-risk-badge`; en vez de arreglar la consistencia de código muerto, se borra.

**Files:**
- Delete: `frontend/modules/tabs/cockpit.js`
- Modify: `frontend/app.js:7` (quitar import), `frontend/app.js:130` (quitar la llamada)
- Modify: `frontend/style.css:2724-3024` (borrar todo el bloque `/* ── F1. Cockpit — pantalla Inicio ── */`)

**Interfaces:** ninguna — `status`, `handover`, `tunnels`, `runtime` (los 4 argumentos que recibía `renderCockpit`) siguen usándose en `app.js` para `renderFreshness`/`renderHost`/`renderPendientes`/`updateTunnelDots`/`renderBriefing`, ninguno queda huérfano al sacar la llamada.

- [ ] **Step 1: Confirmar que `cockpit.js` es inalcanzable (repetir el grep antes de borrar)**

Run: `grep -n "cockpit" frontend/index.html`
Expected: sin resultados (0 matches) — si aparece algo, DETENERSE, no borrar.

Run: `grep -rn "cockpit" frontend/modules/ frontend/app.js`
Expected: solo `frontend/app.js:7` (import) y `frontend/app.js:130` (llamada) — y el propio `frontend/modules/tabs/cockpit.js`. Ningún otro archivo debe importar nada de `cockpit.js`.

- [ ] **Step 2: Borrar el archivo**

```bash
rm frontend/modules/tabs/cockpit.js
```

- [ ] **Step 3: Quitar el import y la llamada en `app.js`**

En `frontend/app.js`, borrar la línea 7:

```javascript
import { renderCockpit } from './modules/tabs/cockpit.js';
```

Y borrar la línea (dentro de `update()`):

```javascript
    renderCockpit(status, handover.sections, tunnels, runtime, { onActivateProject: setActiveProject });
```

(No tocar ninguna otra línea de `update()` — `status`/`handover`/`tunnels`/`runtime` se siguen usando en las líneas de alrededor.)

- [ ] **Step 4: Borrar el bloque CSS de Cockpit**

En `frontend/style.css`, borrar desde:

```css
/* ── F1. Cockpit — pantalla Inicio ────────────────────── */

/* ── Inicio / Cockpit ────────────────────────────────────── */
.cockpit-grid {
```

hasta (inclusive):

```css
.cockpit-proj-active-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--accent-2);
  text-transform: uppercase;
}
```

**No borrar** las 2 líneas que vienen justo después (`/* btn-activate reutiliza btn + btn-sm... */` y `.btn-activate[data-active="true"] { ... }`) — `.btn-activate` también lo usa `frontend/modules/tabs/projects.js:526`, sigue vivo.

- [ ] **Step 5: Confirmar que no queda ninguna clase `.cockpit-*` huérfana**

Run: `grep -n "cockpit" frontend/style.css`
Expected: sin resultados (0 matches).

Run: `grep -rn "cockpit" frontend/`
Expected: sin resultados en ningún archivo (0 matches totales).

- [ ] **Step 6: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde (nada importaba nada de `cockpit.js`).

- [ ] **Step 7: Verificación visual en vivo**

Abrir `localhost:8080` → F5. Confirmar que la consola del navegador no tira ningún error de import/módulo faltante y que la pantalla de Inicio sigue funcionando igual que antes (Inicio nunca mostró el cockpit, no había contenedor).

- [ ] **Step 8: Commit**

```bash
git add -A -- frontend/modules/tabs/cockpit.js frontend/app.js frontend/style.css
git commit -m "chore: eliminar cockpit.js (código muerto, sin entrada en el sidebar)"
```

---

### Task 2: Unificar iconografía a glifos geométricos (sacar emojis a color)

**Contexto:** Además de Gobernanza (ya resuelto en una ronda anterior), quedan emojis a color en: el ícono de "Secretos" en el sidebar y en su propio título de vista, los títulos de card de Vault, los 5 botones de acción inline de Vault (mostrar/ocultar/guardar/editar/eliminar — 2 de ellos, `👁`/`✏`, además INCONSISTENTES entre sí porque `✏` no es el mismo glifo de "editar" que usa el resto de la app, `✎`), el botón "👁 Vista" de Inventario, y el label "🗄 Bases de datos" de Túneles.

**Files:**
- Modify: `frontend/index.html` (3 líneas: sidebar Secretos, view-title de Secretos —también se arregla la clase en Task 3—, botón Vista de Inventario)
- Modify: `frontend/modules/tabs/vault.js` (6 líneas: card title + 5 botones inline)
- Modify: `frontend/modules/tabs/tunnels.js:93` (sacar el emoji del label, sin reemplazo — los demás `.view-section-label` de la app no llevan ícono)

**Interfaces:** ninguna — solo cambia texto/glifos dentro de template strings ya existentes.

- [ ] **Step 1: Sidebar — ícono de Secretos**

En `frontend/index.html`, reemplazar:

```html
        <button class="tab-btn nav-item" data-tab="vault" title="Secretos">
          <span class="nav-icon">🔑</span>
          <span class="nav-label">Secretos</span>
        </button>
```

por:

```html
        <button class="tab-btn nav-item" data-tab="vault" title="Secretos">
          <span class="nav-icon">⚿</span>
          <span class="nav-label">Secretos</span>
        </button>
```

- [ ] **Step 2: Botón "Vista" de Inventario**

Buscar en `frontend/index.html` el botón con texto `👁 Vista` (toggle de columnas visibles de Inventario) y reemplazar el emoji por `◐`, dejando el resto del botón igual (mismo `id`/clases, solo cambia el glifo dentro del texto).

- [ ] **Step 3: Vault — título de card**

En `frontend/modules/tabs/vault.js:86`, reemplazar:

```javascript
          <div class="vault-card-title">🔑 ${escHtml(cat.category)}</div>
```

por:

```javascript
          <div class="vault-card-title">⚿ ${escHtml(cat.category)}</div>
```

- [ ] **Step 4: Vault — botones inline en modo edición (línea 139-141)**

En `frontend/modules/tabs/vault.js`, reemplazar:

```javascript
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye-edit" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">👁</button>
          <button class="btn btn-sm btn-primary vault-icon-btn" data-vault-action="save" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Guardar">💾</button>
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="cancel" data-edit-id="${escHtml(editId)}" title="Cancelar">✕</button>
```

por:

```javascript
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye-edit" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">◐</button>
          <button class="btn btn-sm btn-primary vault-icon-btn" data-vault-action="save" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Guardar">✓</button>
          <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="cancel" data-edit-id="${escHtml(editId)}" title="Cancelar">✕</button>
```

(El botón "Cancelar" ya usaba `✕`, un glifo BMP correcto — no se toca.)

- [ ] **Step 5: Vault — botones inline en modo vista (línea 153-155)**

En `frontend/modules/tabs/vault.js`, reemplazar:

```javascript
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">${isRevealed ? '🙈' : '👁'}</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="edit" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Editar">✏</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="delete" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Eliminar">🗑</button>
```

por:

```javascript
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="toggle-eye" data-edit-id="${escHtml(editId)}" title="Mostrar/ocultar">${isRevealed ? '◑' : '◐'}</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="edit" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Editar">✎</button>
        <button class="btn btn-sm btn-ghost vault-icon-btn" data-vault-action="delete" data-category="${escHtml(category)}" data-key="${escHtml(entry.key)}" title="Eliminar">⊗</button>
```

(`✎` unifica con el ícono de "editar" que ya usa el resto de la app, ej. `.infra-edit-btn` en Inventario/SSL.)

- [ ] **Step 6: Túneles — sacar emoji del label "Bases de datos"**

En `frontend/modules/tabs/tunnels.js:93`, reemplazar:

```javascript
      dbLabel.textContent = '🗄 Bases de datos';
```

por:

```javascript
      dbLabel.textContent = 'Bases de datos';
```

(Sin ícono — coherente con el resto de los `.view-section-label` de la app, ninguno lleva emoji ni glifo.)

- [ ] **Step 7: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde (cambios de texto/template, sin lógica tocada).

- [ ] **Step 8: Verificación visual en vivo**

Abrir `localhost:8080` → F5. Confirmar: sidebar "Secretos" con `⚿`, tab Secretos abre y las cards muestran `⚿` en el título, los botones de mostrar/ocultar/guardar/editar/eliminar de un secreto muestran los glifos nuevos (sin emoji a color), botón "Vista" de Inventario con `◐`, label "Bases de datos" de Túneles sin ícono.

- [ ] **Step 9: Commit**

```bash
git add frontend/index.html frontend/modules/tabs/vault.js frontend/modules/tabs/tunnels.js
git commit -m "fix(ui): unificar iconografía a glifos geométricos (sidebar, Vault, Inventario, Túneles)"
```

---

### Task 3: Arreglar `view-title` huérfano de Secretos

**Contexto:** `frontend/index.html:360` es el ÚNICO lugar de toda la app que usa `class="view-title"` — esa clase no tiene ninguna regla en `style.css` (confirmado por la auditoría: cero matches), así que el título de la vista Secretos renderiza con tipografía default del navegador. El resto de las vistas usa `.view-section-label` (`style.css:3704`: 0.68rem, uppercase, letter-spacing, `--text-faint`).

**Files:**
- Modify: `frontend/index.html:360`

**Interfaces:** ninguna.

- [ ] **Step 1: Confirmar que `view-title` no tiene CSS y que es el único uso**

Run: `grep -n "view-title" frontend/style.css frontend/index.html`
Expected: cero resultados en `style.css`, y en `index.html` solo la línea 360.

- [ ] **Step 2: Cambiar la clase**

En `frontend/index.html`, reemplazar:

```html
            <span class="view-title">⚿ Secretos</span>
```

(el emoji ya se reemplazó por `⚿` en el Task 2 — si por algún motivo esta task corre antes que el Task 2 en un resume parcial, el texto puede seguir siendo `🔑 Secretos`; tratar cualquiera de las dos variantes como el mismo target)

por:

```html
            <span class="view-section-label">Secretos</span>
```

(Se saca también el ícono del título de vista — ninguna otra vista lo lleva, ej. "Scripts de gobernanza", "Mapa vivo del workspace", "Catálogo de APIs VCC" son solo texto.)

- [ ] **Step 3: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: sin cambios (HTML puro, sin JS).

- [ ] **Step 4: Verificación visual en vivo**

Abrir `localhost:8080` → Secretos → F5. Confirmar que el título de la vista ahora tiene el mismo estilo (tamaño, mayúsculas, color tenue) que los títulos de las demás vistas (Gobernanza, Túneles, Mapa Operativo, APIs).

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "fix(vault): título de vista usa view-section-label (antes huérfano sin CSS)"
```

---

### Task 4: Unificar títulos de `apis.js` a clases propias

**Contexto:** `apis.js` es el único módulo que usa tags semánticos crudos (`<h2>`, `<h3>`) para sus títulos en vez de un `<span>`/`<div>` con clase, y su `.apis-group-header h3` (0.88rem) queda ligeramente más grande que el estándar de título de card (0.8rem/mono/600) que ya se unificó en el resto de la app (Inventario, Proyectos, Túneles, SSL, Gobernanza) en una ronda de estandarización anterior.

**Files:**
- Modify: `frontend/modules/tabs/apis.js:27,48`
- Modify: `frontend/style.css:3411-3415` (`.apis-hero h2` → `.apis-hero-title`), `frontend/style.css:3461-3464` (`.apis-group-header h3` → `.apis-group-header .apis-group-title`, alineado al estándar de 0.8rem/mono/600)

**Interfaces:** ninguna.

- [ ] **Step 1: Cambiar el markup en `apis.js`**

En `frontend/modules/tabs/apis.js:27`, reemplazar:

```javascript
        <h2>Backend VCC local</h2>
```

por:

```javascript
        <h2 class="apis-hero-title">Backend VCC local</h2>
```

En `frontend/modules/tabs/apis.js:48`, reemplazar:

```javascript
          <h3>${escHtml(moduleName)}</h3>
```

por:

```javascript
          <h3 class="apis-group-title">${escHtml(moduleName)}</h3>
```

- [ ] **Step 2: Cambiar el CSS a selector de clase**

En `frontend/style.css`, reemplazar:

```css
.apis-hero h2 {
  margin-top: 6px;
  font-size: 1.35rem;
  color: var(--text);
}
```

por:

```css
.apis-hero-title {
  margin-top: 6px;
  font-size: 1.35rem;
  color: var(--text);
}
```

(Mismo tamaño — es un hero de página, no una card, no se alinea al estándar de 0.8rem de título de card.)

Reemplazar:

```css
.apis-group-header h3 {
  font-size: 0.88rem;
  color: var(--text);
}
```

por:

```css
.apis-group-header .apis-group-title {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text);
}
```

(Este sí es, en efecto, el título de card de cada grupo de endpoints — se alinea al estándar mono/600/0.8rem que ya usan `.infra-card-name`/`.project-card-name`/`.tunnel-card-name`/`.ssl-card-domain`/`.govern-card-name`.)

- [ ] **Step 3: Confirmar que no quedan selectors por tag huérfanos**

Run: `grep -n "apis-hero h2\|apis-group-header h3" frontend/style.css`
Expected: sin resultados (0 matches) — ambos reemplazados por selectors de clase.

- [ ] **Step 4: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests existentes siguen en verde.

- [ ] **Step 5: Verificación visual en vivo**

Abrir `localhost:8080` → APIs VCC → F5. Confirmar que el hero title ("Backend VCC local") se ve igual que antes (mismo tamaño), y que los títulos de cada grupo de endpoints ahora se ven en mono/negrita/0.8rem, consistentes con los títulos de card del resto de la app.

- [ ] **Step 6: Commit**

```bash
git add frontend/modules/tabs/apis.js frontend/style.css
git commit -m "fix(apis): títulos con clase propia en vez de tags h2/h3 crudos, alineados al estándar de card"
```

---

### Task 5: Token `--risk-alto` para el hex `#F97316` duplicado

**Contexto:** `#F97316` (el color de severidad "alto", deliberadamente sin token semántico según el comentario de `RISK_COLORS` en `inventory.js`) está hardcodeado en 2 lugares distintos que hay que mantener sincronizados a mano: `RISK_COLORS.alto` en `inventory.js` y `.infra-card.risk-alto` en `style.css`. (El tercer lugar, `.cockpit-badge-risk.risk-alto`, se borró en el Task 1 junto con todo `cockpit.js`.)

**Files:**
- Modify: `frontend/style.css` (agregar `--risk-alto: #F97316;` a `:root`, referenciarlo en `.infra-card.risk-alto`)
- Modify: `frontend/modules/tabs/inventory.js:11` (usar `var(--risk-alto)` en vez del hex literal)
- Modify: `frontend/test/inventory-risk-colors.test.js` (el test existente afirma el valor literal `'#F97316'` — pasa a afirmar `'var(--risk-alto)'`)

**Interfaces:** `RISK_COLORS.alto` sigue siendo un string usable directamente en `style="..."` inline (`var(--risk-alto)` es tan válido ahí como `var(--danger)`, mismo mecanismo que ya usan los otros 3 valores de `RISK_COLORS`).

- [ ] **Step 1: Agregar el token**

En `frontend/style.css`, en el bloque `:root` (dark, cerca de donde están `--success`/`--warning`/`--danger`, línea ~25-28), agregar una línea nueva:

```css
  --risk-alto:   #F97316;
```

(No hace falta override en el bloque de light theme — el comentario de `inventory.js` ya documenta que `alto` es la única excepción sin token semántico compartido, y no tenía variante de light antes tampoco.)

- [ ] **Step 2: Usar el token en `.infra-card.risk-alto`**

En `frontend/style.css`, reemplazar:

```css
.infra-card.risk-alto     { border-left: 3px solid #F97316; }
```

por:

```css
.infra-card.risk-alto     { border-left: 3px solid var(--risk-alto); }
```

- [ ] **Step 3: Usar el token en `RISK_COLORS`**

En `frontend/modules/tabs/inventory.js`, reemplazar:

```javascript
  alto:     '#F97316',
```

por:

```javascript
  alto:     'var(--risk-alto)',
```

- [ ] **Step 4: Actualizar el test existente**

En `frontend/test/inventory-risk-colors.test.js`, en el segundo test (`'los 4 colores de riesgo...'` o equivalente, el que hace `assert.deepEqual` de los 4 valores), cambiar la expectativa de `alto` de `'#F97316'` a `'var(--risk-alto)'`.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests en verde, incluido el test de `RISK_COLORS` actualizado.

- [ ] **Step 6: Confirmar que no queda el hex duplicado**

Run: `grep -n "F97316" frontend/style.css frontend/modules/tabs/inventory.js`
Expected: **una sola** aparición, la del `:root` (`--risk-alto: #F97316;`) — cero apariciones sueltas en el resto del CSS o del JS.

- [ ] **Step 7: Verificación visual en vivo**

Abrir `localhost:8080` → Inventario → F5. Confirmar que una card con riesgo "alto" sigue mostrando el mismo naranja que antes en el border-left, el dot y el badge (sin cambio visual, solo de origen del color).

- [ ] **Step 8: Commit**

```bash
git add frontend/style.css frontend/modules/tabs/inventory.js frontend/test/inventory-risk-colors.test.js
git commit -m "refactor(style): tokenizar --risk-alto, elimina el hex #F97316 duplicado"
```

---

### Task 6: Migrar los campos de texto simples de Túneles a `formField()`

**Contexto:** `tunnels.js` es el único módulo que arma sus inputs de formulario a mano (`.form-field`/`.form-label`/`.form-input` escritos como template string) en vez de usar el helper `formField()` de `core/dom.js` que usa el resto de la app. De los 10 campos (5 del form de edición de túnel + 5 del form ad-hoc), 6 son texto simple y migran 1:1 a `formField()`; los otros 4 (2 de puerto con `type="number"`/`min`/`max`, 2 de clave SSH con `list="ssh-keys-list"`) usan atributos HTML que `formField(label, id, value, placeholder, readonly)` no soporta hoy — forzarlos por el helper perdería el datalist o el teclado numérico. Se dejan sin tocar, con un comentario que explique por qué, en vez de ampliar el contrato del helper compartido (usado por 6+ módulos) sin que se pida explícitamente.

**Files:**
- Modify: `frontend/modules/tabs/tunnels.js:1` (agregar `formField` al import existente de `core/dom.js`)
- Modify: `frontend/modules/tabs/tunnels.js:331,332,334` (form de edición: Nombre, Remote, Forward)
- Modify: `frontend/modules/tabs/tunnels.js:424,425,427` (form ad-hoc: Nombre, Remote, Forward)

**Interfaces:** ninguna — `formField()` ya existe y no cambia de contrato.

- [ ] **Step 1: Agregar `formField` al import**

En `frontend/modules/tabs/tunnels.js`, la línea de import de `core/dom.js` gana `formField` (mantener el resto de los nombres ya importados tal cual estén, solo agregar `formField` a la lista).

- [ ] **Step 2: Migrar los 3 campos de texto simple del form de edición de túnel**

Reemplazar:

```javascript
          `<div class="form-field"><label class="form-label" for="tun-f-name">Nombre</label><input class="form-input" id="tun-f-name" value="${escHtml(tunnel?.name ?? '')}" placeholder="Nombre"></div>` +
```

por:

```javascript
          formField('Nombre', 'tun-f-name', tunnel?.name ?? '', 'Nombre') +
```

Reemplazar:

```javascript
          `<div class="form-field"><label class="form-label" for="tun-f-remote">Remote</label><input class="form-input" id="tun-f-remote" value="${escHtml(tunnel?.remote ?? '')}" placeholder="user@host"></div>` +
```

por:

```javascript
          formField('Remote', 'tun-f-remote', tunnel?.remote ?? '', 'user@host') +
```

Reemplazar:

```javascript
          `<div class="form-field"><label class="form-label" for="tun-f-forward">Forward</label><input class="form-input" id="tun-f-forward" value="${escHtml(tunnel?.forward ?? '')}" placeholder="host:3306"></div>` +
```

por:

```javascript
          formField('Forward', 'tun-f-forward', tunnel?.forward ?? '', 'host:3306') +
```

(`formField()` ya escapa el value internamente vía `escHtml` — ver `core/dom.js:63` — no hace falta escapar antes de pasarlo.)

**No tocar** las líneas de `tun-f-port` (número) ni `tun-f-key` (datalist) — dejarlas como están, son las que necesitan atributos que `formField()` no soporta.

- [ ] **Step 3: Migrar los 3 campos de texto simple del form ad-hoc**

Reemplazar:

```javascript
          `<div class="form-field"><label class="form-label" for="adhoc-name">Nombre (opcional)</label><input type="text" id="adhoc-name" class="form-input" placeholder="Mi túnel"></div>` +
```

por:

```javascript
          formField('Nombre (opcional)', 'adhoc-name', '', 'Mi túnel') +
```

Reemplazar:

```javascript
          `<div class="form-field"><label class="form-label" for="adhoc-remote">Remote (user@host)</label><input type="text" id="adhoc-remote" class="form-input" placeholder="ubuntu@10.145.2.26"></div>` +
```

por:

```javascript
          formField('Remote (user@host)', 'adhoc-remote', '', 'ubuntu@10.145.2.26') +
```

Reemplazar:

```javascript
          `<div class="form-field"><label class="form-label" for="adhoc-forward">Forward (host:port)</label><input type="text" id="adhoc-forward" class="form-input" placeholder="127.0.0.1:3306"></div>` +
```

por:

```javascript
          formField('Forward (host:port)', 'adhoc-forward', '', '127.0.0.1:3306') +
```

**No tocar** `adhoc-port` (número) ni `adhoc-key` (datalist).

- [ ] **Step 4: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests en verde (cambio de markup generado, sin lógica de negocio tocada — los `id` de los inputs quedan idénticos, así que el código que los lee por `getElementById` después de submit sigue funcionando igual).

- [ ] **Step 5: Verificación visual en vivo**

Abrir `localhost:8080` → Túneles → abrir "Gestionar" → editar un túnel existente y abrir el form ad-hoc. Confirmar que los campos Nombre/Remote/Forward se ven idénticos a como se veían antes (mismo label, mismo placeholder, mismo ancho), y que Puerto/Clave SSH siguen funcionando (datalist de claves SSH conocidas sigue apareciendo al tipear en Clave SSH).

- [ ] **Step 6: Commit**

```bash
git add frontend/modules/tabs/tunnels.js
git commit -m "refactor(tunnels): migrar campos de texto simple a formField(), dejar puerto/clave-SSH sin tocar"
```

---

### Task 7: Arreglar colisión de CSS y geometría de botones legacy

**Contexto:** `.btn-ssl-action` aparece en DOS bloques de "normalización" distintos en `frontend/style.css` con las mismas propiedades (`font-size`/`padding`/`border-radius`) redeclaradas — el segundo bloque (más abajo en el archivo) gana por orden de cascada, así que su presencia en el primer bloque es CSS muerto que nadie lee, solo confunde. Además, el primer bloque de normalización (pensado para unificar la geometría con `.btn` base) en realidad diverge de `.btn` en `border-radius` (5px vs 7px) y `padding` derecho (10px vs 11px) — el propio comentario del bloque dice que busca unificar eso, pero no lo logra.

**Files:**
- Modify: `frontend/style.css:4020-4033` (sacar `.btn-ssl-action` del primer bloque, alinear radius/padding a `.btn` base)

**Interfaces:** ninguna — solo ajusta valores CSS de selectors ya existentes, sin tocar ningún HTML/JS.

- [ ] **Step 1: Confirmar la colisión antes de tocar nada**

Run: `grep -n "btn-ssl-action" frontend/style.css`
Expected: 3 apariciones — una en el primer bloque de normalización (~línea 4022), una en el segundo bloque compacto (~línea 4035), y una en `frontend/style.css:2145`... (verificar el número real con el grep, no asumir).

- [ ] **Step 2: Sacar `.btn-ssl-action` del primer bloque y alinear geometría a `.btn`**

Reemplazar:

```css
.btn-ssl-refresh,
.btn-ssl-manage,
.btn-ssl-action,
.btn-project-add,
.btn-manage-close,
.btn-modal-ok, .btn-modal-cancel,
.btn-clear,
.btn-infra-monitored {
  font-size: 0.72rem;
  font-family: var(--font-ui);
  border-radius: 5px;
  padding: 5px 10px;
  white-space: nowrap;
}
```

por:

```css
.btn-ssl-refresh,
.btn-ssl-manage,
.btn-project-add,
.btn-manage-close,
.btn-modal-ok, .btn-modal-cancel,
.btn-clear,
.btn-infra-monitored {
  font-size: 0.72rem;
  font-family: var(--font-ui);
  border-radius: 7px;
  padding: 5px 11px;
  white-space: nowrap;
}
```

(`.btn-ssl-action` se saca de la lista porque el bloque de abajo, `.btn-manage-edit, .btn-manage-del, .btn-ssl-action { font-size: 0.68rem; padding: 3px 8px; border-radius: 4px; }`, ya lo sobreescribe por completo — dejarlo acá era código muerto. `border-radius`/`padding` del resto de la lista pasan a ser byte-idénticos a `.btn` base, en vez de divergir en 2px/1px sin motivo.)

**No tocar** el segundo bloque (`.btn-manage-edit, .btn-manage-del, .btn-ssl-action { font-size: 0.68rem; ... }`) — es un tier de tamaño "compacto" deliberado para botones inline de fila (Editar/Eliminar en tablas de gestión), no una divergencia accidental; se conserva tal cual.

- [ ] **Step 3: Confirmar que la colisión se resolvió**

Run: `grep -n "btn-ssl-action" frontend/style.css`
Expected: ahora `.btn-ssl-action` aparece una sola vez en las reglas de normalización (en el bloque compacto), no en las dos.

- [ ] **Step 4: Correr la suite completa**

Run: `node --test frontend/test/*.test.js`
Expected: todos los tests en verde (cambio de CSS puro).

- [ ] **Step 5: Verificación visual en vivo**

Abrir `localhost:8080` → F5. Comparar visualmente un botón `.btn-ssl-manage`/`.btn-project-add`/`.btn-clear` contra un `.btn` genérico (ej. "＋ Agregar" de Links) — deben verse con el mismo radio de borde ahora. Confirmar que los botones compactos `.btn-manage-edit`/`.btn-manage-del`/`.btn-ssl-action` (Editar/Eliminar de filas de tabla) NO cambiaron de tamaño respecto a antes (siguen en el tier 0.68rem/compacto).

- [ ] **Step 6: Commit**

```bash
git add frontend/style.css
git commit -m "fix(style): sacar colisión de CSS en .btn-ssl-action, alinear geometría de botones legacy a .btn base"
```

---

## Self-Review

**Spec coverage:** las 7 dimensiones de la auditoría (modales, inputs, títulos, etiquetas, botones, colores, iconografía) tienen cobertura: iconografía (Task 2), títulos (Task 3, Task 4), inputs (Task 6), botones (Task 7), colores (Task 5), y una limpieza de código muerto que afectaba a "etiquetas"/badges duplicados (Task 1). Quedan explícitamente FUERA de este plan (por decisión — no son hallazgos accionables sin más contexto o son de alcance mucho mayor): la migración completa de `btn-ssl-*`/`btn-manage-*` a clases `.btn` reales en el HTML de 6+ módulos (Task 7 solo resuelve la colisión CSS y la geometría, no reescribe el markup), la redacción no uniforme de placeholders ("coma-separado" vs "separados por coma") y la etiqueta en inglés `notes` de `projects.js:779` (cosmético, no incluido), y la auditoría por-callsite de `confirmDialog(danger=true)` en cada confirmación destructiva (requiere revisar cada invocación, no es un fix puntual).

**Placeholder scan:** sin TBD/TODO, código completo en cada step.

**Type consistency:** `RISK_COLORS` mantiene el mismo shape en Task 5 (solo cambia el valor de `alto` de hex a `var()`); `formField()` no cambia de firma en Task 6, solo gana call-sites nuevos.

**Ambigüedad:** ninguna — cada task tiene contenido exacto antes/después. Orden de ejecución explícito (1→7, secuencial) por solapamiento de archivos entre tasks.
