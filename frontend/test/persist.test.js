import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState } from '../modules/core/persist.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    _data: data,
  };
}

test('loadState devuelve fallback si la key no existe', () => {
  const storage = fakeStorage();
  assert.equal(loadState('vcc-test', 'default', storage), 'default');
});

test('saveState + loadState hacen roundtrip de un string', () => {
  const storage = fakeStorage();
  saveState('vcc-test', 'expiry', storage);
  assert.equal(loadState('vcc-test', 'default', storage), 'expiry');
});

test('saveState + loadState hacen roundtrip de un objeto combinado', () => {
  const storage = fakeStorage();
  const filtros = { tipo: 'Repo', estado: '', favOnly: true, texto: 'n8n' };
  saveState('vcc-links-filters', filtros, storage);
  assert.deepEqual(loadState('vcc-links-filters', {}, storage), filtros);
});

test('saveState + loadState hacen roundtrip de un boolean', () => {
  const storage = fakeStorage();
  saveState('vcc-test-bool', false, storage);
  assert.equal(loadState('vcc-test-bool', true, storage), false);
});

test('loadState devuelve fallback si el JSON guardado está corrupto', () => {
  const storage = fakeStorage({ 'vcc-test': '{not valid json' });
  assert.deepEqual(loadState('vcc-test', { a: 1 }, storage), { a: 1 });
});

test('loadState no explota si storage.getItem tira una excepción', () => {
  const storage = { getItem: () => { throw new Error('boom'); } };
  assert.equal(loadState('vcc-test', 'fallback', storage), 'fallback');
});
