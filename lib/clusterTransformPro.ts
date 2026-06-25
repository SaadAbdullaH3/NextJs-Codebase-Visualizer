// lib/clusterTransformPro.ts
import { Node, Edge } from "reactflow";
import { getDomainRole, getClusterKey } from "./clusterTransform";

export { buildRouteFlow } from "./clusterTransform";

export function getSubClusterKey(
  clusterKey: string,
  filePath: string
): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const prefix = clusterKey + "/";

  if (!normalized.startsWith(prefix)) return null;

  const remainder = normalized.slice(prefix.length);
  const parts = remainder.split("/");

  // If there is only one part (the filename itself), it's a root file
  if (parts.length <= 1) return null;

  // The first part after the cluster prefix is the sub-folder name
  return parts[0];
}

function shouldActivateSubSectors(children: Node[], clusterKey: string): boolean {
  if (children.length < 8) return false;

  const subFolders = new Set<string>();
  for (const child of children) {
    const filePath = (child.data?.filePath as string) || child.id;
    const subKey = getSubClusterKey(clusterKey, filePath);
    if (subKey !== null) subFolders.add(subKey);
  }

  return subFolders.size >= 3;
}

function computePortTopology(edges: Edge[]): {
  edgeSourcePortMap: Map<string, string>;
  edgeTargetPortMap: Map<string, string>;
  nodeOutPortCount: Map<string, number>;
  nodeInPortCount: Map<string, number>;
} {
  const nodeOutCount = new Map<string, number>();
  const nodeInCount  = new Map<string, number>();

  for (const edge of edges) {
    nodeOutCount.set(edge.source, (nodeOutCount.get(edge.source) ?? 0) + 1);
    nodeInCount.set( edge.target, (nodeInCount.get( edge.target) ?? 0) + 1);
  }

  const sourceTracker = new Map<string, number>();
  const targetTracker = new Map<string, number>();
  const edgeSourcePortMap = new Map<string, string>();
  const edgeTargetPortMap = new Map<string, string>();

  for (const edge of edges) {
    const srcIdx = sourceTracker.get(edge.source) ?? 0;
    const srcTotal = nodeOutCount.get(edge.source) ?? 1;
    edgeSourcePortMap.set(edge.id, `port-out-${srcIdx}-of-${srcTotal}`);
    sourceTracker.set(edge.source, srcIdx + 1);

    const tgtIdx = targetTracker.get(edge.target) ?? 0;
    const tgtTotal = nodeInCount.get(edge.target) ?? 1;
    edgeTargetPortMap.set(edge.id, `port-in-${tgtIdx}-of-${tgtTotal}`);
    targetTracker.set(edge.target, tgtIdx + 1);
  }

  return {
    edgeSourcePortMap,
    edgeTargetPortMap,
    nodeOutPortCount: nodeOutCount,
    nodeInPortCount:  nodeInCount,
  };
}

