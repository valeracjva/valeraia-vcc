import test from 'node:test';
import assert from 'node:assert/strict';
import { computeImpact } from '../opsmap-impact.js';

function fixtureGraph() {
  const nodes = [
    { id: 'workspace', type: 'workspace', label: 'ValeraIA', state: 'fresh' },
    { id: 'server:srv1', type: 'server', label: 'srv1', state: 'fresh' },
    { id: 'domain:example.com', type: 'domain', label: 'example.com', state: 'watch' },
    { id: 'env:proj1:prod', type: 'environment', label: 'prod', state: 'critico' },
    { id: 'project:proj1', type: 'project', label: 'proj1', state: 'fresh' },
    { id: 'tunnel:3309', type: 'tunnel', label: '3309', state: 'critico' },
    { id: 'mcp:laravel-dev-full', type: 'mcp', label: 'laravel-dev-full', state: 'fresh' },
    { id: 'server:srv2', type: 'server', label: 'srv2', state: 'fresh' },
    { id: 'domain:app.test', type: 'domain', label: 'app.test', state: 'watch' },
    { id: 'env:proj2:dev', type: 'environment', label: 'dev', state: 'fresh' },
    { id: 'project:proj2', type: 'project', label: 'proj2', state: 'fresh' },
    { id: 'domain:isolated.com', type: 'domain', label: 'isolated.com', state: 'idle' },
  ];

  const links = [
    { from: 'workspace', to: 'server:srv1', type: 'contains', label: 'inventario' },
    { from: 'workspace', to: 'server:srv2', type: 'contains', label: 'inventario' },
    { from: 'server:srv1', to: 'domain:example.com', type: 'exposes', label: 'expone' },
    { from: 'workspace', to: 'domain:example.com', type: 'monitors', label: 'monitorea SSL' },
    { from: 'workspace', to: 'domain:isolated.com', type: 'monitors', label: 'monitorea SSL' },
    { from: 'workspace', to: 'project:proj1', type: 'has-project', label: 'proyecto' },
    { from: 'project:proj1', to: 'env:proj1:prod', type: 'has-env', label: 'ambiente' },
    { from: 'env:proj1:prod', to: 'server:srv1', type: 'runs-on', label: 'corre en' },
    { from: 'env:proj1:prod', to: 'mcp:laravel-dev-full', type: 'uses-mcp', label: 'usa MCP' },
    { from: 'workspace', to: 'tunnel:3309', type: 'has-tunnel', label: 'tunel' },
    { from: 'tunnel:3309', to: 'server:srv1', type: 'tunnel-to', label: 'conecta' },
    { from: 'workspace', to: 'project:proj2', type: 'has-project', label: 'proyecto' },
    { from: 'project:proj2', to: 'env:proj2:dev', type: 'has-env', label: 'ambiente' },
    { from: 'env:proj2:dev', to: 'server:srv2', type: 'runs-on', label: 'corre en' },
    { from: 'server:srv2', to: 'domain:app.test', type: 'exposes', label: 'expone' },
  ];

  return { nodes, links };
}

test('server con env + domain + tunnel + mcp: impacto completo y crítico', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('server:srv1', nodes, links);

  const impactedIds = result.impacted.map(n => n.id).sort();
  assert.deepEqual(impactedIds, [
    'domain:example.com',
    'env:proj1:prod',
    'mcp:laravel-dev-full',
    'project:proj1',
    'tunnel:3309',
  ]);
  assert.equal(result.hasCritical, true);
  assert.equal(result.byType.domain.length, 1);
  assert.equal(result.byType.environment.length, 1);
  assert.equal(result.byType.project.length, 1);
  assert.equal(result.byType.tunnel.length, 1);
  assert.equal(result.byType.mcp.length, 1);
});

test('server sin nodos críticos: impacto sin badge crítico', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('server:srv2', nodes, links);

  const impactedIds = result.impacted.map(n => n.id).sort();
  assert.deepEqual(impactedIds, [
    'domain:app.test',
    'env:proj2:dev',
    'project:proj2',
  ]);
  assert.equal(result.hasCritical, false);
});

test('domain aislado: impacto vacío', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('domain:isolated.com', nodes, links);

  assert.deepEqual(result.impacted, []);
  assert.deepEqual(result.byType, {});
  assert.equal(result.hasCritical, false);
});

test('no cruza por workspace ni mezcla clusters', () => {
  const { nodes, links } = fixtureGraph();
  const result = computeImpact('server:srv1', nodes, links);

  const impactedIds = new Set(result.impacted.map(n => n.id));
  assert.equal(impactedIds.has('workspace'), false);
  assert.equal(impactedIds.has('server:srv2'), false);
  assert.equal(impactedIds.has('domain:app.test'), false);
  assert.equal(impactedIds.has('env:proj2:dev'), false);
  assert.equal(impactedIds.has('project:proj2'), false);
});
