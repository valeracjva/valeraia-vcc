import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTransition, commitState, _resetForTests } from './state-tracker.js';

test('primera vez que se ve un servidor -> first:true, no transicion', () => {
  _resetForTests();
  const result = checkTransition('srv-a', 'fresh');
  assert.deepEqual(result, { first: true });
});

test('sin cambio de estado -> null', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  assert.equal(checkTransition('srv-a', 'fresh'), null);
});

test('cambio de estado -> from/to (confirmado tras el debounce de 2 polls)', () => {
  // Antes del debounce (fix "VCC Monitoring Core" review final) esto confirmaba
  // en el primer poll. Ahora requiere 2 polls consecutivos con el mismo estado
  // nuevo -- el primero queda pendiente, el segundo confirma. Ver tests de
  // debounce mas abajo para los casos de blip y de umbral.
  _resetForTests();
  commitState('srv-a', 'fresh');
  assert.equal(checkTransition('srv-a', 'critico'), null);
  const result = checkTransition('srv-a', 'critico');
  assert.deepEqual(result, { from: 'fresh', to: 'critico' });
});

test('commitState no se llama automaticamente dentro de checkTransition', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  checkTransition('srv-a', 'critico');
  // sin commitState explicito, el siguiente check sigue viendo 'fresh' como estado previo
  assert.deepEqual(checkTransition('srv-a', 'critico'), { from: 'fresh', to: 'critico' });
});

test('debounce: un solo poll con estado nuevo -> null (todavia pendiente)', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  const result = checkTransition('srv-a', 'critico');
  assert.equal(result, null);
});

test('debounce: dos polls consecutivos con el mismo estado nuevo -> transicion confirmada en el segundo', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  const first = checkTransition('srv-a', 'critico');
  assert.equal(first, null);
  const second = checkTransition('srv-a', 'critico');
  assert.deepEqual(second, { from: 'fresh', to: 'critico' });
});

test('debounce: blip que revierte antes del umbral no dispara transicion espuria despues', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  // A -> B (un solo poll, queda pendiente)
  assert.equal(checkTransition('srv-a', 'critico'), null);
  // vuelve a A -- limpia el pendiente de B
  assert.equal(checkTransition('srv-a', 'fresh'), null);
  // si B reaparece, tiene que arrancar el conteo de nuevo desde 1, no seguir desde 1+1
  assert.equal(checkTransition('srv-a', 'critico'), null);
});

test('debounce: tras confirmar una transicion, un nuevo estado distinto arranca pendiente desde 1', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
  assert.equal(checkTransition('srv-a', 'critico'), null);
  const confirmed = checkTransition('srv-a', 'critico');
  assert.deepEqual(confirmed, { from: 'fresh', to: 'critico' });
  commitState('srv-a', 'critico');

  // ahora aparece un tercer estado -- un solo poll no debe confirmar de inmediato
  const pending = checkTransition('srv-a', 'degradado');
  assert.equal(pending, null);
  const confirmed2 = checkTransition('srv-a', 'degradado');
  assert.deepEqual(confirmed2, { from: 'critico', to: 'degradado' });
});

test('patron real del poller (commitState solo si transition es truthy): una transicion sostenida se confirma', () => {
  // Regresion del bug critico de final-review: poller.js llamaba a commitState()
  // incondicionalmente en cada poll, lo que borraba pendingState antes de llegar
  // al umbral de debounce y dejaba el alerting de transiciones inerte para siempre.
  // Este test reproduce el llamador real (poller.js: checkTransition -> commitState
  // solo si transition es truthy) y prueba que una transicion sostenida sí confirma.
  _resetForTests();
  commitState('srv-a', 'fresh'); // baseline

  function simulatePoll(state) {
    const transition = checkTransition('srv-a', state);
    if (transition) commitState('srv-a', state);
    return transition;
  }

  assert.equal(simulatePoll('critico'), null); // poll 1: pendiente
  assert.deepEqual(simulatePoll('critico'), { from: 'fresh', to: 'critico' }); // poll 2: confirmado
  assert.equal(simulatePoll('critico'), null); // poll 3: ya committeado, sin cambio, no vuelve a notificar
});
