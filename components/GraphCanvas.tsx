"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useGraphStore } from "@/lib/graphStore";
import { layoutGraphWithElk } from "@/lib/graphLayout";
import { nodeTypes as defaultNodeTypes } from "./CustomNode";
import { ClusterNode } from "./ClusterNode";
import ElkEdge from "./ElkEdge";
import { buildClusteredFlow, buildRouteFlow } from "@/lib/clusterTransform";
import { buildDataFlowGraph } from "@/lib/dataFlowTransform";
import { applyBoundaryOverlay, applyHeatmapOverlay } from "@/lib/overlayCompute";
import { HeatmapLegend } from "./HeatmapLegend";
import { 
  PanelLeftClose, 
  PanelLeftOpen, 
  PanelRightClose, 
  PanelRightOpen
} from "lucide-react";

const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string; animated?: boolean }> = {
  render: { stroke: "#60a5fa" },
  call: { stroke: "#fb923c", strokeDasharray: "8 4" },
  "import-only": { stroke: "#9ca3af", strokeDasharray: "4 4" },
  "dynamic-import": { stroke: "#c084fc", strokeDasharray: "8 4", animated: true },
  "revalidates":    { stroke: "#a78bfa", strokeDasharray: "6 3" },
  "data-fetch":     { stroke: "#06b6d4", strokeDasharray: "3 3" },
};

const NODE_COLORS: Record<string, string> = {
  page: "#2563eb", layout: "#6366f1", "client-component": "#d97706", "server-component": "#16a34a",
  "server-action": "#dc2626", "api-route": "#ea580c", middleware: "#9333ea", hook: "#0d9488",
  utility: "#4b5563", context: "#0891b2", unknown: "#374151"
};

function minimapNodeColor(node: Node): string {
  return NODE_COLORS[node.data?.nodeType] || "#374151";
}

