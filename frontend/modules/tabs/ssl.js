import { API_BASE } from '../core/constants.js';
import { get } from '../core/api.js';
import { publishActivityNote } from '../core/activity-rail.js';
import { buildAccordion, escHtml, formField, openEditModal, showManageBanner } from '../core/dom.js';

// === M10 — SSL ===
const SSL_STATUS_LABEL = { ok: 'OK', warn: 'WARN', crit: 'CRÍTICO', expired: 'VENCIDO', error: 'SIN RESOLVER', archived: 'ARCHIVADO' };
// error va antes que warn/ok: no saber si un cert vive es al menos tan urgente como saber que agoniza.
// archived va al final de todo: es un problema con decisión tomada, no una alerta activa.
const SSL_STATUS_ORDER = { expired: 0, crit: 1, error: 2, warn: 3, ok: 4, archived: 5 };

let sslView = 'expiry';
let sslData  = null;

const HIDDEN_SSL_KEY = 'vcc-hidden-ssl';
function getSslHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_SSL_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveSslHidden(set) {
  localStorage.setItem(HIDDEN_SSL_KEY, JSON.stringify([...set]));
}

function updateSSLBadge(summary) {
  const badge = document.getElementById('ssl-header-badge');
  const count = (summary.expired ?? 0) + (summary.crit ?? 0);
  if (count === 0) { badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  badge.classList.toggle('warn', (summary.expired ?? 0) === 0);
  badge.textContent = `SSL ⚠ ${count}`;
  badge.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.querySelector('[data-tab="ssl"]')?.classList.add('active');
    document.getElementById('tab-ssl').classList.remove('hidden');
  };
}

function sslDaysText(row) {
  if (row.archived) return '—';
  if (row.daysLeft === null) return '—';
  return row.daysLeft <= 0 ? `${Math.abs(row.daysLeft)}d vencido` : `${row.daysLeft}d`;
}

// Versión larga para las cards (hay espacio) — la compacta ("31d") queda para Listado.
function sslDaysTextLong(row) {
  if (row.archived) return '—';
  if (row.daysLeft === null) return '—';
  if (row.daysLeft <= 0) return `Vencido hace ${Math.abs(row.daysLeft)} día${Math.abs(row.daysLeft) === 1 ? '' : 's'}`;
  return `${row.daysLeft} día${row.daysLeft === 1 ? '' : 's'}`;
}

function sslExpiresText(row) {
  if (row.archived) return row.archivedNote || 'Archivado';
  if (row.expiresAt) return new Date(row.expiresAt).toLocaleDateString('es-AR');
  return row.error ?? '—';
}

function buildSSLCard(row) {
  const card = document.createElement('div');
  card.className = `ssl-card ssl-status-${row.status}`;
  const nsText = row.nsRecords?.length ? row.nsRecords.join(', ') : null;
  const dnsLine = [row.dnsAdmin, nsText].filter(Boolean).join(' · ');
  // Misma jerarquía que la card de servidor: técnico (IP) → organizacional (empresa)
  // → propósito (label) → conexión (dns admin) → gap → métrica (días/vencimiento).
  card.innerHTML =
    `<div class="ssl-card-header">` +
      `<span class="ssl-dot ${row.status}"></span>` +
      `<span class="ssl-card-domain" title="${escHtml(row.domain)}">${escHtml(row.domain)}</span>` +
      `<button class="infra-edit-btn" title="Editar" data-edit-domain="${escHtml(row.domain)}">✎</button>` +
      `<button class="infra-hide-btn" title="Ocultar de la vista" data-hide-domain="${escHtml(row.domain)}">×</button>` +
    `</div>` +
    `<div class="ssl-card-ip">${row.resolvedIp ? escHtml(row.resolvedIp) : 'sin IP'}</div>` +
    (row.empresa ? `<div class="ssl-card-empresa">${escHtml(row.empresa)}</div>` : '') +
    `<div class="ssl-card-label">${escHtml(row.label)}</div>` +
    (dnsLine ? `<div class="ssl-card-dns">${escHtml(dnsLine)}</div>` : '') +
    `<div class="ssl-card-metrics">` +
      `<div class="ssl-metric-row">` +
        `<span class="ssl-metric-label">Vence en</span>` +
        `<span class="ssl-card-days ssl-status-${row.status}">${escHtml(sslDaysTextLong(row))}</span>` +
      `</div>` +
      `<div class="ssl-metric-row">` +
        `<span class="ssl-metric-label">Fecha</span>` +
        `<span class="ssl-card-date">${escHtml(sslExpiresText(row))}</span>` +
      `</div>` +
    `</div>`;

  card.querySelector('.infra-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showDomainModal(row);
  });
  card.querySelector('.infra-hide-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const hidden = getSslHidden();
    hidden.add(row.domain);
    saveSslHidden(hidden);
    renderSSLMonitor(sslData);
  });

  return card;
}

