import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createRegistryStore,
  validateRegistry,
} from '../lib/registry-store.js';

function validRegistry() {
  return {
    version: '1.0',
    workspaceRoot: 'C:\\AI-Workspace',
    reposRoot: 'E:\\Workspace-Repos',
    projects: [
      {
        id: 'demo',
        name: 'Demo',
        type: 'laravel',
        category: 'desarrollo',
        status: 'active',
        client: 'test',
        environments: [
          { name: 'dev', server: 'srv-demo' },
        ],
      },
    ],
  };
}

async function withTempRegistry(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vcc-registry-store-'));
  const registryPath = path.join(directory, 'projects-registry.json');
  const registry = validRegistry();
  await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');

  try {
    await run({ directory, registryPath, registry });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('readRegistry lee el JSON y devuelve el hash del contenido', async () => {
  await withTempRegistry(async ({ registryPath, registry }) => {
    const store = createRegistryStore(registryPath);
    const result = await store.readRegistry();

    assert.deepEqual(result.registry, registry);
    assert.match(result.hash, /^[a-f0-9]{64}$/);
    assert.equal(await store.getRegistryHash(), result.hash);
  });
});

test('validateRegistry rechaza IDs de proyecto duplicados', () => {
  const registry = validRegistry();
  registry.projects.push({ ...registry.projects[0] });

  assert.throws(() => validateRegistry(registry), /ID de proyecto duplicado: demo/);
});

test('validateRegistry rechaza nombres de ambiente duplicados por proyecto', () => {
  const registry = validRegistry();
  registry.projects[0].environments.push({ name: 'dev', server: 'srv-otro' });

  assert.throws(() => validateRegistry(registry), /Ambiente duplicado en demo: dev/);
});

test('validateRegistry rechaza campos obligatorios faltantes', () => {
  const registry = validRegistry();
  delete registry.projects[0].category;

  assert.throws(() => validateRegistry(registry), /project\[0\]\.category es obligatorio/);
});

test('readRegistry no altera el contenido del archivo', async () => {
  await withTempRegistry(async ({ registryPath }) => {
    const before = await readFile(registryPath, 'utf8');
    const store = createRegistryStore(registryPath);

    await store.readRegistry();

    assert.equal(await readFile(registryPath, 'utf8'), before);
  });
});

test('mutateRegistry hace round-trip sin cambios semánticos', async () => {
  await withTempRegistry(async ({ registryPath, registry }) => {
    const store = createRegistryStore(registryPath);
    const expectedHash = await store.getRegistryHash();

    await store.mutateRegistry(expectedHash, () => undefined);

    assert.deepEqual(JSON.parse(await readFile(registryPath, 'utf8')), registry);
  });
});

test('mutateRegistry preserva campos desconocidos y genera JSON válido', async () => {
  await withTempRegistry(async ({ directory, registryPath, registry }) => {
    registry.extensionRoot = { enabled: true };
    registry.projects[0].customProjectField = 'preservar';
    registry.projects[0].environments[0].customEnvironmentField = 42;
    await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');

    const store = createRegistryStore(registryPath);
    const expectedHash = await store.getRegistryHash();
    const result = await store.mutateRegistry(expectedHash, (draft) => {
      draft.projects[0].name = 'Demo editado';
    });

    const written = JSON.parse(await readFile(registryPath, 'utf8'));
    assert.equal(written.projects[0].name, 'Demo editado');
    assert.deepEqual(written.extensionRoot, { enabled: true });
    assert.equal(written.projects[0].customProjectField, 'preservar');
    assert.equal(written.projects[0].environments[0].customEnvironmentField, 42);
    assert.deepEqual(result.registry, written);
    assert.match(result.hash, /^[a-f0-9]{64}$/);

    const files = await readdir(directory);
    assert.equal(files.filter(name => name.includes('.backup.')).length, 1);
    assert.equal(files.filter(name => name.endsWith('.tmp')).length, 0);
  });
});

test('mutateRegistry devuelve conflicto cuando cambió el hash original', async () => {
  await withTempRegistry(async ({ registryPath, registry }) => {
    const store = createRegistryStore(registryPath);
    const staleHash = await store.getRegistryHash();
    registry.projects[0].name = 'Cambio externo';
    await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');

    await assert.rejects(
      store.mutateRegistry(staleHash, draft => {
        draft.projects[0].name = 'Cambio local';
      }),
      error => error.statusCode === 409 && /hash/.test(error.message),
    );

    const current = JSON.parse(await readFile(registryPath, 'utf8'));
    assert.equal(current.projects[0].name, 'Cambio externo');
  });
});

test('mutateRegistry restaura el backup si falla el reemplazo', async () => {
  await withTempRegistry(async ({ registryPath }) => {
    const original = await readFile(registryPath, 'utf8');
    const store = createRegistryStore(registryPath, {
      replaceFile: async (_temporaryPath, targetPath) => {
        await writeFile(targetPath, '{"corrupto":true}', 'utf8');
        throw new Error('fallo de reemplazo simulado');
      },
    });
    const expectedHash = await store.getRegistryHash();

    await assert.rejects(
      store.mutateRegistry(expectedHash, draft => {
        draft.projects[0].name = 'No debe persistir';
      }),
      /fallo de reemplazo simulado/,
    );

    assert.equal(await readFile(registryPath, 'utf8'), original);
  });
});
