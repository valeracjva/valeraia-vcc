import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';

import { parseAgentCategory, parseAgentDescription } from '../lib/agent-catalog.js';

export function createAgentsRouter({
  agentsDir = path.join(os.homedir(), '.claude', 'agents'),
  readdirFn = readdir,
  readFileFn = readFile,
} = {}) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const entries = await readdirFn(agentsDir).catch(() => []);
      const mdFiles = entries.filter(name => name.endsWith('.md'));
      const agents = [];
      for (const fileName of mdFiles) {
        const content = await readFileFn(path.join(agentsDir, fileName), 'utf8').catch(() => '');
        agents.push({
          name: fileName.replace(/\.md$/, ''),
          category: parseAgentCategory(content),
          description: parseAgentDescription(content),
        });
      }
      res.json({ agents });
    } catch (error) {
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
}

export default createAgentsRouter();
