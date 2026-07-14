export function buildActiveMd({ projectId, environment, resumen, fecha }) {
  return `# Sesión activa — ${projectId}\n\n` +
    `## Estado\n` +
    `Última sesión guardada: ${fecha}\n\n` +
    `## Punto de reanudación\n` +
    `${resumen}\n\n` +
    `## Ambiente activo\n` +
    `- Proyecto  : ${projectId}\n` +
    `- Ambiente  : ${environment}\n` +
    `- Generado  : ${fecha}\n`;
}
