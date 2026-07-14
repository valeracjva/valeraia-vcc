import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentCategory } from '../lib/agent-catalog.js';

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
