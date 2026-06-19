// Parseo de secciones Markdown — compartido por routes/index.js y routes/status.js

const PENDIENTES_SECTION = 'Pendientes abiertos';

export function extractPendientesSection(content) {
  const lines = content.split('\n');
  let inSection = false;
  const sectionLines = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inSection) break;
      if (line.slice(3).trim() === PENDIENTES_SECTION) inSection = true;
      continue;
    }
    if (inSection) sectionLines.push(line);
  }

  return sectionLines.join('\n').trim();
}

export function parseGroups(sectionRaw) {
  const lines = sectionRaw.split('\n');
  const groups = [];
  let currentGroup = null;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      currentGroup = { heading: line.slice(4).trim(), items: [] };
      groups.push(currentGroup);
      continue;
    }
    if (!currentGroup) continue;

    const openMatch = line.match(/^- \[ \] (.+)/);
    const doneMatch = line.match(/^- \[x\] (.+)/i);
    if (openMatch) {
      currentGroup.items.push({ done: false, text: openMatch[1].trim() });
    } else if (doneMatch) {
      currentGroup.items.push({ done: true, text: doneMatch[1].trim() });
    }
  }

  return groups;
}
