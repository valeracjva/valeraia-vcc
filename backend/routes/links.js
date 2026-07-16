import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PATHS } from '../config.js';

const router = Router();

const VALID_ESTADOS = ['Pendiente', 'Revisado', 'Implementar', 'Descartado'];
const VALID_COLORES = ['accent', 'info', 'success', 'warning', 'danger', 'text-faint', 'teal', 'purple', 'pink', 'cyan'];
const DEFAULT_TIPOS = [
  { nombre: 'Repo',     color: 'accent'     },
  { nombre: 'Articulo', color: 'info'       },
  { nombre: 'Skill',    color: 'success'    },
  { nombre: 'MCP',      color: 'warning'    },
  { nombre: 'Otro',     color: 'text-faint' },
];

function isValidUrl(u) {
  try { const parsed = new URL(u); return parsed.protocol === 'http:' || parsed.protocol === 'https:'; }
  catch { return false; }
}

function validateLink(l, validTipos) {
  if (!l || typeof l !== 'object')     return 'link inválido';
  if (!l.url?.trim())                  return 'url requerida';
  if (!isValidUrl(l.url.trim()))       return 'url inválida (debe ser http:// o https://)';
  if (!l.titulo?.trim())               return 'titulo requerido';
  if (l.tipo !== undefined && !validTipos.includes(l.tipo))
    return `tipo inválido (${validTipos.join('|')})`;
  if (l.estado !== undefined && !VALID_ESTADOS.includes(l.estado))
    return `estado inválido (${VALID_ESTADOS.join('|')})`;
  if (l.tags !== undefined && !Array.isArray(l.tags))
    return 'tags debe ser array';
  return null;
}

function cleanLink(l, validTipos, existing = null) {
  const now = new Date().toISOString();
  return {
    id:              existing?.id ?? randomUUID(),
    url:             l.url.trim(),
    titulo:          l.titulo.trim(),
    tipo:            validTipos.includes(l.tipo) ? l.tipo : (validTipos.includes('Otro') ? 'Otro' : validTipos[0]),
    tags:            Array.isArray(l.tags) ? l.tags.map(t => String(t).trim()).filter(Boolean) : [],
    estado:          VALID_ESTADOS.includes(l.estado) ? l.estado : 'Pendiente',
    favorito:        l.favorito === true,
    nota:            (l.nota || '').trim(),
    fechaAgregado:   existing?.fechaAgregado ?? now,
    fechaActualizado: now,
  };
}

async function loadAll() {
  try {
    const raw = await readFile(PATHS.linksInventory, 'utf8');
    const data = JSON.parse(raw);
    return { links: data.links ?? [], tipos: data.tipos ?? DEFAULT_TIPOS };
  } catch (err) {
    if (err.code === 'ENOENT') {
      const seed = { links: [], tipos: DEFAULT_TIPOS };
      await saveAll(seed);
      return seed;
    }
    throw err;
  }
}

async function saveAll(data) {
  await writeFile(PATHS.linksInventory, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/links — soporta filtros opcionales por query string
router.get('/', async (req, res, next) => {
  try {
    const { links } = await loadAll();
    const { tipo, estado, favorito } = req.query;
    let filtered = links;
    if (tipo)     filtered = filtered.filter(l => l.tipo === tipo);
    if (estado)   filtered = filtered.filter(l => l.estado === estado);
    if (favorito !== undefined) filtered = filtered.filter(l => l.favorito === (favorito === 'true'));
    res.json({ links: filtered, count: filtered.length });
  } catch (err) { next(err); }
});

// GET /api/links/tipos — antes de /:id para que no colisione
router.get('/tipos', async (req, res, next) => {
  try {
    const { links, tipos } = await loadAll();
    const withCount = tipos.map(t => ({ ...t, count: links.filter(l => l.tipo === t.nombre).length }));
    res.json({ tipos: withCount, colores: VALID_COLORES });
  } catch (err) { next(err); }
});

// POST /api/links/tipos — crea un tipo nuevo
router.post('/tipos', async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim();
    const color  = req.body?.color;
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    if (!VALID_COLORES.includes(color)) return res.status(400).json({ error: `color inválido (${VALID_COLORES.join('|')})` });

    const data = await loadAll();
    if (data.tipos.some(t => t.nombre.toLowerCase() === nombre.toLowerCase()))
      return res.status(400).json({ error: `ya existe un tipo "${nombre}"` });

    data.tipos.push({ nombre, color });
    await saveAll(data);
    res.status(201).json({ tipo: { nombre, color, count: 0 } });
  } catch (err) { next(err); }
});

