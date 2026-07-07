# VCC como core de monitoreo — Etapa 1 (local, en PC de Carlos)

## Contexto y objetivo

VCC/Inventario hoy es un dashboard pasivo: el backend (`workspace-ui/backend`) responde a pedidos del frontend, que hace polling SSH/WinRM cada 60s **solo mientras hay una pestaña de navegador abierta**. No tiene timer propio, no analiza transiciones de estado, no notifica nada por su cuenta.

Por separado existen dos stacks de monitoreo ya desplegados y funcionando de forma autónoma en los servidores:
- **Linux** (`project_monitoreo`, Bash + cron + Telegram) — corre en cada host, independiente de VCC.
- **Windows Hyper-V** (`project_monitoreo_windows_hyperv`, PowerShell + Task Scheduler + Telegram) — corre en `srv-n001`/`srv-n003`, independiente de VCC.

Ambos ya tienen lógica de dispatch a Telegram (dedup por sha256, igual patrón en los dos), pero al de NRE le falta el bot/token real.

**Objetivo de esta etapa:** convertir VCC en el "core" de monitoreo — el punto central que, mientras esté prendido, vigila, analiza transiciones de estado y notifica por Telegram con más contexto que los checks locales. Los agentes locales dejan de ser la fuente primaria de alerta cuando VCC está activo, pero siguen siendo la red de seguridad permanente cuando VCC está apagado.

**Fuera de alcance de esta etapa (etapa 2, futura):** mover VCC a un servidor dedicado siempre encendido, fuera de la red VPN, con conectividad propia. Esa etapa requiere resolver antes cómo VCC se conecta a la red sin depender de la VPN de Carlos — decisión explícitamente pospuesta.

## Decisiones ya tomadas (de la sesión de brainstorming)

1. VCC pasa a ser el punto central de monitoreo; vive en la PC de Carlos por ahora.
2. Los agentes locales (Linux/Windows) son la red de seguridad permanente — nunca dejan de poder alertar por su cuenta.
3. Modelo de interruptor automático: si VCC está activo y vigilando un host, el agente local de ese host se calla; si VCC está apagado (o el host no tiene respuesta reciente de VCC), el agente local alerta normalmente.
4. El mecanismo del interruptor es un **heartbeat por archivo**, escrito por VCC en cada host durante su propio ciclo de poll (mismo canal SSH/WinRM que ya usa para métricas) — fail-safe por diseño: si VCC se cae de golpe, el heartbeat envejece solo y el agente local retoma sin intervención.
5. VCC usa un **bot de Telegram propio**, centralizado, independiente de los bots de DIGNA/Fincos y NRE.
6. VCC alerta **solo en transición de estado** (fresh↔watch↔crítico), no en cada poll.
7. Al iniciar, VCC hace catch-up leyendo el historial local de cada host con agente y lo muestra **solo en la UI** (no dispara Telegram — el agente local ya alertó en su momento si correspondía).
8. El heartbeat/interruptor solo aplica a hosts que ya tienen agente local desplegado. El resto de los servidores de Inventario (sin agente local) no tienen fallback — VCC es su única fuente de alerta, prendida o no. Limitación conocida, no bloqueante para esta etapa.

## Arquitectura

### Componentes nuevos en `backend/`

```
backend/
├── monitoring-core/
│   ├── poller.js          ← setInterval propio (60s), reemplaza la dependencia del frontend
│   ├── heartbeat.js        ← escribe timestamp en cada host (SSH exec / WinRM), por ciclo exitoso
│   ├── state-tracker.js    ← lastKnownState[serverId], detecta transición vs healthState actual
│   ├── telegram.js         ← cliente del bot propio de VCC, envío de mensajes de transición
│   └── catchup.js          ← lectura de historial local de cada host al iniciar el backend
└── routes/
    └── monitoring-core.js  ← GET /api/monitoring-core/catchup, GET /api/monitoring-core/status
```

### 1. Poller propio del backend

`poller.js` arranca junto con `server.js` (no depende de rutas HTTP llamadas por el frontend). Cada 60s:
1. Llama a `getMonitoredServers()` (ya existe en `metrics.js`).
2. Para cada servidor, ejecuta la misma recolección SSH/WinRM que hoy dispara `/api/metrics` — reutiliza las funciones existentes de `metrics.js`, no las duplica.
3. Actualiza `cache[id]` (el mismo cache que ya lee el frontend) — el contrato de `/api/metrics` no cambia.
4. Al final de cada host exitoso, llama a `heartbeat.write(serverId)` y a `stateTracker.check(serverId, healthState)`.

El frontend sigue funcionando igual (lee `cache[id]`), pero ahora el cache se refresca aunque no haya ninguna pestaña abierta.

### 2. Heartbeat

`heartbeat.write(serverId)` solo actúa si `serverId` tiene agente local desplegado (lista fija, hoy: `srv-n001`, `srv-n003` para Windows; los hosts de `project_monitoreo` para Linux — se lee de un config, no hardcodeado en el módulo).
- Linux: `ssh <host> "touch /var/lib/monitoring-core/vcc-heartbeat"` (o `date +%s > archivo` para tener el timestamp explícito, más robusto que confiar en mtime si el reloj del host difiere).
- Windows: mismo `Invoke-Command` que ya usa `metrics.js` para WinRM, agrega `Set-Content -Path C:\ProgramData\Monitoring\vcc-heartbeat.txt -Value (Get-Date -Format o)`.

