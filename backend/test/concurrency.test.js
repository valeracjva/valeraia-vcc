import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../lib/concurrency.js';

test('devuelve los resultados en el mismo orden que Promise.allSettled', async () => {
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
  assert.deepEqual(results, [
    { status: 'fulfilled', value: 10 },
    { status: 'fulfilled', value: 20 },
    { status: 'fulfilled', value: 30 },
    { status: 'fulfilled', value: 40 },
    { status: 'fulfilled', value: 50 },
  ]);
});

test('nunca despacha más de "limit" invocaciones en vuelo a la vez', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);

  await mapWithConcurrency(items, 3, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--;
    return n;
  });

  assert.ok(maxInFlight <= 3, `maxInFlight fue ${maxInFlight}, esperado <= 3`);
});

test('un rechazo individual no aborta el resto (mismo comportamiento que allSettled)', async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('falló el 2');
    return n;
  });

  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[0].value, 1);
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.message, 'falló el 2');
  assert.equal(results[2].status, 'fulfilled');
  assert.equal(results[2].value, 3);
});

test('limit mayor o igual a la cantidad de items se comporta igual que Promise.allSettled', async () => {
  const items = [1, 2, 3];
  const expected = await Promise.allSettled(items.map(n => Promise.resolve(n * 2)));
  const actual = await mapWithConcurrency(items, 10, async (n) => n * 2);
  assert.deepEqual(actual, expected);
});

test('array vacío devuelve array vacío sin invocar fn', async () => {
  let calls = 0;
  const results = await mapWithConcurrency([], 5, async () => { calls++; });
  assert.deepEqual(results, []);
  assert.equal(calls, 0);
});
