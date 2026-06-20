import { Router } from 'express';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { SCRIPTS, WORKSPACE_ROOT } from '../config.js';

const WS_OPEN = 1;

export default function governRouter(wss) {
  const router = Router();
  let activeJob = null;

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WS_OPEN) client.send(data);
    }
  }

  router.post('/run', (req, res) => {
    const { script } = req.body ?? {};

    if (!script || !SCRIPTS[script]) {
      return res.status(400).json({ error: `Script desconocido: '${script}'` });
    }
    if (activeJob) {
      return res.status(409).json({ error: 'Ya hay un script corriendo' });
    }

    const jobId = `ws-${Date.now()}`;
    activeJob = jobId;
    res.status(202).json({ jobId });

    const scriptPath = path.join(WORKSPACE_ROOT, SCRIPTS[script]);
    let child;
    try {
      child = spawn('pwsh', ['-NoProfile', '-File', scriptPath], {
        cwd: WORKSPACE_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      broadcast({ type: 'error', jobId, message: err.message });
      activeJob = null;
      return;
    }

    const rl_out = createInterface({ input: child.stdout });
    const rl_err = createInterface({ input: child.stderr });

    rl_out.on('line', (data) => broadcast({ type: 'output', jobId, data: data + '\n' }));
    rl_err.on('line', (data) => broadcast({ type: 'output', jobId, data: data + '\n' }));

    child.on('close', (exitCode) => {
      broadcast({ type: 'done', jobId, exitCode: exitCode ?? -1 });
      activeJob = null;
    });

    child.on('error', (err) => {
      broadcast({ type: 'error', jobId, message: err.message });
      activeJob = null;
    });
  });

  return router;
}
