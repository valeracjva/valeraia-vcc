import { Router } from 'express';
import { readFile } from 'fs/promises';
import os from 'os';
import { PATHS } from '../config.js';
import { extractPendientesSection, parseGroups } from '../lib/md-parser.js';

const router = Router();

function extractMetaField(content, field) {
  const re = new RegExp(`^- ${field}:\\s*(.+)$`, 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// P1-P4 explícitos en HANDOVER.md bajo ### P1 / Crítico, etc.
function countHandoverByPriority(content) {
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  const lines = content.split('\n');
  let currentP = null;

  for (const line of lines) {
    const pMatch = line.match(/^### (P[1-4])\b/);
    if (pMatch) { currentP = pMatch[1]; continue; }
    if (line.startsWith('## ')) { currentP = null; continue; }
    if (currentP && /^- \[ \]/.test(line)) counts[currentP]++;
  }

  return counts;
}

// Emoji inicial del heading (primer carácter si es emoji, sino vacío)
function extractEmoji(heading) {
  const m = heading.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return m ? m[1] : '';
}

// Por sección de INDEX.md: { titulo, emoji, open, done }
function buildIndexSections(indexContent) {
  const raw = extractPendientesSection(indexContent);
  if (!raw) return [];

  return parseGroups(raw).map(group => ({
    titulo: group.heading,
    emoji:  extractEmoji(group.heading),
    open:   group.items.filter(i => !i.done).length,
    done:   group.items.filter(i =>  i.done).length,
  }));
}

router.get('/', async (req, res, next) => {
  try {
    const [handoverContent, indexContent] = await Promise.all([
      readFile(PATHS.handover, 'utf8'),
      readFile(PATHS.index,    'utf8').catch(() => null), // INDEX no bloquea si falta
    ]);

    const freshness    = extractMetaField(handoverContent, 'Estado de frescura');
    const hostFromFile = extractMetaField(handoverContent, 'Host detectado');

    const host       = hostFromFile ?? os.hostname();
    const hostSource = hostFromFile ? 'handover' : 'hostname-fallback';

    res.json({
      freshness: freshness ?? 'desconocido',
      host: { value: host, source: hostSource },
      pendientes: {
        handover: countHandoverByPriority(handoverContent),
        index: {
          porSeccion: indexContent ? buildIndexSections(indexContent) : [],
        },
      },
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'HANDOVER.md no encontrado' });
    }
    next(err);
  }
});

export default router;
