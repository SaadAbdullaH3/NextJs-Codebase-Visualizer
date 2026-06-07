"use client";

/**
 * GraphCanvas.tsx — React Flow canvas with custom node types.
 *
 * This is the core visualization component. It converts graph.json
 * data into React Flow nodes and edges with:
 * - Custom node components per NodeType (different colors/badges)
 * - Edge styling per EdgeType (color, dash pattern)
 * - Dagre layout for automatic positioning
 * - Filtering via Zustand store
 * - MiniMap and Controls
 */

import { useCallback, useMemo, memo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  NodeProps,
  Handle,
  Position,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { useGraphStore, GraphNode, GraphEdge, NodeType } from "@/lib/graphStore";
import { layoutGraph } from "@/lib/graphLayout";

// ── Edge styling map ────────────────────────────────────────────────────

const EDGE_STYLES: Record<
  string,
  { stroke: string; strokeDasharray?: string; animated?: boolean }
> = {
  render: { stroke: "#3b82f6" },
  call: { stroke: "#f97316", strokeDasharray: "8 4" },
  "import-only": { stroke: "#4b5563", strokeDasharray: "4 4" },
  "dynamic-import": {
    stroke: "#a855f7",
    strokeDasharray: "8 4",
    animated: true,
  },
};

// ── Custom Node Component ───────────────────────────────────────────────

const CustomNode = memo(({ data, selected }: NodeProps) => {
  const nodeType = data.nodeType as NodeType;
  const isClient = data.isClientComponent as boolean;
  const hasServerAction = data.hasServerAction as boolean;

  return (
    <div
      className={`graph-node graph-node--${nodeType} ${selected ? "selected" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/30 !w-2 !h-2 !border-0 !min-w-0 !min-h-0" />

      {/* Client component badge */}
      {isClient && (
        <div className="node-badge bg-amber-500">C</div>
      )}

      {/* Server action badge */}
      {hasServerAction && !isClient && (
        <div className="node-badge bg-red-500">S</div>
      )}

      <div className="node-label" title={data.filePath}>
        {data.label}
      </div>
      <div className="node-type">{nodeType.replace(/-/g, " ")}</div>

      {/* Route badge */}
      {data.route && (
        <div className="text-[8px] mt-1 opacity-60 font-mono truncate max-w-[140px]">
          {data.route}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-white/30 !w-2 !h-2 !border-0 !min-w-0 !min-h-0" />
    </div>
  );
});

CustomNode.displayName = "CustomNode";

// ── MiniMap node color helper ───────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  page: "#2563eb",
  layout: "#6366f1",
  "client-component": "#d97706",
  "server-component": "#16a34a",
  "server-action": "#dc2626",
  "api-route": "#ea580c",
  middleware: "#9333ea",
  hook: "#0d9488",
  utility: "#4b5563",
  context: "#0891b2",
  unknown: "#374151",
  "route-group": "#7c3aed",
  "parallel-route": "#c026d3",
  "intercepting-route": "#e11d48",
};

function minimapNodeColor(node: Node): string {
  return NODE_COLORS[node.data?.nodeType] || "#374151";
}

// ── Internal canvas (must be inside ReactFlowProvider) ──────────────────

function GraphCanvasInner() {
  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);
  
  const graphData = useGraphStore((s) => s.graphData);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const activeFilters = useGraphStore((s) => s.activeFilters);
  const activeEdgeFilters = useGraphStore((s) => s.activeEdgeFilters);
  const isDraggable = useGraphStore((s) => s.isDraggable);

  // 1. Heavy Calculation: Only run when data or filters change
  const baseLayout = useMemo(() => {
    if (!graphData) return { baseNodes: [], baseEdges: [] };

    const visibleNodeIds = new Set<string>();
    const filteredNodes: Node[] = [];

    for (const node of graphData.nodes) {
      if (!activeFilters.has(node.type)) continue;

      visibleNodeIds.add(node.id);
      filteredNodes.push({
        id: node.id,
        type: "custom",
        position: { x: 0, y: 0 }, // Will be overwritten by dagre
        data: {
          label: node.label,
          nodeType: node.type,
          filePath: node.filePath,
          isClientComponent: node.isClientComponent,
          isServerComponent: node.isServerComponent,
          hasServerAction: node.hasServerAction,
          route: node.route,
          exports: node.exports,
        },
      });
    }

    const filteredEdges: Edge[] = [];
    for (const edge of graphData.edges) {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue;
      if (!activeEdgeFilters.has(edge.type)) continue;

      const style = EDGE_STYLES[edge.type] || EDGE_STYLES["import-only"];
      filteredEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "default",
        animated: style.animated || false,
        style: {
          stroke: style.stroke,
          strokeDasharray: style.strokeDasharray,
          strokeWidth: edge.type === "render" ? 2 : 1.5,
          opacity: edge.type === "import-only" ? 0.5 : 0.8,
        },
        markerEnd: { type: "arrowclosed" as any, color: style.stroke, width: 16, height: 12 },
      });
    }

    const laidOutNodes = layoutGraph(filteredNodes, filteredEdges);
    return { baseNodes: laidOutNodes, baseEdges: filteredEdges };
  }, [graphData, activeFilters, activeEdgeFilters]);

  // 2. Lightweight Calculation: Just toggle the 'selected' boolean
  const { flowNodes, flowEdges } = useMemo(() => {
    return {
      flowNodes: baseLayout.baseNodes.map(node => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
      flowEdges: baseLayout.baseEdges,
    };
  }, [baseLayout, selectedNodeId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
    },
    [selectedNodeId, setSelectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  if (!graphData) return null;

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      nodesDraggable={isDraggable}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
      minZoom={0.1}
      maxZoom={3}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#1a1a2e"
      />
      <Controls
        showInteractive={false}
        position="bottom-left"
      />
      <MiniMap
        nodeColor={minimapNodeColor}
        maskColor="rgba(0, 0, 0, 0.6)"
        position="bottom-right"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}

// ── Exported component (wraps with ReactFlowProvider) ───────────────────

export default function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner />
    </ReactFlowProvider>
  );
}
