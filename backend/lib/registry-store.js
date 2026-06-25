import { createHash, randomUUID } from 'node:crypto';
import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PATHS } from '../config.js';

export class RegistryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryValidationError';
    this.statusCode = 400;
  }
}

export class RegistryConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryConflictError';
    this.statusCode = 409;
  }
}

function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RegistryValidationError(`${field} es obligatorio`);
  }
}

export function validateRegistry(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new RegistryValidationError('root debe ser un objeto');
  }

  for (const field of ['version', 'workspaceRoot', 'reposRoot']) {
    requireString(registry[field], `root.${field}`);
  }
  if (!Array.isArray(registry.projects)) {
    throw new RegistryValidationError('root.projects debe ser un array');
  }

  const projectIds = new Set();
  registry.projects.forEach((project, projectIndex) => {
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      throw new RegistryValidationError(`project[${projectIndex}] debe ser un objeto`);
    }

    for (const field of ['id', 'name', 'type', 'category', 'status', 'client']) {
      requireString(project[field], `project[${projectIndex}].${field}`);
    }

    if (projectIds.has(project.id)) {
      throw new RegistryValidationError(`ID de proyecto duplicado: ${project.id}`);
    }
    projectIds.add(project.id);

    if (project.environments === undefined) return;
    if (!Array.isArray(project.environments)) {
      throw new RegistryValidationError(`project[${projectIndex}].environments debe ser un array`);
    }

    const environmentNames = new Set();
    project.environments.forEach((environment, environmentIndex) => {
      if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
        throw new RegistryValidationError(
          `project[${projectIndex}].environment[${environmentIndex}] debe ser un objeto`,
        );
      }
      requireString(
        environment.name,
        `project[${projectIndex}].environment[${environmentIndex}].name`,
      );
      requireString(
        environment.server,
        `project[${projectIndex}].environment[${environmentIndex}].server`,
      );

      if (environmentNames.has(environment.name)) {
        throw new RegistryValidationError(
          `Ambiente duplicado en ${project.id}: ${environment.name}`,
        );
      }
      environmentNames.add(environment.name);
    });
  });

  return registry;
}

export function createRegistryStore(registryPath, { replaceFile = rename } = {}) {
  let mutationQueue = Promise.resolve();

  async function readValidatedFile(filePath) {
    const content = await readFile(filePath, 'utf8');
    const registry = JSON.parse(content);
    validateRegistry(registry);
    return { registry, hash: hashContent(content) };
  }

  async function readRegistry() {
    return readValidatedFile(registryPath);
  }

  async function getRegistryHash() {
    const content = await readFile(registryPath, 'utf8');
    return hashContent(content);
  }

  async function runMutation(expectedHash, mutatorFn) {
    if (typeof mutatorFn !== 'function') {
      throw new TypeError('mutatorFn debe ser una función');
    }

    const initial = await readRegistry();
    if (initial.hash !== expectedHash) {
      throw new RegistryConflictError('El hash original del registry cambió');
    }

    const draft = structuredClone(initial.registry);
    const mutatorResult = await mutatorFn(draft);
    const candidate = mutatorResult === undefined ? draft : mutatorResult;
    validateRegistry(candidate);

    const directory = path.dirname(registryPath);
    const baseName = path.basename(registryPath, path.extname(registryPath));
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const temporaryPath = path.join(directory, `.${baseName}.${suffix}.tmp`);
    const backupPath = path.join(directory, `${baseName}.backup.${suffix}.json`);
    const serialized = `${JSON.stringify(candidate, null, 2)}\n`;

    await writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });

    try {
      await readValidatedFile(temporaryPath);

      const currentHash = await getRegistryHash();
      if (currentHash !== expectedHash) {
        throw new RegistryConflictError('El hash original del registry cambió antes de reemplazar');
      }

      await copyFile(registryPath, backupPath);

      try {
        await replaceFile(temporaryPath, registryPath);
        const result = await readRegistry();
        return { ...result, backupPath };
      } catch (error) {
        try {
          await copyFile(backupPath, registryPath);
        } catch (restoreError) {
          error.restoreError = restoreError;
        }
        throw error;
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  function mutateRegistry(expectedHash, mutatorFn) {
    const operation = mutationQueue.then(() => runMutation(expectedHash, mutatorFn));
    mutationQueue = operation.catch(() => undefined);
    return operation;
  }

  return { readRegistry, validateRegistry, mutateRegistry, getRegistryHash };
}

const defaultStore = createRegistryStore(PATHS.registry);

export const readRegistry = defaultStore.readRegistry;
export const mutateRegistry = defaultStore.mutateRegistry;
export const getRegistryHash = defaultStore.getRegistryHash;
