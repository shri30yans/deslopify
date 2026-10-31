/**
 * Personalized PageRank over the file import graph. Importance flows from an importer
 * to the files it imports, so widely used modules rank highest. `bias` raises files
 * relevant to the current task (the technique Aider's repo map uses).
 */
export function pageRank(
  nodes: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
  bias: ReadonlyMap<string, number> = new Map(),
  damping = 0.85,
  iterations = 40,
): Map<string, number> {
  const n = nodes.length;
  if (n === 0) return new Map();
  const biasTotal = [...bias.values()].reduce((a, b) => a + b, 0);
  const teleport = (node: string): number => (biasTotal > 0 ? (bias.get(node) ?? 0) / biasTotal : 1 / n);

  let rank = new Map(nodes.map((node) => [node, 1 / n]));
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map(nodes.map((node) => [node, (1 - damping) * teleport(node)]));
    let dangling = 0;
    for (const node of nodes) {
      const targets = edges.get(node) ?? [];
      const share = rank.get(node)!;
      if (targets.length === 0) dangling += share;
      else for (const t of targets) next.set(t, next.get(t)! + (damping * share) / targets.length);
    }
    for (const node of nodes) next.set(node, next.get(node)! + damping * dangling * teleport(node));
    rank = next;
  }
  return rank;
}
