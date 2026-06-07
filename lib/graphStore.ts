/**
 * graphStore.ts — Zustand store for graph state management.
 *
 * Central state for the graph viewer. Holds:
 * - The parsed graph.json data
 * - Currently selected node
 * - Active node type filters
 * - Dragging toggle for performance
 *
 * Zustand was chosen over React Context because:
 * 1. No provider wrapper needed (simpler component tree)
 * 2. Selective subscriptions (components re-render only when their slice changes)
 * 3. Works across Next.js client components without hydration issues
 */

import { create } from "zustand";

// ── Types matching graph.json schema ────────────────────────────────────

export type NodeType =
  | "page"
  | "layout"
  | "route-group"
  | "parallel-route"
  | "intercepting-route"
  | "server-component"
  | "client-component"
  | "server-action"
  | "api-route"
  | "middleware"
  | "hook"
  | "utility"
  | "context"
  | "unknown";

export type EdgeType = "render" | "call" | "import-only" | "dynamic-import";

export interface GraphMeta {
  generatedAt: string;
  projectName: string;
  routerType: "app" | "pages" | "hybrid";
  totalFiles: number;
  analysisVersion: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  filePath: string;
  isClientComponent: boolean;
  isServerComponent: boolean;
  hasServerAction: boolean;
  route?: string;
  exports: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
}

export interface GraphData {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Store ───────────────────────────────────────────────────────────────

interface GraphStore {
  // Data
  graphData: GraphData | null;
  setGraphData: (data: GraphData) => void;

  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Filters — which node types are visible
  activeFilters: Set<NodeType>;
  toggleFilter: (type: NodeType) => void;
  setAllFilters: (active: boolean) => void;

  // Performance — dragging toggle for large graphs
  isDraggable: boolean;
  toggleDraggable: () => void;

  // Edge type visibility filters
  activeEdgeFilters: Set<EdgeType>;
  toggleEdgeFilter: (type: EdgeType) => void;
}

const ALL_NODE_TYPES: NodeType[] = [
  "page",
  "layout",
  "route-group",
  "parallel-route",
  "intercepting-route",
  "server-component",
  "client-component",
  "server-action",
  "api-route",
  "middleware",
  "hook",
  "utility",
  "context",
  "unknown",
];

const ALL_EDGE_TYPES: EdgeType[] = [
  "render",
  "call",
  "import-only",
  "dynamic-import",
];

export const useGraphStore = create<GraphStore>((set) => ({
  // Data
  graphData: null,
  setGraphData: (data) =>
    set({
      graphData: data,
      selectedNodeId: null,
      // Reset filters to show all when new graph is loaded
      activeFilters: new Set(ALL_NODE_TYPES),
      activeEdgeFilters: new Set(ALL_EDGE_TYPES),
    }),

  // Selection
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  // Filters
  activeFilters: new Set(ALL_NODE_TYPES),
  toggleFilter: (type) =>
    set((state) => {
      const next = new Set(state.activeFilters);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return { activeFilters: next };
    }),
  setAllFilters: (active) =>
    set({
      activeFilters: active ? new Set(ALL_NODE_TYPES) : new Set(),
    }),

  // Performance
  isDraggable: false,
  toggleDraggable: () => set((state) => ({ isDraggable: !state.isDraggable })),

  // Edge filters
  activeEdgeFilters: new Set(ALL_EDGE_TYPES),
  toggleEdgeFilter: (type) =>
    set((state) => {
      const next = new Set(state.activeEdgeFilters);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return { activeEdgeFilters: next };
    }),
}));

export { ALL_NODE_TYPES, ALL_EDGE_TYPES };
