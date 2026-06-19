import { Router } from 'express';
import { readFile } from 'fs/promises';
import { PATHS } from '../config.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const raw = await readFile(PATHS.registry, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch {
      return res.status(500).json({ error: 'El archivo de registry no es JSON válido', path: PATHS.registry });
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'projects-registry.json no encontrado', path: PATHS.registry });
    }
    next(err);
  }
});

export default router;
