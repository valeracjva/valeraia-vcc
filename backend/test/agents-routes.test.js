import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';

import { createAgentsRouter } from '../routes/agents.js';

async function withApi(run, { files } = {}) {
  const readdirFn = async () => Object.keys(files ?? {});
  const readFileFn = async (p) => {
    const name = p.split(/[\\/]/).pop();
    if (!(name in (files ?? {}))) throw new Error('ENOENT');
    return files[name];
  };

  const app = express();
  app.use('/api/agents', createAgentsRouter({ agentsDir: '/fake/agents', readdirFn, readFileFn }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request() {
    const response = await fetch(`${baseUrl}/api/agents`);
    const payload = await response.json();
    return { response, payload };
  }

  try {
    await run({ request });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('GET /api/agents lista agentes con nombre y categoría', async () => {
  await withApi(async ({ request }) => {
    const { response, payload } = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(
      payload.agents.sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: 'laravel-dev', category: 'aplicaciones', description: null },
        { name: 'networking', category: 'red', description: null },
      ],
    );
  }, {
    files: {
      'laravel-dev.md': '---\ncategory: aplicaciones\n---\n',
      'networking.md': '---\ncategory: red\n---\n',
      'ignorar.txt': 'no es .md, no debería listarse',
    },
  });
});

test('GET /api/agents con directorio vacío devuelve lista vacía (no es error)', async () => {
  await withApi(async ({ request }) => {
    const { response, payload } = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.agents, []);
  }, { files: {} });
});
