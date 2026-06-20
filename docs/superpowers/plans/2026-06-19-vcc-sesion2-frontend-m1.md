# VCC Sesión 2 — Frontend M1 (Workspace Hub) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el frontend del ValeraIA Command Center (Sesión 2): shell visual completo (header + sidebar + main placeholder), módulo M1 (Workspace Hub) con datos en vivo desde la API, y efecto de partículas cursor verde eléctrico.

**Architecture:** Express sirve archivos estáticos desde `workspace-ui/frontend/` en `localhost:8080`. El frontend es vanilla HTML/CSS/JS sin frameworks — tres archivos planos. `app.js` hace fetch a `/api/status` y `/api/handover`, renderiza el sidebar M1, y corre un requestAnimationFrame loop para las partículas sobre un canvas overlay fullscreen.

**Tech Stack:** Node.js + Express (ya existente), HTML5 Canvas API, CSS Custom Properties, JS ES2022 (async/await, top-level, `AbortSignal.timeout`), JetBrains Mono via Google Fonts.

## Global Constraints

- Sin frameworks JS — vanilla puro (no React, no Vue, no Alpine)
- `"type": "module"` en `backend/package.json` — todo el JS del backend usa `import/export`
- El frontend usa `<script type="module">` — misma convención
- Puerto backend: `8080` — no cambiar
- CORS backend ya configurado para `localhost` únicamente — no abrir a otras IPs
- Fuente: JetBrains Mono 400 + 600 desde Google Fonts — no cambiar
- Paleta: `--bg:#0D1117`, `--surface:#0F172A`, `--header-bg:#111827`, `--border:#1E293B`, `--green:#00E676`, `--amber:#FFAB40`, `--red:#FF5252`, `--text:#E2E8F0`, `--muted:#64748B`
- Sidebar width: `280px` fijo, no colapsable en esta sesión
- Polling interval: `30000ms`
- Partículas: spawn 2 por mousemove, 60 frames de vida, color `#00E676`

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `workspace-ui/backend/server.js` | Modificar | Agregar `express.static('../frontend')` |
| `workspace-ui/frontend/index.html` | Crear | Shell HTML: header, sidebar, main, canvas, imports |
| `workspace-ui/frontend/style.css` | Crear | Variables CSS, layout grid, sidebar, animaciones semáforo |
| `workspace-ui/frontend/app.js` | Crear | Fetch API, render sidebar M1, polling, partículas canvas |

---

## Task 1: Backend sirve el frontend

**Files:**
- Modify: `workspace-ui/backend/server.js`
- Create: `workspace-ui/frontend/index.html` (scaffold mínimo)
- Create: `workspace-ui/frontend/style.css` (vacío)
- Create: `workspace-ui/frontend/app.js` (vacío)

**Interfaces:**
- Produce: `GET http://localhost:8080/` → sirve `frontend/index.html`

- [ ] **Step 1: Agregar express.static a server.js**

Abrir `workspace-ui/backend/server.js` y reemplazar:

```js
import express from 'express';
import { existsSync } from 'fs';
import { SERVER, PATHS } from './config.js';
```

por:

```js
import express from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { SERVER, PATHS } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
```

Luego agregar esta línea justo antes de `app.use('/api/handover', handoverRouter)`:

```js
app.use(express.static(path.join(__dirname, '../frontend')));
```

El bloque de rutas debe quedar así:

```js
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/handover', handoverRouter);
app.use('/api/index',    indexRouter);
app.use('/api/registry', registryRouter);
app.use('/api/status',   statusRouter);
```

- [ ] **Step 2: Crear frontend/index.html mínimo**

Crear `workspace-ui/frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>VCC</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <p style="color:white">VCC cargando...</p>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Crear frontend/style.css y frontend/app.js vacíos**

```
workspace-ui/frontend/style.css  → archivo vacío
workspace-ui/frontend/app.js     → archivo vacío (o `console.log('VCC app.js cargado')`)
```

- [ ] **Step 4: Verificar que el servidor sirve el frontend**

```powershell
# Terminal 1 — en workspace-ui/backend/
node server.js
```

Salida esperada:
```
VCC Backend iniciado en http://localhost:8080

  ✓ HANDOVER.md
  ✓ INDEX.md
  ✓ WORKSPACE_MAP.md
  ✓ projects-registry.json
```

Abrir browser en `http://localhost:8080/`.  
Debe mostrar: "VCC cargando..." en texto blanco sobre fondo negro (sin CSS aún).  
Si aparece 404: verificar que `frontend/index.html` existe y que el path en `express.static` es correcto.

