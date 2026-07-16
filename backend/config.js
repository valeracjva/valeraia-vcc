import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT
  || 'C:\\Users\\Carlos Valera\\OneDrive\\Escritorio\\AI-Workspace';

// Data files colocados junto al código (D:\Workspace-Repos\workspace-ui\)
const VCC_DATA = process.env.VCC_DATA || path.join(__dirname, '..');

export const PATHS = {
  handover:       path.join(WORKSPACE_ROOT, 'runtime', 'HANDOVER.md'),
  webContext:     path.join(WORKSPACE_ROOT, 'runtime', 'web-context.md'),
  index:          path.join(WORKSPACE_ROOT, 'knowledge', 'INDEX.md'),
  workspaceMap:   path.join(WORKSPACE_ROOT, 'WORKSPACE_MAP.md'),
  registry:       path.join(WORKSPACE_ROOT, 'global', 'projects-registry.json'),
  currentProject: path.join(WORKSPACE_ROOT, 'runtime', 'current-project.json'),
  recentProjects: path.join(WORKSPACE_ROOT, 'runtime', 'recent-projects.json'),
  sessionsRoot:   path.join(WORKSPACE_ROOT, 'sessions'),
  sslWatch:        path.join(VCC_DATA, 'ssl-watch.json'),
  tunnelsConfig:   path.join(VCC_DATA, 'tunnels-config.json'),
  serverInventory: path.join(WORKSPACE_ROOT, 'global', 'servers', 'SERVER_INVENTORY.md'),
  serversConfig:   path.join(VCC_DATA, 'servers-config.json'),
  linksInventory:  path.join(VCC_DATA, 'links-inventory.json'),
};

export const SERVER = {
  port: 8080,
  host: 'localhost',
};

export const SCRIPTS = {
  'workspace-health': process.env.VALERAIA_KERNEL
    ? path.join(process.env.VALERAIA_KERNEL, 'core', 'health', 'workspace-health.ps1')
    : 'scripts/workspace/governance/workspace-health.ps1',
  'compile-agents':   'scripts/workspace/governance/compile-agents-md.ps1',
  'build-ai-context': process.env.VALERAIA_KERNEL
    ? path.join(process.env.VALERAIA_KERNEL, 'core', 'governance', 'build-ai-context.ps1')
    : 'scripts/workspace/context/build-ai-context.ps1',
  'web-context':      'scripts/workspace/governance/generate-web-context.ps1',
  'sync-status':      'scripts/workspace/sync/sync-status.ps1',
  'cierre':           'scripts/workspace/governance/close-session.ps1',
  'knowledge-organizer': process.env.VALERAIA_KERNEL
    ? path.join(process.env.VALERAIA_KERNEL, 'core', 'governance', 'knowledge-organizer.ps1')
    : 'scripts/workspace/governance/knowledge-organizer.ps1',
  'daily-maintenance': process.env.VALERAIA_KERNEL
    ? path.join(process.env.VALERAIA_KERNEL, 'core', 'governance', 'daily-workspace-maintenance.ps1')
    : 'scripts/workspace/governance/daily-workspace-maintenance.ps1',
};

export const TUNNEL_PORTS = [3307, 3308, 3309, 3310];

export { WORKSPACE_ROOT };
