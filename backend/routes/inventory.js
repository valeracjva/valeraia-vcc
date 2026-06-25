import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { PATHS } from '../config.js';

const router = Router();

const VALID_RIESGOS = ['bajo', 'moderado', 'alto', 'critico'];

function validate(s) {
  if (!s || typeof s !== 'object')             return 'servidor inválido';
  if (!s.id?.trim())                           return 'id requerido';
  if (!s.ip?.trim())                           return 'ip requerida';
  if (!s.os?.trim())                           return 'os requerido';
  if (!s.empresa?.trim())                      return 'empresa requerida';
  if (!VALID_RIESGOS.includes(s.riesgo))       return `riesgo inválido (${VALID_RIESGOS.join('|')})`;
  if (!Array.isArray(s.apps))                  return 'apps debe ser array';
  if (!Array.isArray(s.dominios))              return 'dominios debe ser array';
  return null;
}

function clean(s) {
  return {
    monitoreado: s.monitoreado === true,
    id:         s.id.trim(),
    ip:         s.ip.trim(),
    os:         s.os.trim(),
    empresa:    s.empresa.trim(),
    rol:        (s.rol || '').trim(),
    riesgo:     s.riesgo,
    acceso:     (s.acceso || '').trim(),
    sshUser:    s.sshUser?.trim() || null,
    sshKey:     s.sshKey?.trim()  || null,
    mysqlTunel: s.mysqlTunel?.trim() || null,
    puerto:     s.puerto?.trim()  || null,
    notas:      s.notas?.trim()   || null,
    apps:       (s.apps || []).map(a => ({ name: String(a.name || '').trim(), desc: String(a.desc || '').trim() })).filter(a => a.name),
    dominios:   (s.dominios || []).map(d => String(d).trim()).filter(Boolean),
  };
}

async function load() {
  const raw = await readFile(PATHS.serversConfig, 'utf8');
  return JSON.parse(raw).servers;
}

async function save(servers) {
  await writeFile(PATHS.serversConfig, JSON.stringify({ servers }, null, 2), 'utf8');
}

// GET /api/inventory
router.get('/', async (req, res, next) => {
  try {
    const servers = await load();
    res.json({ servers, count: servers.length });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/config — reemplaza la lista completa
router.put('/config', async (req, res, next) => {
  try {
    const { servers } = req.body;
    if (!Array.isArray(servers)) return res.status(400).json({ error: 'servers debe ser un array' });

    const cleaned = [];
    const ids = new Set();
    for (const s of servers) {
      const err = validate(s);
      if (err) return res.status(400).json({ error: `${s?.id ?? '?'}: ${err}` });
      if (ids.has(s.id.trim())) return res.status(400).json({ error: `ID duplicado: ${s.id}` });
      ids.add(s.id.trim());
      cleaned.push(clean(s));
    }

    await save(cleaned);
    res.json({ servers: cleaned });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory — agrega un servidor
router.post('/', async (req, res, next) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const servers = await load();
    if (servers.find(s => s.id === req.body.id.trim()))
      return res.status(409).json({ error: `ID ya existe: ${req.body.id}` });

    const entry = clean(req.body);
    servers.push(entry);
    await save(servers);
    res.status(201).json({ server: entry });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/:id — edita un servidor
router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const servers = await load();
    const idx = servers.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: `Servidor no encontrado: ${id}` });

    // Mantener el id original; la edición no puede cambiar el id
    const incoming = { ...req.body, id };
    const err = validate(incoming);
    if (err) return res.status(400).json({ error: err });

    servers[idx] = clean(incoming);
    await save(servers);
    res.json({ server: servers[idx] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const servers = await load();
    const idx = servers.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: `Servidor no encontrado: ${id}` });

    servers.splice(idx, 1);
    await save(servers);
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});

export default router;