export function buildClusteredFlowPro(
  baseNodes: Node[],
  baseEdges: Edge[],
  expandedClusters: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const finalNodes: Node[] = [];
  const finalEdges: Edge[] = [];

  const clusters = new Map<string, Node[]>();
  
  for (const node of baseNodes) {
    const filePath = (node.data?.filePath as string) || node.id;
    const clusterKey = getClusterKey(filePath);
    
    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, []);
    }
    clusters.get(clusterKey)!.push(node);
  }

  const nodeToVisibleId = new Map<string, string>();

  const { edgeSourcePortMap, edgeTargetPortMap, nodeOutPortCount, nodeInPortCount } = computePortTopology(baseEdges);

  // A — Track active ports per cluster node
  const portActivity = new Map<string, { exits: string[]; entries: string[] }>();
  for (const edge of baseEdges) {
    const sourcePath = (baseNodes.find(n => n.id === edge.source)?.data?.filePath as string) || edge.source;
    const targetPath = (baseNodes.find(n => n.id === edge.target)?.data?.filePath as string) || edge.target;
    
    const sourceClusterKey = getClusterKey(sourcePath);
    const targetClusterKey = getClusterKey(targetPath);

    if (sourceClusterKey !== targetClusterKey) {
      const sourceClusterId = `cluster-${sourceClusterKey}`;
      const targetClusterId = `cluster-${targetClusterKey}`;
      
      if (!portActivity.has(sourceClusterId)) portActivity.set(sourceClusterId, { exits: [], entries: [] });
      portActivity.get(sourceClusterId)!.exits.push(edge.type || "default");
      
      if (!portActivity.has(targetClusterId)) portActivity.set(targetClusterId, { exits: [], entries: [] });
      portActivity.get(targetClusterId)!.entries.push(edge.type || "default");
    }
  }

  for (const [clusterKey, children] of clusters.entries()) {
    const isExpanded = expandedClusters.has(clusterKey);
    const parentId = `cluster-${clusterKey}`;
    const domainRole = getDomainRole(clusterKey);
    
    // B — Inject port data into cluster parent nodes
    const parentNode: Node = {
      id: parentId,
      type: "clusterNodePro",
      position: { x: 0, y: 0 },
      data: { 
        label: clusterKey, 
        isExpanded, 
        childCount: children.length, 
        domainRole,
        portExits: portActivity.get(parentId)?.exits ?? [],
        portEntries: portActivity.get(parentId)?.entries ?? [],
      },
      className: isExpanded 
        ? "react-flow__node-group"
        : "react-flow__node-group-collapsed",
      style: isExpanded 
        ? {}
        : { width: 220, height: 80 },
    };

    if (!isExpanded) {
      finalNodes.push(parentNode);
      for (const child of children) {
        nodeToVisibleId.set(child.id, parentId);
      }
      continue;
    }

    const shouldSubSector = shouldActivateSubSectors(children, clusterKey);

    if (!shouldSubSector) {
      for (const child of children) {
        finalNodes.push({
          ...child,
          type: "fileNodePro",
          parentId,
          extent: "parent",
          position: { x: 0, y: 0 },
          zIndex: 1,
          data: {
            ...child.data,
            inPortCount: nodeInPortCount.get(child.id) ?? 0,
            outPortCount: nodeOutPortCount.get(child.id) ?? 0,
          }
        });
        nodeToVisibleId.set(child.id, child.id);
      }
      finalNodes.push(parentNode);
      continue;
    }

    // ── Sub-Sector Path ──────────────────────────────────────────
    const subGroups = new Map<string, Node[]>();
    const rootFiles: Node[] = [];

    for (const child of children) {
      const filePath = (child.data?.filePath as string) || child.id;
      const subKey = getSubClusterKey(clusterKey, filePath);

      if (subKey === null) {
        rootFiles.push(child);
      } else {
        if (!subGroups.has(subKey)) subGroups.set(subKey, []);
        subGroups.get(subKey)!.push(child);
      }
    }

    finalNodes.push(parentNode);

    for (const [subKey, subChildren] of subGroups.entries()) {
      const subClusterId = `subcluster-${clusterKey}-${subKey}`;

      const subClusterNode: Node = {
        id: subClusterId,
        type: "subClusterNode",
        parentId: parentId,
        extent: "parent",
        position: { x: 0, y: 0 },
        zIndex: 1,
        data: {
          label: subKey,
          childCount: subChildren.length,
          parentClusterId: parentId,
        },
        style: { zIndex: 1 },
      };
      finalNodes.push(subClusterNode);

      for (const child of subChildren) {
        finalNodes.push({
          ...child,
          type: "fileNodePro",
          parentId: subClusterId,
          extent: "parent",
          position: { x: 0, y: 0 },
          zIndex: 2,
          data: {
            ...child.data,
            inPortCount: nodeInPortCount.get(child.id) ?? 0,
            outPortCount: nodeOutPortCount.get(child.id) ?? 0,
          }
        });
        nodeToVisibleId.set(child.id, child.id);
      }
    }

    for (const child of rootFiles) {
      finalNodes.push({
        ...child,
        type: "fileNodePro",
        parentId: parentId,
        extent: "parent",
        position: { x: 0, y: 0 },
        zIndex: 2,
        data: {
          ...child.data,
          inPortCount: nodeInPortCount.get(child.id) ?? 0,
          outPortCount: nodeOutPortCount.get(child.id) ?? 0,
        }
      });
      nodeToVisibleId.set(child.id, child.id);
    }
  }

  const edgeCounts = new Map<string, number>();
  const edgeMap = new Map<string, any>();
  const edgeTypes = new Map<string, Set<string>>();

  for (const edge of baseEdges) {
    const visibleSource = nodeToVisibleId.get(edge.source);
    const visibleTarget = nodeToVisibleId.get(edge.target);

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
      const sourcePath = (baseNodes.find(n => n.id === edge.source)?.data?.filePath as string) || edge.source;
      const targetPath = (baseNodes.find(n => n.id === edge.target)?.data?.filePath as string) || edge.target;
      const isTrunk = getClusterKey(sourcePath) !== getClusterKey(targetPath);

      edgeMap.set(aggregatedEdgeId, {
        ...edge,
        id: aggregatedEdgeId,
        source: visibleSource,
        target: visibleTarget,
        sourceHandle: isTrunk ? undefined : edgeSourcePortMap.get(edge.id),
        targetHandle: isTrunk ? undefined : edgeTargetPortMap.get(edge.id),
        data: { ...edge.data, isTrunk, edgeType: edge.type ?? "import-only" },
      });
    }
  }

  for (const [id, count] of edgeCounts.entries()) {
    const aggregatedEdge = edgeMap.get(id);
    const types = Array.from(edgeTypes.get(id) || []);
    
    if (aggregatedEdge) {
      if (types.length > 1) {
        aggregatedEdge.label = types.join(" | ");
        aggregatedEdge.style = {
          ...aggregatedEdge.style,
          stroke: "#a855f7",
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
