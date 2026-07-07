import { readFile } from 'fs/promises';
import { pollAllServers } from '../routes/metrics.js';
import { healthState } from '../routes/opsmap.js';
import { PATHS } from '../config.js';
import { writeHeartbeat } from './heartbeat.js';
import { checkTransition, commitState } from './state-tracker.js';
import { notifyTransition } from './telegram.js';

const POLL_INTERVAL_MS = 60_000;

async function localAgentHosts() {
  try {
    const { servers } = JSON.parse(await readFile(PATHS.serversConfig, 'utf8'));
    return new Set(servers.filter(s => s.localAgent === true).map(s => s.id));
  } catch {
    return new Set();
  }
}

export async function pollOnce() {
  const [results, agentHosts] = await Promise.all([pollAllServers(), localAgentHosts()]);

  for (const { serverId, conf, data } of results) {
    try {
      const current = healthState(data);
      if (!current) continue; // sin dato (no-config) -- nada que evaluar

      if (agentHosts.has(serverId)) {
        await writeHeartbeat(serverId, conf);
      }

      const transition = checkTransition(serverId, current);
      commitState(serverId, current);
      if (transition && !transition.first) {
        await notifyTransition(serverId, transition.from, transition.to);
      }
    } catch (err) {
      console.error(`[monitoring-core] host ${serverId} FAIL:`, err.message);
    }
  }
}

let timer = null;

// Arranca el ciclo propio del backend -- independiente de que haya frontend abierto.
// Corre una vez de inmediato y despues cada POLL_INTERVAL_MS. Llamar una sola vez desde server.js.
export function startPoller() {
  if (timer) return;
  pollOnce().catch(err => console.error('[monitoring-core] poll FAIL:', err.message));
  timer = setInterval(() => {
    pollOnce().catch(err => console.error('[monitoring-core] poll FAIL:', err.message));
  }, POLL_INTERVAL_MS);
}
