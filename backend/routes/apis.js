import { Router } from 'express';

const router = Router();

const API_CATALOG = [
  { method: 'GET', path: '/api/status', module: 'Shell', purpose: 'Estado general del workspace, freshness, host y conteo de pendientes.', risk: 'bajo', safeCheck: true },
  { method: 'GET', path: '/api/handover', module: 'Sesión actual', purpose: 'Parsea HANDOVER.md y devuelve secciones operativas para briefing/sidebar.', risk: 'bajo', safeCheck: true },
  { method: 'GET', path: '/api/index', module: 'Knowledge', purpose: 'Lee pendientes del knowledge/INDEX.md.', risk: 'bajo', safeCheck: true },
  { method: 'GET', path: '/api/registry', module: 'Proyectos', purpose: 'Lee projects-registry.json con hash optimista.', risk: 'bajo', safeCheck: true },
  { method: 'POST', path: '/api/projects', module: 'Proyectos', purpose: 'Crea proyecto en registry con expectedHash.', risk: 'moderado', safeCheck: false },
  { method: 'PATCH', path: '/api/projects/:id', module: 'Proyectos', purpose: 'Edita proyecto preservando campos desconocidos.', risk: 'moderado', safeCheck: false },
  { method: 'DELETE', path: '/api/projects/:id', module: 'Proyectos', purpose: 'Elimina proyecto del registry.', risk: 'alto', safeCheck: false },
  { method: 'POST', path: '/api/projects/:id/environments', module: 'Proyectos', purpose: 'Agrega ambiente a un proyecto.', risk: 'moderado', safeCheck: false },
  { method: 'PATCH', path: '/api/projects/:id/environments/:env', module: 'Proyectos', purpose: 'Edita ambiente de proyecto.', risk: 'moderado', safeCheck: false },
  { method: 'DELETE', path: '/api/projects/:id/environments/:env', module: 'Proyectos', purpose: 'Elimina ambiente de proyecto.', risk: 'alto', safeCheck: false },
  { method: 'POST', path: '/api/projects/:id/environments/:env/open-vscode', module: 'Proyectos', purpose: 'Abre VS Code/Remote SSH usando launcher asociado.', risk: 'moderado', safeCheck: false },
  { method: 'GET', path: '/api/runtime/project', module: 'Runtime', purpose: 'Devuelve proyecto activo y proyectos recientes.', risk: 'bajo', safeCheck: true },
  { method: 'POST', path: '/api/runtime/set-project', module: 'Runtime', purpose: 'Cambia proyecto activo y actualiza recientes.', risk: 'moderado', safeCheck: false },
  { method: 'GET', path: '/api/ssl', module: 'SSL / Dominios', purpose: 'Verifica certificados o devuelve cache SSL.', risk: 'bajo', safeCheck: true },
  { method: 'GET', path: '/api/ssl/config', module: 'SSL / Dominios', purpose: 'Lee dominios monitoreados.', risk: 'bajo', safeCheck: true },
  { method: 'PUT', path: '/api/ssl/config', module: 'SSL / Dominios', purpose: 'Reemplaza lista de dominios monitoreados.', risk: 'moderado', safeCheck: false },
  { method: 'GET', path: '/api/tunnels', module: 'Túneles SSH', purpose: 'Estado rápido de puertos locales conocidos.', risk: 'bajo', safeCheck: true },
  { method: 'GET', path: '/api/tunnels/config', module: 'Túneles SSH', purpose: 'Lee presets de túneles con estado activo y DB enabled.', risk: 'bajo', safeCheck: true },
  { method: 'GET', path: '/api/tunnels/config-raw', module: 'Túneles SSH', purpose: 'Lee configuración cruda de túneles.', risk: 'bajo', safeCheck: true },
  { method: 'PUT', path: '/api/tunnels/config', module: 'Túneles SSH', purpose: 'Reemplaza presets de túneles.', risk: 'moderado', safeCheck: false },
  { method: 'POST', path: '/api/tunnels/adhoc', module: 'Túneles SSH', purpose: 'Abre túnel ad-hoc en memoria.', risk: 'alto', safeCheck: false },
  { method: 'POST', path: '/api/tunnels/:port/open', module: 'Túneles SSH', purpose: 'Abre túnel SSH preset.', risk: 'alto', safeCheck: false },
  { method: 'POST', path: '/api/tunnels/:port/close', module: 'Túneles SSH', purpose: 'Cierra túnel SSH local.', risk: 'moderado', safeCheck: false },
  { method: 'GET', path: '/api/tunnel-db/:port', module: 'Túneles SSH', purpose: 'Consulta metadata MySQL del túnel si hay credenciales MCP.', risk: 'moderado', safeCheck: false },
  { method: 'GET', path: '/api/inventory', module: 'Inventario', purpose: 'Lee inventario VCC de servidores.', risk: 'bajo', safeCheck: true },
  { method: 'PUT', path: '/api/inventory/config', module: 'Inventario', purpose: 'Reemplaza inventario completo.', risk: 'moderado', safeCheck: false },
  { method: 'POST', path: '/api/inventory', module: 'Inventario', purpose: 'Agrega servidor al inventario.', risk: 'moderado', safeCheck: false },
  { method: 'PUT', path: '/api/inventory/:id', module: 'Inventario', purpose: 'Edita servidor del inventario.', risk: 'moderado', safeCheck: false },
  { method: 'DELETE', path: '/api/inventory/:id', module: 'Inventario', purpose: 'Elimina servidor del inventario.', risk: 'alto', safeCheck: false },
  { method: 'GET', path: '/api/metrics', module: 'Métricas', purpose: 'Obtiene métricas SSH para servidores monitoreados.', risk: 'moderado', safeCheck: false },
  { method: 'GET', path: '/api/metrics/:id', module: 'Métricas', purpose: 'Obtiene métricas SSH de un servidor.', risk: 'moderado', safeCheck: false },
  { method: 'POST', path: '/api/govern/run', module: 'Gobernanza', purpose: 'Ejecuta scripts de governance con streaming WebSocket.', risk: 'alto', safeCheck: false },
  { method: 'GET', path: '/api/opsmap', module: 'Mapa Operativo', purpose: 'Grafo derivado solo lectura con dependencias proyecto/servidor/dominio/túnel/MCP.', risk: 'bajo', safeCheck: true },
  { method: 'GET', path: '/api/apis', module: 'APIs VCC', purpose: 'Catálogo y health de APIs del backend VCC.', risk: 'bajo', safeCheck: true },
];

router.get('/', async (_req, res) => {
  const generatedAt = new Date().toISOString();
  const endpoints = API_CATALOG.map(api => ({
    ...api,
    status: api.safeCheck ? 'cataloged' : 'not-checked',
    statusLabel: api.safeCheck ? 'Disponible para health check' : 'No se prueba automáticamente',
  }));

  res.json({
    generatedAt,
    summary: {
      total: endpoints.length,
      safeCheck: endpoints.filter(e => e.safeCheck).length,
      writeOrExec: endpoints.filter(e => !['GET'].includes(e.method)).length,
      highRisk: endpoints.filter(e => e.risk === 'alto').length,
    },
    endpoints,
  });
});

export default router;
