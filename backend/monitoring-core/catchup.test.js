import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinuxLogTail, parseWindowsStateJson } from './catchup.js';

test('parseLinuxLogTail devuelve una entrada por linea no vacia', () => {
  const raw = '[2026-07-07 14:32:10] SENT severity=CRITICAL title=Disco 92%\n[2026-07-07 15:10:00] SENT severity=RECOVERY title=Disco normalizado\n';
  const events = parseLinuxLogTail(raw);
  assert.equal(events.length, 2);
  assert.equal(events[0].raw, '[2026-07-07 14:32:10] SENT severity=CRITICAL title=Disco 92%');
});

test('parseLinuxLogTail con salida vacia devuelve array vacio', () => {
  assert.deepEqual(parseLinuxLogTail(''), []);
});

test('parseWindowsStateJson parsea un array de objetos Status/Valor/Timestamp', () => {
  const raw = JSON.stringify([
    { Status: 'critico', Valor: '92', Timestamp: '2026-07-07T14:32:10Z', DesdeTimestamp: '2026-07-07T14:32:10Z' },
  ]);
  const events = parseWindowsStateJson(raw);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'critico');
  assert.equal(events[0].valor, '92');
});

test('parseWindowsStateJson con JSON invalido devuelve array vacio', () => {
  assert.deepEqual(parseWindowsStateJson('no es json'), []);
});