// Extrae el dominio raíz (ej: "one.fincos.com.ar" → "fincos.com.ar")
function rootDomain(domain) {
  const parts = domain.split('.');
  const twoLevel = ['com', 'seg', 'org', 'net', 'edu', 'gob', 'int', 'mil'];
  if (parts.length >= 3 && parts.at(-1) === 'ar' && twoLevel.includes(parts.at(-2))) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

// Peor estado de un grupo
function worstStatus(domains) {
  return domains.reduce((worst, d) =>
    SSL_STATUS_ORDER[d.status] < SSL_STATUS_ORDER[worst] ? d.status : worst,
    'ok'
  );
}

function renderSSLByExpiry(domains) {
  const sorted = [...domains].sort((a, b) => {
    const so = SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status];
    if (so !== 0) return so;
    const da = a.daysLeft ?? 9999;
    const db = b.daysLeft ?? 9999;
    return da - db;
  });
  const grid = document.createElement('div');
  grid.className = 'ssl-grid';
  sorted.forEach(row => grid.appendChild(buildSSLCard(row)));
  return grid;
}

function renderSSLByDomain(domains) {
  const groups = {};
  for (const d of domains) {
    const root = rootDomain(d.domain);
    if (!groups[root]) groups[root] = [];
    groups[root].push(d);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ssl-groups';

  for (const [root, items] of Object.entries(groups).sort()) {
    const worst    = worstStatus(items);
    const isSingle = items.length === 1 && items[0].domain === root;

    const grid = document.createElement('div');
    grid.className = 'ssl-grid';
    [...items].sort((a, b) => SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status])
              .forEach(row => grid.appendChild(buildSSLCard(row)));

    if (isSingle) {
      wrapper.appendChild(grid);
    } else {
      // Auto-expandir dominios con problemas críticos
      const autoOpen = worst === 'expired' || worst === 'crit';
      wrapper.appendChild(buildAccordion(root, items.length, grid, {
        startOpen:  autoOpen,
        storageKey: `ssl-domain-${root}`,
      }));
    }
  }
  return wrapper;
}

function renderSSLByEmpresa(domains) {
  const map = new Map();
  for (const row of domains) {
    const key = row.empresa || 'Sin empresa';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ssl-groups';

  for (const [empresa, items] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const worst = worstStatus(items);
    const autoOpen = worst === 'expired' || worst === 'crit';

    const grid = document.createElement('div');
    grid.className = 'ssl-grid';
    [...items].sort((a, b) => SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status])
              .forEach(row => grid.appendChild(buildSSLCard(row)));

    wrapper.appendChild(buildAccordion(empresa, items.length, grid, {
      startOpen:  autoOpen,
      storageKey: `ssl-empresa-${empresa}`,
    }));
  }
  return wrapper;
}

