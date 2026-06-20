import { Router } from 'express';
import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { PATHS } from '../config.js';

const router = Router();

router.post('/:id/environments/:env/open-vscode', async (req, res, next) => {
  const { id, env } = req.params;

  let registry;
  try {
    registry = JSON.parse(await readFile(PATHS.registry, 'utf8'));
  } catch {
    return res.status(500).json({ error: 'No se pudo leer el registry' });
  }

  const project = registry.projects.find(p => p.id === id);
  if (!project) return res.status(404).json({ error: `Proyecto '${id}' no encontrado` });

  const environment = (project.environments ?? []).find(e => e.name === env);
  if (!environment) return res.status(404).json({ error: `Ambiente '${env}' no encontrado` });

  const { host, remotePath } = environment;
  if (!host || !remotePath) {
    return res.status(400).json({ error: 'host o remotePath no definido para este ambiente' });
  }

  // Validar que host y remotePath no contengan metacaracteres de shell
  if (!/^[A-Za-z0-9._-]+$/.test(host)) {
    return res.status(400).json({ error: 'host contiene caracteres inválidos' });
  }
  if (/[;&|`$<>\\]/.test(remotePath)) {
    return res.status(400).json({ error: 'remotePath contiene caracteres inválidos' });
  }

  const child = spawn(
    'code',
    ['--remote', `ssh-remote+${host}`, remotePath],
    { shell: true, detached: true, stdio: 'ignore' }
  );
  child.unref();

  res.json({ ok: true });
});

export default router;
