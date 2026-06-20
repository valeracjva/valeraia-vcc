import path from 'path';

const WORKSPACE_ROOT = 'C:\\Users\\Carlos Valera\\OneDrive\\Escritorio\\AI-Workspace';

export const PATHS = {
  handover:     path.join(WORKSPACE_ROOT, 'runtime', 'HANDOVER.md'),
  webContext:   path.join(WORKSPACE_ROOT, 'runtime', 'web-context.md'),
  index:        path.join(WORKSPACE_ROOT, 'knowledge', 'INDEX.md'),
  workspaceMap: path.join(WORKSPACE_ROOT, 'WORKSPACE_MAP.md'),
  registry:     path.join(WORKSPACE_ROOT, 'global', 'projects-registry.json'),
  sslWatch:      path.join(WORKSPACE_ROOT, 'workspace-ui', 'ssl-watch.json'),
  tunnelsConfig:   path.join(WORKSPACE_ROOT, 'workspace-ui', 'tunnels-config.json'),
  serverInventory: path.join(WORKSPACE_ROOT, 'global', 'servers', 'SERVER_INVENTORY.md'),
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

const SSH = (...parts) => path.join(
  process.env.USERPROFILE || (process.env.HOME ?? ''),
  '.ssh', ...parts
);

// fingerprint: SHA256 del host key ED25519. Poblar con:
//   ssh-keyscan -t ed25519 <host> | ssh-keygen -lf - -E sha256
//   Copiar solo la parte "SHA256:xxxxx..." (sin el prefijo "256 ")
// Sin fingerprint → conecta con warning en consola (MITM posible).
export const SSH_SERVERS = {
  'srv-appstest': { host: '10.145.2.26',    user: 'ubuntu', key: SSH('digna', 'srv-appstest.key'), fingerprint: null },
  'srv-appsprod': { host: '10.145.2.214',   user: 'ubuntu', key: SSH('digna', 'srv-appsprod.key'), fingerprint: null },
  'srv-appsdesa': { host: '10.145.2.165',   user: 'ubuntu', key: SSH('digna', 'srv-appsdesa.key'), fingerprint: null },
  'srv-faty001':  { host: '172.16.100.150', user: 'fatapp', key: SSH('id_fatapp'),                  fingerprint: null },
  'srv-nexo':     { host: '18.220.238.99',  user: 'ubuntu', key: SSH('fatapp', 'clavessh_aws.pem'), fingerprint: null },
};

export { WORKSPACE_ROOT };
