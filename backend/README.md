# VCC Backend

API REST del ValeraIA Command Center. Node.js + Express.

## Levantar el servidor

```powershell
cd workspace-ui\backend
node server.js
# Disponible en http://localhost:8080
```

## Primera vez en una PC nueva

```powershell
cd workspace-ui\backend
npm install
node server.js
```

OneDrive sincroniza `node_modules/` desde la otra PC. Igual se recomienda re-ejecutar
`npm install` para que los scripts internos de `.bin/` apunten a rutas locales correctas.

---

## ⚠️ Advertencia — node_modules y OneDrive

**Estado actual:** `node_modules/` se sincroniza por OneDrive entre ROG-STRIX y AORUS.

**Por qué no está excluido:** OneDrive no soporta exclusión de subcarpetas anidadas.
La única solución técnica viable en Windows (junction de directorio `mklink /J`) fue
probada y descartada: npm v7+ detecta el reparse point y lo elimina/recrea como
directorio real en cada `npm install`. No hay workaround limpio.

**Por qué es aceptable ahora:** Este proyecto usa solo Express (JS puro, sin binarios
nativos compilados). En Windows → Windows con Node.js equivalente, los archivos
generados por `npm install` son byte a byte idénticos. OneDrive detecta checksums
iguales y no retransmite — el "sync" es efectivamente un no-op después de la primera
vez.

**Cuándo se vuelve un problema real:**
- Si se agrega una dependencia con binarios nativos (bcrypt, sharp, sqlite3, canvas…)
  → los `.node` compilados son distintos por plataforma y arquitectura.
- Si `node_modules` crece a miles de archivos → carga de sync inicial elevada.

**Migración recomendada en ese caso:**
Mover `workspace-ui/` fuera de OneDrive e introducir git para sincronización de código.
`node_modules/` ya está en `.gitignore`. Pasos:

```powershell
# 1. Mover código fuente (sin node_modules) a E:\Workspace-Repos\workspace-ui
# 2. git init + git remote (repo privado GitHub u otro)
# 3. En cada PC: git clone / git pull → npm install
# 4. En AI-Workspace mantener solo un shortcut o referencia al proyecto
```

`config.js` no cambia — WORKSPACE_ROOT sigue apuntando a OneDrive para leer los .md.
Solo el código del VCC se mueve fuera.

---

## Endpoints disponibles

| Endpoint | Descripción |
|---|---|
| `GET /api/handover` | `runtime/HANDOVER.md` parseado en secciones |
| `GET /api/index` | Pendientes de `knowledge/INDEX.md` con conteos |
| `GET /api/registry` | Registry completo + hash en `X-Registry-Hash` y `ETag` |
| `POST /api/projects` | Alta de proyecto; ID autogenerado desde `name` |
| `PATCH /api/projects/:id` | Edición granular de metadata; el ID es inmutable |
| `DELETE /api/projects/:id` | Baja; bloqueada si runtime o HANDOVER lo referencian |
| `POST /api/projects/:id/environments` | Alta de ambiente |
| `PATCH /api/projects/:id/environments/:env` | Edición granular de ambiente |
| `DELETE /api/projects/:id/environments/:env` | Baja de ambiente |
| `POST /api/projects/:id/environments/:env/open-vscode` | Abre VS Code Remote SSH |
| `GET /api/status` | Estado consolidado: frescura, host, pendientes (handover + index) |
| `GET/PUT /api/ssl/config` | Configuración ABM de dominios SSL |
| `GET /api/tunnels/config` | Presets y estado de túneles SSH |
| `PUT /api/tunnels/config` | ABM de presets de túneles |

### Escrituras del registry

Todas las escrituras reciben `expectedHash`. Si difiere del contenido vigente, la API
responde `409` y no sobrescribe. `registry-store.js` trabaja sobre una copia en memoria,
valida estructura e IDs/ambientes únicos, escribe y parsea un temporal, crea backup y
reemplaza el archivo con rollback ante error. Los campos no administrados se preservan.

El alta no acepta un ID elegido por el cliente. El backend lo deriva de `name` como slug
minúsculo sin acentos y resuelve colisiones agregando `-2`, `-3`, etc.

## Estructura

```
backend/
├── server.js          ← entrada, monta rutas, CORS localhost, error handler
├── config.js          ← WORKSPACE_ROOT y PATHS centralizados
├── package.json
├── lib/
│   ├── md-parser.js       ← parseo de secciones .md (compartido)
│   └── registry-store.js  ← lectura, validación y mutación transaccional del registry
├── test/
│   ├── registry-store.test.js
│   └── projects-routes.test.js
└── routes/
    ├── handover.js
    ├── index.js
    ├── projects.js
    ├── registry.js
    ├── ssl.js
    ├── status.js
    └── tunnels.js
```
