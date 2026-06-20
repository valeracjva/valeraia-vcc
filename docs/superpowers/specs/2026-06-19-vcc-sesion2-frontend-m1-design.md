# VCC Sesión 2 — Frontend M1 (Workspace Hub) — Spec

**Fecha:** 2026-06-19  
**Proyecto:** ValeraIA Command Center (VCC)  
**Sesión:** 2 de 4 (Fase 1 MVP)  
**Relacionado:** `knowledge/planning/20260618-Planning-VCC-ValeraIA-Command-Center.md`  
**ADR:** `knowledge/adr/ADR-009-VCC-Reemplazo-Launcher-Consola.md`  
**Estado:** Aprobado — listo para implementación

---

## Objetivo

Construir el frontend de la Sesión 2: el shell visual completo del VCC (header + sidebar + área principal) y el módulo M1 (Workspace Hub) como contenido del sidebar. Incluye el efecto de partículas cursor y el diseño visual definitivo que todas las sesiones posteriores respetan.

---

## Archivos que se crean / modifican

```
workspace-ui/
├── frontend/                 ← nuevo directorio
│   ├── index.html            ← shell HTML, imports, canvas overlay
│   ├── style.css             ← variables, layout, sidebar, animaciones
│   └── app.js                ← lógica: fetch, polling, partículas, render
└── backend/
    └── server.js             ← +1 línea: express.static('../frontend')
```

---

## Layout

El VCC tiene estructura de tres zonas fijas:

```
┌─[header 48px]─────────────────────────────────────────────┐
│  ◆ VCC  │  {host}  │                          ● {estado}  │
├─[sidebar 280px]──────┬─[main content flex-1]──────────────┤
│  M1 Workspace Hub    │  placeholder Sesión 3              │
└──────────────────────┴────────────────────────────────────┘
[canvas fullscreen — partículas cursor, pointer-events:none]
```

- **Header:** `48px`, fijo arriba. Logo ◆ VCC a la izquierda, hostname en el centro, semáforo de frescura a la derecha.
- **Sidebar:** `280px` de ancho, fijo, no colapsable en Sesión 2. Contiene M1.
- **Main:** `flex: 1`, placeholder hasta Sesión 3.
- **Canvas:** `position: fixed`, `top: 0`, `left: 0`, `width: 100vw`, `height: 100vh`, `pointer-events: none`, `z-index: 999`.

---

## Paleta y tipografía

| Variable CSS | Valor | Uso |
|---|---|---|
| `--bg` | `#0D1117` | Fondo principal y main |
| `--surface` | `#0F172A` | Sidebar, cards |
| `--header-bg` | `#111827` | Header |
| `--border` | `#1E293B` | Separadores, bordes |
| `--green` | `#00E676` | Accent, semáforo fresh, partículas |
| `--amber` | `#FFAB40` | Semáforo watch |
| `--red` | `#FF5252` | Semáforo stale/invalid, P1 |
| `--text` | `#E2E8F0` | Texto principal |
| `--muted` | `#64748B` | Labels, metadatos |

**Fuente:** `JetBrains Mono` (Google Fonts, weights 400 y 600) — aplica a todo el VCC via `font-family` en `:root`.

Header: `border-bottom: 1px solid var(--green)`.  
Sidebar: `border-right: 1px solid var(--border)`.

---

## M1 — Workspace Hub (sidebar)

El sidebar muestra las siguientes secciones en orden, separadas por línea `1px solid var(--border)`:

### 1. Estado HANDOVER

Fuente: `/api/status` → `freshness`.

```
ESTADO HANDOVER
● watch
```

- Dot pulsante con `box-shadow` glow del color del estado:
  - `fresh` → `--green`, pulso lento (2s)
  - `watch` → `--amber`, pulso medio (1.5s)
  - `stale` → `--red`, pulso rápido (1s)
  - `invalid` → `--red`, parpadeo rápido (0.5s, `animation: blink`)
- Label del estado en la misma línea, color correspondiente.

### 2. Proyecto activo

Fuente: `/api/handover` → sección `## Proyecto activo`, campos `Proyecto ID`, `Ambiente`, `Nivel de riesgo`.

```
PROYECTO ACTIVO
fatapp-web
prod  ·  ▲ bajo
```

- Nombre del proyecto en `--text`, tamaño `0.9rem`.
- Ambiente y riesgo en `--muted`, separados por ` · `.
- Icono de riesgo: `▲ bajo` / `▲▲ medio` / `▲▲▲ alto` / `⬛ crítico`.

### 3. Pendientes

