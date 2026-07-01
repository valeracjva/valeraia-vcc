import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const router = Router();

const HOME       = os.homedir();
const MCP_JSON   = path.join(HOME, '.mcp.json');
const SETTINGS   = path.join(HOME, '.claude', 'settings.json');
const SSH_INDEX  = path.join(HOME, '.claude', 'mcp', 'mcp-ssh', 'index.js');

const SENSITIVE = /password|secret|token|apikey|api_key|key/i;

function maskEnv(env = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = SENSITIVE.test(k) ? (String(v).slice(0, 4) + '****') : v;
  }
  return out;
}

async function readMcpJson()  { return JSON.parse(await readFile(MCP_JSON,  'utf8')); }
async function readSettings() { return JSON.parse(await readFile(SETTINGS,  'utf8')); }

// GET /api/mcp
router.get('/', async (req, res, next) => {
  try {
    const [mcpJson, settings] = await Promise.all([readMcpJson(), readSettings()]);
    const enabled = new Set(settings.enabledMcpjsonServers ?? []);
    const mcps = Object.entries(mcpJson.mcpServers ?? {}).map(([name, cfg]) => ({
      name,
      command: cfg.command,
      args:    cfg.args ?? [],
      env:     maskEnv(cfg.env),
      enabled: enabled.has(name),
    }));
    res.json({ mcps });
  } catch (err) { next(err); }
});

// PUT /api/mcp/config — reemplaza mcpServers completo en ~/.mcp.json
router.put('/config', async (req, res, next) => {
  try {
    const { mcpServers } = req.body;
    if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers))
      return res.status(400).json({ error: 'mcpServers debe ser un objeto' });

    const mcpJson = await readMcpJson();
    mcpJson.mcpServers = mcpServers;
    await writeFile(MCP_JSON, JSON.stringify(mcpJson, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/mcp/ssh-servers — debe ir antes de /:name para no colisionar
router.get('/ssh-servers', async (req, res, next) => {
  try {
    const content = await readFile(SSH_INDEX, 'utf8');
    res.json({ servers: parseSshServers(content) });
  } catch (err) { next(err); }
});

// POST /api/mcp — agrega nuevo MCP
router.post('/', async (req, res, next) => {
  try {
    const { name, command, args = [], env = {}, enabled = true } = req.body;
    if (!name?.trim())    return res.status(400).json({ error: 'name requerido' });
    if (!command?.trim()) return res.status(400).json({ error: 'command requerido' });

    const [mcpJson, settings] = await Promise.all([readMcpJson(), readSettings()]);
    if (mcpJson.mcpServers?.[name])
      return res.status(409).json({ error: `MCP "${name}" ya existe` });

    const entry = { command: command.trim(), args };
    if (Object.keys(env).length) entry.env = env;
    mcpJson.mcpServers[name] = entry;

    if (enabled) {
      const list = settings.enabledMcpjsonServers ?? [];
      if (!list.includes(name)) list.push(name);
      settings.enabledMcpjsonServers = list;
    }

    await Promise.all([
      writeFile(MCP_JSON,  JSON.stringify(mcpJson,  null, 2), 'utf8'),
      writeFile(SETTINGS,  JSON.stringify(settings, null, 2), 'utf8'),
    ]);
    res.status(201).json({ ok: true, name });
  } catch (err) { next(err); }
});

// PUT /api/mcp/:name — edita comando, args y env (el nombre no cambia)
router.put('/:name', async (req, res, next) => {
  try {
    const name = req.params.name;
    const { command, args = [], env = {} } = req.body;
    if (!command?.trim()) return res.status(400).json({ error: 'command requerido' });

    const mcpJson = await readMcpJson();
    if (!mcpJson.mcpServers?.[name])
      return res.status(404).json({ error: `MCP "${name}" no encontrado` });

    mcpJson.mcpServers[name] = {
      command: command.trim(),
      args,
      ...(Object.keys(env).length ? { env } : {}),
    };

    await writeFile(MCP_JSON, JSON.stringify(mcpJson, null, 2), 'utf8');
    res.json({ ok: true, name });
  } catch (err) { next(err); }
});

// DELETE /api/mcp/ssh-servers/:alias — debe ir antes de /:name
router.delete('/ssh-servers/:alias', async (req, res, next) => {
  try {
    const alias = req.params.alias;
    let content = await readFile(SSH_INDEX, 'utf8');
    if (!content.includes(`'${alias}':`))
      return res.status(404).json({ error: `"${alias}" no existe en mcp-ssh` });

    const re = new RegExp(`\\n  '${alias}':\\s*\\{[\\s\\S]*?\\n  \\},?`);
    content = content.replace(re, '');
    await writeFile(SSH_INDEX, content, 'utf8');
    res.json({ ok: true, deleted: alias });
  } catch (err) { next(err); }
});

// DELETE /api/mcp/:name
router.delete('/:name', async (req, res, next) => {
  try {
    const name = req.params.name;
    const [mcpJson, settings] = await Promise.all([readMcpJson(), readSettings()]);
    if (!mcpJson.mcpServers?.[name])
      return res.status(404).json({ error: `MCP "${name}" no encontrado` });

    delete mcpJson.mcpServers[name];
    settings.enabledMcpjsonServers = (settings.enabledMcpjsonServers ?? []).filter(n => n !== name);

    await Promise.all([
      writeFile(MCP_JSON,  JSON.stringify(mcpJson,  null, 2), 'utf8'),
      writeFile(SETTINGS,  JSON.stringify(settings, null, 2), 'utf8'),
    ]);
    res.json({ ok: true, deleted: name });
  } catch (err) { next(err); }
});

function parseSshServers(content) {
  const servers = [];
  const re = /'([^']+)':\s*\{\s*\n\s*host:\s*'([^']+)'[\s\S]*?username:\s*'([^']+)'[\s\S]*?path\.join\(HOME,\s*([^)]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const parts = m[4].split(',').map(p => p.trim().replace(/^'|'$/g, '')).filter(Boolean);
    servers.push({ alias: m[1], host: m[2], username: m[3], keyPath: parts.join('/') });
  }
  return servers;
}

export default router;