- [ ] **Step 5: Verificar que la API sigue funcionando**

```
GET http://localhost:8080/api/status
```

Debe seguir devolviendo JSON con `freshness`, `host`, `pendientes`.  
Si devuelve HTML (el index.html): el static middleware está capturando las rutas API — verificar que `express.static` está antes de las rutas en `server.js` (está bien) pero que ningún archivo en `frontend/` se llama `api`.

---

## Task 2: HTML completo + CSS

**Files:**
- Modify: `workspace-ui/frontend/index.html` — estructura completa
- Modify: `workspace-ui/frontend/style.css` — variables, layout, sidebar, animaciones

**Interfaces:**
- Consume: nada (solo CSS/HTML estáticos)
- Produce: página con layout header/sidebar/main visible, sidebar con secciones sin datos reales aún

- [ ] **Step 1: Reemplazar index.html con la estructura completa**

Reemplazar `workspace-ui/frontend/index.html` con:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VCC — ValeraIA Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="particles"></canvas>

  <header class="header">
    <span class="logo">◆ VCC</span>
    <span class="header-host" id="host">—</span>
    <span class="freshness-badge">
      <span class="dot" id="freshness-dot"></span>
      <span id="freshness-label">—</span>
    </span>
  </header>

  <div class="layout">
    <aside class="sidebar">

      <div class="sidebar-section">
        <div class="section-label">ESTADO HANDOVER</div>
        <div class="freshness-row">
          <span class="dot" id="sidebar-dot"></span>
          <span id="sidebar-freshness">cargando...</span>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-label">PROYECTO ACTIVO</div>
        <div id="project-name" class="project-name">—</div>
        <div id="project-meta" class="project-meta">—</div>
      </div>

      <div class="sidebar-section">
        <div class="section-label">PENDIENTES</div>
        <div class="pendientes-grid">
          <div class="pendiente" id="p1"><span class="p-label">P1</span><span class="p-count" id="p1-count">—</span></div>
          <div class="pendiente" id="p2"><span class="p-label">P2</span><span class="p-count" id="p2-count">—</span></div>
          <div class="pendiente" id="p3"><span class="p-label">P3</span><span class="p-count" id="p3-count">—</span></div>
          <div class="pendiente" id="p4"><span class="p-label">P4</span><span class="p-count" id="p4-count">—</span></div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-label">TÚNELES</div>
        <div class="tunnel-list">
          <div class="tunnel">
            <span class="tunnel-dot">○</span>
            <span class="tunnel-port">3307</span>
            <span class="tunnel-name">FatApp</span>
          </div>
          <div class="tunnel">
            <span class="tunnel-dot">○</span>
            <span class="tunnel-port">3308</span>
            <span class="tunnel-name">appstest</span>
          </div>
          <div class="tunnel">
            <span class="tunnel-dot">○</span>
            <span class="tunnel-port">3309</span>
            <span class="tunnel-name">appsprod</span>
            <span class="badge-prod">PROD</span>
          </div>
          <div class="tunnel">
            <span class="tunnel-dot">○</span>
            <span class="tunnel-port">3310</span>
            <span class="tunnel-name">appsdesa</span>
          </div>
        </div>
        <div class="tunnel-note">estado disponible en Sesión 3</div>
      </div>

      <div class="sidebar-section">
        <div class="section-label">HOST</div>
        <div id="host-value" class="host-value">—</div>
      </div>

      <div id="error-banner" class="error-banner hidden">⚠ sin conexión</div>

    </aside>

    <main class="main">
      <div class="placeholder">
        <div class="placeholder-title">M2 Proyectos · M3 Gobernanza</div>
        <div class="placeholder-sub">disponibles en Sesión 3</div>
      </div>
    </main>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Escribir style.css completo**

Reemplazar `workspace-ui/frontend/style.css` con:

```css
/* === Variables globales === */
:root {
  --bg:         #0D1117;
  --surface:    #0F172A;
  --header-bg:  #111827;
  --border:     #1E293B;
  --green:      #00E676;
  --amber:      #FFAB40;
  --red:        #FF5252;
  --text:       #E2E8F0;
  --muted:      #64748B;
  font-family: 'JetBrains Mono', monospace;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  overflow: hidden;
}

body {
  background: var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
}

/* === Canvas partículas === */
#particles {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  pointer-events: none;
  z-index: 999;
}

/* === Header === */
.header {
  height: 48px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--green);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  flex-shrink: 0;
  z-index: 10;
}

.logo {
  color: var(--green);
  font-weight: 600;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
}

.header-host {
  color: var(--muted);
  font-size: 0.75rem;
  flex: 1;
  text-align: center;
}

.freshness-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
}

/* === Layout === */
.layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* === Sidebar === */
.sidebar {
  width: 280px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-section {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.section-label {
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  color: var(--muted);
  margin-bottom: 10px;
}

/* === Semáforo (dot pulsante) === */
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
  vertical-align: middle;
}

.dot.fresh  { background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse-slow 2s ease-in-out infinite; }
.dot.watch  { background: var(--amber); box-shadow: 0 0 6px var(--amber); animation: pulse-mid  1.5s ease-in-out infinite; }
.dot.stale  { background: var(--red);   box-shadow: 0 0 6px var(--red);   animation: pulse-fast 1s ease-in-out infinite; }
.dot.invalid { background: var(--red);  box-shadow: 0 0 6px var(--red);   animation: blink 0.5s step-end infinite; }

@keyframes pulse-slow { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
@keyframes pulse-mid  { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
@keyframes pulse-fast { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
@keyframes blink      { 0%,100% { opacity:1; } 50% { opacity:0; } }

.freshness-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}

/* Colores de texto según frescura */
#freshness-label.fresh,  #sidebar-freshness.fresh  { color: var(--green); }
#freshness-label.watch,  #sidebar-freshness.watch  { color: var(--amber); }
#freshness-label.stale,  #sidebar-freshness.stale,
#freshness-label.invalid,#sidebar-freshness.invalid { color: var(--red); }

/* === Proyecto activo === */
.project-name {
  font-size: 0.88rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.project-meta {
  font-size: 0.73rem;
  color: var(--muted);
}

/* === Pendientes === */
.pendientes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pendiente {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8rem;
}

.p-label {
  font-size: 0.68rem;
  color: var(--muted);
}

.p-count { font-weight: 600; color: var(--muted); }

.pendiente.p1-active .p-count { color: var(--red); }
.pendiente.p2-active .p-count { color: var(--amber); }
.pendiente.p3-active .p-count,
.pendiente.p4-active .p-count { color: var(--text); }

/* === Túneles === */
.tunnel-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.tunnel {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.78rem;
}

.tunnel-dot { color: var(--muted); }
.tunnel-port { color: var(--text); }
.tunnel-name { color: var(--muted); flex: 1; }

.badge-prod {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--red);
  border: 1px solid rgba(255, 82, 82, 0.35);
  background: rgba(255, 82, 82, 0.08);
  border-radius: 3px;
  padding: 1px 5px;
}

.tunnel-note {
  margin-top: 9px;
  font-size: 0.63rem;
  color: var(--muted);
  opacity: 0.6;
}

/* === Host === */
.host-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--green);
}

/* === Error banner === */
.error-banner {
  margin: 14px 16px;
  padding: 8px 12px;
  background: rgba(255, 82, 82, 0.08);
  border: 1px solid rgba(255, 82, 82, 0.3);
  border-radius: 4px;
  color: var(--red);
  font-size: 0.78rem;
}

.hidden { display: none !important; }

/* === Main placeholder === */
.main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.placeholder {
  text-align: center;
}

.placeholder-title {
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 6px;
}

.placeholder-sub {
  font-size: 0.72rem;
  color: var(--border);
}
```

- [ ] **Step 3: Verificar layout visual**

Con el servidor corriendo en `localhost:8080`, recargar el browser.  
Checklist visual:
- Fondo near-black (`#0D1117`)
- Header de 48px con `◆ VCC` en verde y borde inferior verde
- Sidebar de ~280px a la izquierda con fondo levemente más claro
- Secciones ESTADO HANDOVER, PROYECTO ACTIVO, PENDIENTES, TÚNELES, HOST visibles con labels grises
- Área principal a la derecha con texto placeholder centrado
- Fuente monospace aplicada en todo el UI (verificar en DevTools → Computed)

Si la fuente no carga (sin internet): es aceptable temporalmente, el layout debe verse igual con monospace del sistema.

---

## Task 3: Fetch API + render sidebar M1

**Files:**
- Modify: `workspace-ui/frontend/app.js` — lógica completa de datos y render

