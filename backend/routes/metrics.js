import { Router } from 'express';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { createHash, timingSafeEqual } from 'crypto';
import { Client } from 'ssh2';
import { SSH_SERVERS } from '../config.js';

const router = Router();

const CACHE_TTL_MS = 60_000;
const cache = {}; // { serverId: { ts, data } }

// Comando: CPU% (snapshot /proc/stat), RAM%, RAM total MB, Disk%, Disk total GB
const CMD = [
  "awk '/^cpu /{idle=$5;tot=0;for(i=2;i<=NF;i++)tot+=$i;printf \"%.0f\\n\",100*(tot-idle)/tot}' /proc/stat",
  "free -m | awk '/Mem:/{printf \"%.0f %d\\n\",$3*100/$2,$2}'",
  "df / | awk 'NR==2{sub(/%/,\"\",$5);printf \"%s %d\\n\",$5,int($2/1024/1024)}'",
].join(' && ');

function sshExec(conf, cmd) {
  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn.end(); } catch { /* ignore */ }
      resolve(result);
    };

    const timer = setTimeout(() => done({ error: 'timeout' }), 7000);

    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return done({ error: err.message });
        let out = '';
        stream.on('data', d => { out += d.toString(); });
        stream.stderr.on('data', () => {});
        stream.on('close', () => done({ out: out.trim() }));
      });
    });

    conn.on('error', (err) => done({ error: err.message }));

    try {
      conn.connect({
        host:         conf.host,
        port:         conf.port ?? 22,
        username:     conf.user,
        privateKey:   readFileSync(conf.key),
        readyTimeout: 6000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
        },
        // Host key verification fail-closed.
        // Sin fingerprint en SSH_SERVERS → rechaza la conexión (no falla abierto).
        // Para poblar: ssh-keyscan -t ed25519 <host> | ssh-keygen -lf - -E sha256
        //   Copiar "SHA256:XXXXX..." en conf.fingerprint (incluyendo el prefijo "SHA256:").
        hostHash: 'sha256',
        hostVerifier: (hash) => {
          if (!conf.fingerprint) {
            console.warn(`[metrics] BLOCK ${conf.host} — sin fingerprint configurado en SSH_SERVERS`);
            return false;
          }
          // Comparación en tiempo constante. ssh2 entrega hash como base64 cuando hostHash='sha256'.
          // ssh-keygen -E sha256 produce "SHA256:<base64>"; extraemos solo la parte base64.
          const expected = conf.fingerprint.replace(/^SHA256:/, '');
          try {
            const a = Buffer.from(hash,     'base64');
            const b = Buffer.from(expected, 'base64');
            if (a.length !== b.length) return false;
            return timingSafeEqual(a, b);
          } catch {
            return false;
          }
        },
      });
    } catch (err) {
      done({ error: err.message });
    }
  });
}

function parse(out) {
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  const cpu   = parseInt(lines[0], 10);
  const [ramPct, ramMB] = lines[1].split(' ').map(Number);
  const [diskPct, diskGB] = lines[2].split(' ').map(Number);

  if ([cpu, ramPct, ramMB, diskPct, diskGB].some(isNaN)) return null;

  return {
    cpu:    { pct: cpu },
    ram:    { pct: ramPct,  totalMB: ramMB },
    disk:   { pct: diskPct, totalGB: diskGB },
  };
}

async function fetchOne(serverId) {
  const conf = SSH_SERVERS[serverId];
  if (!conf) return { serverId, status: 'no-config' };
  if (!conf.fingerprint) return { serverId, status: 'no-fingerprint' };

  const { out, error } = await sshExec(conf, CMD);
  if (error) return { serverId, status: 'unreachable', error };

  const metrics = parse(out);
  if (!metrics) return { serverId, status: 'parse-error', raw: out };

  return { serverId, status: 'ok', ...metrics };
}

// GET /api/metrics — todos los servidores en paralelo
router.get('/', async (req, res) => {
  const force = req.query.force === '1';
  const now   = Date.now();

  const ids = Object.keys(SSH_SERVERS);
  const results = await Promise.all(ids.map(async (id) => {
    if (!force && cache[id] && (now - cache[id].ts) < CACHE_TTL_MS) {
      return { ...cache[id].data, cached: true };
    }
    const data = await fetchOne(id);
    cache[id] = { ts: now, data };
    return { ...data, cached: false };
  }));

  res.json({ metrics: results, checkedAt: new Date().toISOString() });
});

// GET /api/metrics/:id — un servidor
router.get('/:id', async (req, res) => {
  const id    = req.params.id;
  const force = req.query.force === '1';
  const now   = Date.now();

  if (!SSH_SERVERS[id]) return res.status(404).json({ error: `Servidor desconocido: ${id}` });

  if (!force && cache[id] && (now - cache[id].ts) < CACHE_TTL_MS) {
    return res.json({ ...cache[id].data, cached: true });
  }

  const data = await fetchOne(id);
  cache[id] = { ts: now, data };
  res.json({ ...data, cached: false });
});

export default router;
