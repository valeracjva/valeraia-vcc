import path from 'path';

const WORKSPACE_ROOT = 'C:\\Users\\Carlos Valera\\OneDrive\\Escritorio\\AI-Workspace';

export const PATHS = {
  handover:       path.join(WORKSPACE_ROOT, 'runtime', 'HANDOVER.md'),
  webContext:     path.join(WORKSPACE_ROOT, 'runtime', 'web-context.md'),
  index:          path.join(WORKSPACE_ROOT, 'knowledge', 'INDEX.md'),
  workspaceMap:   path.join(WORKSPACE_ROOT, 'WORKSPACE_MAP.md'),
  registry:       path.join(WORKSPACE_ROOT, 'global', 'projects-registry.json'),
  currentProject: path.join(WORKSPACE_ROOT, 'runtime', 'current-project.json'),
  recentProjects: path.join(WORKSPACE_ROOT, 'runtime', 'recent-projects.json'),
  sslWatch:        path.join(WORKSPACE_ROOT, 'workspace-ui', 'ssl-watch.json'),
  tunnelsConfig:   path.join(WORKSPACE_ROOT, 'workspace-ui', 'tunnels-config.json'),
  serverInventory: path.join(WORKSPACE_ROOT, 'global', 'servers', 'SERVER_INVENTORY.md'),
  serversConfig:   path.join(WORKSPACE_ROOT, 'workspace-ui', 'servers-config.json'),
};

export const SERVER = {
  port: 8080,
  host: 'localhost',
};

export const SCRIPTS = {
  'workspace-health': 'scripts/workspace/governance/workspace-health.ps1',
  'compile-agents':   'scripts/workspace/governance/compile-agents-md.ps1',
  'web-context':      'scripts/workspace/governance/generate-web-context.ps1',
  'sync-status':      'scripts/workspace/sync/sync-status.ps1',
  'cierre':           'scripts/workspace/governance/close-session.ps1',
};

export const TUNNEL_PORTS = [3307, 3308, 3309, 3310];


export { WORKSPACE_ROOT };
