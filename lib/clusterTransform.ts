import { Node, Edge, MarkerType } from "reactflow";

export function getDomainRole(clusterKey: string): string {
  if (clusterKey === "root") return "Global Configuration";
  if (clusterKey.includes("api")) return "Core API Routing Layer";
  if (clusterKey.includes("components")) return "Primitives Design System";
  if (clusterKey.includes("app") || clusterKey.includes("pages")) return "Application Views";
  if (clusterKey.includes("lib") || clusterKey.includes("utils")) return "Core Business Logic";
  if (clusterKey.includes("hooks")) return "State Management";
  return "Feature Module";
}

export function getClusterKey(filePath: string): string {
  // Normalize slashes for consistent grouping
  const parts = filePath.replace(/\\/g, "/").split("/");
  
  if (parts.length <= 1) {
    return "root";
  }
  
  // If the path starts with "src", group by the next subdirectory (e.g. src/app)
  if (parts[0] === "src" && parts.length > 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  
  // Otherwise, group by the top-level directory
  return parts[0];
}

export function buildClusteredFlow(
  baseNodes: Node[],
  baseEdges: Edge[],
  expandedClusters: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const finalNodes: Node[] = [];
  const finalEdges: Edge[] = [];

  // Group original nodes by their cluster key
  const clusters = new Map<string, Node[]>();
  
  for (const node of baseNodes) {
    // Determine filePath either from custom data or default to id
    const filePath = (node.data?.filePath as string) || node.id;
    const clusterKey = getClusterKey(filePath);
    
    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, []);
    }
    clusters.get(clusterKey)!.push(node);
  }

  // Map each original node ID to the ID of the node that will actually be visible
  const nodeToVisibleId = new Map<string, string>();

  // Create parent group nodes
  for (const [clusterKey, children] of clusters.entries()) {
    const isExpanded = expandedClusters.has(clusterKey);
    const parentId = `cluster-${clusterKey}`;
    const domainRole = getDomainRole(clusterKey);
    
    const parentNode: Node = {
      id: parentId,
      type: "clusterNode",
      position: { x: 0, y: 0 },
      data: { label: clusterKey, isExpanded, childCount: children.length, domainRole },
      // Generic styling for the parent container box
      className: isExpanded 
        ? "react-flow__node-group" // Handled in globals.css now
        : "react-flow__node-group-collapsed", // Handled in globals.css now
      style: isExpanded 
        ? { zIndex: -1 } // Remove static width and height to give ELKjs total layout freedom
        : { width: 220, height: 80 },
    };

    if (isExpanded) {
      for (const child of children) {
        finalNodes.push({
          ...child,
          parentId,
          extent: "parent",
          position: { x: 0, y: 0 },
          zIndex: 1,
        });
        nodeToVisibleId.set(child.id, child.id);
      }
      finalNodes.push(parentNode);
    } else {
      finalNodes.push(parentNode);
      for (const child of children) {
        nodeToVisibleId.set(child.id, parentId);
      }
    }
  }

  // Aggregate all crossing file edges so they point directly to the parent group container instead
  const edgeCounts = new Map<string, number>();
  const edgeMap = new Map<string, any>();
  const edgeTypes = new Map<string, Set<string>>();

  for (const edge of baseEdges) {
    const visibleSource = nodeToVisibleId.get(edge.source);
    const visibleTarget = nodeToVisibleId.get(edge.target);

    // Skip self-edges if both nodes map to the same collapsed cluster
    if (!visibleSource || !visibleTarget || visibleSource === visibleTarget) {
      continue;
    }

    const aggregatedEdgeId = `${visibleSource}-->${visibleTarget}`;
    edgeCounts.set(aggregatedEdgeId, (edgeCounts.get(aggregatedEdgeId) || 0) + 1);
    
    if (!edgeTypes.has(aggregatedEdgeId)) {
      edgeTypes.set(aggregatedEdgeId, new Set<string>());
    }
    edgeTypes.get(aggregatedEdgeId)!.add(edge.type || "default");
    
    if (!edgeMap.has(aggregatedEdgeId)) {
      edgeMap.set(aggregatedEdgeId, {
        ...edge,
        id: aggregatedEdgeId,
        source: visibleSource,
        target: visibleTarget,
      });
    }
  }

  // Apply density-based stroke weights and consolidate multi-relationship labels
  for (const [id, count] of edgeCounts.entries()) {
    const aggregatedEdge = edgeMap.get(id);
    const types = Array.from(edgeTypes.get(id) || []);
    
    if (aggregatedEdge) {
      if (types.length > 1) {
        aggregatedEdge.label = types.join(" | ");
        aggregatedEdge.style = {
          ...aggregatedEdge.style,
          stroke: "#a855f7", // Distinctive neon highlight for multi-relations
          strokeWidth: 2.5,
        };
      } else {
        aggregatedEdge.style = {
          ...aggregatedEdge.style,
          strokeWidth: Math.min(2 + Math.log2(count) * 0.5, 6)
        };
      }
      finalEdges.push(aggregatedEdge);
    }
  }

  return { nodes: finalNodes, edges: finalEdges };
}

