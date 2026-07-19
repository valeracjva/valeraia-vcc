# M5 — Secret Vault: Plan de implementación

> **Spec:** `docs/superpowers/specs/2026-07-17-m5-secret-vault-design.md`
> **Goal:** Tab de secretos en VCC con cards, toggle ojo, editable sobre `D:\Workspace-Repos\secrets\*.env`

---

## Global Constraints

- Sin dependencias npm nuevas
- Preservar comentarios `#` en los `.env` al editar
- Backup automático antes de escribir: `<archivo>.env.bak.<timestamp>`
- Valores masked por defecto en UI. Toggle por cada valor individual
- Sin logging de valores sensibles. Sin WebSocket govern para secretos
- No hardcodear `D:\Workspace-Repos\secrets` — usar `config.js` → PATHS

## Fase 1 — Backend GET

- [x] Agregar `secretsDir` en `backend/config.js`
- [x] Crear `backend/routes/vault.js` con GET `/api/vault` + GET `/api/vault/:category`
- [x] Parseo `KEY=VALUE` preservando comentarios y preamble
- [x] Conectar en `server.js`: `app.use('/api/vault', vaultRouter)`
- [x] Verificar con curl: lista categorías + detalle de categoría

## Fase 2 — Frontend Tab

- [x] Tab button "Secretos" 🔑 en `index.html` sidebar
- [x] Tab panel `#tab-vault` en `index.html`
- [x] Crear `frontend/modules/tabs/vault.js` con `initVault()` y `loadVault()`
- [x] Cards por categoría (mismo estilo inventario)
- [x] Click en card → expande con pares KEY=VALUE
- [x] Cada valor masked por defecto + ícono ojo toggle
- [x] Estados: vacío, cargando, error
- [x] Conectar en `app.js`: import + init + onTabChange

## Fase 3 — Backend escritura

- [x] PUT `/api/vault/:category/:key` — reemplazar valor, backup automático
- [x] POST `/api/vault/:category` — agregar clave al final del archivo
- [x] DELETE `/api/vault/:category/:key` — eliminar línea
- [x] Backup: `.bak.<timestamp>` sincronizado
- [x] Verificar con curl: PUT, DELETE, POST, restore

## Fase 4 — Frontend edición

- [x] Botón lápiz → inline edit con input masked + toggle ojo
- [x] Botón guardar (💾) → PUT al backend
- [x] Botón cancelar (✕) → vuelve al estado anterior
- [x] Botón eliminar (🗑) → DELETE con confirm
- [x] Auto recarga de categoría después de PUT/DELETE

## Fase 5 — Polish (pendiente)

- [ ] Verificar que ningún valor sensible aparezca en WebSocket govern
- [ ] Verificar que console.log en vault.js no exponga valores
- [ ] Botón "Agregar secreto" por categoría (POST)
- [ ] Prueba manual en navegador
