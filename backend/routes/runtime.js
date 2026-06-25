import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { PATHS } from '../config.js';

const router = Router();
const MAX_RECENT = 3;

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readRegistry() {
  return readJson(PATHS.registry, { projects: [] });
}

async function readRecentProjects() {
  return readJson(PATHS.recentProjects, []);
}

function projectCard(project, env) {
  return {
    projectId:   project.id,
    environment: env.name,
    name:        project.name,
    riskLevel:   env.riskLevel ?? 'bajo',
    url:         env.url ?? null,
  };
}

// GET /api/runtime/project — proyecto activo + recientes
router.get('/project', async (_req, res, next) => {
  try {
    const [current, recent] = await Promise.all([
      readJson(PATHS.currentProject, null),
      readRecentProjects(),
    ]);
    res.json({ current, recent });
  } catch (err) {
    next(err);
  }
});

// POST /api/runtime/set-project — activar proyecto
router.post('/set-project', async (req, res, next) => {
  try {
    const { projectId, environment } = req.body ?? {};
    console.log(`[runtime] set-project → projectId=${projectId} env=${environment}`);

    if (!projectId || !environment) {
      return res.status(400).json({ error: 'projectId y environment son obligatorios' });
    }

    const registry = await readRegistry();
    const project  = registry.projects?.find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: `Proyecto no encontrado: ${projectId}` });

    const env = project.environments?.find(e => e.name === environment);
    if (!env) return res.status(404).json({ error: `Ambiente no encontrado: ${environment}` });

    const now = new Date().toISOString();

    const newCurrent = {
      projectId,
      environment,
      aiProfile:   'claude-code',
      generatedAt: now,
      mcpProfile:  env.mcpProfile ?? null,
      riskLevel:   env.riskLevel  ?? 'bajo',
      host:        env.host       ?? null,
      serverIp:    env.serverIp   ?? null,
      remotePath:  env.remotePath ?? null,
      url:         env.url        ?? null,
    };

    const card    = { ...projectCard(project, env), activatedAt: now };
    const recent  = await readRecentProjects();
    const filtered = recent.filter(
      r => !(r.projectId === projectId && r.environment === environment)
    );
    const newRecent = [card, ...filtered].slice(0, MAX_RECENT);

    await Promise.all([
      writeFile(PATHS.currentProject, JSON.stringify(newCurrent, null, 2), 'utf8'),
      writeFile(PATHS.recentProjects, JSON.stringify(newRecent,  null, 2), 'utf8'),
    ]);

    console.log(`[runtime] set-project OK → ${projectId}/${environment}`);
    res.json({ current: newCurrent, recent: newRecent });
  } catch (err) {
    console.error('[runtime] set-project ERROR:', err.message);
    next(err);
  }
});

export default router;
