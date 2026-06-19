import { Router } from 'express';
import { readFile } from 'fs/promises';
import { PATHS } from '../config.js';
import { extractPendientesSection, parseGroups } from '../lib/md-parser.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const content = await readFile(PATHS.index, 'utf8');
    const raw = extractPendientesSection(content);
    const items = raw ? parseGroups(raw) : [];
    res.json({ raw, items });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'INDEX.md no encontrado' });
    }
    next(err);
  }
});

export default router;
