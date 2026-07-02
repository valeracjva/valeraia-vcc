import { Router } from 'express';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import mysql from 'mysql2/promise';
import { PATHS } from '../config.js';

const router = Router();

const MCP_JSON = path.join(homedir(), '.mcp.json');

const EXCLUDED_DBS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);

async function readMcpJson() {
  try {
    return JSON.parse(await readFile(MCP_JSON, 'utf8'));
  } catch {
    return { mcpServers: {} };
  }
}

async function readTunnelsConfig() {
  try {
    return JSON.parse(await readFile(PATHS.tunnelsConfig, 'utf8'));
  } catch {
    return { tunnels: [] };
  }
}

// Busca credenciales para el puerto: primero en ~/.mcp.json, luego en tunnels-config.json
async function resolveCredentials(port) {
  const portStr = String(port);

  // 1. Buscar en MCPs por MYSQL_PORT
  const mcp = await readMcpJson();
  for (const [, server] of Object.entries(mcp.mcpServers ?? {})) {
    const env = server.env ?? {};
    if (env.MYSQL_PORT === portStr && env.MYSQL_USER && env.MYSQL_PASSWORD) {
      return {
        host: env.MYSQL_HOST ?? '127.0.0.1',
        port: parseInt(portStr, 10),
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
      };
    }
  }

  // 2. Fallback: credenciales explícitas en tunnels-config.json
  const config = await readTunnelsConfig();
  const tunnel = config.tunnels?.find(t => String(t.port) === portStr);
  const db = tunnel?.db;
  if (db?.user && db?.password) {
    return {
      host: '127.0.0.1',
      port: parseInt(portStr, 10),
      user: db.user,
      password: db.password,
    };
  }

  return null;
}

const DB_QUERY = `
  SELECT
    table_schema        AS \`db\`,
    COUNT(table_name)   AS \`tables\`,
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) AS \`size_mb\`
  FROM information_schema.TABLES
  WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
  GROUP BY table_schema
  ORDER BY size_mb DESC
`;

// GET /api/tunnel-db/:port
router.get('/:port', async (req, res, next) => {
  const port = parseInt(req.params.port, 10);
  if (!port) return res.status(400).json({ error: 'Puerto inválido' });

  // Verificar que el túnel existe en el config
  const config = await readTunnelsConfig();
  const tunnel = config.tunnels?.find(t => t.port === port);
  if (!tunnel) return res.status(404).json({ error: `Túnel ${port} no configurado` });

  // Resolver credenciales (MCP tiene prioridad, luego config explícita)
  const creds = await resolveCredentials(port);
  if (!creds) return res.status(400).json({ error: `Sin credenciales para puerto ${port}` });

  let conn;
  try {
    conn = await mysql.createConnection({
      host:            creds.host,
      port:            creds.port,
      user:            creds.user,
      password:        creds.password,
      connectTimeout:  5000,
    });

    const [rows] = await conn.execute(DB_QUERY);
    res.json({ port, databases: rows });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Túnel no activo o sin respuesta' });
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      return res.status(503).json({ error: 'Credenciales MySQL inválidas — revisar MCP o tunnels-config' });
    }
    next(err);
  } finally {
    try { conn?.end(); } catch { /* ignore */ }
  }
});

export default router;
