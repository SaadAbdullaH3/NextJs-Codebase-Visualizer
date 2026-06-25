import { Node, Edge } from "reactflow";

export type BoundaryRole =
  | "server"
  | "client-root"
  | "client-inherited"
  | "server-action"
  | null;

/**
 * Computes client boundary propagation and enriches each node with a boundaryRole.
 *
 * Rules:
 * - "client-root"     → node.data.isClientComponent === true (has 'use client')
 * - "server-action"   → node.data.hasServerAction === true
 * - "client-inherited"→ reachable via RENDER edges from any client-root node,
 *                        but does NOT have its own 'use client' directive
 * - "server"          → everything else
 *
 * IMPORTANT: Only RENDER edges propagate client infection.
 * import-only and call edges do NOT propagate client status because React allows
 * server components to be passed as children (via props) to client components.
 */
export function applyBoundaryOverlay(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  // 1. Build forward adjacency for RENDER edges only
  const renderChildren = new Map<string, string[]>(); // nodeId → [childId, ...]
  for (const edge of edges) {
    const edgeType = (edge as any).data?.edgeType || edge.type;
    if (edgeType === "render") {
      if (!renderChildren.has(edge.source)) {
        renderChildren.set(edge.source, []);
      }
      renderChildren.get(edge.source)!.push(edge.target);
    }
  }

  // 2. Seed client roots
  const nodeMap = new Map<string, Node>();
  const clientRootIds = new Set<string>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    if (node.data?.isClientComponent) {
      clientRootIds.add(node.id);
    }
  }

  // 3. BFS from each client root to find inherited nodes
  const inheritedIds = new Set<string>();
  const queue: string[] = [...clientRootIds];
  const visited = new Set<string>(clientRootIds);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = renderChildren.get(current) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        if (!clientRootIds.has(childId)) {
          inheritedIds.add(childId);
        }
        queue.push(childId);
      }
    }
  }

  // 4. Compute subtree counts for each client-root node
  const subtreeCounts = new Map<string, number>(); // clientRootId → count of inherited descendants
  for (const rootId of clientRootIds) {
    let count = 0;
    const bfsQueue = [rootId];
    const bfsVisited = new Set<string>([rootId]);
    while (bfsQueue.length > 0) {
      const cur = bfsQueue.shift()!;
      const children = renderChildren.get(cur) || [];
      for (const childId of children) {
        if (!bfsVisited.has(childId)) {
          bfsVisited.add(childId);
          count++;
          bfsQueue.push(childId);
        }
      }
    }
    subtreeCounts.set(rootId, count);
  }

  // 5. Assign boundaryRole and subtreeCount to each node
  return nodes.map((node) => {
    let boundaryRole: BoundaryRole = "server";
    let subtreeCount: number | undefined;

    if (node.data?.hasServerAction) {
      boundaryRole = "server-action";
    }
    if (clientRootIds.has(node.id)) {
      boundaryRole = "client-root";
      subtreeCount = subtreeCounts.get(node.id);
    } else if (inheritedIds.has(node.id)) {
      boundaryRole = "client-inherited";
    }

    return {
      ...node,
      data: {
        ...node.data,
        boundaryRole,
        boundarySubtreeCount: subtreeCount,
      },
    };
  });
}

/**
 * Computes transitive reverse fan-out for each node and normalizes to a 0–1 heat score.
 *
 * Algorithm:
 *   For each node N, blastRadius(N) = count of nodes that transitively depend on N.
 *   "Depends on N" means: there is a path from that node TO N via forward dependency edges.
 *   Equivalently: N is reachable from that node via forward edges.
 *   Equivalently: that node is reachable from N via REVERSE edges.
 *
 * We build a reverse adjacency map and BFS from each node in the reverse graph.
 *
 * Time complexity: O(V * (V + E)) — acceptable for graphs up to ~2000 nodes in browser JS.
 */
export function applyHeatmapOverlay(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  // 1. Build reverse adjacency: if A→B exists, add A to reverse[B]
  //    (means: B is depended on by A, so B's blast includes A)
  const reverseAdj = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    reverseAdj.set(node.id, []);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    // edge.source depends on edge.target
    // so edge.target's reverse adjacency gains edge.source
    reverseAdj.get(edge.target)?.push(edge.source);
  }

  // 2. BFS from each node in the reverse graph to count transitive dependents
  const blastRadii = new Map<string, number>();

  for (const node of nodes) {
    const visited = new Set<string>();
    const queue: string[] = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const reverseDeps = reverseAdj.get(current) || [];
      for (const dep of reverseDeps) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }

    // Subtract 1 to exclude the node itself from its own blast radius
    blastRadii.set(node.id, visited.size - 1);
  }

  // 3. Normalize to 0–1
  const radiiValues = Array.from(blastRadii.values());
  const maxRadius = Math.max(...radiiValues, 1); // guard against all-zero

  const heatScore = (nodeId: string): number =>
    (blastRadii.get(nodeId) ?? 0) / maxRadius;

  // 4. Map score to color
  const scoreToColor = (score: number): string => {
    if (score >= 0.70) return "#dc2626"; // Red   — critical
    if (score >= 0.40) return "#f97316"; // Orange — high risk
    if (score >= 0.15) return "#eab308"; // Yellow — moderate
    return "#22c55e";                     // Green  — safe
  };

  // 5. Enrich nodes — write to node.data ONLY, never position or style dimensions
  return nodes.map((node) => {
    const radius = blastRadii.get(node.id) ?? 0;
    const score  = heatScore(node.id);
    const color  = scoreToColor(score);

    return {
      ...node,
      data: {
        ...node.data,
        heatScore:   score,
        blastRadius: radius,
        heatColor:   color,
      },
    };
  });
}
