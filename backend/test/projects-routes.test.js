import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express from 'express';

import { createRegistryStore } from '../lib/registry-store.js';
import { createProjectsRouter } from '../routes/projects.js';
import { createRegistryRouter } from '../routes/registry.js';

function registryFixture() {
  return {
    version: '1.0',
    workspaceRoot: 'C:\\AI-Workspace',
    reposRoot: 'E:\\Workspace-Repos',
    projects: [
      {
        id: 'alpha',
        name: 'Alpha',
        type: 'laravel',
        category: 'desarrollo',
        status: 'active',
        client: 'test',
        customField: { preserve: true },
        environments: [{ name: 'dev', server: 'srv-alpha' }],
      },
      {
        id: 'beta',
        name: 'Beta',
        type: 'infrastructure',
        category: 'infraestructura',
        status: 'active',
        client: 'test',
        environments: [],
      },
    ],
  };
}

async function withApi(run, { currentProjectId = 'alpha', handoverProjectId = 'alpha', spawnProcess, writeStateFiles = true } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vcc-project-routes-'));
  const registryPath = path.join(directory, 'projects-registry.json');
  const currentProjectPath = path.join(directory, 'current-project.json');
  const handoverPath = path.join(directory, 'HANDOVER.md');
  await writeFile(registryPath, JSON.stringify(registryFixture(), null, 2), 'utf8');
  if (writeStateFiles) {
    await writeFile(currentProjectPath, JSON.stringify({ projectId: currentProjectId }), 'utf8');
    await writeFile(handoverPath, `## Proyecto activo\n\n- Proyecto ID: ${handoverProjectId}\n`, 'utf8');
  }

  const store = createRegistryStore(registryPath);
  const app = express();
  app.use(express.json());
  app.use('/api/registry', createRegistryRouter({ store }));
  app.use('/api/projects', createProjectsRouter({ store, currentProjectPath, handoverPath, spawnProcess }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, body) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    return { response, payload };
  }

  try {
    await run({ request, store, registryPath });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test('GET /api/registry usa el store y expone hash sin alterar el body', async () => {
  await withApi(async ({ request }) => {
    const { response, payload } = await request('GET', '/api/registry');

    assert.equal(response.status, 200);
    assert.equal(payload.projects.length, 2);
    assert.match(response.headers.get('x-registry-hash'), /^[a-f0-9]{64}$/);
  });
});

test('POST /api/projects crea un proyecto', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const project = {
      name: 'Nuevo Proyecto', type: 'laravel', category: 'desarrollo',
      status: 'active', client: 'test', environments: [],
    };
    const { response, payload } = await request('POST', '/api/projects', { expectedHash, project });

    assert.equal(response.status, 201);
    assert.equal(payload.project.id, 'nuevo-proyecto');
    assert.ok((await store.readRegistry()).registry.projects.some(item => item.id === 'nuevo-proyecto'));
  });
});

test('POST /api/projects genera sufijo cuando el slug ya existe', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const project = {
      name: 'Alpha', type: 'laravel', category: 'desarrollo',
      status: 'active', client: 'test', environments: [],
    };
    const { response, payload } = await request('POST', '/api/projects', { expectedHash, project });

    assert.equal(response.status, 201);
    assert.equal(payload.project.id, 'alpha-2');
  });
});

test('POST /api/projects normaliza acentos y no acepta un ID elegido por el cliente', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const project = {
      id: 'id-elegido', name: 'Gestión Única Ñandú', type: 'laravel', category: 'desarrollo',
      status: 'active', client: 'test', environments: [],
    };
    const { response, payload } = await request('POST', '/api/projects', { expectedHash, project });

    assert.equal(response.status, 201);
    assert.equal(payload.project.id, 'gestion-unica-nandu');
  });
});

test('POST /api/projects traduce hash desactualizado a 409', async () => {
  await withApi(async ({ request, store, registryPath }) => {
    const expectedHash = await store.getRegistryHash();
    const current = (await store.readRegistry()).registry;
    current.projects[0].name = 'Cambio externo';
    await writeFile(registryPath, JSON.stringify(current, null, 2), 'utf8');
    const project = {
      name: 'Nuevo', type: 'laravel', category: 'desarrollo',
      status: 'active', client: 'test', environments: [],
    };

    const { response } = await request('POST', '/api/projects', { expectedHash, project });
    assert.equal(response.status, 409);
  });
});

test('PATCH /api/projects/:id edita metadata y preserva campos desconocidos', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('PATCH', '/api/projects/alpha', {
      expectedHash,
      changes: { name: 'Alpha editado' },
    });

    assert.equal(response.status, 200);
    const project = (await store.readRegistry()).registry.projects.find(item => item.id === 'alpha');
    assert.equal(project.name, 'Alpha editado');
    assert.deepEqual(project.customField, { preserve: true });
  });
});

test('PATCH de metadata no revalida ambientes legacy que no fueron modificados', async () => {
  await withApi(async ({ request, store, registryPath }) => {
    const current = (await store.readRegistry()).registry;
    current.projects[0].environments[0].host = 'legacy-host';
    await writeFile(registryPath, JSON.stringify(current, null, 2), 'utf8');
    const expectedHash = await store.getRegistryHash();

    const { response } = await request('PATCH', '/api/projects/alpha', {
      expectedHash,
      changes: { name: 'Alpha metadata' },
    });

    assert.equal(response.status, 200);
  });
});

