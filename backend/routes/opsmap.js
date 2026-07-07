import { Router } from 'express';
import { readFile } from 'fs/promises';
import net from 'net';
import { PATHS } from '../config.js';
import { getCachedMetrics } from './metrics.js';

const router = Router();

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

function riskClass(value) {
  return String(value ?? 'bajo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

function nodeState(value) {
  const risk = riskClass(value);
  if (['production', 'prod', 'critico', 'critical'].includes(risk)) return 'critico';
  if (['test', 'testing', 'staging', 'moderado', 'alto'].includes(risk)) return 'watch';
  if (['development', 'desa', 'dev', 'bajo', 'local'].includes(risk)) return 'fresh';
  return risk || 'idle';
}

function hostnameFromUrl(url) {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return null; }
}

function remoteHost(remote) {
  return String(remote ?? '').split('@').pop()?.trim().toLowerCase() || null;
}

function localTunnelPort(mysqlTunel) {
  const m = String(mysqlTunel ?? '').match(/local\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

function addNode(map, node) {
  if (!node?.id || map.has(node.id)) return;
  map.set(node.id, node);
}

function addLink(list, from, to, type, label = type) {
  if (!from || !to) return;
  list.push({ from, to, type, label });
}

// Estado real del servidor a partir de la última métrica cacheada (metrics.js),
// no del campo estático `riesgo`. `null` si nunca se monitoreó/todavía no hay dato.
export function healthState(health) {
  if (!health) return null;
  if (health.status !== 'ok') return 'critico'; // unreachable / parse-error / timeout / no-config
  const worst = Math.max(health.cpu?.pct ?? 0, health.ram?.pct ?? 0, health.disk?.pct ?? 0);
  if (worst >= 85) return 'critico';
  if (worst >= 70) return 'watch';
  return 'fresh';
}

function healthDetail(base, health) {
  if (!health) return base;
  if (health.status === 'ok') {
    return `${base} CPU ${health.cpu.pct}% · RAM ${health.ram.pct}% · Disco ${health.disk.pct}%.`;
  }
  return `${base} Sin acceso SSH${health.error ? `: ${health.error}` : ''}.`;
}

router.get('/', async (_req, res, next) => {
  try {
    const [registry, serversCfg, sslCfg, tunnelsCfg, runtime, recent] = await Promise.all([
      readJson(PATHS.registry, { projects: [] }),
      readJson(PATHS.serversConfig, { servers: [] }),
      readJson(PATHS.sslWatch, { domains: [] }),
      readJson(PATHS.tunnelsConfig, { tunnels: [] }),
      readJson(PATHS.currentProject, null),
      readJson(PATHS.recentProjects, []),
    ]);

    const tunnels = await Promise.all((tunnelsCfg.tunnels ?? []).map(async t => ({
      ...t,
      active: await checkPort(Number(t.port)),
    })));

    const nodes = new Map();
    const links = [];
    const servers = serversCfg.servers ?? [];
    const projects = registry.projects ?? [];
    const domains = sslCfg.domains ?? [];

    addNode(nodes, {
      id: 'workspace', type: 'workspace', label: 'ValeraIA', sub: 'Workspace vivo',
      state: 'fresh', risk: 'bajo', detail: 'Raiz operativa del Command Center.',
    });

    const serverById = new Map(servers.map(s => [s.id, s]));
    const serverByIp = new Map(servers.map(s => [s.ip, s]));
    const domainSet = new Set(domains.map(d => String(d.domain).toLowerCase()));

    for (const server of servers) {
      const health = server.monitoreado === true ? getCachedMetrics(server.id) : null;
      const liveState = healthState(health);
      addNode(nodes, {
        id: `server:${server.id}`, type: 'server', label: server.id, sub: server.ip,
        // Con métrica real disponible, manda por sobre el `riesgo` estático de config.
        state: liveState ?? nodeState(server.riesgo),
        risk: server.riesgo,
        detail: healthDetail(server.rol || server.empresa || 'Servidor registrado.', health),
        meta: {
          empresa: server.empresa, os: server.os, monitoreado: server.monitoreado === true,
          health: health ? { status: health.status, cpu: health.cpu?.pct, ram: health.ram?.pct, disk: health.disk?.pct, checkedAt: health.checkedAt } : null,
        },
      });
      addLink(links, 'workspace', `server:${server.id}`, 'contains', 'inventario');

      for (const domain of server.dominios ?? []) {
        const host = String(domain).toLowerCase();
        addNode(nodes, {
          id: `domain:${host}`, type: 'domain', label: host, sub: domainSet.has(host) ? 'SSL watch' : 'dominio inventario',
          state: domainSet.has(host) ? 'watch' : 'idle', risk: 'bajo', detail: `Dominio asociado a ${server.id}.`,
        });
        addLink(links, `server:${server.id}`, `domain:${host}`, 'exposes', 'expone');
      }
    }

    for (const domain of domains) {
      const host = String(domain.domain).toLowerCase();
      addNode(nodes, {
        id: `domain:${host}`, type: 'domain', label: host, sub: domain.empresa || 'SSL watch',
        state: 'watch', risk: 'bajo', detail: domain.label || 'Dominio monitoreado por SSL.',
        meta: { empresa: domain.empresa, sslWatch: true },
      });
      addLink(links, 'workspace', `domain:${host}`, 'monitors', 'monitorea SSL');
    }

    for (const tunnel of tunnels) {
      const nodeId = `tunnel:${tunnel.port}`;
      const state = tunnel.active ? (tunnel.prod ? 'critico' : 'active') : 'idle';
      addNode(nodes, {
        id: nodeId, type: 'tunnel', label: String(tunnel.port), sub: tunnel.name,
        state, risk: tunnel.prod ? 'critico' : 'moderado',
        detail: `${tunnel.remote ?? '—'} -> ${tunnel.forward ?? '—'}`,
        meta: { active: tunnel.active, prod: tunnel.prod === true, remote: tunnel.remote, forward: tunnel.forward },
      });
      addLink(links, 'workspace', nodeId, 'has-tunnel', 'tunel');

      const host = remoteHost(tunnel.remote);
      const targetServer = servers.find(s =>
        s.ip === host || s.id.toLowerCase() === host || localTunnelPort(s.mysqlTunel) === Number(tunnel.port)
      );
      if (targetServer) addLink(links, nodeId, `server:${targetServer.id}`, 'tunnel-to', 'conecta');
    }

    for (const project of projects) {
      const projectId = `project:${project.id}`;
      addNode(nodes, {
        id: projectId, type: 'project', label: project.id, sub: project.client || project.type,
        state: project.status === 'active' ? 'fresh' : 'idle', risk: 'bajo', detail: project.name || project.id,
        meta: { name: project.name, client: project.client, status: project.status },
      });
      addLink(links, 'workspace', projectId, 'has-project', 'proyecto');

      for (const env of project.environments ?? []) {
        const envId = `env:${project.id}:${env.name}`;
        const envRisk = nodeState(env.riskLevel ?? env.name);
        addNode(nodes, {
          id: envId, type: 'environment', label: env.name, sub: project.id,
          state: envRisk, risk: env.riskLevel ?? env.name, detail: env.remotePath || env.url || 'Ambiente registrado.',
          meta: { projectId: project.id, environment: env.name, url: env.url, mcpProfile: env.mcpProfile },
        });
        addLink(links, projectId, envId, 'has-env', 'ambiente');

        const server = serverById.get(env.server) || serverByIp.get(env.serverIp);
        if (server) addLink(links, envId, `server:${server.id}`, 'runs-on', 'corre en');

        const host = hostnameFromUrl(env.url);
        if (host) {
          addNode(nodes, {
            id: `domain:${host}`, type: 'domain', label: host, sub: domainSet.has(host) ? 'SSL watch' : 'url ambiente',
            state: domainSet.has(host) ? 'watch' : 'idle', risk: 'bajo', detail: `URL de ${project.id}/${env.name}.`,
          });
          addLink(links, envId, `domain:${host}`, 'exposes', 'url');
        }

        if (env.mcpProfile) {
          const mcpId = `mcp:${env.mcpProfile}`;
          addNode(nodes, {
            id: mcpId, type: 'mcp', label: env.mcpProfile, sub: 'MCP profile',
            state: env.mcpProfile.includes('prod') ? 'critico' : 'fresh', risk: env.mcpProfile.includes('prod') ? 'critico' : 'bajo',
            detail: `Perfil MCP requerido por ${project.id}/${env.name}.`,
          });
          addLink(links, envId, mcpId, 'uses-mcp', 'usa MCP');
        }
      }
    }

    if (runtime?.projectId && runtime?.environment) {
      const envId = `env:${runtime.projectId}:${runtime.environment}`;
      addLink(links, 'workspace', envId, 'current', 'activo');
      const node = nodes.get(envId);
      if (node) node.current = true;
    }

    const highRiskServers = servers.filter(s => ['alto', 'critico'].includes(riskClass(s.riesgo))).length;
    const activeProdTunnels = tunnels.filter(t => t.active && t.prod).length;

    res.json({
      generatedAt: new Date().toISOString(),
      current: runtime,
      recent,
      summary: {
        projects: projects.length,
        environments: projects.reduce((total, p) => total + (p.environments?.length ?? 0), 0),
        servers: servers.length,
        domains: nodesArrayCount(nodes, 'domain'),
        tunnels: tunnels.length,
        activeTunnels: tunnels.filter(t => t.active).length,
        activeProdTunnels,
        highRiskServers,
        missionState: activeProdTunnels > 0 ? 'attention' : 'nominal',
      },
      nodes: [...nodes.values()],
      links,
    });
  } catch (err) {
    next(err);
  }
});

function nodesArrayCount(nodes, type) {
  let count = 0;
  for (const node of nodes.values()) if (node.type === type) count++;
  return count;
}

export default router;