// Vista listado compacto (tabla)
function renderSSLAsList(domains) {
  const sorted = [...domains].sort((a, b) => {
    const so = SSL_STATUS_ORDER[a.status] - SSL_STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
  });

  const table = document.createElement('table');
  table.className = 'ssl-table data-table';
  table.innerHTML =
    `<thead><tr>` +
    `<th>DOMINIO</th><th>EMPRESA</th><th>IP</th><th>ESTADO</th><th>DÍAS</th><th>VENCE</th>` +
    `</tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const row of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><code>${escHtml(row.domain)}</code></td>` +
      `<td style="color:var(--text-faint)">${escHtml(row.empresa || '—')}</td>` +
      `<td style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-faint)">${escHtml(row.resolvedIp || '—')}</td>` +
      `<td><span class="ssl-dot ${row.status}"></span> <span class="ssl-status-${row.status}">${SSL_STATUS_LABEL[row.status] ?? row.status}</span></td>` +
      `<td class="ssl-status-${row.status}">${escHtml(sslDaysText(row))}</td>` +
      `<td style="font-family:var(--font-mono);font-size:0.7rem">${escHtml(sslExpiresText(row))}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderSSLMonitor(data) {
  const container = document.getElementById('ssl-container');
  if (data.checkedAt) {
    const d = new Date(data.checkedAt);
    document.getElementById('ssl-checked-at').textContent =
      `verificado ${d.toLocaleTimeString('es-AR')}${data.cached ? ' (caché)' : ''}`;
  }
  updateSSLBadge(data.summary ?? {});
  container.innerHTML = '';

  const hidden      = getSslHidden();
  const visible      = data.domains.filter(d => !hidden.has(d.domain));
  const hiddenCount  = data.domains.length - visible.length;
  const active   = visible.filter(d => !d.archived);
  const archived = visible.filter(d => d.archived);

  const showBtn = document.getElementById('btn-ssl-show-hidden');
  if (showBtn) {
    showBtn.style.display = hiddenCount > 0 ? '' : 'none';
    showBtn.textContent = `↺ Mostrar ocultos (${hiddenCount})`;
  }

  let rendered;
  if (sslView === 'domain')   rendered = renderSSLByDomain(active);
  else if (sslView === 'empresa') rendered = renderSSLByEmpresa(active);
  else if (sslView === 'list')    rendered = renderSSLAsList(active);
  else                            rendered = renderSSLByExpiry(active);
  container.appendChild(rendered);

  if (archived.length) {
    const grid = document.createElement('div');
    grid.className = 'ssl-grid';
    archived.forEach(row => grid.appendChild(buildSSLCard(row)));
    container.appendChild(buildAccordion('Archivados', archived.length, grid, {
      startOpen:  false,
      storageKey: 'ssl-archived',
      title: 'Decisión tomada — no cuentan para las alertas de vencimiento',
    }));
  }
}

export async function loadSSL(force = false) {
  const btn = document.getElementById('btn-ssl-refresh');
  const entryId = force ? `ssl-refresh-${Date.now()}` : null;
  if (entryId) {
    publishActivityNote({
      entryId,
      title: 'SSL / Dominios',
      category: 'refresh',
      status: 'running',
      message: 'verificación manual iniciada',
      details: ['Chequeando certificados desde /api/ssl?force=1'],
    });
  }
  btn.disabled = true;
  document.getElementById('ssl-container').innerHTML =
    '<div class="ssl-loading">Verificando certificados...</div>';
  try {
    sslData = await get(`/api/ssl${force ? '?force=1' : ''}`);
    renderSSLMonitor(sslData);
    if (entryId) {
      const total = sslData?.domains?.length ?? 0;
      const crit = (sslData?.summary?.crit ?? 0) + (sslData?.summary?.expired ?? 0);
      publishActivityNote({
        entryId,
        title: 'SSL / Dominios',
        category: 'refresh',
        status: 'success',
        message: 'verificación completada',
        details: [`${total} dominio(s) revisado(s)`, `${crit} alerta(s) críticas o vencidas`],
      });
    }
  } catch {
    document.getElementById('ssl-container').innerHTML =
      '<div class="ssl-loading" style="color:var(--red)">Error al verificar certificados</div>';
    if (entryId) {
      publishActivityNote({
        entryId,
        title: 'SSL / Dominios',
        category: 'refresh',
        status: 'error',
        message: 'falló la verificación manual',
        details: ['El request a /api/ssl?force=1 no devolvió datos válidos'],
      });
    }
  } finally {
    btn.disabled = false;
  }
}

// === M10 — ABM Dominios ===
let sslManageMode = false;
let sslManageDomains = [];

function renderManageTable(domains) {
  sslManageDomains = domains;
  const c = document.getElementById('ssl-manage-container');
  c.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-solid btn-manage-add';
  addBtn.textContent = '＋ Agregar dominio';
  addBtn.addEventListener('click', () => showDomainModal(null));
  c.appendChild(addBtn);

  const table = document.createElement('table');
  table.className = 'ssl-table data-table';
  table.innerHTML = `<thead><tr><th>DOMINIO</th><th>ETIQUETA</th><th>EMPRESA</th><th>ADMIN DNS</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  domains.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.dataset.domain = entry.domain;

    const archivedTag = entry.archived ? ` <span class="ssl-status-archived" style="font-size:0.62rem;font-weight:700;letter-spacing:0.06em">● ARCHIVADO</span>` : '';
    tr.innerHTML =
      `<td><span class="ssl-domain">${escHtml(entry.domain)}</span>${archivedTag}</td>` +
      `<td><span class="ssl-label">${escHtml(entry.label)}</span></td>` +
      `<td><span style="color:var(--text-faint)">${escHtml(entry.empresa || '—')}</span></td>` +
      `<td><span style="color:var(--text-faint)">${escHtml(entry.dnsAdmin || '—')}</span></td>` +
      `<td class="manage-actions"></td>`;

    const tdActs = tr.querySelector('.manage-actions');

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-sm btn-ghost btn-ssl-action';
    btnEdit.textContent = 'Editar';
    btnEdit.addEventListener('click', () => showDomainModal(entry));

    const btnArchive = document.createElement('button');
    btnArchive.className = 'btn btn-sm btn-warning btn-ssl-action';
    btnArchive.textContent = entry.archived ? 'Desarchivar' : 'Archivar';
    btnArchive.title = entry.archived
      ? 'Volver a monitorear este dominio activamente'
      : 'Sacar de las alertas — para problemas con decisión tomada (ej: dominio no se renueva)';
    btnArchive.addEventListener('click', () => {
      if (entry.archived) {
        const updated = sslManageDomains.map(d => d.domain === entry.domain ? { ...d, archived: false, archivedNote: '' } : d);
        saveConfig(updated);
        return;
      }
      showArchiveModal(entry);
    });

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm btn-danger btn-ssl-action del';
    btnDel.textContent = 'Eliminar';
    btnDel.title = 'Eliminación definitiva del monitoreo';
    btnDel.addEventListener('click', () => {
      const updated = sslManageDomains.filter(d => d.domain !== entry.domain);
      saveConfig(updated);
    });

    tdActs.appendChild(btnEdit);
    tdActs.appendChild(btnArchive);
    tdActs.appendChild(btnDel);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  c.appendChild(table);
}

