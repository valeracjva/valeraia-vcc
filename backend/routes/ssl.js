import { Router } from 'express';
import tls from 'tls';
import dns from 'dns';
import { readFile, writeFile } from 'fs/promises';
import { PATHS } from '../config.js';

const router = Router();
const dnsPromises = dns.promises;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
let cache = null;

function classifyDays(daysLeft) {
  if (daysLeft <= 0)  return 'expired';
  if (daysLeft <= 14) return 'crit';
  if (daysLeft <= 35) return 'warn'; // Let's Encrypt renueva ~30d antes — margen para notar renovaciones fallidas
  return 'ok';
}

// Equivalente a `dig +short domain` / `nslookup domain` — resuelve el A record
// y los nameservers reales. Corre para todos los dominios, incluso archivados,
// porque es liviano y sirve como señal si algo vuelve a resolver.
//
// dns.lookup() usa el resolver del SO (igual que tls.connect internamente) — funciona
// detrás de VPN/firewall. dns.resolve4()/resolveNs() consultan nameservers directo por
// UDP:53 y dan ECONNREFUSED en redes que solo permiten el stub resolver del SO — por eso
// van separados: IP por lookup (confiable), NS records por resolve (best-effort, puede fallar).
async function resolveDnsInfo(domain) {
  const [ip, ns] = await Promise.all([
    dnsPromises.lookup(domain, { family: 4 }).then(r => r.address).catch(() => null),
    dnsPromises.resolveNs(domain).catch(() => []),
  ]);
  return { resolvedIp: ip, nsRecords: ns };
}

function checkDomain(domain) {
  return new Promise((resolve) => {
    // rejectUnauthorized:false es intencional: necesitamos leer el cert incluso cuando
    // está vencido o es inválido. Solo leemos metadatos, no enviamos datos sensibles.
    // Equivalente a: openssl s_client -connect domain:443
    const socket = tls.connect(443, domain, {
      servername: domain,
      rejectUnauthorized: false,
      timeout: 7000,
    });

    const cleanup = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.on('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        return cleanup({ status: 'error', error: 'sin certificado', daysLeft: null, expiresAt: null });
      }
      const expiresAt = new Date(cert.valid_to);
      const daysLeft  = Math.floor((expiresAt - Date.now()) / 86_400_000);
      cleanup({ status: classifyDays(daysLeft), daysLeft, expiresAt: expiresAt.toISOString(), error: null });
    });

    socket.on('error',   (err) => cleanup({ status: 'error', error: err.message, daysLeft: null, expiresAt: null }));
    socket.on('timeout', ()    => cleanup({ status: 'error', error: 'timeout',   daysLeft: null, expiresAt: null }));
  });
}

async function runChecks() {
  const raw  = await readFile(PATHS.sslWatch, 'utf8');
  const list = JSON.parse(raw).domains;

  const results = await Promise.all(
    list.map(async ({ domain, label, empresa, dnsAdmin, archived, archivedNote }) => {
      const dnsInfo = await resolveDnsInfo(domain);

      // Archivado = decisión tomada (ej: dominio dado de baja en nic.ar y no se renueva).
      // No tiene sentido pegarle al puerto 443 por algo que ya sabemos que no responde,
      // pero el DNS sí se resuelve siempre — es la señal barata de si algo cambió.
      if (archived) {
        return { domain, label, empresa: empresa ?? '', dnsAdmin: dnsAdmin ?? '', ...dnsInfo,
                  archived: true, archivedNote: archivedNote ?? '',
                  status: 'archived', daysLeft: null, expiresAt: null, error: null };
      }
      const check = await checkDomain(domain);
      return { domain, label, empresa: empresa ?? '', dnsAdmin: dnsAdmin ?? '', ...dnsInfo, archived: false, ...check };
    })
  );

  const summary = { ok: 0, warn: 0, crit: 0, expired: 0, error: 0 };
  for (const r of results) if (!r.archived) summary[r.status]++;

  return { domains: results, summary, checkedAt: new Date().toISOString() };
}

// === Config CRUD ===

router.get('/config', async (req, res, next) => {
  try {
    const raw = await readFile(PATHS.sslWatch, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    next(err);
  }
});

router.put('/config', async (req, res, next) => {
  try {
    const { domains } = req.body;
    if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains debe ser un array' });
    for (const d of domains) {
      if (typeof d.domain !== 'string' || !d.domain.trim()) {
        return res.status(400).json({ error: 'cada entrada requiere domain (string no vacío)' });
      }
      if (typeof d.label !== 'string') {
        return res.status(400).json({ error: 'cada entrada requiere label (string)' });
      }
    }
    const clean = domains.map(d => ({
      domain: d.domain.trim(),
      label: d.label.trim(),
      empresa: (d.empresa ?? '').trim(),
      dnsAdmin: (d.dnsAdmin ?? '').trim(),
      ...(d.archived ? { archived: true, archivedNote: (d.archivedNote ?? '').trim() } : {}),
    }));
    await writeFile(PATHS.sslWatch, JSON.stringify({ domains: clean }, null, 2), 'utf8');
    cache = null; // invalidar caché
    res.json({ domains: clean });
  } catch (err) {
    next(err);
  }
});

// === Monitor ===

router.get('/', async (req, res, next) => {
  try {
    const force = req.query.force === '1';
    const now   = Date.now();

    if (!force && cache && (now - cache.ts) < CACHE_TTL_MS) {
      return res.json({ ...cache.data, cached: true });
    }

    const data = await runChecks();
    cache = { ts: now, data };
    res.json({ ...data, cached: false });
  } catch (err) {
    next(err);
  }
});

export default router;
