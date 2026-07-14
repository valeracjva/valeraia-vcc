import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express from 'express';

import { createSessionsRouter } from '../routes/sessions.js';
import { fechaActual } from '../routes/sessions.js';

test('fechaActual() retorna hora local en formato YYYY-MM-DD HH:mm', () => {
  const result = fechaActual();

  // Verificar formato correcto
  assert.match(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

  // Verificar que NO es UTC (no debería ser igual a toISOString().slice(0,16).replace('T',' '))
  const utcFormat = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // Solo assert que difiere si la zona horaria local no es UTC
  const offset = new Date().getTimezoneOffset();
  if (offset !== 0) {
    // Si hay offset (no es UTC), fechaActual debe diferir de UTC
    assert.notEqual(result, utcFormat, 'fechaActual debe retornar hora local, no UTC');
  }

  // Verificar que la fecha esté razonablemente cerca a ahora
  const [year, month, day, hours, mins] = result.match(/(\d+)/g).map(Number);
  const now = new Date();
  assert.equal(year, now.getFullYear());
  assert.equal(month, now.getMonth() + 1);
  assert.equal(day, now.getDate());
  // La hora y minutos pueden coincidir o estar a un minuto de diferencia
  const expectedHours = now.getHours();
  const expectedMins = now.getMinutes();
  assert(hours === expectedHours || hours === expectedHours + 1 || hours === expectedHours - 1);
  assert(mins === expectedMins || mins === expectedMins + 1 || mins === expectedMins - 1);
});

function registryFixture() {
  return {
    registry: {
      version: '1.0',
      workspaceRoot: 'C:\\AI-Workspace',
      reposRoot: 'E:\\Workspace-Repos',
      projects: [
        {
          id: 'alpha', name: 'Alpha', type: 'laravel', category: 'desarrollo',
          status: 'active', client: 'test',
          environments: [{ name: 'test', server: 'srv-alpha' }],
        },
      ],
    },
    hash: 'fakehash',
  };
}

async function withApi(run, { execFileFn } = {}) {
  const sessionsRoot = await mkdtemp(path.join(tmpdir(), 'vcc-sessions-'));
  const readRegistryFn = async () => registryFixture();
  const defaultExecFileFn = async () => ({
    stdout: JSON.stringify({ timestamp: '2026-07-13T18:30:00', bundlePath: 'runtime/context-bundle.md', lines: 42 }),
    stderr: '',
  });

  const app = express();
  app.use(express.json());
  app.use('/api/sessions', createSessionsRouter({
    readRegistryFn,
    sessionsRoot,
    buildScriptPath: 'fake-build-ai-context.ps1',
    execFileFn: execFileFn ?? defaultExecFileFn,
  }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, body) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    return { response, payload };
  }

  try {
    await run({ request, sessionsRoot });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(sessionsRoot, { recursive: true, force: true });
  }
}

test('POST /api/sessions/:id/save escribe active.md y regenera el bundle', async () => {
  await withApi(async ({ request, sessionsRoot }) => {
    const { response, payload } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'test',
      resumen: 'Nota de prueba',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.bundlePath, 'runtime/context-bundle.md');

    const written = await readFile(path.join(sessionsRoot, 'alpha', 'active.md'), 'utf8');
    assert.match(written, /Nota de prueba/);
  });
});

test('POST /api/sessions/:id/save con resumen vacío no escribe nada', async () => {
  await withApi(async ({ request, sessionsRoot }) => {
    const { response, payload } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'test',
      resumen: '   ',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.skipped, true);
    await assert.rejects(readFile(path.join(sessionsRoot, 'alpha', 'active.md'), 'utf8'));
  });
});

test('POST /api/sessions/:id/save con proyecto inexistente responde 404', async () => {
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/sessions/no-existe/save', {
      environment: 'test',
      resumen: 'algo',
    });
    assert.equal(response.status, 404);
  });
});

test('POST /api/sessions/:id/save con ambiente inexistente responde 404', async () => {
  await withApi(async ({ request }) => {
    const { response } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'no-existe',
      resumen: 'algo',
    });
    assert.equal(response.status, 404);
  });
});

test('POST /api/sessions/:id/save responde 500 si el script falla, sin borrar el .md ya escrito', async () => {
  const failingExecFileFn = async () => {
    const err = new Error('script failed');
    err.code = 2;
    err.stderr = 'proyecto/ambiente no encontrado';
    throw err;
  };
  await withApi(async ({ request, sessionsRoot }) => {
    const { response, payload } = await request('POST', '/api/sessions/alpha/save', {
      environment: 'test',
      resumen: 'Nota que debe sobrevivir al fallo del script',
    });
    assert.equal(response.status, 500);
    assert.match(payload.error, /proyecto\/ambiente no encontrado/);

    const written = await readFile(path.join(sessionsRoot, 'alpha', 'active.md'), 'utf8');
    assert.match(written, /Nota que debe sobrevivir al fallo del script/);
  }, { execFileFn: failingExecFileFn });
});