**Interfaces:**
- Consume: `GET /api/status` → `{ freshness, host: { value }, pendientes: { handover: { P1, P2, P3, P4 } } }`
- Consume: `GET /api/handover` → `{ sections: { "Proyecto activo": "- Proyecto ID: ...\n- Nombre: ...\n- Ambiente: ...\n- Nivel de riesgo: ..." } }`
- Produce: sidebar M1 renderizado con datos reales + polling cada 30s

- [ ] **Step 1: Escribir app.js completo (sin partículas aún)**

Reemplazar `workspace-ui/frontend/app.js` con:

```js
// === Config ===
const API_BASE  = '';          // mismo origen — Express sirve frontend y API
const POLL_MS   = 30_000;

const RISK_ICONS = { bajo: '▲', medio: '▲▲', alto: '▲▲▲', crítico: '⬛' };
const FRESHNESS_STATES = ['fresh', 'watch', 'stale', 'invalid'];

// === Fetch ===
async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
  return res.json();
}

// === Parseo de sección Proyecto activo ===
function parseProject(sections) {
  const raw = sections['Proyecto activo'] ?? '';
  const field = (name) => {
    const m = raw.match(new RegExp(`^- ${name}:\\s*(.+)`, 'm'));
    return m ? m[1].trim() : '—';
  };
  return {
    id:   field('Proyecto ID'),
    name: field('Nombre'),
    env:  field('Ambiente'),
    risk: field('Nivel de riesgo'),
  };
}

// === Render ===
function renderFreshness(freshness) {
  const f = FRESHNESS_STATES.includes(freshness) ? freshness : 'stale';

  for (const id of ['freshness-dot', 'sidebar-dot']) {
    const el = document.getElementById(id);
    FRESHNESS_STATES.forEach(s => el.classList.remove(s));
    el.classList.add(f);
  }

  for (const id of ['freshness-label', 'sidebar-freshness']) {
    const el = document.getElementById(id);
    FRESHNESS_STATES.forEach(s => el.classList.remove(s));
    el.classList.add(f);
    el.textContent = f;
  }
}

function renderHost(hostValue) {
  document.getElementById('host').textContent       = hostValue ?? '—';
  document.getElementById('host-value').textContent = hostValue ?? '—';
}

function renderPendientes(handoverCounts) {
  const map = [
    { elId: 'p1', countId: 'p1-count', key: 'P1', cls: 'p1-active' },
    { elId: 'p2', countId: 'p2-count', key: 'P2', cls: 'p2-active' },
    { elId: 'p3', countId: 'p3-count', key: 'P3', cls: 'p3-active' },
    { elId: 'p4', countId: 'p4-count', key: 'P4', cls: 'p4-active' },
  ];
  for (const { elId, countId, key, cls } of map) {
    const count = handoverCounts[key] ?? 0;
    const el    = document.getElementById(elId);
    document.getElementById(countId).textContent = count;
    ['p1-active','p2-active','p3-active','p4-active'].forEach(c => el.classList.remove(c));
    if (count > 0) el.classList.add(cls);
  }
}

function renderProject(project) {
  const icon = RISK_ICONS[project.risk] ?? '';
  document.getElementById('project-name').textContent =
    project.id !== '—' ? project.id : project.name;
  document.getElementById('project-meta').textContent =
    `${project.env} · ${icon} ${project.risk}`.replace('  ', ' ');
}

function showError(visible) {
  document.getElementById('error-banner').classList.toggle('hidden', !visible);
}

// === Update principal ===
async function update() {
  try {
    const [status, handover] = await Promise.all([
      get('/api/status'),
      get('/api/handover'),
    ]);

    renderFreshness(status.freshness);
    renderHost(status.host?.value);
    renderPendientes(status.pendientes.handover);
    renderProject(parseProject(handover.sections));
    showError(false);
  } catch (err) {
    console.error('[VCC] update error:', err.message);
    showError(true);
  }
}

update();
setInterval(update, POLL_MS);
```

- [ ] **Step 2: Verificar datos reales en sidebar**

Recargar `http://localhost:8080/`.  
Checklist:
- ESTADO HANDOVER: dot animado con color correcto (amber para `watch`), texto `watch`
- PROYECTO ACTIVO: muestra `fatapp-web`, `prod · ▲ bajo`
- PENDIENTES: P1=1 en rojo, P2=1 en amber, P3=1, P4=1
- HOST: `ROG-STRIX` en verde
- TÚNELES: 4 filas con `○` en gris (sin estado)
- Sin banner de error visible

Si los datos no aparecen: abrir DevTools → Console. Buscar `[VCC] update error`. Si hay error de CORS: verificar que el fetch usa path relativo (`/api/status`, no `http://localhost:8080/api/status`).

