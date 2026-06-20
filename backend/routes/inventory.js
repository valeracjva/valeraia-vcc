import { Router } from 'express';
import { readFile } from 'fs/promises';
import { PATHS } from '../config.js';

const router = Router();

function normalizeRisk(raw) {
  const s = raw.toLowerCase();
  if (s.includes('crítico') || s.includes('critico')) return 'critico';
  if (s.includes('alto'))     return 'alto';
  if (s.includes('moderado')) return 'moderado';
  return 'bajo';
}

function parseList(lines, startPattern, stopPattern) {
  const items = [];
  let active = false;
  for (const line of lines) {
    if (startPattern.test(line))  { active = true; continue; }
    if (active && stopPattern.test(line)) { active = false; continue; }
    if (active && /^-\s+/.test(line)) {
      items.push(line.replace(/^-\s+/, '').trim());
    }
  }
  return items;
}

function parseContainers(lines) {
  let inTable = false;
  let total = 0, healthy = 0, unhealthy = 0;
  for (const line of lines) {
    if (/^\*\*Contenedores Docker/.test(line)) { inTable = true; continue; }
    if (inTable && /^\*\*[A-Z]|^---/.test(line)) inTable = false;
    if (inTable && /^\|/.test(line) && !/Contenedor|---|---/.test(line)) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 3) continue;
      const state = cols[2] || '';
      if (/✓ healthy|✓ up/.test(state)) { total++; healthy++; }
      else if (/UNHEALTHY|RESTARTING/.test(state)) { total++; unhealthy++; }
    }
  }
  return inTable || total > 0 ? { total, healthy, unhealthy } : null;
}

function parseSection(title, body) {
  const lines = body.split('\n');

  // Parse key-value table
  const kv = {};
  for (const line of lines) {
    const m = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/);
    if (m) kv[m[1].trim()] = m[2].replace(/`/g, '').trim();
  }

  const ipRaw = kv['IP'] || kv['IP primaria'] || kv['IP pública'] || kv['Red'] || null;
  if (!ipRaw) return null; // no es un servidor
  // Tomar solo el primer token (eliminar notas inline como "⚠️ cambia al reiniciar")
  const ip = ipRaw.split(/\s/)[0].replace(/\(.*\)/, '').trim();

  const riesgoRaw = kv['Riesgo'] || 'bajo';

  // Apps: líneas con `- \`nombre\``
  const apps = [];
  let inApps = false;
  for (const line of lines) {
    if (/^\*\*Apps en/.test(line))  { inApps = true; continue; }
    if (inApps && /^\*\*/.test(line)) { inApps = false; }
    if (inApps && /^-\s+/.test(line)) {
      const m = line.match(/^-\s+`(.+?)`(?:\s*—\s*(.+))?/);
      if (m) apps.push({ name: m[1], desc: (m[2] || '').trim() });
    }
  }

  // Dominios
  const dominios = parseList(
    lines,
    /^\*\*Dominios:\*\*/,
    /^\*\*[A-Z]|^---/
  ).flatMap(d => d.split(' / ')).map(d => d.trim()).filter(Boolean);

  // Contenedores (solo faty001)
  const containers = parseContainers(lines);

  const id = title.replace(/\s*\(.*?\)/, '').trim();

  return {
    id,
    title: title.trim(),
    ip,
    os:          kv['OS'] || '—',
    empresa:     kv['Empresa'] || '—',
    rol:         kv['Rol'] || '—',
    riesgo:      normalizeRisk(riesgoRaw),
    riesgoLabel: riesgoRaw.split('—')[0].trim().replace(/CRÍTICO/i, 'CRÍTICO'),
    acceso:      kv['Acceso'] || '—',
    sshUser:     kv['SSH usuario'] || null,
    sshKey:      kv['SSH clave'] || null,
    mysqlTunel:  kv['MySQL túnel'] || null,
    puerto:      kv['Puerto'] || null,
    apps,
    dominios,
    containers,
  };
}

function parse(text) {
  const SKIP = /^(Túneles SSH|MCPs disponibles|Red y acceso)/;
  const chunks = text.split(/^## /m).slice(1);
  return chunks
    .map(chunk => {
      const nl = chunk.indexOf('\n');
      const title = chunk.slice(0, nl).trim();
      const body  = chunk.slice(nl + 1);
      if (SKIP.test(title)) return null;
      return parseSection(title, body);
    })
    .filter(Boolean);
}

router.get('/', async (req, res, next) => {
  try {
    const text = await readFile(PATHS.serverInventory, 'utf8');
    const servers = parse(text);
    res.json({ servers, count: servers.length });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'SERVER_INVENTORY.md no encontrado' });
    next(err);
  }
});

export default router;
