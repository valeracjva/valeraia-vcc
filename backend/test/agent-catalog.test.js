import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentCategory, parseAgentDescription } from '../lib/agent-catalog.js';

test('parseAgentCategory extrae la categoría del frontmatter', () => {
  const content = '---\nname: laravel-dev\nversion: "2.0"\ncategory: aplicaciones\ndescription: |\n  algo\n---\n';
  assert.equal(parseAgentCategory(content), 'aplicaciones');
});

test('parseAgentCategory devuelve null si no hay categoría', () => {
  const content = '---\nname: x\n---\n';
  assert.equal(parseAgentCategory(content), null);
});

test('parseAgentCategory devuelve null con contenido vacío', () => {
  assert.equal(parseAgentCategory(''), null);
});

test('parseAgentDescription extrae solo el primer párrafo del bloque YAML |', () => {
  const content =
    '---\nname: ciberseguridad\ncategory: redes\n' +
    'description: |\n' +
    '  Seguridad de perímetro: FortiGate, VPN IPSec/SSL.\n' +
    '  Usar para configurar o auditar firewalls.\n' +
    'exclusions: |\n' +
    '  NO usar para hardening de host.\n' +
    '---\n';
  assert.equal(
    parseAgentDescription(content),
    'Seguridad de perímetro: FortiGate, VPN IPSec/SSL. Usar para configurar o auditar firewalls.',
  );
});

test('parseAgentDescription corta en la primera línea en blanco', () => {
  const content =
    '---\ndescription: |\n' +
    '  Primer párrafo.\n' +
    '\n' +
    '  Segundo párrafo que no debería aparecer.\n' +
    '---\n';
  assert.equal(parseAgentDescription(content), 'Primer párrafo.');
});

test('parseAgentDescription soporta description en una sola línea', () => {
  const content = '---\ndescription: Descripción corta.\n---\n';
  assert.equal(parseAgentDescription(content), 'Descripción corta.');
});

test('parseAgentDescription devuelve null si no hay description', () => {
  assert.equal(parseAgentDescription('---\nname: x\n---\n'), null);
});

test('parseAgentDescription devuelve null con contenido vacío', () => {
  assert.equal(parseAgentDescription(''), null);
});