// PUT /api/links/tipos/:nombre — renombra/recolorea (cascada a los links existentes si cambia el nombre)
router.put('/tipos/:nombre', async (req, res, next) => {
  try {
    const nombreActual = req.params.nombre;
    const nombreNuevo  = String(req.body?.nombre ?? '').trim();
    const color        = req.body?.color;
    if (!nombreNuevo) return res.status(400).json({ error: 'nombre requerido' });
    if (!VALID_COLORES.includes(color)) return res.status(400).json({ error: `color inválido (${VALID_COLORES.join('|')})` });

    const data = await loadAll();
    const idx = data.tipos.findIndex(t => t.nombre === nombreActual);
    if (idx === -1) return res.status(404).json({ error: `Tipo no encontrado: ${nombreActual}` });

    if (nombreNuevo.toLowerCase() !== nombreActual.toLowerCase() &&
        data.tipos.some(t => t.nombre.toLowerCase() === nombreNuevo.toLowerCase()))
      return res.status(400).json({ error: `ya existe un tipo "${nombreNuevo}"` });

    data.tipos[idx] = { nombre: nombreNuevo, color };
    if (nombreNuevo !== nombreActual) {
      data.links.forEach(l => { if (l.tipo === nombreActual) l.tipo = nombreNuevo; });
    }
    await saveAll(data);
    const count = data.links.filter(l => l.tipo === nombreNuevo).length;
    res.json({ tipo: { ...data.tipos[idx], count } });
  } catch (err) { next(err); }
});

// DELETE /api/links/tipos/:nombre — bloquea si hay links usando ese tipo, o si es el último que queda
router.delete('/tipos/:nombre', async (req, res, next) => {
  try {
    const nombre = req.params.nombre;
    const data = await loadAll();
    const idx = data.tipos.findIndex(t => t.nombre === nombre);
    if (idx === -1) return res.status(404).json({ error: `Tipo no encontrado: ${nombre}` });
    if (data.tipos.length <= 1) return res.status(400).json({ error: 'debe quedar al menos un tipo' });

    const enUso = data.links.filter(l => l.tipo === nombre).length;
    if (enUso > 0) return res.status(400).json({ error: `"${nombre}" está en uso por ${enUso} link(s) -- reasigná esos links antes de eliminarlo` });

    data.tipos.splice(idx, 1);
    await saveAll(data);
    res.json({ deleted: nombre });
  } catch (err) { next(err); }
});

// POST /api/links — crea un link nuevo (usado por form manual y bookmarklet)
router.post('/', async (req, res, next) => {
  try {
    const data = await loadAll();
    const validTipos = data.tipos.map(t => t.nombre);
    const err = validateLink(req.body, validTipos);
    if (err) return res.status(400).json({ error: err });

    const entry = cleanLink(req.body, validTipos);
    data.links.push(entry);
    await saveAll(data);
    res.status(201).json({ link: entry });
  } catch (err) { next(err); }
});

// PATCH /api/links/:id — actualiza campos parciales
router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const data = await loadAll();
    const idx = data.links.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: `Link no encontrado: ${id}` });

    const validTipos = data.tipos.map(t => t.nombre);
    const merged = { ...data.links[idx], ...req.body };
    const err = validateLink(merged, validTipos);
    if (err) return res.status(400).json({ error: err });

    data.links[idx] = cleanLink(merged, validTipos, data.links[idx]);
    await saveAll(data);
    res.json({ link: data.links[idx] });
  } catch (err) { next(err); }
});

// DELETE /api/links/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const data = await loadAll();
    const idx = data.links.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: `Link no encontrado: ${id}` });

    data.links.splice(idx, 1);
    await saveAll(data);
    res.json({ deleted: id });
  } catch (err) { next(err); }
});

export default router;
