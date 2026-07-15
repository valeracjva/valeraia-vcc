import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';

import { PATHS, WORKSPACE_ROOT } from '../config.js';
import { mutateRegistry, readRegistry } from '../lib/registry-store.js';

const PROJECT_FIELDS = ['id', 'name', 'type', 'category', 'status', 'client'];
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_OPEN_SCRIPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const defaultStore = { mutateRegistry, readRegistry };

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendError(res, error) {
  const status = [400, 404, 409].includes(error?.statusCode) ? error.statusCode : 500;
  return res.status(status).json({
    error: status === 500 ? 'Error interno del servidor' : error.message,
  });
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${field} debe ser un objeto`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} es obligatorio`);
  }
}

function requireExpectedHash(expectedHash) {
  requireString(expectedHash, 'expectedHash');
  return expectedHash;
}

function validateEnvironment(environment, field = 'environment') {
  requireObject(environment, field);
  requireString(environment.name, `${field}.name`);
  requireString(environment.server, `${field}.server`);

  for (const optionalField of ['host', 'remotePath', 'openScript']) {
    if (environment[optionalField] !== undefined && typeof environment[optionalField] !== 'string') {
      throw new HttpError(400, `${field}.${optionalField} debe ser string`);
    }
  }

  const hasHost = typeof environment.host === 'string' && !!environment.host.trim();
  const hasRemotePath = typeof environment.remotePath === 'string' && !!environment.remotePath.trim();
  if (hasHost !== hasRemotePath) {
    throw new HttpError(400, 'host y remotePath deben coexistir');
  }

  if (environment.openScript) {
    const openScript = environment.openScript.trim();
    if (
      !SAFE_OPEN_SCRIPT_PATTERN.test(openScript)
      || openScript.includes('..')
      || path.basename(openScript) !== openScript
    ) {
      throw new HttpError(400, 'openScript debe ser sólo un nombre de archivo seguro');
    }
  }
}

function validateProject(project, { validateEnvironments = true } = {}) {
  requireObject(project, 'project');
  for (const field of PROJECT_FIELDS) requireString(project[field], `project.${field}`);
  if (!PROJECT_ID_PATTERN.test(project.id)) {
    throw new HttpError(400, 'project.id debe ser un slug en minúsculas');
  }
  if (validateEnvironments && project.environments !== undefined) {
    if (!Array.isArray(project.environments)) {
      throw new HttpError(400, 'project.environments debe ser un array');
    }
    const names = new Set();
    project.environments.forEach((environment, index) => {
      validateEnvironment(environment, `project.environments[${index}]`);
      if (names.has(environment.name)) {
        throw new HttpError(409, `Ambiente duplicado: ${environment.name}`);
      }
      names.add(environment.name);
    });
  }
}

function slugifyProjectName(name) {
  requireString(name, 'project.name');
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new HttpError(400, 'project.name no permite generar un id válido');
  return slug;
}

function uniqueProjectId(projects, baseId) {
  const ids = new Set(projects.map(project => project.id));
  if (!ids.has(baseId)) return baseId;
  let suffix = 2;
  while (ids.has(`${baseId}-${suffix}`)) suffix++;
  return `${baseId}-${suffix}`;
}

function findProject(registry, id) {
  const project = registry.projects.find(item => item.id === id);
  if (!project) throw new HttpError(404, `Proyecto '${id}' no encontrado`);
  return project;
}

function findEnvironment(project, name) {
  const environment = (project.environments ?? []).find(item => item.name === name);
  if (!environment) throw new HttpError(404, `Ambiente '${name}' no encontrado`);
  return environment;
}

async function getActiveProjectIds(currentProjectPath, handoverPath) {
  const [currentRaw, handover] = await Promise.all([
    readFile(currentProjectPath, 'utf8'),
    readFile(handoverPath, 'utf8'),
  ]);
  const current = JSON.parse(currentRaw);
  const handoverMatch = handover.match(/^- Proyecto ID:\s*(.+?)\s*$/m);
  return new Set([current.projectId, handoverMatch?.[1]].filter(Boolean));
}

