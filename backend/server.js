import express from 'express';
import { createServer } from 'http';
import { existsSync } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { SERVER, PATHS } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

import handoverRouter  from './routes/handover.js';
import indexRouter     from './routes/index.js';
import registryRouter  from './routes/registry.js';
import statusRouter    from './routes/status.js';
import tunnelsRouter   from './routes/tunnels.js';
import projectsRouter  from './routes/projects.js';
import governRouter    from './routes/govern.js';
import sslRouter       from './routes/ssl.js';
import inventoryRouter from './routes/inventory.js';
import metricsRouter   from './routes/metrics.js';
import runtimeRouter   from './routes/runtime.js';
import tunnelDbRouter  from './routes/tunnel-db.js';
import opsmapRouter    from './routes/opsmap.js';
import apisRouter      from './routes/apis.js';
import mcpRouter       from './routes/mcp.js';
import linksRouter     from './routes/links.js';
import sessionsRouter  from './routes/sessions.js';

const app = express();

function isLocalOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch { return false; }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/handover',  handoverRouter);
app.use('/api/index',     indexRouter);
app.use('/api/registry',  registryRouter);
app.use('/api/status',    statusRouter);
app.use('/api/tunnels',   tunnelsRouter);
app.use('/api/projects',  projectsRouter);
app.use('/api/ssl',       sslRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/metrics',   metricsRouter);
app.use('/api/infra-health', metricsRouter);
app.use('/api/runtime',   runtimeRouter);
app.use('/api/tunnel-db', tunnelDbRouter);
app.use('/api/opsmap',    opsmapRouter);
app.use('/api/apis',      apisRouter);
app.use('/api/mcp',       mcpRouter);
app.use('/api/sessions',   sessionsRouter);

// CORS abierto solo para POST /api/links: el bookmarklet corre en el origen
// de la pestaña que el usuario esté visitando, no en localhost. Peor caso:
// un sitio hostil podría insertar un link falso — no puede leer nada.
app.use('/api/links', (req, res, next) => {
  const origin = req.headers.origin;
  const isPostPreflight = req.method === 'OPTIONS' && req.headers['access-control-request-method'] === 'POST';
  if (origin && req.path === '/' && (req.method === 'POST' || isPostPreflight)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  if (isPostPreflight && req.path === '/') {
    return res.status(204).end();
  }
  next();
});
app.use('/api/links',    linksRouter);

const httpServer = createServer(app);
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: ({ origin }) => {
    if (!origin) return false;
    try {
      const { hostname } = new URL(origin);
      return hostname === 'localhost' || hostname === '127.0.0.1';
    } catch { return false; }
  },
});
wss.on('connection', () => {});   // govern.js usa wss.clients directamente

app.use('/api/govern', governRouter(wss));

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Error interno del servidor', detail: err.message });
});

httpServer.listen(SERVER.port, SERVER.host, () => {
  console.log(`\nVCC Backend iniciado en http://${SERVER.host}:${SERVER.port}\n`);

  const checks = [
    ['HANDOVER.md',              PATHS.handover],
    ['INDEX.md',                 PATHS.index],
    ['WORKSPACE_MAP.md',         PATHS.workspaceMap],
    ['projects-registry.json',   PATHS.registry],
  ];

  for (const [label, filePath] of checks) {
    const ok = existsSync(filePath);
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : '  ← ARCHIVO NO ENCONTRADO'}`);
  }
  console.log('');
});
