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
