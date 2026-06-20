import { Router } from 'express';
import net from 'net';
import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { TUNNEL_PORTS, PATHS } from '../config.js';

const router = Router();
const homeDir = os.homedir();
const sshDir  = path.resolve(homeDir, '.ssh');
const adhocTunnels = new Map(); // port -> adhoc config (in-memory only)

// ── validación ───────────────────────────────────────────────────────────────

const RE_REMOTE  = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;
const RE_FORWARD = /^[A-Za-z0-9._-]+:\d{1,5}$/;

function validateTunnelInput({ remote, key, forward }) {
  if (!RE_REMOTE.test((remote || '').trim()))
    return 'remote inválido — formato esperado: user@host';
  if (!RE_FORWARD.test((forward || '').trim()))
    return 'forward inválido — formato esperado: host:port';
  const resolved = path.resolve(homeDir, (key || '').trim());
  if (!resolved.startsWith(sshDir + path.sep))
    return 'key debe estar bajo ~/.ssh y no puede contener ..';
  return null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

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

function spawnTunnel(port, remote, keyRelative, forward) {
  const keyPath = path.resolve(homeDir, keyRelative);
  if (!keyPath.startsWith(sshDir + path.sep))
    throw new Error('key fuera de ~/.ssh');
  const [fwHost, fwPort] = forward.split(':');
  const child = spawn('ssh', [
    '-i', keyPath,
    '-L', `${port}:${fwHost}:${fwPort}`,
    remote, '-N',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'BatchMode=yes',
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

async function pollPort(port, attempts = 24, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, delayMs));
    if (await checkPort(port)) return true;
  }
  return false;
}

// ── GET /api/tunnels  (sidebar dots — backward compat) ───────────────────────

router.get('/', async (req, res) => {
  const allPorts = [...TUNNEL_PORTS, ...adhocTunnels.keys()];
  const results  = await Promise.all(allPorts.map(async p => [String(p), await checkPort(p)]));
  res.json(Object.fromEntries(results));
});

// ── GET /api/tunnels/config ───────────────────────────────────────────────────

router.get('/config', async (req, res, next) => {
  try {
    const saved   = await loadConfig();
    const allPorts = [...saved.map(t => t.port), ...adhocTunnels.keys()];
    const statuses = Object.fromEntries(
      await Promise.all(allPorts.map(async p => [p, await checkPort(p)]))
    );

    const savedList = saved.map(t => ({ ...t, active: !!statuses[t.port] }));

    const adhocList = [];
    for (const [port, cfg] of adhocTunnels) {
      if (!statuses[port]) adhocTunnels.delete(port); // cleanup stale
      else adhocList.push({ ...cfg, active: true, adhoc: true });
    }

    res.json([...savedList, ...adhocList]);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/tunnels/config ───────────────────────────────────────────────────

router.put('/config', async (req, res, next) => {
  try {
    const { tunnels } = req.body;
    if (!Array.isArray(tunnels))
      return res.status(400).json({ error: 'tunnels debe ser un array' });

    for (const t of tunnels) {
      if (!Number.isInteger(t.port) || t.port < 1024 || t.port > 65535)
        return res.status(400).json({ error: `Puerto inválido: ${t.port}` });
      for (const f of ['name', 'remote', 'key', 'forward']) {
        if (typeof t[f] !== 'string' || !t[f].trim())
          return res.status(400).json({ error: `Campo requerido: ${f}` });
      }
      const err = validateTunnelInput(t);
      if (err) return res.status(400).json({ error: err });
    }

    const clean = tunnels.map(({ port, name, desc, remote, key, forward, prod }) => ({
      port, name: name.trim(), desc: (desc || '').trim(),
      remote: remote.trim(), key: key.trim(), forward: forward.trim(),
      prod: !!prod,
    }));

    await writeFile(PATHS.tunnelsConfig, JSON.stringify({ tunnels: clean }, null, 2), 'utf8');
    res.json({ tunnels: clean });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tunnels/adhoc ───────────────────────────────────────────────────

router.post('/adhoc', async (req, res, next) => {
  const { port: rawPort, name, remote, key, forward } = req.body;
  const port = parseInt(rawPort, 10);

  if (!port || port < 1024 || port > 65535)
    return res.status(400).json({ error: 'Puerto inválido (1024–65535)' });
  for (const [f, v] of [['remote', remote], ['key', key], ['forward', forward]]) {
    if (typeof v !== 'string' || !v.trim())
      return res.status(400).json({ error: `Campo requerido: ${f}` });
  }
  const valErr = validateTunnelInput({ remote, key, forward });
  if (valErr) return res.status(400).json({ error: valErr });

  try {
    if (await checkPort(port)) return res.json({ status: 'already_open' });

    spawnTunnel(port, remote.trim(), key.trim(), forward.trim());
    const ok = await pollPort(port);

    if (ok) adhocTunnels.set(port, {
      port, name: (name || `ad-hoc :${port}`).trim(),
      desc: `${remote.trim()} → ${forward.trim()}`,
      remote: remote.trim(), key: key.trim(), forward: forward.trim(), prod: false,
    });

    res.json({ status: ok ? 'open' : 'timeout' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tunnels/:port/open ──────────────────────────────────────────────

router.post('/:port/open', async (req, res, next) => {
  const port = parseInt(req.params.port, 10);
  try {
    const tunnels = await loadConfig();
    const cfg = tunnels.find(t => t.port === port);
    if (!cfg) return res.status(404).json({ error: `Puerto ${port} no configurado` });

    if (await checkPort(port)) return res.json({ status: 'already_open' });

    spawnTunnel(port, cfg.remote, cfg.key, cfg.forward);
    const ok = await pollPort(port);
    res.json({ status: ok ? 'open' : 'timeout' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tunnels/:port/close ─────────────────────────────────────────────

router.post('/:port/close', async (req, res, next) => {
  const port = parseInt(req.params.port, 10);
  try {
    const result = await killPort(port);
    if (result === 'killed') adhocTunnels.delete(port);
    res.json({ status: result === 'killed' ? 'closed' : 'not_found' });
  } catch (err) {
    next(err);
  }
});

export default router;
