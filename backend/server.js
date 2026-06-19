import express from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { SERVER, PATHS } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

import handoverRouter from './routes/handover.js';
import indexRouter   from './routes/index.js';
import registryRouter from './routes/registry.js';
import statusRouter  from './routes/status.js';

const app = express();

// CORS solo para localhost
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/handover', handoverRouter);
app.use('/api/index',    indexRouter);
app.use('/api/registry', registryRouter);
app.use('/api/status',   statusRouter);

// Manejo global de errores — nunca crashea el proceso
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Error interno del servidor', detail: err.message });
});

app.listen(SERVER.port, SERVER.host, () => {
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
