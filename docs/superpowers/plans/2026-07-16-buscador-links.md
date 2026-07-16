# Buscador en Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un input de búsqueda de texto libre a la toolbar del tab Links, filtrando
client-side por título/URL/nota/tags, combinado en AND con los filtros de Tipo/Estado/Favoritos
ya existentes.

**Architecture:** `filterLinks()` (función pura ya exportada en `frontend/modules/tabs/links.js`)
gana un parámetro `texto` opcional. Un nuevo input en la toolbar (`frontend/index.html`) dispara
`renderLinksView()` en cada evento `input`, igual que ya hacen los botones de filtro existentes.
Sin cambios de backend.

**Tech Stack:** HTML/CSS/JS vanilla (ES modules), tests con `node:test` (mismo runner que
`frontend/test/opsmap-impact.test.js`).

## Global Constraints

- El filtro de texto busca sobre `titulo + url + nota + tags.join(' ')`, substring simple,
  case-insensitive (`.toLowerCase()` en ambos lados, sin regex ni fuzzy matching).
- Se combina en AND con `tipo`/`estado`/`favOnly` — un solo `.filter()`, ningún filtro nuevo pisa
  a los demás ni cambia su comportamiento actual.
- Sin debounce — filtra en cada evento `input`, es un array en memoria sin llamada de red.
- No tocar backend (`backend/routes/links.js`) ni el modelo de datos de `links-inventory.json`.
- No agregar resaltado de texto ni búsqueda fuzzy — fuera de alcance (spec, sección YAGNI).

---

### Task 1: `filterLinks()` acepta `texto` opcional (TDD)

**Files:**
- Modify: `frontend/modules/tabs/links.js:53-59` (función `filterLinks`)
- Test: `frontend/test/links-filter.test.js` (nuevo)

**Interfaces:**
- Produces: `filterLinks(links, { tipo, estado, favOnly, texto })` — `texto` es un string
  opcional (default `''`/`undefined` = sin filtrar por texto, mismo comportamiento que hoy).

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/test/links-filter.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLinks } from '../modules/tabs/links.js';

function fixtureLinks() {
  return [
    { id: '1', titulo: 'Laravel Livewire docs', url: 'https://livewire.laravel.com', tipo: 'Articulo', estado: 'Pendiente', favorito: false, tags: ['laravel'], nota: '' },
    { id: '2', titulo: 'n8n workflow patterns', url: 'https://n8n.io/patterns', tipo: 'Repo', estado: 'Revisado', favorito: true, tags: ['n8n', 'automatizacion'], nota: 'Ver sección de webhooks' },
    { id: '3', titulo: 'FortiGate CLI reference', url: 'https://docs.fortinet.com', tipo: 'Otro', estado: 'Pendiente', favorito: false, tags: [], nota: 'Comandos de IPSec' },
  ];
}

test('sin texto, se comporta como antes (solo tipo/estado/favOnly)', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: '' });
  assert.equal(result.length, 3);
});

test('texto matchea por título, case-insensitive', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'LIVEWIRE' });
  assert.deepEqual(result.map(l => l.id), ['1']);
});

test('texto matchea por URL', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'fortinet.com' });
  assert.deepEqual(result.map(l => l.id), ['3']);
});

test('texto matchea por nota', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'webhooks' });
  assert.deepEqual(result.map(l => l.id), ['2']);
});

test('texto matchea por tag', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'automatizacion' });
  assert.deepEqual(result.map(l => l.id), ['2']);
});

test('texto se combina en AND con tipo', () => {
  const result = filterLinks(fixtureLinks(), { tipo: 'Repo', estado: '', favOnly: false, texto: 'n8n' });
  assert.deepEqual(result.map(l => l.id), ['2']);
  const noMatch = filterLinks(fixtureLinks(), { tipo: 'Articulo', estado: '', favOnly: false, texto: 'n8n' });
  assert.equal(noMatch.length, 0);
});

test('texto sin coincidencias devuelve vacío', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'zzz-no-existe' });
  assert.equal(result.length, 0);
});

test('texto undefined no filtra (compat con llamadas viejas)', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false });
  assert.equal(result.length, 3);
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run (desde `D:\Workspace-Repos\workspace-ui`): `node --test frontend/test/links-filter.test.js`

Expected: FAIL — `filterLinks` ignora `texto` porque el parámetro todavía no existe en la
función (los tests de matching por texto van a devolver los 3 links en vez de 1, o vacío).