export function createProjectsRouter({
  store = defaultStore,
  currentProjectPath = path.join(WORKSPACE_ROOT, 'runtime', 'current-project.json'),
  handoverPath = PATHS.handover,
  spawnProcess = spawn,
} = {}) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const expectedHash = requireExpectedHash(req.body?.expectedHash);
      const project = structuredClone(req.body?.project);
      requireObject(project, 'project');
      delete project.id;
      const baseId = slugifyProjectName(project.name);
      project.id = baseId;
      validateProject(project);

      let createdProject;
      const result = await store.mutateRegistry(expectedHash, registry => {
        project.id = uniqueProjectId(registry.projects, baseId);
        registry.projects.push(project);
        createdProject = structuredClone(project);
      });
      res.status(201).json({ project: createdProject, hash: result.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const expectedHash = requireExpectedHash(req.body?.expectedHash);
      const changes = req.body?.changes;
      requireObject(changes, 'changes');
      if (changes.id !== undefined && changes.id !== req.params.id) {
        throw new HttpError(400, 'No se permite cambiar el id del proyecto');
      }

      let updatedProject;
      const result = await store.mutateRegistry(expectedHash, registry => {
        const project = findProject(registry, req.params.id);
        Object.assign(project, structuredClone(changes));
        validateProject(project, { validateEnvironments: changes.environments !== undefined });
        updatedProject = structuredClone(project);
      });
      res.json({ project: updatedProject, hash: result.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const expectedHash = requireExpectedHash(req.body?.expectedHash);
      const activeProjectIds = await getActiveProjectIds(currentProjectPath, handoverPath);
      if (activeProjectIds.has(req.params.id)) {
        throw new HttpError(409, `Proyecto '${req.params.id}' está activo y no puede eliminarse`);
      }

      const result = await store.mutateRegistry(expectedHash, registry => {
        const projectIndex = registry.projects.findIndex(item => item.id === req.params.id);
        if (projectIndex === -1) throw new HttpError(404, `Proyecto '${req.params.id}' no encontrado`);
        registry.projects.splice(projectIndex, 1);
      });
      res.json({ deleted: req.params.id, hash: result.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/:id/environments', async (req, res) => {
    try {
      const expectedHash = requireExpectedHash(req.body?.expectedHash);
      const environment = structuredClone(req.body?.environment);
      validateEnvironment(environment);

      const result = await store.mutateRegistry(expectedHash, registry => {
        const project = findProject(registry, req.params.id);
        project.environments ??= [];
        if (project.environments.some(item => item.name === environment.name)) {
          throw new HttpError(409, `Ambiente '${environment.name}' ya existe`);
        }
        project.environments.push(environment);
      });
      res.status(201).json({ environment, hash: result.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/:id/environments/:env', async (req, res) => {
    try {
      const expectedHash = requireExpectedHash(req.body?.expectedHash);
      const changes = req.body?.changes;
      requireObject(changes, 'changes');

      let updatedEnvironment;
      const result = await store.mutateRegistry(expectedHash, registry => {
        const project = findProject(registry, req.params.id);
        const environment = findEnvironment(project, req.params.env);
        Object.assign(environment, structuredClone(changes));
        validateEnvironment(environment);
        if (
          project.environments.some(item => item !== environment && item.name === environment.name)
        ) {
          throw new HttpError(409, `Ambiente '${environment.name}' ya existe`);
        }
        updatedEnvironment = structuredClone(environment);
      });
      res.json({ environment: updatedEnvironment, hash: result.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/:id/environments/:env', async (req, res) => {
    try {
      const expectedHash = requireExpectedHash(req.body?.expectedHash);
      const result = await store.mutateRegistry(expectedHash, registry => {
        const project = findProject(registry, req.params.id);
        const environmentIndex = (project.environments ?? [])
          .findIndex(item => item.name === req.params.env);
        if (environmentIndex === -1) {
          throw new HttpError(404, `Ambiente '${req.params.env}' no encontrado`);
        }
        project.environments.splice(environmentIndex, 1);
      });
      res.json({ deleted: req.params.env, hash: result.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/:id/environments/:env/open-vscode', async (req, res) => {
    try {
      const { registry } = await store.readRegistry();
      const project = findProject(registry, req.params.id);
      const environment = findEnvironment(project, req.params.env);
      const { host, remotePath } = environment;
      if (!host || !remotePath) {
        throw new HttpError(400, 'host o remotePath no definido para este ambiente');
      }
      if (!/^[A-Za-z0-9._-]+$/.test(host)) {
        throw new HttpError(400, 'host contiene caracteres inválidos');
      }
      if (/[;&|`$<>\\]/.test(remotePath)) {
        throw new HttpError(400, 'remotePath contiene caracteres inválidos');
      }

      const child = spawnProcess(
        'code',
        ['--remote', `ssh-remote+${host}`, remotePath],
        { shell: true, detached: true, stdio: 'ignore' },
      );
      child.unref();
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/:id/open-ssh', async (req, res) => {
    try {
      const { host, user } = req.body ?? {};
      requireString(host, 'host');
      requireString(user, 'user');
      if (!/^[A-Za-z0-9._-]+$/.test(host)) throw new HttpError(400, 'host contiene caracteres inválidos');
      if (!/^[A-Za-z0-9._-]+$/.test(user)) throw new HttpError(400, 'user contiene caracteres inválidos');

      const child = spawnProcess(
        'pwsh',
        ['-NoExit', '-Command', `ssh ${user}@${host}`],
        { detached: true, stdio: 'ignore' },
      );
      child.unref();
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/open-claude-cli', (req, res) => {
    const child = spawnProcess(
      'pwsh',
      ['-NoExit', '-Command', `Set-Location '${WORKSPACE_ROOT}'; claude`],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();
    res.json({ ok: true });
  });

  return router;
}

export default createProjectsRouter();
