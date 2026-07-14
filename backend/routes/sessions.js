import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Router } from 'express';

import { PATHS, SCRIPTS, WORKSPACE_ROOT } from '../config.js';
import { readRegistry } from '../lib/registry-store.js';
import { buildActiveMd } from '../lib/session-template.js';

const execFileAsync = promisify(execFile);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendError(res, error) {
  const status = [400, 404].includes(error?.statusCode) ? error.statusCode : 500;
  res.status(status).json({ error: error.message || 'Error interno del servidor' });
}

export function fechaActual() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function createSessionsRouter({
  readRegistryFn = readRegistry,
  sessionsRoot = PATHS.sessionsRoot,
  buildScriptPath = SCRIPTS['build-ai-context'],
  execFileFn = (...args) => execFileAsync(...args),
} = {}) {
  const router = Router();

  router.post('/:projectId/save', async (req, res) => {
    try {
      const { environment, resumen } = req.body ?? {};
      const { registry } = await readRegistryFn();
      const project = registry.projects.find(item => item.id === req.params.projectId);
      if (!project) throw new HttpError(404, `Proyecto '${req.params.projectId}' no encontrado`);
      const env = (project.environments ?? []).find(item => item.name === environment);
      if (!env) throw new HttpError(404, `Ambiente '${environment}' no encontrado`);

      if (!resumen || !resumen.trim()) {
        return res.json({ skipped: true });
      }

      const fecha = fechaActual();
      const md = buildActiveMd({ projectId: project.id, environment, resumen: resumen.trim(), fecha });
      const projectSessionDir = path.join(sessionsRoot, project.id);
      await mkdir(projectSessionDir, { recursive: true });
      await writeFile(path.join(projectSessionDir, 'active.md'), md, 'utf8');

      const scriptPath = path.isAbsolute(buildScriptPath)
        ? buildScriptPath
        : path.join(WORKSPACE_ROOT, buildScriptPath);

      try {
        const { stdout } = await execFileFn('pwsh', [
          '-NoProfile', '-NonInteractive', '-File', scriptPath,
          '-ProjectId', project.id, '-Environment', environment,
          '-AIProfile', 'claude-code', '-Json',
        ]);
        const result = JSON.parse(stdout.trim());
        res.json({ ok: true, bundlePath: result.bundlePath });
      } catch (scriptError) {
        throw new HttpError(500, scriptError.stderr || scriptError.message);
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createSessionsRouter();
