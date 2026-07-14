import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActiveMd } from '../lib/session-template.js';

test('buildActiveMd genera el template con todos los campos', () => {
  const md = buildActiveMd({
    projectId: 'fincos-one',
    environment: 'test',
    resumen: 'Terminé el hero estático, falta ajustar la imagen.',
    fecha: '2026-07-13 18:30',
  });

  assert.match(md, /^# Sesión activa — fincos-one/);
  assert.match(md, /Última sesión guardada: 2026-07-13 18:30/);
  assert.match(md, /## Punto de reanudación\nTerminé el hero estático, falta ajustar la imagen\./);
  assert.match(md, /- Proyecto {2}: fincos-one/);
  assert.match(md, /- Ambiente {2}: test/);
});