function showDomainModal(entry) {
  openEditModal((box, close) => {
    const isEdit = entry !== null;
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(entry.domain)}` : 'Nuevo dominio'}</div>` +
        formField('Dominio', 'ssl-f-domain', entry?.domain ?? '', 'dominio.com.ar') +
        formField('Etiqueta', 'ssl-f-label', entry?.label ?? '', 'Etiqueta') +
        formField('Empresa', 'ssl-f-empresa', entry?.empresa ?? '', 'Empresa') +
        formField('Admin DNS', 'ssl-f-dnsadmin', entry?.dnsAdmin ?? '', '(opcional)') +
        `<div class="manage-banner hidden" id="ssl-f-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-ssl-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-ssl-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-ssl-form-cancel').addEventListener('click', close);

    box.querySelector('#btn-ssl-form-save').addEventListener('click', async () => {
      const domain   = document.getElementById('ssl-f-domain').value.trim();
      const label    = document.getElementById('ssl-f-label').value.trim();
      const empresa  = document.getElementById('ssl-f-empresa').value.trim();
      const dnsAdmin = document.getElementById('ssl-f-dnsadmin').value.trim();
      if (!domain) return;

      const updated = isEdit
        ? sslManageDomains.map(d => d.domain === entry.domain
            ? { ...d, domain, label: label || domain, empresa, dnsAdmin }
            : d)
        : [...sslManageDomains, { domain, label: label || domain, empresa, dnsAdmin }];

      const ok = await saveConfig(updated);
      if (ok) close();
      else showManageBanner('ssl-f-error', 'Error al guardar — revisá la consola', true);
    });
  }, { size: 'compact' });
}

function showArchiveModal(entry) {
  openEditModal((box, close) => {
    box.innerHTML =
      `<div class="manage-form">` +
        `<div class="manage-form-title">Archivar ${escHtml(entry.domain)}</div>` +
        `<label class="form-label" for="ssl-f-archive-note">Motivo del archivado (opcional)</label>` +
        `<textarea class="form-textarea" id="ssl-f-archive-note" rows="4" placeholder="Ej: dominio vencido, no se renueva">${escHtml(entry.archivedNote ?? '')}</textarea>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-ssl-archive-cancel">Cancelar</button>` +
          `<button class="btn btn-warning btn-modal-ok" id="btn-ssl-archive-confirm">Archivar</button>` +
        `</div>` +
      `</div>`;

    box.querySelector('#btn-ssl-archive-cancel').addEventListener('click', close);
    box.querySelector('#btn-ssl-archive-confirm').addEventListener('click', async () => {
      const archivedNote = document.getElementById('ssl-f-archive-note').value.trim();
      const updated = sslManageDomains.map(d => d.domain === entry.domain ? { ...d, archived: true, archivedNote } : d);
      const ok = await saveConfig(updated);
      if (ok) close();
    });
  }, { size: 'compact' });
}

