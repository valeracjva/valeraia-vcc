import { Router } from 'express';
import { readFile } from 'fs/promises';
import { PATHS } from '../config.js';

const router = Router();

function parseSections(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentSection = null;
  let buffer = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection !== null) {
        sections[currentSection] = buffer.join('\n').trim();
      }
      currentSection = line.slice(3).trim();
      buffer = [];
    } else if (currentSection !== null) {
      buffer.push(line);
    }
  }
  if (currentSection !== null) {
    sections[currentSection] = buffer.join('\n').trim();
  }

  return sections;
}

router.get('/', async (req, res, next) => {
  try {
    const raw = await readFile(PATHS.handover, 'utf8');
    res.json({ raw, sections: parseSections(raw) });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'HANDOVER.md no encontrado' });
    }
    next(err);
  }
});

export default router;
