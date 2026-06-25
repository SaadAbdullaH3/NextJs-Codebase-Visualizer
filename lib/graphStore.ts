/**
 * graphStore.ts — Zustand store for graph state management.
 */

import { create } from "zustand";

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

export type EdgeType = "render" | "call" | "import-only" | "dynamic-import" | "revalidates" | "data-fetch";

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

export type ViewMode = "cluster" | "routes" | "full" | "dataflow";

interface GraphStore {
  // Data
  graphData: GraphData | null;
  setGraphData: (data: GraphData) => void;

  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  lockedEdgeId: string | null;
  setLockedEdgeId: (id: string | null) => void;

  // View Mode & Clustering
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  expandedClusters: Set<string>;
  toggleCluster: (clusterId: string) => void;
  expandAllClusters: (clusterKeys: string[]) => void;
  collapseAllClusters: () => void;

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

  // ── NEW ADVANCED UI PANEL PERSISTENCE CONTROLLERS ───────────────────
  isLeftSidebarClosed: boolean;
  setIsLeftSidebarClosed: (closed: boolean) => void;
  isRightSidebarClosed: boolean;
  setIsRightSidebarClosed: (closed: boolean) => void;
  highlightColor: string;
  setHighlightColor: (color: string) => void;

  // Overlays
  showBoundaryOverlay: boolean;
  setBoundaryOverlay: (show: boolean) => void;
  showHeatmapOverlay: boolean;
  setHeatmapOverlay: (show: boolean) => void;
}

const ALL_NODE_TYPES: NodeType[] = [
  "page", "layout", "route-group", "parallel-route", "intercepting-route",
  "server-component", "client-component", "server-action", "api-route",
  "middleware", "hook", "utility", "context", "unknown"
];

const ALL_EDGE_TYPES: EdgeType[] = ["render", "call", "import-only", "dynamic-import", "revalidates", "data-fetch"];

export const useGraphStore = create<GraphStore>((set) => ({
  // Data
  graphData: null,
  setGraphData: (data) =>
    set({
      graphData: data,
      selectedNodeId: null,
      activeFilters: new Set(ALL_NODE_TYPES),
      activeEdgeFilters: new Set(ALL_EDGE_TYPES),
      expandedClusters: new Set(),
    }),

  // Selection
  selectedNodeId: null,
  setSelectedNodeId: (id) => set((state) => ({ 
    selectedNodeId: id,
    // Auto-open right drawer when a valid node is highlighted
    isRightSidebarClosed: id ? false : state.isRightSidebarClosed 
  })),
  lockedEdgeId: null,
  setLockedEdgeId: (id) => set({ lockedEdgeId: id }),

  // View Mode & Clustering
  viewMode: "cluster",
  setViewMode: (mode) => set({ viewMode: mode }),
  expandedClusters: new Set(),
  toggleCluster: (clusterId) =>
    set((state) => {
      const next = new Set(state.expandedClusters);
      if (next.has(clusterId)) { next.delete(clusterId); } else { next.add(clusterId); }
      return { expandedClusters: next };
    }),
  expandAllClusters: (clusterKeys) => set({ expandedClusters: new Set(clusterKeys) }),
  collapseAllClusters: () => set({ expandedClusters: new Set() }),

  // Filters
  activeFilters: new Set(ALL_NODE_TYPES),
  toggleFilter: (type) =>
    set((state) => {
      const next = new Set(state.activeFilters);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return { activeFilters: next };
    }),
  setAllFilters: (active) => set({ activeFilters: active ? new Set(ALL_NODE_TYPES) : new Set() }),

  // Performance
  isDraggable: false,
  toggleDraggable: () => set((state) => ({ isDraggable: !state.isDraggable })),

  // Edge filters
  activeEdgeFilters: new Set(ALL_EDGE_TYPES),
  toggleEdgeFilter: (type) =>
    set((state) => {
      const next = new Set(state.activeEdgeFilters);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return { activeEdgeFilters: next };
    }),

  // UI Panel Initializations
  isLeftSidebarClosed: false,
  setIsLeftSidebarClosed: (closed) => set({ isLeftSidebarClosed: closed }),
  isRightSidebarClosed: false,
  setIsRightSidebarClosed: (closed) => set({ isRightSidebarClosed: closed }),
  highlightColor: "#38bdf8", // Sets Electric Cyan as default theme highlight color
  setHighlightColor: (color) => set({ highlightColor: color }),

  // Overlays
  showBoundaryOverlay: false,
  setBoundaryOverlay: (show) => set({ showBoundaryOverlay: show }),
  showHeatmapOverlay: false,
  setHeatmapOverlay: (show) => set({ showHeatmapOverlay: show }),
}));

export { ALL_NODE_TYPES, ALL_EDGE_TYPES };
