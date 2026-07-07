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

test('cambio de estado -> from/to', () => {
  _resetForTests();
  commitState('srv-a', 'fresh');
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
