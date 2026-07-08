import { get, apiFetch } from '../core/api.js';
import { escHtml, formField, formSelect } from '../core/dom.js';

const ESTADO_COLOR = {
  Pendiente:    'var(--text-faint)',
  Revisado:     'var(--info)',
  Implementar:  'var(--warning)',
  Descartado:   'var(--danger)',
};

let linksAllData = [];
let linksFilterTipo = '';
let linksFilterEstado = '';
let linksFilterFavOnly = false;
let confirmDialogRef = null;

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export function filterLinks(links, { tipo, estado, favOnly }) {
  return links.filter(l =>
    (!tipo || l.tipo === tipo) &&
    (!estado || l.estado === estado) &&
    (!favOnly || l.favorito === true)
  );
}

function buildLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'infra-card';
  card.style.borderLeft = `3px solid ${ESTADO_COLOR[link.estado]}`;

  const tagsHtml = link.tags.map(t =>
    `<span class="infra-risk-badge" style="color:var(--text-faint);border-color:var(--text-faint)">${escHtml(t)}</span>`
  ).join(' ');

  card.innerHTML =
    `<div class="infra-card-header">` +
      `<button class="infra-edit-btn" style="opacity:1" title="Favorito" data-fav-id="${link.id}">${link.favorito ? '★' : '☆'}</button>` +
      `<span class="infra-id">${escHtml(truncate(link.titulo, 60))}</span>` +
      `<span class="infra-risk-badge" style="color:var(--accent);border-color:var(--accent)">${escHtml(link.tipo)}</span>` +
      `<span class="infra-risk-badge" style="color:${ESTADO_COLOR[link.estado]};border-color:${ESTADO_COLOR[link.estado]}">${escHtml(link.estado)}</span>` +
      `<button class="infra-edit-btn" title="Editar" data-edit-id="${link.id}">✎</button>` +
      `<button class="infra-hide-btn" title="Eliminar" data-del-id="${link.id}">×</button>` +
    `</div>` +
    `<div class="infra-ip">${escHtml(truncate(link.url, 70))}</div>` +
    (link.nota ? `<div class="infra-os">${escHtml(link.nota)}</div>` : '') +
    (tagsHtml ? `<div class="infra-empresa">${tagsHtml}</div>` : '');

  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    window.open(link.url, '_blank', 'noopener');
  });

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
  const visible = filterLinks(linksAllData, { tipo: linksFilterTipo, estado: linksFilterEstado, favOnly: linksFilterFavOnly });

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

export async function loadLinks() {
  const c = document.getElementById('links-container');
  if (!c) return;
  c.innerHTML = '<div class="infra-loading">Cargando links...</div>';
  try {
    const { links } = await get('/api/links');
    linksAllData = links;
    renderLinksView();
  } catch (err) {
    c.innerHTML = `<div class="infra-loading" style="color:var(--danger)">Error al cargar links: ${escHtml(err.message)}</div>`;
  }
}

export function initLinks({ confirmDialog } = {}) {
  confirmDialogRef = confirmDialog ?? null;

  document.getElementById('btn-links-refresh')?.addEventListener('click', () => loadLinks());

  document.querySelectorAll('.btn-links-tipo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-links-tipo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      linksFilterTipo = btn.dataset.tipo;
      renderLinksView();
    });
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
}

function showLinksForm(link) {
  const isEdit = link !== null;
  const container = document.getElementById('links-form-container');
  const tagsText = (link?.tags ?? []).join(', ');

  container.innerHTML =
    `<div class="modal-overlay" id="links-form-overlay">` +
      `<div class="modal-box manage-form">` +
        `<div class="manage-form-title">${isEdit ? 'Editar link' : 'Nuevo link'}</div>` +
        formField('URL', 'links-f-url', link?.url ?? '', 'https://...') +
        `<div class="manage-banner hidden" id="links-f-dup-warning"></div>` +
        formField('Título', 'links-f-titulo', link?.titulo ?? '', 'Título descriptivo') +
        `<div class="manage-form-grid">` +
          formSelect('Tipo', 'links-f-tipo', link?.tipo ?? 'Otro', [
            ['Repo', 'Repo'], ['Articulo', 'Artículo'], ['Skill', 'Skill'], ['MCP', 'MCP'], ['Otro', 'Otro'],
          ]) +
          formSelect('Estado', 'links-f-estado', link?.estado ?? 'Pendiente', [
            ['Pendiente', 'Pendiente'], ['Revisado', 'Revisado'], ['Implementar', 'Implementar'], ['Descartado', 'Descartado'],
          ]) +
        `</div>` +
        formField('Tags (separados por coma)', 'links-f-tags', tagsText, 'laravel, n8n') +
        `<label class="form-label" for="links-f-nota">Nota</label>` +
        `<textarea class="form-textarea" id="links-f-nota" rows="3" placeholder="Nota opcional">${link?.nota ?? ''}</textarea>` +
        `<div class="manage-form-actions">` +
          `<button class="btn btn-ghost btn-modal-cancel" id="btn-links-form-cancel">Cancelar</button>` +
          `<button class="btn btn-primary btn-modal-ok" id="btn-links-form-save">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>` +
        `</div>` +
      `</div>` +
    `</div>`;

  const overlay = document.getElementById('links-form-overlay');
  const close = () => { container.innerHTML = ''; };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
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

    if (!url || !titulo) return;

    const body = { url, titulo, tipo, estado, tags, nota };
    try {
      if (isEdit) {
        await apiFetch(`/api/links/${encodeURIComponent(link.id)}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/api/links', { method: 'POST', body });
      }
      close();
      await loadLinks();
    } catch (err) {
      alert(`Error al guardar: ${err.message}`);
    }
  });
}
