import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { PATHS } from '../config.js';
import path from 'path';
import os from 'os';

const router = Router();

const VALID_RIESGOS = ['bajo', 'moderado', 'alto', 'critico'];

export function validate(s) {
  if (!s || typeof s !== 'object')             return 'servidor inválido';
  if (!s.id?.trim())                           return 'id requerido';
  if (!s.ip?.trim())                           return 'ip requerida';
  if (!s.os?.trim())                           return 'os requerido';
  if (!s.empresa?.trim())                      return 'empresa requerida';
  if (!VALID_RIESGOS.includes(s.riesgo))       return `riesgo inválido (${VALID_RIESGOS.join('|')})`;
  if (!Array.isArray(s.apps))                  return 'apps debe ser array';
  if (!Array.isArray(s.dominios))              return 'dominios debe ser array';
  // perfil = tags libres (igual que apps/dominios), aplica a Linux y Windows por igual --
  // antes era un enum fijo de valores Windows (hyper-v/iis/sql-server/...) que bloqueaba
  // etiquetas de Linux como "laravel".
  if (s.perfil !== undefined && s.perfil !== null && !Array.isArray(s.perfil)) {
    return 'perfil debe ser array';
  }
  return null;
}

export function clean(s) {
  return {
    monitoreado: s.monitoreado === true,
    id:         s.id.trim(),
    ip:         s.ip.trim(),
    os:         s.os.trim(),
    empresa:    s.empresa.trim(),
    rol:        (s.rol || '').trim(),
    riesgo:     s.riesgo,
    acceso:     (s.acceso || '').trim(),
    perfil:     Array.isArray(s.perfil) ? s.perfil.map(p => String(p).trim()).filter(Boolean) : [],
    // localAgent: true si el host ya tiene el stack de monitoreo local desplegado
    // (Linux: projects/monitoreo/, Windows: projects/monitoreo/windows/) -- monitoring-core/poller.js
    // solo escribe heartbeat en hosts con este flag, el resto no tiene fallback local que coordinar.
    localAgent: s.localAgent === true,
    sshUser:      s.sshUser?.trim() || null,
    sshKey:       s.sshKey?.trim()  || null,
    winrmUser:    s.winrmUser?.trim() || null,
    // winrmPassword: credencial de login de Windows completo (no solo DB) -- se guarda en texto plano
    // en servers-config.json (gitignored), mismo patrón que db.password en tunnels-config.json.
    // Se enmascara en GET /api/inventory (ver maskPassword) para no dejarla circulando en el frontend
    // salvo el instante de alta/edición donde el propio operador la acaba de tipear.
    winrmPassword: s.winrmPassword?.trim() || null,
    mysqlTunel: s.mysqlTunel?.trim() || null,
    puerto:     s.puerto?.trim()  || null,
    notas:      s.notas?.trim()   || null,
    apps:       (s.apps || []).map(a => ({ name: String(a.name || '').trim(), desc: String(a.desc || '').trim() })).filter(a => a.name),
    dominios:   (s.dominios || []).map(d => String(d).trim()).filter(Boolean),
  };
}

