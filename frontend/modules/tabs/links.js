import { get, apiFetch } from '../core/api.js';
import { escHtml, formField, formSelect, showManageBanner } from '../core/dom.js';

const ESTADO_COLOR = {
  Pendiente:    'var(--accent)',
  Revisado:     'var(--info)',
  Implementar:  'var(--warning)',
  Descartado:   'var(--danger)',
};

const COLOR_VAR = {
  accent:      'var(--accent)',
  info:        'var(--info)',
  success:     'var(--success)',
  warning:     'var(--warning)',
  danger:      'var(--danger)',
  'text-faint': 'var(--text-faint)',
};

const COLOR_LABEL = {
  accent:      'Índigo',
  info:        'Azul',
  success:     'Verde',
  warning:     'Ámbar',
  danger:      'Rojo',
  'text-faint': 'Gris',
};

const TAG_PALETTE = ['var(--accent)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--danger)'];

function tagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

let linksAllData = [];
let linksTipos = []; // [{ nombre, color, count }]
let linksFilterTipo = '';
let linksFilterEstado = '';
let linksFilterFavOnly = false;
let confirmDialogRef = null;

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function tipoColorOf(nombre) {
  const t = linksTipos.find(t => t.nombre === nombre);
  return COLOR_VAR[t?.color] ?? 'var(--accent)';
}

export function filterLinks(links, { tipo, estado, favOnly, texto } = {}) {
  const needle = (texto ?? '').trim().toLowerCase();
  return links.filter(l => {
    if (tipo && l.tipo !== tipo) return false;
    if (estado && l.estado !== estado) return false;
    if (favOnly && l.favorito !== true) return false;
    if (needle) {
      const haystack = `${l.titulo} ${l.url} ${l.nota ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function buildLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'infra-card';

  const tipoColor = tipoColorOf(link.tipo);
  card.style.borderLeft = `4px solid ${tipoColor}`;
  card.style.boxShadow = `inset 3px 0 8px -4px color-mix(in srgb, ${tipoColor} 35%, transparent)`;

  const tagsHtml = link.tags.map(t => {
    const c = tagColor(t);
    return `<span class="infra-risk-badge" style="color:${c};border-color:${c}">${escHtml(t)}</span>`;
  }).join(' ');

  const favStar = link.favorito ? '<span style="color:#FBBF24">★</span>' : '☆';

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<button class="infra-edit-btn" style="opacity:1" title="Favorito" data-fav-id="${link.id}">${favStar}</button>` +
      `<span class="infra-id" title="${escHtml(link.titulo)}">${escHtml(truncate(link.titulo, 60))}</span>` +
      `<span class="infra-risk-badge" style="color:${tipoColor};border-color:${tipoColor}">${escHtml(link.tipo)}</span>` +
      `<span class="infra-risk-badge" style="color:${ESTADO_COLOR[link.estado]};border-color:${ESTADO_COLOR[link.estado]}">${escHtml(link.estado)}</span>` +
      `<button class="infra-edit-btn" title="Editar" data-edit-id="${link.id}">✎</button>` +
      `<button class="infra-hide-btn" title="Eliminar" data-del-id="${link.id}">×</button>` +
    `</div>` +
    `<a class="infra-ip" href="${escHtml(link.url)}" target="_blank" rel="noopener">${escHtml(truncate(link.url, 70))}</a>` +
    (link.nota ? `<div class="infra-os link-nota">${escHtml(link.nota)}</div>` : '') +
    (tagsHtml ? `<div class="infra-empresa">${tagsHtml}</div>` : '');

  card.querySelector('[data-fav-id]').addEventListener('click', async (e) => {
    e.stopPropagation();
    await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'PATCH', body: { favorito: !link.favorito } });
    await loadLinks();
  });

  card.querySelector('[data-edit-id]').addEventListener('click', (e) => {
    e.stopPropagation();
    showLinksForm(link);
  });

  card.querySelector('[data-del-id]').addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialogRef(`¿Eliminar "${link.titulo}"?`, 'Esta acción no se puede deshacer.', true);
    if (!ok) return;
    await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'DELETE' });
    await loadLinks();
  });

  return card;
}