/**
 * Advanced Transitive Route Flow Transformer
 * Synthesizes structural directory-tree edges to stitch disconnected Next.js layouts and pages.
 */
export function buildRouteFlow(
  baseNodes: Node[],
  baseEdges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  
  // 1. Isolate only route-moving nodes (pages and layouts)
  const routeNodes = baseNodes.filter((node) => {
    const type = node.data?.nodeType || node.type;
    return type === "page" || type === "layout" || type === "api-route";
  });

  const routeNodeIds = new Set(routeNodes.map((n) => n.id));

  // 2. Extract layout components to act as structural anchors
  const layoutNodes = routeNodes.filter((n) => (n.data?.nodeType || n.type) === "layout");
  const nonLayoutNodes = routeNodes.filter((n) => (n.data?.nodeType || n.type) !== "layout");

  const syntheticEdges: Edge[] = [];
  const seenConnections = new Set<string>();

  // 3. TRANSITIVE ROUTE STITCHER: Connect nested pages/sub-layouts to their closest parent layout
  nonLayoutNodes.forEach((node) => {
    let closestParentLayout: Node | null = null;
    let deepestMatchLength = -1;

    layoutNodes.forEach((layout) => {
      // Check if the current node file is nested inside the parent layout's directory path
      const layoutDir = layout.id.replace("layout.tsx", "");
      if (node.id.startsWith(layoutDir) && node.id !== layout.id) {
        if (layoutDir.length > deepestMatchLength) {
          deepestMatchLength = layoutDir.length;
          closestParentLayout = layout;
        }
      }
    });

    // Stitch a clean hierarchy line from the structural layout shell down to the active route view
    if (closestParentLayout) {
      const parent: Node = closestParentLayout;
      const connectionId = `route-nest|${parent.id}→${node.id}`;
      
      if (!seenConnections.has(connectionId)) {
        seenConnections.add(connectionId);
        syntheticEdges.push({
          id: connectionId,
          source: parent.id,
          target: node.id,
          type: "elkEdge",
          animated: false,
          style: {
            stroke: "#60a5fa", // High-visibility blue layout branch line
            strokeWidth: 2,
            opacity: 0.8,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#60a5fa",
            width: 14,
            height: 10,
          },
          label: "mounts view",
        });
      }
    }
  });

  // 4. Nested Layout Stitcher: Connect sub-layouts cleanly back to their parent app layouts
  layoutNodes.forEach((subLayout) => {
    let closestParentLayout: Node | null = null;
    let deepestMatchLength = -1;

    layoutNodes.forEach((parentLayout) => {
      const parentDir = parentLayout.id.replace("layout.tsx", "");
      if (subLayout.id.startsWith(parentDir) && subLayout.id !== parentLayout.id) {
        if (parentDir.length > deepestMatchLength) {
          deepestMatchLength = parentDir.length;
          closestParentLayout = parentLayout;
        }
      }
    });

    if (closestParentLayout) {
      const parent: Node = closestParentLayout;
      const connectionId = `layout-nest|${parent.id}→${subLayout.id}`;
      
      if (!seenConnections.has(connectionId)) {
        seenConnections.add(connectionId);
        syntheticEdges.push({
          id: connectionId,
          source: parent.id,
          target: subLayout.id,
          type: "elkEdge",
          style: {
            stroke: "#818cf8", // Indigo track line for compound layouts
            strokeWidth: 2,
            strokeDasharray: "4 4",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#818cf8",
            width: 14,
            height: 10,
          },
          label: "nested layout",
        });
      }
    }
  });

  // 5. Inject clean layout labels showing route targets natively inside node titles
  const enrichedNodes = routeNodes.map((node) => {
    const currentRoute = node.data?.route || "/";
    return {
      ...node,
      data: {
        ...node.data,
        // Appends the active URL directly into the display configurations
        label: `${node.data?.label || node.id} (${currentRoute})`,
      },
    };
  });

  return {
    nodes: enrichedNodes,
    edges: syntheticEdges,
  };
}
