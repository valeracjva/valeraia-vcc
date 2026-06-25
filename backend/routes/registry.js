import { Router } from 'express';

import { readRegistry } from '../lib/registry-store.js';

const defaultStore = { readRegistry };

function sendError(res, error) {
  if (error?.code === 'ENOENT') {
    return res.status(404).json({ error: 'projects-registry.json no encontrado' });
  }
  const status = [400, 404, 409].includes(error?.statusCode) ? error.statusCode : 500;
  return res.status(status).json({
    error: status === 500 ? 'Error interno del servidor' : error.message,
  });
}

export function createRegistryRouter({ store = defaultStore } = {}) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const { registry, hash } = await store.readRegistry();
      res.setHeader('ETag', `"${hash}"`);
      res.setHeader('X-Registry-Hash', hash);
      res.json(registry);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createRegistryRouter();