Fuente: `/api/status` → `pendientes.handover` (P1–P4 del HANDOVER.md).

```
PENDIENTES
P1 ■ 1   P2 ■ 1
P3 ● 1   P4 ○ 1
```

- 4 badges en grilla 2×2.
- P1: color `--red` si count > 0, `--muted` si 0.
- P2: color `--amber` si count > 0, `--muted` si 0.
- P3/P4: `--text` si count > 0, `--muted` si 0.
- El número es el count de ítems `[ ]` sin cerrar.

### 4. Túneles SSH

Hardcodeados en `app.js` (no hay endpoint de estado en Sesión 2). Sin verificación de puerto.

```
TÚNELES
○  3307  FatApp
○  3308  appstest
○  3309  appsprod   PROD
○  3310  appsdesa
```

- Dot `○` en `--muted` (estado desconocido).
- Puerto en `--text`, nombre en `--muted`.
- Badge `PROD` en `--red` para 3309.
- Nota `[estado en Sesión 3]` en `--muted` al pie de la sección, tamaño `0.7rem`.

### 5. Host

Fuente: `/api/status` → `host.value`.

```
HOST
ROG-STRIX
```

---

## Datos y polling

- Al cargar: `fetch('/api/status')` y `fetch('/api/handover')` en paralelo.
- Cada `30s`: re-fetch `/api/status` y actualizar sidebar sin recargar la página.
- Si el backend no responde: mostrar `⚠ sin conexión` en el sidebar, mantener último estado conocido.
- Si un campo no está disponible: mostrar `—` en lugar del valor.

La función de parseo de la sección `## Proyecto activo` del handover extrae líneas de la forma `- Campo: valor` con una regex simple. No depende de `md-parser.js` (que vive en el backend).

---

## Efecto de partículas cursor

Canvas overlay fullscreen con `pointer-events: none`. Implementado en `app.js`.

**Spawn:** en `mousemove`, crear 2 partículas en `(e.clientX, e.clientY)`.

**Propiedades por partícula:**
| Campo | Valor inicial |
|---|---|
| `x, y` | posición del cursor |
| `vx` | `(Math.random() - 0.5) * 3` |
| `vy` | `-(Math.random() * 2 + 1.5)` |
| `size` | `Math.random() * 2 + 2` (2–4px) |
| `opacity` | `1.0` |
| `life` | `60` frames |
| `maxLife` | `60` |

**Por frame (requestAnimationFrame loop):**
1. `ctx.clearRect(0, 0, canvas.width, canvas.height)`
2. Por cada partícula activa:
   - `x += vx`, `y += vy`
   - `vy -= 0.08` (flotación sostenida)
   - `opacity = life / maxLife`
   - `size *= 0.97`
   - Render: `ctx.shadowBlur = 8`, `ctx.shadowColor = '#00E676'`, `fillStyle = rgba(0,230,118,{opacity})`, círculo de radio `size`
3. Eliminar partículas con `life <= 0`
4. `life--` en cada partícula activa

**Resize:** `addEventListener('resize', ...)` ajusta `canvas.width` y `canvas.height` al nuevo viewport.

---

## Cambio en backend/server.js

Agregar una sola línea antes de las rutas:

```js
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(express.static(path.join(__dirname, '../frontend')));
```

Con esto, `http://localhost:8080/` sirve `index.html` directamente.

---

## Restricciones y decisiones

| Decisión | Resolución |
|---|---|
| Frameworks JS | Ninguno — vanilla JS puro |
| Estado de túneles | Hardcodeado, sin live check (Sesión 3) |
| Launcher `.ps1` | Sesión 4 |
| Fuente de host | `/api/status` → `host.value` (desde HANDOVER.md) |
| Edición de sidebar | Solo lectura — no se edita desde el VCC en Sesión 2 |
| Autenticación | Sin auth — uso 100% local |

---

## Criterio de completitud (Sesión 2 lista cuando...)

- [ ] `http://localhost:8080/` carga `index.html` servido por Express
- [ ] Sidebar muestra estado HANDOVER con dot pulsante del color correcto
- [ ] Proyecto activo, pendientes P1–P4 y host se cargan desde la API
- [ ] Polling cada 30s funciona (verificar con `console.log` en DevTools)
- [ ] Sección de túneles visible con 4 entradas hardcodeadas
- [ ] Partículas verdes aparecen al mover el cursor por la página
- [ ] Backend no responde → mensaje `⚠ sin conexión` en sidebar
- [ ] Resize del viewport ajusta el canvas sin artefactos