- [ ] **Step 3: Implementar `texto` en `filterLinks`**

En `frontend/modules/tabs/links.js`, reemplazar el bloque actual (líneas 53-59):

```js
export function filterLinks(links, { tipo, estado, favOnly } = {}) {
  return links.filter(l =>
    (!tipo || l.tipo === tipo) &&
    (!estado || l.estado === estado) &&
    (!favOnly || l.favorito === true)
  );
}
```

Por:

```js
export function filterLinks(links, { tipo, estado, favOnly, texto } = {}) {
  const needle = (texto ?? '').trim().toLowerCase();
  return links.filter(l => {
    if (tipo && l.tipo !== tipo) return false;
    if (estado && l.estado !== estado) return false;
    if (favOnly && l.favorito !== true) return false;
    if (needle) {
      const haystack = `${l.titulo} ${l.url} ${l.nota ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `node --test frontend/test/links-filter.test.js`

Expected: PASS — 8/8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/modules/tabs/links.js frontend/test/links-filter.test.js
git commit -m "feat(links): filterLinks acepta texto opcional (título/URL/nota/tags)"
```

---

### Task 2: Input de búsqueda en la UI

**Files:**
- Modify: `frontend/index.html` (toolbar del tab Links, dentro de `.view-toolbar-start`)
- Modify: `frontend/modules/tabs/links.js` (estado `linksFilterTexto`, `renderLinksView()`,
  `initLinks()`)

**Interfaces:**
- Consumes: `filterLinks(links, { tipo, estado, favOnly, texto })` de Task 1.

- [ ] **Step 1: Agregar el input en el HTML**

En `frontend/index.html`, dentro de `.view-toolbar-start` del tab Links (antes de
`#links-tipo-filters`, línea ~329):

```html
<input type="text" class="form-input links-search-input" id="links-search" placeholder="Buscar por título, URL, nota o tag...">
```

Colocarlo como primer hijo de `.view-toolbar-start`, antes del `<div class="btn-group ..." id="links-tipo-filters">`.

- [ ] **Step 2: Estilo mínimo del input**

En `frontend/style.css`, agregar (cerca de las reglas de `.view-toolbar` / `.btn-tab` — buscar
`.view-toolbar-start` para ubicar la sección correcta):

```css
.links-search-input {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  border-radius: 6px;
  padding: 5px 10px;
  color: var(--text);
  min-width: 200px;
}
.links-search-input:focus {
  outline: none;
  border-color: var(--accent);
}
```

(reusa `var(--font-ui)`, `var(--surface-2)`, `var(--border-2)`, `var(--accent)` — tokens ya
existentes en el sistema, sin definir colores nuevos.)

- [ ] **Step 3: Estado + wiring en `links.js`**

En `frontend/modules/tabs/links.js`:

a) Agregar la variable de módulo junto a las otras 3 (cerca de la línea 41):

```js
let linksFilterTexto = '';
```

b) En `renderLinksView()` (línea ~114), pasar `texto` a `filterLinks`:

```js
const visible = filterLinks(linksAllData, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly, texto: linksFilterTexto })
```

c) En `initLinks()`, agregar el listener (junto a los otros listeners de filtro, después del de
`btn-links-fav-only`):

```js
document.getElementById('links-search')?.addEventListener('input', (e) => {
  linksFilterTexto = e.target.value;
  renderLinksView();
});
```

- [ ] **Step 4: Verificar en vivo**

Con el backend corriendo (`vcc` o `npm start` en `backend/`), abrir `http://localhost:8080`, tab
Links. Escribir en el campo de búsqueda una palabra que sepas que está en el título de un link
real — confirmar que la grilla se reduce en cada tecla y que el contador `#links-counter` se
actualiza. Combinar con un filtro de Tipo activo y confirmar que el texto sigue filtrando dentro
de ese subconjunto (AND). Borrar el texto y confirmar que vuelve a mostrar todos los links que
pasan los demás filtros.

- [ ] **Step 5: Correr toda la suite frontend**

Run: `node --test frontend/test/*.test.js`

Expected: todos los tests pasan (los ya existentes + los 8 nuevos de Task 1).

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/style.css frontend/modules/tabs/links.js
git commit -m "feat(links): input de búsqueda en la toolbar, filtra client-side en cada tecla"
```
