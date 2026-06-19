import path from 'path';

const WORKSPACE_ROOT = 'C:\\Users\\Carlos Valera\\OneDrive\\Escritorio\\AI-Workspace';

export const PATHS = {
  handover:     path.join(WORKSPACE_ROOT, 'runtime', 'HANDOVER.md'),
  webContext:   path.join(WORKSPACE_ROOT, 'runtime', 'web-context.md'),
  index:        path.join(WORKSPACE_ROOT, 'knowledge', 'INDEX.md'),
  workspaceMap: path.join(WORKSPACE_ROOT, 'WORKSPACE_MAP.md'),
  registry:     path.join(WORKSPACE_ROOT, 'global', 'projects-registry.json'),
};

export const SERVER = {
  port: 8080,
  host: 'localhost',
};

export { WORKSPACE_ROOT };