test('PATCH /api/projects/:id rechaza cambiar el ID', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('PATCH', '/api/projects/alpha', {
      expectedHash,
      changes: { id: 'otro-id' },
    });

    assert.equal(response.status, 400);
  });
});

test('PATCH /api/projects/:id devuelve 404 si no existe', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('PATCH', '/api/projects/inexistente', {
      expectedHash,
      changes: { name: 'Nada' },
    });

    assert.equal(response.status, 404);
  });
});

test('DELETE /api/projects/:id elimina un proyecto no activo', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('DELETE', '/api/projects/beta', { expectedHash });

    assert.equal(response.status, 200);
    assert.ok(!(await store.readRegistry()).registry.projects.some(item => item.id === 'beta'));
  });
});

test('DELETE /api/projects/:id bloquea un proyecto activo', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('DELETE', '/api/projects/alpha', { expectedHash });

    assert.equal(response.status, 409);
    assert.ok((await store.readRegistry()).registry.projects.some(item => item.id === 'alpha'));
  });
});

test('DELETE bloquea referencia exclusiva de current-project.json', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('DELETE', '/api/projects/alpha', { expectedHash });
    assert.equal(response.status, 409);
  }, { currentProjectId: 'alpha', handoverProjectId: 'beta' });
});

test('DELETE bloquea referencia exclusiva de HANDOVER.md', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('DELETE', '/api/projects/alpha', { expectedHash });
    assert.equal(response.status, 409);
  }, { currentProjectId: 'beta', handoverProjectId: 'alpha' });
});

test('DELETE funciona aunque current-project.json y HANDOVER.md no existan', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('DELETE', '/api/projects/beta', { expectedHash });

    assert.equal(response.status, 200);
    assert.ok(!(await store.readRegistry()).registry.projects.some(item => item.id === 'beta'));
  }, { writeStateFiles: false });
});

test('crea, edita y borra un environment', async () => {
  await withApi(async ({ request, store }) => {
    let expectedHash = await store.getRegistryHash();
    let result = await request('POST', '/api/projects/beta/environments', {
      expectedHash,
      environment: { name: 'test', server: 'srv-test' },
    });
    assert.equal(result.response.status, 201);

    expectedHash = result.payload.hash;
    result = await request('PATCH', '/api/projects/beta/environments/test', {
      expectedHash,
      changes: { name: 'prod', server: 'srv-prod', host: 'srv-prod', remotePath: '/app' },
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.environment.name, 'prod');

    expectedHash = result.payload.hash;
    result = await request('DELETE', '/api/projects/beta/environments/prod', { expectedHash });
    assert.equal(result.response.status, 200);
    assert.deepEqual(
      (await store.readRegistry()).registry.projects.find(item => item.id === 'beta').environments,
      [],
    );
  });
});

test('rechaza un environment duplicado', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('POST', '/api/projects/alpha/environments', {
      expectedHash,
      environment: { name: 'dev', server: 'srv-otro' },
    });

    assert.equal(response.status, 409);
  });
});

test('rechaza host sin remotePath y remotePath sin host', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    let result = await request('POST', '/api/projects/beta/environments', {
      expectedHash,
      environment: { name: 'host-only', server: 'srv', host: 'srv-host' },
    });
    assert.equal(result.response.status, 400);

    result = await request('POST', '/api/projects/beta/environments', {
      expectedHash,
      environment: { name: 'path-only', server: 'srv', remotePath: '/app' },
    });
    assert.equal(result.response.status, 400);
  });
});

test('rechaza openScript con path traversal', async () => {
  await withApi(async ({ request, store }) => {
    const expectedHash = await store.getRegistryHash();
    const { response } = await request('POST', '/api/projects/beta/environments', {
      expectedHash,
      environment: { name: 'unsafe', server: 'srv', openScript: '../unsafe.ps1' },
    });

    assert.equal(response.status, 400);
  });
});

test('POST /api/projects/:id/open-ssh spawnea ssh con host/user válidos', async () => {
  const calls = [];
  const spawnProcess = (...args) => { calls.push(args); return { unref() {} }; };
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/projects/alpha/open-ssh', {
      host: '172.16.100.1',
      user: 'cvalera',
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(' '), /ssh cvalera@172\.16\.100\.1/);
  }, { spawnProcess });
});

test('POST /api/projects/:id/open-ssh rechaza host con caracteres inválidos', async () => {
  const calls = [];
  const spawnProcess = (...args) => { calls.push(args); return { unref() {} }; };
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/projects/alpha/open-ssh', {
      host: '172.16.100.1; rm -rf /',
      user: 'cvalera',
    });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  }, { spawnProcess });
});

test('POST /api/projects/open-claude-cli spawnea una terminal con claude', async () => {
  const calls = [];
  const spawnProcess = (...args) => { calls.push(args); return { unref() {} }; };
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/projects/open-claude-cli');
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(' '), /claude/);
  }, { spawnProcess });
});

test('un error inesperado se traduce a 500', async () => {
  const store = {
    readRegistry: async () => { throw new Error('boom'); },
  };
  const app = express();
  app.use('/api/registry', createRegistryRouter({ store }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/registry`);
    assert.equal(response.status, 500);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
