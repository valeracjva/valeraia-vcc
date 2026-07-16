export function parseAgentCategory(content) {
  if (!content) return null;
  const match = content.match(/^category:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

// Extrae solo el primer párrafo de `description:` (bloque YAML `|` multilínea) --
// el resto (exclusiones, listas de fuentes, etc.) no aporta a una card de un vistazo.
export function parseAgentDescription(content) {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex(l => /^description:/.test(l));
  if (idx === -1) return null;

  const inline = lines[idx].match(/^description:\s*(.+)$/);
  if (inline && !/^\|/.test(inline[1].trim())) return inline[1].trim();

  const paragraph = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (!/^\s+/.test(line)) break;
    paragraph.push(line.trim());
  }
  return paragraph.join(' ').trim() || null;
}
