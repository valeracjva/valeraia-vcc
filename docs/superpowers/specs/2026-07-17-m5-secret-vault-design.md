# M5 — Secret Vault: Gestor de Secretos para VCC

**Status:** Spec v1
**Goal:** Tab de secretos en VCC que lee/escribe archivos `.env` en `D:\Workspace-Repos\secrets\` con vista tipo card, valores masked por defecto y toggle ojo para mostrar/ocultar.

---

## Stack / Constraints

- **Backend:** Node.js/Express (ES modules), ruta nueva `/api/vault`
- **Frontend:** Vanilla JS SPA, módulo nuevo `frontend/modules/tabs/vault.js`, tab en el shell
- **CSS:** Design system existente (tokens, cards de inventario), mismo patrón de `buildServerCard`
- **No dependencias npm nuevas**
- **Sin autenticación extra** — solo localhost, mismo alcance que el resto de VCC
- **Sin logging de valores** — los secretos nunca se escriben en logs ni se exponen en WebSocket govern

## Arquitectura

### Backend — `/api/vault`

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/vault` | GET | Lista categorías + metadatos (archivo, cantidad de claves, últimas modificación) |
| `/api/vault/:category` | GET | Devuelve todos los pares KEY=VALUE de una categoría (valores sin máscara) |
| `/api/vault/:category/:key` | PUT | Actualiza el valor de una clave específica |
| `/api/vault/:category/:key` | DELETE | Elimina una clave específica |
| `/api/vault/:category` | POST | Agrega un par KEY=VALUE nuevo |

**Reglas de escritura:**
- Preservar comentarios (`# ...`) del archivo original
- Solo modificar líneas `KEY=VALUE` existentes o agregar al final
- Backup automático del `.env` antes de escribir (`<archivo>.bak` con timestamp)

### Frontend — Tab Vault

**Cards** por categoría (mismo layout que inventario/servidores):
- Header: nombre de la categoría + ícono + badges (cantidad de claves)
- Body: lista de pares KEY=VALUE, uno por línea, con:
  - KEY en texto normal
  - VALUE en `<input type="password">` o similar, con ícono ojo al lado
  - Click en ojo → toggle mostrar/ocultar valor
  - Hover → botón editar (lápiz) que abre inline edit
- Footer: botón "Agregar secreto" + timestamp última modificación

**Estados:**
- Vacío: mensaje "No hay secretos en esta categoría" + botón para agregar
- Cargando: skeleton cards
- Error: card con mensaje + botón reintentar

**Seguridad en UI:**
- Valores masked por defecto al cargar
- Ojo toggle por cada valor individual (no toggle global)
- Al editar, el input empieza masked, toggle para ver mientras se escribe
- Copy que no debe salir a WebSocket govern stream

## UX States (3)

| Estado | Comportamiento |
|--------|---------------|
| **Vacío (categoría sin claves)** | Card con título, "Sin secretos" y botón `+ Agregar` |
| **Con datos** | Cards con lista de pares, cada valor masked, ojo para revelar |
| **Cargando/Error** | Skeleton card / card con fondo danger y botón reintentar |

## Plan de implementación

### Fase 1 — Backend (ruta GET lista + GET categoría)

- [ ] Crear `backend/routes/vault.js` con GET `/api/vault` (lista categorías)
- [ ] GET `/api/vault/:category` (lectura archivo, parse KEY=VALUE)
- [ ] Preservar comentarios del `.env`
- [ ] Test: archivo temporal de prueba, leer y verificar parse

### Fase 2 — Frontend (tab + cards + toggle)

- [ ] Agregar tab "Secretos" al shell (`app.js`, `core/shell.js`)
- [ ] Crear `frontend/modules/tabs/vault.js`
- [ ] `loadVault()` → GET `/api/vault` → render cards por categoría
- [ ] `loadCategory(cat)` → GET `/api/vault/:cat` → render pares
- [ ] Toggle ojo (mostrar/ocultar) por cada valor
- [ ] Botón editar inline (put)
- [ ] Botón agregar secreto (post)
- [ ] Estados vacío, cargando, error

### Fase 3 — Backend (escritura)

- [ ] PUT `/api/vault/:category/:key`
- [ ] Backup automático antes de escribir
- [ ] POST `/api/vault/:category` (agregar clave nueva)
- [ ] DELETE `/api/vault/:category/:key`
- [ ] Test: escribir, leer de vuelta, verificar backup

### Fase 4 — Polish

- [ ] Verificar que ningún valor se filtre a WebSocket govern
- [ ] Verificar que no haya logging de valores sensibles
- [ ] Prueba manual con `mail.env` real (no commitear cambios)
