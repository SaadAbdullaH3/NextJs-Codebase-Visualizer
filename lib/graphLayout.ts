/**
 * graphLayout.ts — Dagre layout algorithm for React Flow.
 *
 * Computes X/Y positions for all nodes using the dagre library,
 * which implements a layered graph drawing algorithm (Sugiyama-style).
 *
 * Direction is top-to-bottom (TB) since dependency graphs naturally
 * flow from pages (top) → components → utilities (bottom).
 *
 * The layout is computed ONCE when the graph loads, not on every render.
 * React Flow handles panning/zooming/dragging after initial positioning.
 */

import dagre from "dagre";
import type { Node, Edge } from "reactflow";

// ── Constants ───────────────────────────────────────────────────────────

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const GRAPH_DIRECTION = "TB"; // Top-to-Bottom

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Applies dagre layout to a set of React Flow nodes and edges.
 * Returns new node array with computed x/y positions.
 *
 * @param nodes - React Flow nodes (position will be overwritten)
 * @param edges - React Flow edges (used for layout graph structure)
 * @returns New array of nodes with computed positions
 */
export function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const dagreGraph = new dagre.graphlib.Graph();

  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure layout algorithm
  dagreGraph.setGraph({
    rankdir: GRAPH_DIRECTION,
    // Spacing between nodes in the same rank (horizontal gap)
    nodesep: 40,
    // Spacing between ranks (vertical gap between layers)
    ranksep: 70,
    // Edge routing: "short" for straight edges, or omit for routed
    edgesep: 20,
    // Use the "network-simplex" ranker for better results on DAGs
    ranker: "network-simplex",
  });

  // Add nodes to dagre graph
  for (const node of nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add edges to dagre graph
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  // Run the layout algorithm
  dagre.layout(dagreGraph);

  // Map dagre positions back to React Flow nodes.
  // dagre returns center positions; React Flow uses top-left origin.
  return nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);

    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });
}

export { NODE_WIDTH, NODE_HEIGHT };
