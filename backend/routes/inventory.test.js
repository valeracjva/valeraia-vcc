// backend/routes/inventory.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, clean } from './inventory.js';

test('clean() incluye localAgent=true cuando viene true', () => {
  const s = { id: 'srv-x', ip: '10.0.0.1', os: 'Ubuntu', empresa: 'NRE', riesgo: 'bajo', apps: [], dominios: [], localAgent: true };
  assert.equal(clean(s).localAgent, true);
});

test('clean() default localAgent=false cuando no viene', () => {
  const s = { id: 'srv-x', ip: '10.0.0.1', os: 'Ubuntu', empresa: 'NRE', riesgo: 'bajo', apps: [], dominios: [] };
  assert.equal(clean(s).localAgent, false);
});

test('validate() no rechaza localAgent booleano', () => {
  const s = { id: 'srv-x', ip: '10.0.0.1', os: 'Ubuntu', empresa: 'NRE', riesgo: 'bajo', apps: [], dominios: [], localAgent: true };
  assert.equal(validate(s), null);
});
