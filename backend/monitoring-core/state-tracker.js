// Ultimo estado conocido por servidor -- vive en memoria, se resetea en cada reinicio
// del backend (mismo gotcha que el cache de metrics.js y los tuneles SSH). Un reinicio
// "olvida" el ultimo estado y trata la primera lectura post-reinicio como baseline,
// no como transicion -- evita una alerta falsa al arrancar.
const lastKnownState = {};

// Estado "candidato" a transicion, todavia no confirmado. Vive por separado de
// lastKnownState para no mutar el estado confirmado hasta pasar el debounce.
const pendingState = {};

// Poll ~= 60s (POLL_INTERVAL_MS en poller.js). 2 polls consecutivos con el mismo
// estado nuevo ~= 2 minutos -- suficiente para filtrar un blip de un solo poll
// (ej: caida momentanea de VPN en la laptop del poller) sin demorar de forma
// significativa una alerta real.
const DEBOUNCE_THRESHOLD = 2;

function clearPending(serverId) {
  delete pendingState[serverId];
}

// No muta lastKnownState -- el llamador decide cuando confirmar via commitState(),
// para poder reintentar la notificacion sin perder el estado previo si el envio falla.
export function checkTransition(serverId, currentState) {
  const previous = lastKnownState[serverId];
  if (previous === undefined) {
    clearPending(serverId);
    return { first: true };
  }
  if (previous === currentState) {
    // Volvio al estado confirmado (o nunca cambio) -- un blip que revierte no debe
    // contar para un futuro debounce.
    clearPending(serverId);
    return null;
  }

  const pending = pendingState[serverId];
  if (!pending || pending.state !== currentState) {
    // Primera vez que se ve este candidato -- arranca el conteo desde 1.
    pendingState[serverId] = { state: currentState, count: 1 };
    return null;
  }

  pending.count += 1;
  if (pending.count >= DEBOUNCE_THRESHOLD) {
    return { from: previous, to: currentState };
  }
  return null;
}

export function commitState(serverId, currentState) {
  lastKnownState[serverId] = currentState;
  clearPending(serverId);
}

// Solo para tests -- limpia el estado en memoria entre casos.
export function _resetForTests() {
  for (const key of Object.keys(lastKnownState)) delete lastKnownState[key];
  for (const key of Object.keys(pendingState)) delete pendingState[key];
}
