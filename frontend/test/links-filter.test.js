import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLinks } from '../modules/tabs/links.js';

function fixtureLinks() {
  return [
    { id: '1', titulo: 'Laravel Livewire docs', url: 'https://livewire.laravel.com', tipo: 'Articulo', estado: 'Pendiente', favorito: false, tags: ['laravel'], nota: '' },
    { id: '2', titulo: 'n8n workflow patterns', url: 'https://n8n.io/patterns', tipo: 'Repo', estado: 'Revisado', favorito: true, tags: ['n8n', 'automatizacion'], nota: 'Ver sección de webhooks' },
    { id: '3', titulo: 'FortiGate CLI reference', url: 'https://docs.fortinet.com', tipo: 'Otro', estado: 'Pendiente', favorito: false, tags: [], nota: 'Comandos de IPSec' },
  ];
}

test('sin texto, se comporta como antes (solo tipo/estado/favOnly)', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: '' });
  assert.equal(result.length, 3);
});

test('texto matchea por título, case-insensitive', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'LIVEWIRE' });
  assert.deepEqual(result.map(l => l.id), ['1']);
});

test('texto matchea por URL', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'fortinet.com' });
  assert.deepEqual(result.map(l => l.id), ['3']);
});

test('texto matchea por nota', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'webhooks' });
  assert.deepEqual(result.map(l => l.id), ['2']);
});

test('texto matchea por tag', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'automatizacion' });
  assert.deepEqual(result.map(l => l.id), ['2']);
});

test('texto se combina en AND con tipo', () => {
  const result = filterLinks(fixtureLinks(), { tipo: 'Repo', estado: '', favOnly: false, texto: 'n8n' });
  assert.deepEqual(result.map(l => l.id), ['2']);
  const noMatch = filterLinks(fixtureLinks(), { tipo: 'Articulo', estado: '', favOnly: false, texto: 'n8n' });
  assert.equal(noMatch.length, 0);
});

test('texto sin coincidencias devuelve vacío', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false, texto: 'zzz-no-existe' });
  assert.equal(result.length, 0);
});

test('texto undefined no filtra (compat con llamadas viejas)', () => {
  const result = filterLinks(fixtureLinks(), { tipo: '', estado: '', favOnly: false });
  assert.equal(result.length, 3);
});