**Cambio necesario del lado de los agentes locales** (fuera del alcance de código de VCC, pero parte de esta spec porque es el otro extremo del interruptor): `MonitoringCore.psm1` (Windows) y el dispatcher Bash (Linux) deben leer ese archivo antes de llamar a `Send-TelegramAlert`/`telegram-dispatcher.sh` y abortar el envío si el timestamp tiene menos de **180s** (3x el intervalo de poll de VCC, tolera un ciclo perdido sin generar falso silencio). Esto se documenta acá pero se implementa como cambio en los repos de `projects/monitoreo/` — se coordina en el plan de implementación.

### 3. Detección de transición + Telegram

`state-tracker.js` mantiene `lastKnownState = { [serverId]: 'fresh'|'watch'|'critico' }` en memoria (mismo gotcha de persistencia que `cache` de métricas y los túneles SSH: se resetea en cada reinicio del backend).

En cada ciclo:
```
current = healthState(server)  // ya existe en opsmap.js, se reusa
if (current !== lastKnownState[serverId]) {
  telegram.notifyTransition(serverId, lastKnownState[serverId], current)
  lastKnownState[serverId] = current
}
```
Primera vez que se ve un servidor tras un reinicio del backend: no hay estado previo, se toma el estado actual como baseline sin notificar (evita falsa alarma de "transición" al arrancar).

`telegram.notifyTransition` arma el mensaje según la dirección:
- `fresh/watch → crítico`: 🔴 alerta.
- `crítico → watch/fresh`: ✅ recuperación.
- `fresh → watch`: ⚠️ aviso temprano.
- `watch → fresh`: silencioso (opcional, a decidir en el plan — no genera ruido si se omite).

### 4. Catch-up al iniciar

Al arrancar `server.js`, antes de que el poller haga su primer ciclo:
1. Para cada host con agente local: lee el JSON de estado/historial que el agente ya mantiene (`MonitoringCore.psm1` en Windows, el JSON del dispatcher en Linux) vía el mismo canal SSH/WinRM.
2. Arma un resumen por host: eventos desde la última vez que VCC estuvo activo (se infiere por el heartbeat viejo: "última escritura hace X horas").
3. Expone el resultado en `GET /api/monitoring-core/catchup` — el frontend lo muestra una sola vez al cargar (ej. banner en Sesión actual o Inicio), no repetido en cada refresh de 30s.

Si la lectura falla para un host puntual (agente no responde, JSON corrupto), se omite ese host del resumen sin bloquear el catch-up de los demás ni el arranque del poller.

### 5. Bot de Telegram propio de VCC

Nuevo bot (Carlos lo crea vía BotFather, mismo procedimiento que los bots existentes). Config en un archivo no versionado, mismo patrón que `deploy/telegram.psd1.template` de los stacks locales:
```
backend/monitoring-core/telegram-config.json.template   ← se versiona (plantilla)
backend/monitoring-core/telegram-config.json             ← real, gitignored
```
Campos: `botToken`, `chatId`.

### 6. Manejo de errores

- Heartbeat write falla (host inalcanzable, credencial rota): se loguea, no aborta el ciclo de los demás hosts (`Promise.allSettled`, mismo patrón que `metrics.js`).
- Catch-up read falla: se omite el host de ese resumen, no bloquea arranque.
- Telegram send falla (sin red, token inválido): se loguea el intento, no hay reintento — mismo patrón que los scripts locales existentes.
- Backend se reinicia: `lastKnownState` y el cache de heartbeat en memoria se pierden — primera vuelta post-reinicio no notifica transición (se toma baseline), documentado como comportamiento esperado, no bug.

## Testing

- Unit test (`node:test`, mismo patrón que `opsmap-impact.test.js`) para `state-tracker.js`: dado un `lastKnownState` y un `healthState` nuevo, verifica que decide notificar o no, y en qué dirección.
- Verificación manual con Playwright: forzar un cambio de estado en un servidor de prueba (ej. bajar el threshold temporalmente), confirmar que:
  - Llega el mensaje de Telegram al bot propio de VCC.
  - El archivo de heartbeat aparece/se actualiza en el host.
  - `GET /api/monitoring-core/catchup` responde con el resumen esperado tras un reinicio simulado.
- No se automatiza el envío real de Telegram en tests (evita spam al bot real) — se testea `telegram.js` con un mock de la llamada HTTP.

## Pendientes que quedan fuera de esta spec (para el plan de implementación)

- Lista de hosts con agente local (config explícita, no hardcodeada) — de dónde se lee, formato.
- Cambios concretos en `MonitoringCore.psm1` y el dispatcher Bash para chequear el heartbeat antes de alertar (repo `projects/monitoreo/`).
- Decisión final sobre si `watch → fresh` genera mensaje o no.
- Creación del bot de Telegram propio de VCC (acción de Carlos, no de código).
- Etapa 2 (server dedicado fuera de VPN) — explícitamente no diseñada acá.