function renderLinksView() {
  const c = document.getElementById('links-container');
  if (!c) return;
  const visible = filterLinks(linksAllData, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly })
    .slice()
    .sort((a, b) => {
      if (a.favorito !== b.favorito) return a.favorito ? -1 : 1;
      return a.titulo.localeCompare(b.titulo, 'es');
    });

  const counter = document.getElementById('links-counter');
  if (counter) counter.textContent = `${visible.length} de ${linksAllData.length}`;

  c.innerHTML = '';
  if (!visible.length) {
    c.innerHTML = `<div class="infra-loading">${linksAllData.length ? 'Ningún link coincide con los filtros.' : 'No hay links guardados todavía.'}</div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'infra-grid';
  for (const link of visible) grid.appendChild(buildLinkCard(link));
  c.appendChild(grid);
}

function renderTipoFilters() {
  const container = document.getElementById('links-tipo-filters');
  if (!container) return;
  container.innerHTML =
    `<button class="btn-tab btn-links-tipo${linksFilterTipo === '' ? ' active' : ''}" data-tipo="">Todos</button>` +
    linksTipos.map(t =>
      `<button class="btn-tab btn-links-tipo${linksFilterTipo === t.nombre ? ' active' : ''}" data-tipo="${escHtml(t.nombre)}">${escHtml(t.nombre)}</button>`
    ).join('');
}

async function loadLinksTipos() {
  const { tipos } = await get('/api/links/tipos');
  linksTipos = tipos;
  renderTipoFilters();
}

export async function loadLinks() {
  const c = document.getElementById('links-container');
  if (!c) return;
  c.innerHTML = '<div class="infra-loading">Cargando links...</div>';
  try {
    const [{ links }] = await Promise.all([get('/api/links'), loadLinksTipos()]);
    linksAllData = links;
    renderLinksView();
  } catch (err) {
    c.innerHTML = `<div class="infra-loading" style="color:var(--danger)">Error al cargar links: ${escHtml(err.message)}</div>`;
  }
}

export function initLinks({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;

  document.getElementById('btn-links-refresh')?.addEventListener('click', () => loadLinks());

  // Delegado -- los botones de tipo se regeneran dinámicamente (CRUD de tipos)
  document.getElementById('links-tipo-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-links-tipo');
    if (!btn) return;
    document.querySelectorAll('.btn-links-tipo').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    linksFilterTipo = btn.dataset.tipo;
    renderLinksView();
  });

  document.querySelectorAll('.btn-links-estado').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-links-estado').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      linksFilterEstado = btn.dataset.estado;
      renderLinksView();
    });
  });

  document.getElementById('btn-links-fav-only')?.addEventListener('click', (e) => {
    linksFilterFavOnly = !linksFilterFavOnly;
    e.currentTarget.classList.toggle('active', linksFilterFavOnly);
    renderLinksView();
  });

  document.getElementById('btn-links-add')?.addEventListener('click', () => showLinksForm(null));

  document.getElementById('btn-links-tipos-manage')?.addEventListener('click', () => {
    const mc   = document.getElementById('links-tipos-manage-container');
    const main = document.getElementById('links-main');
    if (mc.classList.contains('hidden')) {
      main.classList.add('hidden');
      renderTiposManage();
    } else {
      mc.classList.add('hidden');
      main.classList.remove('hidden');
    }
  });
}

function showLinksForm(link) {
  const isEdit = link !== null;
  const container = document.getElementById('links-form-container');
  const tagsText = (link?.tags ?? []).join(', ');
  const tipoOptions = linksTipos.map(t => [t.nombre, t.nombre]);

  container.innerHTML =
    `<div class="modal-overlay" id="links-form-overlay">` +
      `<div class="modal-box manage-form">` +
        `<div class="manage-form-title">${isEdit ? 'Editar link' : 'Nuevo link'}</div>` +
        formField('URL', 'links-f-url', link?.url ?? '', 'https://...') +
        `<div class="manage-banner hidden" id="links-f-dup-warning"></div>` +
        formField('Título', 'links-f-titulo', link?.titulo ?? '', 'Título descriptivo') +
        `<div class="manage-form-grid">` +
          formSelect('Tipo', 'links-f-tipo', link?.tipo ?? (linksTipos[0]?.nombre ?? ''), tipoOptions) +
          formSelect('Estado', 'links-f-estado', link?.estado ?? 'Pendiente', [
            ['Pendiente', 'Pendiente'], ['Revisado', 'Revisado'], ['Implementar', 'Implementar'], ['Descartado', 'Descartado'],
          ]) +
        `</div>` +
        formField('Tags (separados por coma)', 'links-f-tags', tagsText, 'laravel, n8n') +
        `<label class="form-toggle-row">` +
          `<input type="checkbox" id="links-f-favorito"${link?.favorito ? ' checked' : ''}>` +
          `<span class="form-toggle-label">★ Favorito</span>` +
        `</label>` +
        `<label class="form-label" for="links-f-nota">Nota</label>` +
        `<textarea class="form-textarea" id="links-f-nota" rows="8" placeholder="Nota opcional">${escHtml(link?.nota ?? '')}</textarea>` +
        `<div class="manage-banner hidden" id="links-f-save-error"></div>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-links-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-links-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>` +
    `</div>`;

  // Regla VCC: los modales nunca cierran con clic afuera -- solo Cancelar/Guardar/X o Escape.
  const close = () => { document.removeEventListener('keydown', onKeydown); container.innerHTML = ''; };
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKeydown);
  document.getElementById('btn-links-form-cancel').addEventListener('click', close);

  // Aviso no bloqueante de URL duplicada (no impide guardar, solo informa)
  const urlInput  = document.getElementById('links-f-url');
  const dupWarning = document.getElementById('links-f-dup-warning');
  urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    const dup = val && linksAllData.some(l => l.url === val && l.id !== link?.id);
    dupWarning.textContent = dup ? 'Ya existe un link guardado con esta URL. Se puede guardar igual.' : '';
    dupWarning.classList.toggle('hidden', !dup);
  });

  document.getElementById('btn-links-form-save').addEventListener('click', async () => {
    const url    = document.getElementById('links-f-url').value.trim();
    const titulo = document.getElementById('links-f-titulo').value.trim();
    const tipo   = document.getElementById('links-f-tipo').value;
    const estado = document.getElementById('links-f-estado').value;
    const tags   = document.getElementById('links-f-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const nota   = document.getElementById('links-f-nota').value.trim();
    const favorito = document.getElementById('links-f-favorito').checked;

    if (!url || !titulo) return;

    const body = { url, titulo, tipo, estado, tags, nota, favorito };
    try {
      if (isEdit) {
        await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/api/links', { method: 'POST', body });
      }
      close();
      await loadLinks();
    } catch (err) {
      showManageBanner('links-f-save-error', `Error al guardar: ${err.message}`, true);
    }
  });
}

// === Gestión de tipos (CRUD) ===

const COLOR_OPTIONS = Object.keys(COLOR_VAR).map(c => [c, COLOR_LABEL[c]]);

function renderTiposManage() {
  const container = document.getElementById('links-tipos-manage-container');
  container.classList.remove('hidden');

  let html =
    `<div class="manage-header">` +
      `<span class="manage-title">Gestión de tipos de link</span>` +
      `<button class="btn btn-ghost btn-manage-close" id="btn-tipos-manage-close">Cerrar</button>` +
    `</div>` +
    `<div class="manage-banner hidden" id="tipos-manage-banner"></div>` +
    `<button class="btn btn-solid btn-manage-add" id="btn-tipo-add">＋ Agregar tipo</button>` +
    `<div id="tipo-form-container"></div>` +
    `<table class="manage-table data-table">` +
      `<thead><tr><th>NOMBRE</th><th>COLOR</th><th>LINKS</th><th></th></tr></thead>` +
      `<tbody>`;

  for (const t of linksTipos) {
    const color = COLOR_VAR[t.color] ?? 'var(--accent)';
    html +=
      `<tr>` +
        `<td><code>${escHtml(t.nombre)}</code></td>` +
        `<td><span class="infra-risk-badge" style="color:${color};border-color:${color}">${escHtml(COLOR_LABEL[t.color] ?? t.color)}</span></td>` +
        `<td>${t.count}</td>` +
        `<td class="manage-actions">` +
          `<button class="btn btn-sm btn-ghost btn-manage-edit" data-edit-tipo="${escHtml(t.nombre)}">Editar</button>` +
          `<button class="btn btn-sm btn-danger btn-manage-del" data-del-tipo="${escHtml(t.nombre)}">Eliminar</button>` +
        `</td>` +
      `</tr>`;
  }

  html += `</tbody></table>`;
  container.innerHTML = html;

  container.querySelector('#btn-tipos-manage-close').addEventListener('click', () => {
    container.classList.add('hidden');
    document.getElementById('links-main').classList.remove('hidden');
  });

  container.querySelector('#btn-tipo-add').addEventListener('click', () => showTipoForm(null));

  container.querySelectorAll('[data-edit-tipo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = linksTipos.find(x => x.nombre === btn.dataset.editTipo);
      showTipoForm(t);
    });
  });

  container.querySelectorAll('[data-del-tipo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nombre = btn.dataset.delTipo;
      const ok = await confirmDialogRef(`¿Eliminar el tipo "${nombre}"?`, 'Solo se puede borrar si ningún link lo usa.', true);
      if (!ok) return;
      try {
        await apiFetch(`/api/links/tipos/${encodeURIComponent(nombre)}`, { method: 'DELETE' });
        await loadLinksTipos();
        renderTiposManage();
      } catch (err) {
        showManageBanner('tipos-manage-banner', err.message, true);
      }
    });
  });
}

function showTipoForm(tipo) {
  const isEdit = tipo !== null;
  const container = document.getElementById('tipo-form-container');

  container.innerHTML =
    `<div class="manage-form">` +
      `<div class="manage-form-title">${isEdit ? `Editar: ${escHtml(tipo.nombre)}` : 'Nuevo tipo'}</div>` +
      formField('Nombre', 'tipo-f-nombre', tipo?.nombre ?? '', 'Tutorial, Video...') +
      formSelect('Color', 'tipo-f-color', tipo?.color ?? 'accent', COLOR_OPTIONS) +
      `<div class="manage-banner hidden" id="tipo-f-error"></div>` +
      `<div class="manage-form-actions">` +
        `<button class="btn btn-ghost btn-modal-cancel" id="btn-tipo-form-cancel">Cancelar</button>` +
        `<button class="btn btn-primary btn-modal-ok" id="btn-tipo-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
      `</div>` +
    `</div>`;

  const close = () => { container.innerHTML = ''; };
  container.querySelector('#btn-tipo-form-cancel').addEventListener('click', close);

  container.querySelector('#btn-tipo-form-save').addEventListener('click', async () => {
    const nombre = document.getElementById('tipo-f-nombre').value.trim();
    const color  = document.getElementById('tipo-f-color').value;
    if (!nombre) return;

    try {
      if (isEdit) {
        await apiFetch(`/api/links/tipos/${encodeURIComponent(tipo.nombre)}`, { method: 'PUT', body: { nombre, color } });
      } else {
        await apiFetch('/api/links/tipos', { method: 'POST', body: { nombre, color } });
      }
      close();
      await loadLinksTipos();
      renderTiposManage();
    } catch (err) {
      showManageBanner('tipo-f-error', err.message, true);
    }
  });
}
