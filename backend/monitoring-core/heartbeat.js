import { sshExec, winrmExecRaw } from '../routes/metrics.js';

// Mismo directorio State/Log que usan los agentes locales (ver MonitoringCore.psm1 /
// monitoring.env) -- el heartbeat vive junto a ellos para que el chequeo de frescura
// que hagan esos scripts (plan futuro, fuera de este) sea un simple stat/Get-Date.
export const WINRM_HEARTBEAT_SCRIPT = `
$ErrorActionPreference = 'Stop'
$pass = New-Object System.Security.SecureString
foreach ($ch in $env:VCC_WINRM_PASS.ToCharArray()) { $pass.AppendChar($ch) }
$cred = New-Object System.Management.Automation.PSCredential($env:VCC_WINRM_USER, $pass)
Invoke-Command -ComputerName $env:VCC_WINRM_HOST -Credential $cred -ScriptBlock {
  New-Item -ItemType Directory -Force -Path 'C:\\ProgramData\\Monitoring' | Out-Null
  Set-Content -Path 'C:\\ProgramData\\Monitoring\\vcc-heartbeat.txt' -Value (Get-Date -Format o) -Encoding UTF8
}
`.trim();

export const SSH_HEARTBEAT_CMD =
  'mkdir -p /var/lib/monitoring-core && date -u +%Y-%m-%dT%H:%M:%SZ > /var/lib/monitoring-core/vcc-heartbeat';

export async function writeHeartbeat(serverId, conf) {
  const result = conf.type === 'winrm'
    ? await winrmExecRaw(conf, WINRM_HEARTBEAT_SCRIPT)
    : await sshExec(conf, SSH_HEARTBEAT_CMD);
  if (result.error) {
    console.error(`[monitoring-core] heartbeat FAIL ${serverId}: ${result.error}`);
    return false;
  }
  return true;
}
