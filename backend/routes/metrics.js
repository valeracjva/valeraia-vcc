import { Router } from 'express';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import { Client } from 'ssh2';
import { PATHS } from '../config.js';

async function getSSHServers() {
  const raw = await readFile(PATHS.serversConfig, 'utf8');
  const { servers } = JSON.parse(raw);
  const result = {};
  for (const s of servers) {
    if (!s.monitoreado || !s.sshUser || !s.sshKey) continue;
    result[s.id] = {
      host:        s.ip,
      user:        s.sshUser,
      key:         path.join(homedir(), s.sshKey),
      fingerprint: s.fingerprint ?? null,
    };
  }
  return result;
}

const router = Router();

const CACHE_TTL_MS = 60_000;
const HISTORY_MAX  = 20; // ~20 min de trend a intervalo de refresco de 60s
const cache = {}; // { serverId: { ts, data, history: [{ts,cpu,ram,disk}] } }

// Comando: CPU% (snapshot /proc/stat), RAM%, RAM total MB, Disk%, Disk total GB, cores, load avg 1m
const CMD = [
  "awk '/^cpu /{idle=$5;tot=0;for(i=2;i<=NF;i++)tot+=$i;printf \"%.0f\\n\",100*(tot-idle)/tot}' /proc/stat",
  "free -m | awk '/Mem:/{printf \"%.0f %d\\n\",$3*100/$2,$2}'",
  "df / | awk 'NR==2{sub(/%/,\"\",$5);printf \"%s %d\\n\",$5,int($2/1024/1024)}'",
  "echo \"$(nproc) $(awk '{print $1}' /proc/loadavg)\"",
].join(' && ');

function timeoutMsForHost(host) {
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return 3000;
  return 8000;
}

function sshExec(conf, cmd) {
  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;
    const timeoutMs = timeoutMsForHost(conf.host);

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn.end(); } catch { /* ignore */ }
      resolve(result);
    };

    const timer = setTimeout(() => done({ error: 'timeout' }), timeoutMs);

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
        readyTimeout: timeoutMs + 1000,
        algorithms: {
          serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-256', 'rsa-sha2-512', 'ssh-rsa'],
        },
        // Host key verification fail-closed.
        // Sin fingerprint en SSH_SERVERS → rechaza la conexión (no falla abierto).
        // Para poblar: ssh-keyscan -t ed25519 <host> | ssh-keygen -lf - -E sha256
        //   Copiar "SHA256:XXXXX..." en conf.fingerprint (incluyendo el prefijo "SHA256:").
        hostHash: 'sha256',
        hostVerifier: (hash) => {
          if (!conf.fingerprint) {
            // Trust-on-first-use para servidores internos sin fingerprint configurado.
            // Para verificar: ssh-keyscan -t ed25519 <host> | ssh-keygen -lf - -E sha256
            return true;
          }
          // Comparación en tiempo constante cuando hay fingerprint configurado.
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
  if (lines.length < 4) return null;

  const cpu   = parseInt(lines[0], 10);
  const [ramPct, ramMB] = lines[1].split(' ').map(Number);
  const [diskPct, diskGB] = lines[2].split(' ').map(Number);
  const [cores, load1] = lines[3].split(' ').map(Number);

  if ([cpu, ramPct, ramMB, diskPct, diskGB, cores, load1].some(isNaN)) return null;

  return {
    cpu:    { pct: cpu, cores, load1 },
    ram:    { pct: ramPct,  totalMB: ramMB },
    disk:   { pct: diskPct, totalGB: diskGB },
  };
}

async function fetchOne(serverId, conf) {
  if (!conf) return { serverId, status: 'no-config' };

  console.log(`[metrics] ${serverId} → ${conf.user}@${conf.host}  key=${conf.key}`);
  const { out, error } = await sshExec(conf, CMD);
  if (error) {
    console.error(`[metrics] ${serverId} FAIL: ${error}`);
    return { serverId, status: 'unreachable', error };
  }

  const metrics = parse(out);
  if (!metrics) {
    console.error(`[metrics] ${serverId} parse-error raw=${JSON.stringify(out)}`);
    return { serverId, status: 'parse-error', raw: out };
  }

  console.log(`[metrics] ${serverId} OK  cpu=${metrics.cpu.pct}%`);
  return { serverId, status: 'ok', ...metrics };
}

async function fetchWithHistory(id, conf, force, now) {
  const prev = cache[id];
  if (!force && prev && (now - prev.ts) < CACHE_TTL_MS) {
    return { ...prev.data, cached: true, history: prev.history };
  }
  const data = await fetchOne(id, conf);
  const history = prev?.history ? [...prev.history] : [];
  if (data.status === 'ok') {
    history.push({ ts: now, cpu: data.cpu.pct, ram: data.ram.pct, disk: data.disk.pct });
    if (history.length > HISTORY_MAX) history.shift();
  }
  cache[id] = { ts: now, data, history };
  return { ...data, cached: false, history };
}

// Lectura sin disparar SSH — usada por opsmap.js para reflejar salud real
// sin duplicar el polling que ya hace Inventario cada 60s.
export function getCachedMetrics(serverId) {
  const entry = cache[serverId];
  if (!entry) return null;
  return { ...entry.data, checkedAt: entry.ts };
}

// GET /api/metrics — todos los servidores en paralelo
router.get('/', async (req, res) => {
  const force = req.query.force === '1';
  const now   = Date.now();

  const SSH_SERVERS = await getSSHServers();
  const ids = Object.keys(SSH_SERVERS);

  const results = await Promise.allSettled(
    ids.map((id) => fetchWithHistory(id, SSH_SERVERS[id], force, now))
  );

  res.json({
    metrics: results.map(r => r.status === 'fulfilled' ? r.value : { serverId: 'unknown', status: 'unreachable', error: r.reason?.message ?? 'unknown error' }),
    checkedAt: new Date().toISOString(),
  });
});

// GET /api/metrics/:id — un servidor
router.get('/:id', async (req, res) => {
  const id    = req.params.id;
  const force = req.query.force === '1';
  const now   = Date.now();

  const SSH_SERVERS = await getSSHServers();
  if (!SSH_SERVERS[id]) return res.status(404).json({ error: `Servidor desconocido: ${id}` });

  res.json(await fetchWithHistory(id, SSH_SERVERS[id], force, now));
});

export default router;
