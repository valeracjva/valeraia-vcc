export function parseAgentCategory(content) {
  if (!content) return null;
  const match = content.match(/^category:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}