function GraphCanvasInner() {
  const { fitView, setCenter } = useReactFlow();
  const graphData = useGraphStore((s) => s.graphData);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const activeFilters = useGraphStore((s) => s.activeFilters);
  const activeEdgeFilters = useGraphStore((s) => s.activeEdgeFilters);
  const isDraggable = useGraphStore((s) => s.isDraggable);
  const viewMode = useGraphStore((s) => s.viewMode);
  const expandedClusters = useGraphStore((s) => s.expandedClusters);
  const toggleCluster = useGraphStore((s) => s.toggleCluster);

  // OVERLAY CONFIGURATION FLAGS
  const showBoundaryOverlay = useGraphStore((s) => s.showBoundaryOverlay);
  const showHeatmapOverlay = useGraphStore((s) => s.showHeatmapOverlay);

  // COLLAPSIBLE SIDEBAR STATES
  const isLeftSidebarClosed = useGraphStore((s) => s.isLeftSidebarClosed);
  const setIsLeftSidebarClosed = useGraphStore((s) => s.setIsLeftSidebarClosed);
  const isRightSidebarClosed = useGraphStore((s) => s.isRightSidebarClosed);
  const setIsRightSidebarClosed = useGraphStore((s) => s.setIsRightSidebarClosed);
  const highlightColor = useGraphStore((s) => s.highlightColor);

  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const lockedEdgeId = useGraphStore((s) => s.lockedEdgeId);
  const setLockedEdgeId = useGraphStore((s) => s.setLockedEdgeId);
  const [baseLayout, setBaseLayout] = useState<{ baseNodes: Node[]; baseEdges: Edge[] }>({ baseNodes: [], baseEdges: [] });

  const hasFitInitially = useRef(false);
  const skipNextCameraAnimationRef = useRef(false);
  const pendingSidebarTargetRef = useRef<string | null>(null);

  // Memoize nodeTypes and edgeTypes to prevent React Flow warnings on hot reload
  const nodeTypes = useMemo(() => ({
    ...defaultNodeTypes,
    clusterNode: ClusterNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    elkEdge: ElkEdge,
  }), []);

  // 1. Structural Compilation Pipeline Pass (Runs Asynchronous ELK Calculations)
  useEffect(() => {
    if (!graphData) return;
    let isMounted = true;

    let processedNodes: Node[] = [];
    let processedEdges: Edge[] = [];

    if (viewMode === "dataflow") {
      const rawCustomNodes = graphData.nodes.map(node => ({
        id: node.id,
        type: "custom",
        position: { x: 0, y: 0 },
        data: {
          label: node.label, nodeType: node.type, filePath: node.filePath,
          isClientComponent: node.isClientComponent, isServerComponent: node.isServerComponent,
          hasServerAction: node.hasServerAction, route: node.route, exports: node.exports,
          revalidatesPaths: (node as any).revalidatesPaths,
          revalidatesTags: (node as any).revalidatesTags,
          hasFetch: (node as any).hasFetch, dbClients: (node as any).dbClients,
        }
      }));

      const rawEdges = graphData.edges.map(e => ({
        id: e.id, source: e.source, target: e.target, type: e.type, data: { edgeType: e.type }
      }));

      const dataFlowResult = buildDataFlowGraph(rawCustomNodes, rawEdges);
      processedNodes = dataFlowResult.nodes;
      processedEdges = dataFlowResult.edges;

    } else if (viewMode === "routes") {
      const rawCustomNodes = graphData.nodes.map(node => ({
        id: node.id, type: "custom", position: { x: 0, y: 0 },
        data: { label: node.label, nodeType: node.type, route: node.route }
      }));
      const rawEdges = graphData.edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type }));
      
      const routeResult = buildRouteFlow(rawCustomNodes, rawEdges);
      processedNodes = routeResult.nodes;
      processedEdges = routeResult.edges;

    } else {
      const visibleNodeIds = new Set<string>();
      const filteredNodes: Node[] = [];

      for (const node of graphData.nodes) {
        if (!activeFilters.has(node.type)) continue;
        visibleNodeIds.add(node.id);
        filteredNodes.push({
          id: node.id,
          type: "custom",
          position: { x: 0, y: 0 },
          data: {
            label: node.label, nodeType: node.type, filePath: node.filePath,
            isClientComponent: node.isClientComponent, isServerComponent: node.isServerComponent,
            hasServerAction: node.hasServerAction, route: node.route, exports: node.exports,
          },
        });
      }

      const filteredEdges: Edge[] = [];
      const edgeMap = new Map<string, any>();
      const groupedEdgeTypes = new Map<string, Set<string>>();

      for (const edge of graphData.edges) {
        if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue;
        if (!activeEdgeFilters.has(edge.type)) continue;

        const aggregatedEdgeId = `${edge.source}-->${edge.target}`;
        if (!groupedEdgeTypes.has(aggregatedEdgeId)) groupedEdgeTypes.set(aggregatedEdgeId, new Set<string>());
        groupedEdgeTypes.get(aggregatedEdgeId)!.add(edge.type || "default");

        if (!edgeMap.has(aggregatedEdgeId)) {
          const style = EDGE_STYLES[edge.type] || EDGE_STYLES["import-only"];
          edgeMap.set(aggregatedEdgeId, {
            id: aggregatedEdgeId, source: edge.source, target: edge.target, type: "elkEdge",
            animated: style.animated || false,
            style: {
              stroke: style.stroke, strokeDasharray: style.strokeDasharray,
              strokeWidth: edge.type === "render" ? 2 : 1.5, opacity: edge.type === "import-only" ? 0.5 : 0.8,
            },
            markerEnd: { type: "arrowclosed" as any, color: style.stroke, width: 16, height: 12 },
          });
        }
      }

      for (const [id, aggregatedEdge] of edgeMap.entries()) {
        const types = Array.from(groupedEdgeTypes.get(id) || []);
        if (types.length > 1) {
          aggregatedEdge.label = types.join(" | ");
          aggregatedEdge.style = { ...aggregatedEdge.style, stroke: "#a855f7", strokeWidth: 2.5, strokeDasharray: undefined, opacity: 1 };
          aggregatedEdge.markerEnd = { type: "arrowclosed" as any, color: "#a855f7", width: 16, height: 12 };
        }
        filteredEdges.push(aggregatedEdge);
      }

      processedNodes = filteredNodes;
      processedEdges = filteredEdges;

      if (viewMode === "cluster") {
        const clusterResult = buildClusteredFlow(filteredNodes, filteredEdges, expandedClusters);
        processedNodes = clusterResult.nodes;
        processedEdges = clusterResult.edges;
      }
    }

    // Normalize all edges to ensure they use the ElkEdge component and have base styles
    const normalizedEdges = processedEdges.map(edge => {
      if (edge.type === "elkEdge") return edge;
      
      const originalType = edge.type || "import-only";
      const styleConfig = EDGE_STYLES[originalType] || EDGE_STYLES["import-only"];
      
      return {
        ...edge,
        type: "elkEdge",
        animated: edge.animated ?? styleConfig.animated ?? false,
        style: edge.style || {
          stroke: styleConfig.stroke,
          strokeDasharray: styleConfig.strokeDasharray,
          strokeWidth: originalType === "render" ? 2 : 1.5,
          opacity: originalType === "import-only" ? 0.3 : 0.8,
        },
        markerEnd: edge.markerEnd || { 
          type: "arrowclosed" as any, 
          color: styleConfig.stroke, 
          width: 16, 
          height: 12 
        },
      };
    });

    layoutGraphWithElk(processedNodes, normalizedEdges).then(({ nodes: laidOutNodes, edgePaths }) => {
      if (isMounted) {
        const enhancedEdges = normalizedEdges.map(edge => ({
          ...edge,
          data: { ...edge.data, elkPath: edgePaths.get(edge.id) }
        }));
        setBaseLayout({ baseNodes: laidOutNodes, baseEdges: enhancedEdges });
        
        if (!hasFitInitially.current) {
          setTimeout(() => { fitView({ padding: 0.20, duration: 600 }); }, 50);
          hasFitInitially.current = true;
        }
      }
    });

    return () => { isMounted = false; };
  }, [graphData, activeFilters, activeEdgeFilters, viewMode, expandedClusters, fitView]);

  const getAbsoluteCenter = useCallback((targetId: string, currentNodes: Node[]) => {
    let targetNode = currentNodes.find((n) => n.id === targetId);
    if (!targetNode) return null;

    let absoluteX = targetNode.position.x;
    let absoluteY = targetNode.position.y;
    let parentId = targetNode.parentId;

    while (parentId) {
      const parentNode = currentNodes.find((n) => n.id === parentId);
      if (parentNode) {
        absoluteX += parentNode.position.x; absoluteY += parentNode.position.y;
        parentId = parentNode.parentId;
      } else { break; }
    }

    const nodeWidth = targetNode.style?.width ? Number(targetNode.style.width) : 180;
    const nodeHeight = targetNode.style?.height ? Number(targetNode.style.height) : 55;
    return { x: absoluteX + nodeWidth / 2, y: absoluteY + nodeHeight / 2 };
  }, []);

  useEffect(() => {
    if (!selectedNodeId || baseLayout.baseNodes.length === 0) return;
    if (skipNextCameraAnimationRef.current) {
      skipNextCameraAnimationRef.current = false;
      return;
    }

    let coords = getAbsoluteCenter(selectedNodeId, baseLayout.baseNodes);

    if (!coords && viewMode === "cluster") {
      const selectedGraphNode = graphData?.nodes.find(n => n.id === selectedNodeId) as any;
      const parentCluster = selectedGraphNode?.parentId;
      if (parentCluster && !expandedClusters.has(parentCluster)) {
        pendingSidebarTargetRef.current = selectedNodeId;
        toggleCluster(parentCluster); 
        return; 
      }
    }

    if (!coords) return;
    setCenter(coords.x, coords.y, { zoom: 1.15, duration: 750 });
    pendingSidebarTargetRef.current = null;
  }, [selectedNodeId, baseLayout.baseNodes, setCenter, viewMode, graphData, expandedClusters, toggleCluster, getAbsoluteCenter]);

  useEffect(() => {
    if (pendingSidebarTargetRef.current && baseLayout.baseNodes.length > 0) {
      const targetId = pendingSidebarTargetRef.current;
      const coords = getAbsoluteCenter(targetId, baseLayout.baseNodes);
      if (coords) {
        setTimeout(() => { setCenter(coords.x, coords.y, { zoom: 1.15, duration: 750 }); }, 150);
        pendingSidebarTargetRef.current = null;
      }
    }
  }, [baseLayout.baseNodes, setCenter, getAbsoluteCenter]);

  // 3. Lightweight Rendering Pass (Maps Highlighting and Sequential Overlay Enrichment Loops)
  const { flowNodes, flowEdges } = useMemo(() => {
    // Phase 2: Intercept Edge Focus logic
    // FIX: Isolate background blur dimming to explicit Double-Click Lock states only
    const activeEdgeId = lockedEdgeId; // Removed hoveredEdgeId fallback trigger
    let activeSourceId: string | null = null;
    let activeTargetId: string | null = null;
    
    if (activeEdgeId) {
      const activeEdge = baseLayout.baseEdges.find(e => e.id === activeEdgeId);
      if (activeEdge) {
        activeSourceId = activeEdge.source;
        activeTargetId = activeEdge.target;
      }
    }

    // Step A: Base Selection Configuration mapping and Opacity Dimming
    let enrichedNodes: Node[] = baseLayout.baseNodes.map(node => {
      let nodeOpacity = 1;
      if (activeEdgeId) {
        if (node.id === activeSourceId || node.id === activeTargetId) {
          nodeOpacity = 1;
        } else {
          nodeOpacity = 0.25; // 25% opacity for unrelated nodes when an edge is LOCKED
        }
      }

      return {
        ...node,
        selected: node.id === selectedNodeId,
        style: {
          ...node.style,
          opacity: nodeOpacity,
          transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }
      };
    });

    // Step B: SEQUENTIAL OVERLAY INJECTION (Calculated dynamically without altering ELK boundaries)
    if (showBoundaryOverlay) {
      enrichedNodes = applyBoundaryOverlay(enrichedNodes, baseLayout.baseEdges);
    }
    if (showHeatmapOverlay) {
      enrichedNodes = applyHeatmapOverlay(enrichedNodes, baseLayout.baseEdges);
    }

    // Step C: Interactive Link Highlight formatting map
    const mappedEdges = baseLayout.baseEdges.map(edge => {
      const isHighlighted = edge.id === hoveredEdgeId || edge.id === lockedEdgeId;
      
      // If an edge is locked, dim all other inactive background paths down
      if (activeEdgeId && !isHighlighted) {
        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: 0.15,
            transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }
        };
      }

      if (!isHighlighted) return edge;
      
      return {
        ...edge,
        animated: true,
        style: { 
          ...edge.style, 
          stroke: highlightColor, 
          strokeWidth: 4, 
          opacity: 1,
          transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.2s ease" 
        },
        markerEnd: (typeof edge.markerEnd === 'object' && edge.markerEnd !== null) 
          ? { ...edge.markerEnd, color: highlightColor } 
          : { type: "arrowclosed" as any, color: highlightColor },
        data: {
          ...edge.data,
          startPin: {
            color: highlightColor,
            width: 8,
          }
        }
      };
    });

    return {
      flowNodes: enrichedNodes,
      flowEdges: mappedEdges,
    };
  }, [baseLayout, selectedNodeId, hoveredEdgeId, lockedEdgeId, highlightColor, showBoundaryOverlay, showHeatmapOverlay]);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => { 
    skipNextCameraAnimationRef.current = true; setSelectedNodeId(node.id); 
  }, [setSelectedNodeId]);

  const onPaneClick = useCallback(() => { 
    skipNextCameraAnimationRef.current = false; setSelectedNodeId(null); 
    setLockedEdgeId(null); setHoveredEdgeId(null);
  }, [setSelectedNodeId]);

  if (!graphData) return null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      
      <style dangerouslySetInnerHTML={{ __html: `
        div[data-panel="left-filter"] {
          display: ${isLeftSidebarClosed ? "none !important" : "flex !important"};
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        div[data-panel="right-details"] {
          display: ${isRightSidebarClosed ? "none !important" : "flex !important"};
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}} />

      {/* FLOATING ACTION TOGGLES */}
      <div style={{ position: "absolute", top: "15px", left: "15px", zIndex: 110 }}>
        <button
          onClick={() => setIsLeftSidebarClosed(!isLeftSidebarClosed)}
          style={{ background: "#1e1e2f", color: "#9ca3af", border: "1px solid #2d2d44", padding: "8px", borderRadius: "8px", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}
          className="hover:text-white hover:bg-[#2a2a40]"
        >
          {isLeftSidebarClosed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* FIX: Render the right toggle unconditionally so users can collapse the Executive Summary */}
      <div style={{ position: "absolute", top: "15px", right: "15px", zIndex: 110 }}>
        <button
          onClick={() => setIsRightSidebarClosed(!isRightSidebarClosed)}
          style={{ background: "#1e1e2f", color: "#9ca3af", border: "1px solid #2d2d44", padding: "8px", borderRadius: "8px", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}
          className="hover:text-white hover:bg-[#2a2a40]"
        >
          {isRightSidebarClosed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
        </button>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeMouseEnter={(_e, edge) => { if (!lockedEdgeId) setHoveredEdgeId(edge.id); }}
        onEdgeMouseLeave={() => { if (!lockedEdgeId) setHoveredEdgeId(null); }}
        onEdgeDoubleClick={(_e, edge) => { setLockedEdgeId(edge.id); setHoveredEdgeId(edge.id); }}
        nodesDraggable={isDraggable}
        nodesConnectable={false}
        minZoom={0.01}
        maxZoom={5.0}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a2e" />
        <Controls showInteractive={false} position="bottom-left" />
        <HeatmapLegend /> {/* PERSISTENT DOWNSTREAM OVERLAY ANCHOR */}
        <MiniMap nodeColor={minimapNodeColor} maskColor="rgba(0, 0, 0, 0.6)" position="bottom-right" pannable zoomable />
      </ReactFlow>
    </div>
  );
}

import { ViewModeBar } from "./ViewModeBar";
import { OverlayBar } from "./OverlayBar"; // Re-mounted to maintain secondary control strip visibility

export default function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <ViewModeBar />
      <OverlayBar />
      <GraphCanvasInner />
    </ReactFlowProvider>
  );
}
