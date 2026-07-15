// backend/routes/monitoring-core.js
import { Router } from 'express';
import { readFile } from 'fs/promises';
import { PATHS } from '../config.js';
import { getMonitoredServers } from './metrics.js';
import { readCatchupForHost } from '../monitoring-core/catchup.js';

const router = Router();

// GET /api/monitoring-core/catchup — se llama una vez al cargar la UI (no en cada refresh
// de 30s), muestra que paso en los hosts con agente local mientras VCC estuvo apagado.
router.get('/catchup', async (_req, res, next) => {
  try {
    const { servers } = JSON.parse(await readFile(PATHS.serversConfig, 'utf8'));
    const agentServerIds = servers.filter(s => s.localAgent === true).map(s => s.id);
    const monitored = await getMonitoredServers();

    const hosts = await Promise.all(
      agentServerIds
        .filter(id => monitored[id])
        .map(id => readCatchupForHost(id, monitored[id]))
    );

    res.json({ generatedAt: new Date().toISOString(), hosts });
  } catch (err) {
    next(err);
  }
});

export default router;
