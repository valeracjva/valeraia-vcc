import { Router } from 'express';
import net from 'net';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { TUNNEL_PORTS, PATHS } from '../config.js';

const router = Router();
const homeDir = os.homedir();

// ── helpers ──────────────────────────────────────────────────────────────────

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error',   () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function loadConfig() {
  const raw = await readFile(PATHS.tunnelsConfig, 'utf8');
  return JSON.parse(raw).tunnels;
}

function killPort(port) {
  return new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-Command',
      `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
      `if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Output "killed" } else { Write-Output "not_found" }`,
    ]);
    let out = '';
    ps.stdout.on('data', d => { out += d.toString(); });
    ps.on('close', () => resolve(out.trim()));
  });
}

// ── GET /api/tunnels  (sidebar dots — backward compat) ───────────────────────

router.get('/', async (req, res) => {
  const results = await Promise.all(
    TUNNEL_PORTS.map(async (port) => [String(port), await checkPort(port)])
  );
  res.json(Object.fromEntries(results));
});

// ── GET /api/tunnels/config  (M6 panel — config + status) ───────────────────

router.get('/config', async (req, res, next) => {
  try {
    const [tunnels, statuses] = await Promise.all([
      loadConfig(),
      Promise.all(TUNNEL_PORTS.map(async p => [p, await checkPort(p)])).then(Object.fromEntries),
    ]);
    res.json(tunnels.map(t => ({ ...t, active: !!statuses[t.port] })));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tunnels/:port/open ─────────────────────────────────────────────

router.post('/:port/open', async (req, res, next) => {
  const port = parseInt(req.params.port, 10);
  try {
    const tunnels = await loadConfig();
    const cfg = tunnels.find(t => t.port === port);
    if (!cfg) return res.status(404).json({ error: `Puerto ${port} no configurado` });

    const already = await checkPort(port);
    if (already) return res.json({ status: 'already_open' });

    const keyPath   = path.join(homeDir, cfg.key);
    const [fwHost, fwPort] = cfg.forward.split(':');

    const child = spawn('ssh', [
      '-i', keyPath,
      '-L', `${port}:${fwHost}:${fwPort}`,
      cfg.remote,
      '-N',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'BatchMode=yes',
    ], { detached: true, stdio: 'ignore' });
    child.unref();

    // Polling hasta que el puerto responde (max 12s)
    let ok = false;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkPort(port)) { ok = true; break; }
    }

    res.json({ status: ok ? 'open' : 'timeout', pid: child.pid });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tunnels/:port/close ────────────────────────────────────────────

router.post('/:port/close', async (req, res, next) => {
  const port = parseInt(req.params.port, 10);
  try {
    const result = await killPort(port);
    res.json({ status: result === 'killed' ? 'closed' : 'not_found' });
  } catch (err) {
    next(err);
  }
});

export default router;
