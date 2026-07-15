import { sshExec, winrmExecRaw } from '../routes/metrics.js';

// Rutas fijas, iguales en todos los hosts desplegados con el mismo template
// (ver monitoring.env / monitoring.psd1 de projects/monitoreo). Si algun host futuro
// usa una ruta distinta, este modulo necesitara leer la ruta desde servers-config.json
// en vez de asumirla -- no se generaliza ahora (YAGNI), solo aplica a los 6 hosts conocidos.
const LINUX_LOG_PATH = '/var/log/digna-monitoring/telegram-dispatcher.log';
const LINUX_TAIL_LINES = 50;

const WINRM_CATCHUP_SCRIPT = `
$ErrorActionPreference = 'Stop'
$pass = New-Object System.Security.SecureString
foreach ($ch in $env:VCC_WINRM_PASS.ToCharArray()) { $pass.AppendChar($ch) }
$cred = New-Object System.Management.Automation.PSCredential($env:VCC_WINRM_USER, $pass)
Invoke-Command -ComputerName $env:VCC_WINRM_HOST -Credential $cred -ScriptBlock {
  Get-ChildItem -Path 'C:\\ProgramData\\Monitoring\\state' -Filter '*.json' -ErrorAction SilentlyContinue |
    ForEach-Object { $file = $_; (Get-Content -Path $file.FullName -Raw | ConvertFrom-Json) | Add-Member -NotePropertyName CheckName -NotePropertyValue $file.BaseName -PassThru }
} | ConvertTo-Json -Compress -Depth 4
`.trim();

// Linux: telegram-dispatcher.log es texto plano ("[fecha] SENT severity=... title=..." o
// "SUPPRESSED ..."), no hay historial JSON estructurado -- se devuelve linea a linea sin
// parseo adicional, el frontend las muestra como lista simple.
export function parseLinuxLogTail(rawOutput) {
  return rawOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(raw => ({ raw }));
}

// Windows: cada check tiene su propio JSON con Status/Valor/Timestamp/DesdeTimestamp
// (ver Set-CheckState en MonitoringCore.psm1) -- estructura real, se mapea a un shape
// mas simple para la UI.
export function parseWindowsStateJson(rawOutput) {
  try {
    const parsed = JSON.parse(rawOutput);
    const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    return list.map(item => ({
      check: item.CheckName ?? null,
      status: item.Status,
      valor: item.Valor,
      timestamp: item.Timestamp,
    }));
  } catch {
    return [];
  }
}

// Devuelve el estado actual/reciente por host (estado por check en Windows, tail del log
// en Linux) -- NO filtra por antiguedad del heartbeat todavia. Filtrar de verdad "que paso
// desde que VCC dejo de mirar" requiere comparar timestamps entre dos convenciones de OS
// distintas -- queda deferido, no implementado aca.
export async function readCatchupForHost(serverId, conf) {
  if (conf.type === 'winrm') {
    const result = await winrmExecRaw(conf, WINRM_CATCHUP_SCRIPT);
    if (result.error) return { serverId, events: [], error: result.error };
    return { serverId, events: parseWindowsStateJson(result.out) };
  }
  const result = await sshExec(conf, `tail -n ${LINUX_TAIL_LINES} ${LINUX_LOG_PATH} 2>/dev/null || true`);
  if (result.error) return { serverId, events: [], error: result.error };
  return { serverId, events: parseLinuxLogTail(result.out) };
}
