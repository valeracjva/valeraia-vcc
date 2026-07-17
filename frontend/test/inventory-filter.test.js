import test from 'node:test';
import assert from 'node:assert/strict';
import { filterServers } from '../modules/tabs/inventory.js';

function fixtureServers() {
  return [
    { id: 'srv-appstest', ip: '10.145.2.26', empresa: 'DIGNA / Fincos', rol: 'Test multi-aplicación Laravel', os: 'Ubuntu 22.04' },
    { id: 'srv-n001', ip: '172.16.100.129', empresa: 'NRE Seguros', rol: 'Hyper-V (CLUSTER01)', os: 'Windows Server 2019 Datacenter' },
    { id: 'srv-proxy', ip: '172.16.102.235', empresa: 'NRE Seguros', rol: 'Apache Proxy', os: 'Ubuntu 22.04.5 LTS' },
  ];
}

test('sin texto devuelve todos los servers sin tocar el array', () => {
  const result = filterServers(fixtureServers(), '');
  assert.equal(result.length, 3);
});

test('texto matchea por id, case-insensitive', () => {
  const result = filterServers(fixtureServers(), 'PROXY');
  assert.deepEqual(result.map(s => s.id), ['srv-proxy']);
});

test('texto matchea por IP', () => {
  const result = filterServers(fixtureServers(), '172.16.100.129');
  assert.deepEqual(result.map(s => s.id), ['srv-n001']);
});

test('texto matchea por empresa', () => {
  const result = filterServers(fixtureServers(), 'nre seguros');
  assert.deepEqual(result.map(s => s.id).sort(), ['srv-n001', 'srv-proxy']);
});

test('texto matchea por rol', () => {
  const result = filterServers(fixtureServers(), 'hyper-v');
  assert.deepEqual(result.map(s => s.id), ['srv-n001']);
});

test('texto matchea por os', () => {
  const result = filterServers(fixtureServers(), 'windows');
  assert.deepEqual(result.map(s => s.id), ['srv-n001']);
});

test('texto sin coincidencias devuelve vacío', () => {
  const result = filterServers(fixtureServers(), 'zzz-no-existe');
  assert.equal(result.length, 0);
});

test('texto undefined no filtra', () => {
  const result = filterServers(fixtureServers());
  assert.equal(result.length, 3);
});