async function saveConfig(domains) {
  try {
    const res = await fetch(`${API_BASE}/api/ssl/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    renderManageTable(data.domains);
    return true;
  } catch (e) {
    console.error('[VCC] saveConfig SSL error:', e.message);
    return false;
  }
}

async function loadManage() {
  const c = document.getElementById('ssl-manage-container');
  c.innerHTML = '<div class="ssl-loading">Cargando...</div>';
  try {
    const data = await get('/api/ssl/config');
    renderManageTable(data.domains);
  } catch {
    c.innerHTML = '<div class="ssl-loading" style="color:var(--red)">Error al cargar configuración</div>';
  }
}

function toggleManageMode() {
  sslManageMode = !sslManageMode;
  const monitor = document.getElementById('ssl-container');
  const manage  = document.getElementById('ssl-manage-container');
  const btnM    = document.getElementById('btn-ssl-manage');
  const btnR    = document.getElementById('btn-ssl-refresh');

  monitor.classList.toggle('hidden', sslManageMode);
  manage.classList.toggle('hidden', !sslManageMode);
  btnM.textContent = sslManageMode ? '← Monitor' : '⚙ Gestionar';
  btnR.classList.toggle('hidden', sslManageMode);

  if (sslManageMode) loadManage();
}

export function initSSL() {
  document.getElementById('btn-ssl-refresh').addEventListener('click', () => loadSSL(true));
  document.getElementById('btn-ssl-manage').addEventListener('click', toggleManageMode);

  document.getElementById('btn-ssl-show-hidden')?.addEventListener('click', () => {
    localStorage.removeItem(HIDDEN_SSL_KEY);
    if (sslData) renderSSLMonitor(sslData);
  });

  document.querySelectorAll('.btn-ssl-view').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === sslView) return;
      sslView = btn.dataset.view;
      document.querySelectorAll('.btn-ssl-view').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (sslData) renderSSLMonitor(sslData);
    });
  });
}
