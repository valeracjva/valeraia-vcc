import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransitionMessage } from './telegram.js';

test('fresh -> critico genera mensaje con icono rojo', () => {
  const msg = buildTransitionMessage('srv-n001', 'fresh', 'critico');
  assert.match(msg, /🔴/);
  assert.match(msg, /srv-n001/);
});

test('critico -> fresh genera mensaje de recuperacion', () => {
  const msg = buildTransitionMessage('srv-n001', 'critico', 'fresh');
  assert.match(msg, /✅/);
});

test('fresh -> watch genera aviso temprano', () => {
  const msg = buildTransitionMessage('srv-n001', 'fresh', 'watch');
  assert.match(msg, /⚠️/);
});

test('watch -> fresh NO genera mensaje (recuperacion parcial silenciosa)', () => {
  assert.equal(buildTransitionMessage('srv-n001', 'watch', 'fresh'), null);
});