function maskPassword(s) {
  if (!s.winrmPassword) return s;
  return { ...s, winrmPassword: s.winrmPassword.slice(0, 2) + '****' };
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
    res.json({ servers: servers.map(maskPassword), count: servers.length });
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
    await syncServerInventory();
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
    await syncServerInventory();
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

    // Mantener el id original; la edición no puede cambiar el id.
    // Si no se envía winrmPassword (campo dejado en blanco a propósito en el form), conservar la existente.
    const incoming = { ...req.body, id };
    if (!incoming.winrmPassword) incoming.winrmPassword = servers[idx].winrmPassword || null;
    const err = validate(incoming);
    if (err) return res.status(400).json({ error: err });

    servers[idx] = clean(incoming);
    await save(servers);
    await syncServerInventory();
    res.json({ server: servers[idx] });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/:id/mcp-ssh — agrega el servidor al SERVERS de mcp-ssh/index.js
router.post('/:id/mcp-ssh', async (req, res, next) => {
  try {
    const id = req.params.id;
    const servers = await load();
    const srv = servers.find(s => s.id === id);
    if (!srv) return res.status(404).json({ error: `Servidor no encontrado: ${id}` });
    if (!srv.sshUser || !srv.sshKey)
      return res.status(400).json({ error: 'El servidor necesita sshUser y sshKey para agregar al mcp-ssh' });

    const mcpSshPath = path.join(os.homedir(), '.claude', 'mcp', 'mcp-ssh', 'index.js');
    let content = await readFile(mcpSshPath, 'utf8');

    if (content.includes(`'${id}':`))
      return res.status(409).json({ error: `El alias "${id}" ya existe en mcp-ssh` });

    // Normalizar sshKey: quitar ~/ o ./ y partir en segmentos para path.join(HOME, ...)
    const keyNorm = srv.sshKey.replace(/^~\//, '').replace(/^\.\//, '');
    const keyParts = keyNorm.split('/').map(p => `'${p}'`).join(', ');

    const newEntry =
      `  '${id}': {\n` +
      `    host: '${srv.ip}',\n` +
      `    port: 22,\n` +
      `    username: '${srv.sshUser}',\n` +
      `    privateKey: fs.readFileSync(path.join(HOME, ${keyParts}))\n` +
      `  }`;

    const ANCHOR = '\n};\n\nfunction connect(';
    const anchorIdx = content.indexOf(ANCHOR);
    if (anchorIdx === -1)
      return res.status(500).json({ error: 'No se encontró el anchor en mcp-ssh/index.js' });

    content = content.slice(0, anchorIdx) + ',\n' + newEntry + content.slice(anchorIdx);
    await writeFile(mcpSshPath, content, 'utf8');

    res.json({ ok: true, added: id });
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
    await syncServerInventory();
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});

// ── Sync: servers-config.json → SERVER_INVENTORY.md ──────────────
async function syncServerInventory() {
  try {
    const servers = await load();
    const vccIds = new Set(servers.map(s => s.id));

    // Escanear SERVER_INVENTORY.md viejo para capturar servidores legacy
    let orphanBlocks = [];
    try {
      const old = await readFile(PATHS.serverInventory, 'utf8');

      // Parte 1: detectar secciones pre-Pendientes que no estén en VCC
      const pendIdx = old.indexOf('\n## Pendientes');
      const mainContent = pendIdx === -1 ? old : old.slice(0, pendIdx);

      const sectionRe = /^## (.+)$/gm;
      const allLines = old.split('\n');
      const starts = [];

      // Escanear secciones en la parte principal
      let m;
      while ((m = sectionRe.exec(mainContent)) !== null) {
        const lineNum = mainContent.slice(0, m.index).split('\n').length - 1;
        const header = m[1].trim();
        const firstWord = header.split(/[\s(]/)[0];
        if (!vccIds.has(firstWord) && !['Túneles', 'MCPs', 'Red', 'Pendientes'].some(p => header.startsWith(p))) {
          starts.push({ header, lineNum });
        }
      }

      // Parte 2: si existe un bloque Pendientes, extraer sus servidores
      // y mantenerlos si todavía no están en VCC
      if (pendIdx !== -1) {
        const pendContent = old.slice(pendIdx);
        const linesBeforePend = old.slice(0, pendIdx).split('\n').length;
        const pendLines = pendContent.split('\n');
        for (let li = 0; li < pendLines.length; li++) {
          const pm = pendLines[li].match(/^## (.+)$/);
          if (!pm) continue;
          const header = pm[1].trim();
          const firstWord = header.split(/[\s(]/)[0];
          if (!vccIds.has(firstWord) && !['Pendientes', 'Túneles', 'MCPs', 'Red'].some(p => header.startsWith(p))) {
            // -1 porque pendLines[0] es vacío fantasma por el \n inicial de pendContent
            starts.push({ header, lineNum: linesBeforePend + li - 1 });
          }
        }
      }

      // Ordenar por línea y extraer bloques únicos
      starts.sort((a, b) => a.lineNum - b.lineNum);
      const seen = new Set();
      const uniqueStarts = starts.filter(s => {
        if (seen.has(s.header)) return false;
        seen.add(s.header);
        return true;
      });

      for (let i = 0; i < uniqueStarts.length; i++) {
        const s = uniqueStarts[i].lineNum;
        const e = i + 1 < uniqueStarts.length ? uniqueStarts[i + 1].lineNum : allLines.length;
        let block = allLines.slice(s, e).join('\n');
        block = block.replace(/\n---\s*$/, '');
        orphanBlocks.push(block);
      }
    } catch (_) { /* archivo aun no existe — ok */ }

    // Generar markdown
    const now = new Date();
    const ds = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    let md = `# SERVER_INVENTORY.md
> Generado automáticamente desde VCC (servers-config.json).
> Agregar/editar servidores desde la UI de VCC → Inventario.
> NO editar manualmente — los cambios se pierden al regenerar.
> Última regeneración: ${ds}

---
`;

    for (const s of servers) {
      md += `\n## ${s.id}\n\n`;
      md += `| Campo | Valor |\n|---|---|\n`;
      md += `| **IP** | ${s.ip} |\n`;
      md += `| **OS** | ${s.os} |\n`;
      md += `| **Empresa** | ${s.empresa} |\n`;
      md += `| **Rol** | ${s.rol || '-'} |\n`;
      md += `| **Riesgo** | ${s.riesgo} |\n`;
      md += `| **Acceso** | ${s.acceso || '-'} |\n`;
      if (s.sshUser && s.sshKey) {
        md += `| **SSH usuario** | ${s.sshUser} |\n`;
        md += `| **SSH clave** | \`~/${s.sshKey}\` |\n`;
      }
      if (s.winrmUser) {
        md += `| **WinRM usuario** | ${s.winrmUser} |\n`;
      }
      if (s.mysqlTunel) {
        md += `| **MySQL túnel** | local ${s.mysqlTunel} → 3306 |\n`;
      }
      if (s.notas) {
        md += `| **Notas** | ${s.notas} |\n`;
      }
      md += '\n';
      if (s.perfil && s.perfil.length > 0) {
        md += `**Perfiles:** ${s.perfil.join(', ')}\n\n`;
      }
      if (s.apps && s.apps.length > 0) {
        md += '**Apps:**\n';
        for (const a of s.apps) {
          md += `- \`${a.name}\`${a.desc ? ` — ${a.desc}` : ''}\n`;
        }
        md += '\n';
      }
      if (s.dominios && s.dominios.length > 0) {
        md += '**Dominios:**\n';
        for (const d of s.dominios) {
          md += `- ${d}\n`;
        }
        md += '\n';
      }
      md += '---\n';
    }

    if (orphanBlocks.length > 0) {
      md += '\n## Pendientes de migrar a VCC\n\n';
      md += '> Estos servidores están en SERVER_INVENTORY.md pero aún no fueron agregados a VCC.\n';
      md += '> Agregarlos desde la UI de Inventario en VCC.\n\n';
      for (const block of orphanBlocks) {
        // Sacar el --- final del bloque legacy porque ya agregamos separador abajo
        const trimmed = block.replace(/\n---\s*$/, '');
        md += trimmed + '\n\n---\n';
      }
    }

    await writeFile(PATHS.serverInventory, md, 'utf8');
  } catch (err) {
    console.error('[inventory] Error en syncServerInventory:', err.message);
    // No interrumpir el request si el sync falla
  }
}

export default router;
