// Ultimo estado conocido por servidor -- vive en memoria, se resetea en cada reinicio
// del backend (mismo gotcha que el cache de metrics.js y los tuneles SSH). Un reinicio
// "olvida" el ultimo estado y trata la primera lectura post-reinicio como baseline,
// no como transicion -- evita una alerta falsa al arrancar.
const lastKnownState = {};

// No muta lastKnownState -- el llamador decide cuando confirmar via commitState(),
// para poder reintentar la notificacion sin perder el estado previo si el envio falla.
export function checkTransition(serverId, currentState) {
  const previous = lastKnownState[serverId];
  if (previous === undefined) return { first: true };
  if (previous === currentState) return null;
  return { from: previous, to: currentState };
}

export function commitState(serverId, currentState) {
  lastKnownState[serverId] = currentState;
}

// Solo para tests -- limpia el estado en memoria entre casos.
export function _resetForTests() {
  for (const key of Object.keys(lastKnownState)) delete lastKnownState[key];
}
