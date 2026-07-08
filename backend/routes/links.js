import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PATHS } from '../config.js';

const router = Router();

const VALID_TIPOS  = ['Repo', 'Articulo', 'Skill', 'MCP', 'Otro'];
const VALID_ESTADOS = ['Pendiente', 'Revisado', 'Implementar', 'Descartado'];

function isValidUrl(u) {
  try { const parsed = new URL(u); return parsed.protocol === 'http:' || parsed.protocol === 'https:'; }
  catch { return false; }
}

function validate(l) {
  if (!l || typeof l !== 'object')     return 'link inválido';
  if (!l.url?.trim())                  return 'url requerida';
  if (!isValidUrl(l.url.trim()))       return 'url inválida (debe ser http:// o https://)';
  if (!l.titulo?.trim())               return 'titulo requerido';
  if (l.tipo !== undefined && !VALID_TIPOS.includes(l.tipo))
    return `tipo inválido (${VALID_TIPOS.join('|')})`;
  if (l.estado !== undefined && !VALID_ESTADOS.includes(l.estado))
    return `estado inválido (${VALID_ESTADOS.join('|')})`;
  if (l.tags !== undefined && !Array.isArray(l.tags))
    return 'tags debe ser array';
  return null;
}

function clean(l, existing = null) {
  const now = new Date().toISOString();
  return {
    id:              existing?.id ?? randomUUID(),
    url:             l.url.trim(),
    titulo:          l.titulo.trim(),
    tipo:            VALID_TIPOS.includes(l.tipo) ? l.tipo : 'Otro',
    tags:            Array.isArray(l.tags) ? l.tags.map(t => String(t).trim()).filter(Boolean) : [],
    estado:          VALID_ESTADOS.includes(l.estado) ? l.estado : 'Pendiente',
    favorito:        l.favorito === true,
    nota:            (l.nota || '').trim(),
    fechaAgregado:   existing?.fechaAgregado ?? now,
    fechaActualizado: now,
  };
}

async function load() {
  try {
    const raw = await readFile(PATHS.linksInventory, 'utf8');
    return JSON.parse(raw).links;
  } catch (err) {
    if (err.code === 'ENOENT') { await save([]); return []; }
    throw err;
  }
}

async function save(links) {
  await writeFile(PATHS.linksInventory, JSON.stringify({ links }, null, 2), 'utf8');
}

// GET /api/links — soporta filtros opcionales por query string
router.get('/', async (req, res, next) => {
  try {
    const links = await load();
    const { tipo, estado, favorito } = req.query;
    let filtered = links;
    if (tipo)     filtered = filtered.filter(l => l.tipo === tipo);
    if (estado)   filtered = filtered.filter(l => l.estado === estado);
    if (favorito !== undefined) filtered = filtered.filter(l => l.favorito === (favorito === 'true'));
    res.json({ links: filtered, count: filtered.length });
  } catch (err) { next(err); }
});

// POST /api/links — crea un link nuevo (usado por form manual y bookmarklet)
router.post('/', async (req, res, next) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const links = await load();
    const entry = clean(req.body);
    links.push(entry);
    await save(links);
    res.status(201).json({ link: entry });
  } catch (err) { next(err); }
});

// PATCH /api/links/:id — actualiza campos parciales
router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const links = await load();
    const idx = links.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: `Link no encontrado: ${id}` });

    const merged = { ...links[idx], ...req.body };
    const err = validate(merged);
    if (err) return res.status(400).json({ error: err });

    links[idx] = clean(merged, links[idx]);
    await save(links);
    res.json({ link: links[idx] });
  } catch (err) { next(err); }
});

// DELETE /api/links/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const links = await load();
    const idx = links.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: `Link no encontrado: ${id}` });

    links.splice(idx, 1);
    await save(links);
    res.json({ deleted: id });
  } catch (err) { next(err); }
});

export default router;
