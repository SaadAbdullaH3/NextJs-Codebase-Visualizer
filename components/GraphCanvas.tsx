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
import { buildClusteredFlowPro } from "@/lib/clusterTransformPro";
import { layoutGraphWithElkPro } from "@/lib/graphLayoutPro";
import { ClusterNodePro, SubClusterNode, FileNodePro } from "@/components/pro";
import { buildClusteredFlow, buildRouteFlow } from "@/lib/clusterTransform";
import { buildDataFlowGraph } from "@/lib/dataFlowTransform";
import { applyBoundaryOverlay, applyHeatmapOverlay } from "@/lib/overlayCompute";
import { HeatmapLegend } from "./HeatmapLegend";
import { getClusterKey } from "@/lib/clusterTransform";
import { 
  PanelLeftClose, 
  PanelLeftOpen, 
  PanelRightClose, 
  PanelRightOpen
} from "lucide-react";

const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string; animated?: boolean }> = {
  render: { stroke: "#3b82f6" },       
  call: { stroke: "#f97316", strokeDasharray: "8 4" }, 
  "import-only": { stroke: "#737373" }, 
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

  const showBoundaryOverlay = useGraphStore((s) => s.showBoundaryOverlay);
  const showHeatmapOverlay = useGraphStore((s) => s.showHeatmapOverlay);

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

  const nodeTypes = useMemo(() => ({
    ...defaultNodeTypes,
    clusterNode: ClusterNode,
    clusterNodePro: ClusterNodePro,
    subClusterNode: SubClusterNode,
    fileNodePro: FileNodePro,
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
              strokeWidth: edge.type === "render" ? 2.5 : 1.5, opacity: 0.85, 
            },
            markerEnd: { type: "arrowclosed" as any, color: style.stroke, width: 16, height: 12 },
            data: { rawEdges: [edge], edgeType: edge.type || "import-only" }
          });
        } else {
          edgeMap.get(aggregatedEdgeId).data.rawEdges.push(edge);
        }
      }

      for (const [id, aggregatedEdge] of edgeMap.entries()) {
        const types = Array.from(groupedEdgeTypes.get(id) || []);
        if (types.length > 1) {
          aggregatedEdge.label = types.join(" | ");
          aggregatedEdge.style = { ...aggregatedEdge.style, stroke: "#a855f7", strokeWidth: 2.5, strokeDasharray: undefined, opacity: 0.9 };
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
      } else if (viewMode === "cluster-pro") {
        const proResult = buildClusteredFlowPro(filteredNodes, filteredEdges, expandedClusters);
        processedNodes = proResult.nodes;
        processedEdges = proResult.edges;
      }
    }

    const normalizedEdges = processedEdges.map(edge => {
      const originalType = (edge.data?.edgeType || edge.type || "import-only") as string;
      const styleConfig = EDGE_STYLES[originalType] || EDGE_STYLES["import-only"];
      
      return {
        ...edge,
        type: "elkEdge",
        animated: edge.animated ?? styleConfig.animated ?? false,
        style: {
          stroke: edge.style?.stroke || styleConfig.stroke,
          strokeDasharray: edge.style?.strokeDasharray || styleConfig.strokeDasharray,
          strokeWidth: edge.style?.strokeWidth || (originalType === "render" ? 2.5 : 1.5),
          opacity: edge.style?.opacity || 0.85, 
        },
        markerEnd: edge.markerEnd || { 
          type: "arrowclosed" as any, 
          color: styleConfig.stroke, 
          width: 16, 
          height: 12 
        },
      };
    });

    if (viewMode === "cluster-pro") {
      layoutGraphWithElkPro(processedNodes, normalizedEdges).then(({ nodes: laidOutNodes, edgePaths }) => {
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
    }

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
  const flowNodesAndEdges = useMemo(() => {
    const activeEdgeId = lockedEdgeId;
    let activeSourceId: string | null = null;
    let activeTargetId: string | null = null;
    
    const selectedClusterParentId = selectedNodeId ? `cluster-${getClusterKey(selectedNodeId)}` : null;

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
        const isConnectedNode = node.id === activeSourceId || node.id === activeTargetId ||
                                baseLayout.baseEdges.some(e => (e.id === activeEdgeId) && (e.source === node.id || e.target === node.id || e.id.includes(node.id)));
        nodeOpacity = isConnectedNode ? 1 : 0.25;
      }

      // Calculate dynamic background container layers
      let computedZIndex = 12; // Default foreground priority for file nodes
      if (node.type === "clusterNode" || node.type === "group" || node.type === "clusterNodePro") {
        computedZIndex = node.data?.isExpanded ? 1 : 4;
      } else if (node.type === "subClusterNode") {
        computedZIndex = 2;
      }

      return {
        ...node,
        selected: node.id === selectedNodeId,
        zIndex: computedZIndex,
        style: {
          ...node.style,
          opacity: nodeOpacity,
          transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }
      };
    });

    if (showBoundaryOverlay) {
      enrichedNodes = applyBoundaryOverlay(enrichedNodes, baseLayout.baseEdges);
    }
    if (showHeatmapOverlay) {
      enrichedNodes = applyHeatmapOverlay(enrichedNodes, baseLayout.baseEdges);
    }

    // Step C: UNIVERSAL EDGE HIGHLIGHT MATCHER WITH FOREGROUND LAYER ELEVATION
    const mappedEdges = baseLayout.baseEdges.map(edge => {
      const isDirectlyFocused = edge.id === hoveredEdgeId || edge.id === lockedEdgeId;
      const isConnectedToSelectedNode = selectedNodeId && (
        edge.source === selectedNodeId || 
        edge.target === selectedNodeId ||
        edge.source === selectedClusterParentId || 
        edge.target === selectedClusterParentId ||
        edge.id.includes(selectedNodeId)
      );

      const isHighlighted = !!(isDirectlyFocused || isConnectedToSelectedNode);

      if (activeEdgeId && !isHighlighted) {
        return {
          ...edge,
          style: { ...edge.style, opacity: 0.1, transition: "opacity 0.2s ease" }
        };
      }

      if (!isHighlighted) return edge;
      
      return {
        ...edge,
        animated: true,
        zIndex: 1000, // CRITICAL: Elevates active trace blocks completely into the foreground dome
        data: {
          ...edge.data,
          isHighlighted: true,
          highlightColor,
        },
        style: { 
          ...edge.style, 
          stroke: highlightColor, 
          strokeWidth: 4, 
          opacity: 1,
          transition: "opacity 0.2s ease, stroke-width 0.2s ease" 
        },
        markerEnd: (typeof edge.markerEnd === 'object' && edge.markerEnd !== null) 
          ? { ...edge.markerEnd, color: highlightColor } 
          : { type: "arrowclosed" as any, color: highlightColor },
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

      <div style={{ position: "absolute", top: "15px", left: "15px", zIndex: 110 }}>
        <button
          onClick={() => setIsLeftSidebarClosed(!isLeftSidebarClosed)}
          style={{ background: "#1e1e2f", color: "#9ca3af", border: "1px solid #2d2d44", padding: "8px", borderRadius: "8px", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}
          className="hover:text-white hover:bg-[#2a2a40]"
        >
          {isLeftSidebarClosed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

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
        nodes={flowNodesAndEdges.flowNodes}
        edges={flowNodesAndEdges.flowEdges}
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
        <HeatmapLegend />
        <MiniMap nodeColor={minimapNodeColor} maskColor="rgba(0, 0, 0, 0.6)" position="bottom-right" pannable zoomable />
      </ReactFlow>
    </div>
  );
}

import { ViewModeBar } from "./ViewModeBar";
import { OverlayBar } from "./OverlayBar";

export default function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <ViewModeBar />
      <OverlayBar />
      <GraphCanvasInner />
    </ReactFlowProvider>
  );
}
