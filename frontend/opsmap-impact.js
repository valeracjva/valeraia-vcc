const IMPACT_LINK_TYPES = new Set(['runs-on', 'exposes', 'tunnel-to', 'uses-mcp', 'has-env']);

export function computeImpact(nodeId, nodes, links) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adjacency = new Map();

  for (const link of links) {
    if (!IMPACT_LINK_TYPES.has(link.type)) continue;
    if (!adjacency.has(link.from)) adjacency.set(link.from, []);
    if (!adjacency.has(link.to)) adjacency.set(link.to, []);
    adjacency.get(link.from).push(link.to);
    adjacency.get(link.to).push(link.from);
  }

  const visited = new Set([nodeId]);
  const queue = [...(adjacency.get(nodeId) ?? [])];
  const impacted = [];

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) impacted.push(node);
    for (const next of adjacency.get(id) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  const byType = {};
  for (const node of impacted) {
    (byType[node.type] ??= []).push(node);
  }

  return {
    originId: nodeId,
    impacted,
    byType,
    hasCritical: impacted.some(n => n.state === 'critico'),
  };
}