- [ ] **Step 3: Verificar polling**

En DevTools → Console, agregar temporalmente al final de `update()`:
```js
console.log('[VCC] update OK', new Date().toLocaleTimeString());
```

Esperar 30 segundos. Debe aparecer un segundo log. Eliminar el `console.log` después de confirmar.

- [ ] **Step 4: Verificar estado de error**

Detener el servidor (`Ctrl+C`). En el browser, esperar el siguiente ciclo de polling (30s) o recargar.  
Debe aparecer el banner `⚠ sin conexión` en el sidebar.  
Reiniciar el servidor → el banner desaparece al siguiente poll.

---

## Task 4: Efecto de partículas cursor

**Files:**
- Modify: `workspace-ui/frontend/app.js` — agregar sistema de partículas canvas

**Interfaces:**
- Consume: `<canvas id="particles">` ya presente en `index.html`
- Produce: partículas verdes con glow que flotan hacia arriba al mover el cursor

- [ ] **Step 1: Agregar código de partículas al inicio de app.js**

Insertar el siguiente bloque **antes** del `// === Config ===` existente en `app.js`:

```js
// === Partículas cursor ===
const canvas = document.getElementById('particles');
const ctx    = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

window.addEventListener('mousemove', (e) => {
  for (let i = 0; i < 2; i++) {
    particles.push({
      x: e.clientX,
      y: e.clientY,
      vx: (Math.random() - 0.5) * 3,
      vy: -(Math.random() * 2 + 1.5),
      size: Math.random() * 2 + 2,    // 2–4 px
      life: 60,
      maxLife: 60,
    });
  }
});

function renderParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles = particles.filter(p => p.life > 0);

  for (const p of particles) {
    p.x    += p.vx;
    p.y    += p.vy;
    p.vy   -= 0.08;           // flotación sostenida
    p.size *= 0.97;

    const alpha = p.life / p.maxLife;

    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.shadowBlur   = 8;
    ctx.shadowColor  = '#00E676';
    ctx.fillStyle    = '#00E676';
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(p.size, 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    p.life--;
  }

  requestAnimationFrame(renderParticles);
}

requestAnimationFrame(renderParticles);

```

El archivo `app.js` completo debe quedar:
1. Bloque de partículas (Task 4, arriba)
2. `// === Config ===` y todo lo demás (Task 3)

- [ ] **Step 2: Verificar partículas en browser**

Recargar `http://localhost:8080/` y mover el cursor lentamente por el área principal.  
Debe verse:
- Pequeñas partículas verdes `#00E676` que aparecen en la posición del cursor
- Flotan hacia arriba con ligera deriva lateral
- Se desvanecen y encogen hasta desaparecer (~1 segundo de vida)
- Glow verde alrededor de cada partícula
- El canvas NO bloquea clicks ni hover sobre elementos del sidebar (verificar que el sidebar sigue siendo interactivo)

Si las partículas no aparecen: DevTools → Console → verificar que no hay errores. Verificar que `canvas.width > 0` con `console.log(canvas.width, canvas.height)` en `resizeCanvas()`.

Si el sidebar no responde al hover: verificar que `#particles` tiene `pointer-events: none` en CSS.

- [ ] **Step 3: Verificar resize**

Con el browser abierto, cambiar el tamaño de la ventana (arrastrar el borde).  
Las partículas no deben quedar "fuera de pantalla" ni dejar artefactos en los bordes.  
El canvas debe cubrir siempre el viewport completo.

---

## Criterio de completitud — Sesión 2 lista cuando:

- [ ] `http://localhost:8080/` carga `index.html` servido por Express
- [ ] Sidebar muestra ESTADO HANDOVER con dot pulsante del color correcto según frescura
- [ ] Proyecto activo muestra ID, ambiente y riesgo con ícono
- [ ] Pendientes P1–P4 muestran conteos reales con colores (rojo/amber/blanco)
- [ ] HOST muestra hostname detectado desde el handover
- [ ] Sección TÚNELES visible con 4 entradas hardcodeadas y nota "Sesión 3"
- [ ] Polling cada 30s actualiza el sidebar sin recargar la página
- [ ] Backend detenido → banner `⚠ sin conexión` aparece en el sidebar
- [ ] Partículas verdes aparecen al mover el cursor
- [ ] Resize del viewport no deja artefactos en el canvas
- [ ] La API `/api/status` y demás endpoints siguen funcionando normalmente
