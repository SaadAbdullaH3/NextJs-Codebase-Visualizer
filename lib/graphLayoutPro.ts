import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from 'reactflow';

const elk = new ELK();

export async function layoutGraphWithElkPro(
  nodes: Node[],
  edges: Edge[]
): Promise<{ nodes: Node[]; edgePaths: Map<string, any> }> {
  
  const elkNodesMap = new Map<string, any>();
  const nodeParentMap = new Map<string, string | undefined>();
  const rootElkNodes: any[] = [];
  
  const isClusterMode = nodes.some(n => n.type === "clusterNode" || n.type === "group" || n.type === "clusterNodePro");
  
  for (const node of nodes) {
    const isGroup = node.type === "clusterNode" || node.type === "group" || node.type === "clusterNodePro";
    const isExpanded = isGroup && !!node.data?.isExpanded;
    const isSubCluster = node.type === "subClusterNode";
    
    const labelText = node.data?.label || node.id || "";
    const labelLength = labelText.length;
    const dynamicFileWidth = Math.max(200, labelLength * 8 + 60);

    const elkNode: any = {
      id: node.id,
      layoutOptions: isSubCluster ? {
        "org.eclipse.elk.algorithm":                              "org.eclipse.elk.layered",
        "org.eclipse.elk.direction":                              "DOWN",
        "org.eclipse.elk.spacing.nodeNode":                       "60",
        "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers":  "70",
        "org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers":  "30",
        "org.eclipse.elk.spacing.edgeNode":                       "20",
        "org.eclipse.elk.padding":                                "[top=50,left=30,bottom=30,right=30]",
        "org.eclipse.elk.nodeSize.constraints":                   "COMPUTE_PADDING MINIMUM_SIZE",
        "org.eclipse.elk.nodeSize.minimum":                       "(160, 100)",
      } : isGroup ? {
        "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
        "org.eclipse.elk.direction": "DOWN",
        "org.eclipse.elk.edgeRouting": "ORTHOGONAL",
        "org.eclipse.elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "org.eclipse.elk.spacing.nodeNode": "100",
        "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "140",
        "org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers": "50",
        "org.eclipse.elk.spacing.edgeEdge": "25",
        "org.eclipse.elk.spacing.edgeNode": "35",
        "org.eclipse.elk.padding": "[top=100,left=60,bottom=60,right=60]",
        ...(isExpanded ? {
          "org.eclipse.elk.nodeSize.constraints": "COMPUTE_PADDING MINIMUM_SIZE",
          "org.eclipse.elk.nodeSize.minimum": "(280, 240)"
        } : {})
      } : undefined,
      children: [],
      edges: [],
    };

    if (isGroup && !isSubCluster) {
      elkNode.layoutOptions = elkNode.layoutOptions || {};
      elkNode.layoutOptions["org.eclipse.elk.margins"] = "[top=120, left=120, bottom=120, right=120]";
    }

    if (!isExpanded && !isSubCluster) {
      elkNode.width = isGroup ? (Number(node.style?.width) || 240) : dynamicFileWidth;
      elkNode.height = isGroup ? (Number(node.style?.height) || 85) : 55;
    }

    if (node.type === "fileNodePro") {
      const nodeW = elkNode.width || 200;
      const nodeH = elkNode.height || 55;
      const inCount  = node.data?.inPortCount  ?? 0;
      const outCount = node.data?.outPortCount ?? 0;

      if (inCount > 0 || outCount > 0) {
        elkNode.ports = elkNode.ports || [];

        for (let i = 0; i < inCount; i++) {
          const xFraction = (i + 1) / (inCount + 1);
          elkNode.ports.push({
            id: `${node.id}.port-in-${i}-of-${inCount}`,
            x:  nodeW * xFraction,
            y:  0,
            properties: { "org.eclipse.elk.port.side": "NORTH" },
          });
        }

        for (let i = 0; i < outCount; i++) {
          const xFraction = (i + 1) / (outCount + 1);
          elkNode.ports.push({
            id: `${node.id}.port-out-${i}-of-${outCount}`,
            x:  nodeW * xFraction,
            y:  nodeH,
            properties: { "org.eclipse.elk.port.side": "SOUTH" },
          });
        }

        elkNode.layoutOptions = elkNode.layoutOptions || {};
        elkNode.layoutOptions["org.eclipse.elk.portConstraints"] = "FIXED_POS";
      }
    }

    const approxW = isExpanded ? 300 : (Number(node.style?.width) || 240);
    const approxH = isExpanded ? 250 : (Number(node.style?.height) || 85);

    if (isGroup && !isSubCluster) {
      elkNode.ports = [
        { id: `${node.id}.port-right-out`, x: approxW,     y: approxH * 0.5, properties: { "org.eclipse.elk.port.side": "EAST" } },
        { id: `${node.id}.port-left-in`,   x: 0,           y: approxH * 0.5, properties: { "org.eclipse.elk.port.side": "WEST" } },
        { id: `${node.id}.port-top-in`,    x: approxW / 2, y: 0, properties: { "org.eclipse.elk.port.side": "NORTH" } },
        { id: `${node.id}.port-bottom-out`,x: approxW / 2, y: approxH, properties: { "org.eclipse.elk.port.side": "SOUTH" } },
      ];
      elkNode.layoutOptions = {
        ...elkNode.layoutOptions,
        "org.eclipse.elk.portConstraints": "FIXED_POS",
      };
    }

    elkNodesMap.set(node.id, elkNode);
    nodeParentMap.set(node.id, node.parentId);
  }

  for (const node of nodes) {
    const elkNode = elkNodesMap.get(node.id);
    if (node.parentId) {
      const parentElkNode = elkNodesMap.get(node.parentId);
      if (parentElkNode) {
        parentElkNode.children.push(elkNode);
      } else {
        rootElkNodes.push(elkNode);
      }
    } else {
      rootElkNodes.push(elkNode);
    }
  }

  const knownElkNodeIds = new Set(nodes.map(n => n.id));
  const rootElkEdges: any[] = [];
  const activeTrunks = new Set<string>();

  const getRootCluster = (id: string) => {
    let parent = nodeParentMap.get(id);
    while (parent && !parent.startsWith("cluster-")) {
      parent = nodeParentMap.get(parent);
    }
    return parent || (id.startsWith("cluster-") ? id : undefined);
  };

  const getLCA = (src: string, tgt: string) => {
    const srcAncestors = new Set<string>();
    let curr = nodeParentMap.get(src);
    while (curr) { srcAncestors.add(curr); curr = nodeParentMap.get(curr); }
    curr = nodeParentMap.get(tgt);
    while (curr) { if (srcAncestors.has(curr)) return curr; curr = nodeParentMap.get(curr); }
    return undefined;
  };

  for (const edge of edges) {
    if (!knownElkNodeIds.has(edge.source) || !knownElkNodeIds.has(edge.target)) continue;

    const sourceRoot = getRootCluster(edge.source);
    const targetRoot = getRootCluster(edge.target);

    if (isClusterMode && sourceRoot && targetRoot && sourceRoot !== targetRoot) {
      const outPort = `${sourceRoot}.port-right-out`;
      const inPort = `${targetRoot}.port-left-in`;
      const trunkId = `trunk-${sourceRoot}-->${targetRoot}`;

      if (!edge.source.startsWith("cluster-")) {
        const srcFolder = elkNodesMap.get(sourceRoot);
        if (srcFolder) {
          srcFolder.edges.push({ id: `${edge.id}-stream-out`, sources: [edge.source + ((edge as any).sourceHandle ? `.${(edge as any).sourceHandle}` : "")], targets: [outPort] });
        }
      }

      if (!activeTrunks.has(trunkId)) {
        activeTrunks.add(trunkId);
        rootElkEdges.push({ id: trunkId, sources: [outPort], targets: [inPort] });
      }

      if (!edge.target.startsWith("cluster-")) {
        const destFolder = elkNodesMap.get(targetRoot);
        if (destFolder) {
          destFolder.edges.push({ id: `${edge.id}-stream-in`, sources: [inPort], targets: [edge.target + ((edge as any).targetHandle ? `.${(edge as any).targetHandle}` : "")] });
        }
      }
      continue;
    }

    const elkEdge: any = {
      id:      edge.id,
      sources: [
        edge.source + ((edge as any).sourceHandle ? `.${(edge as any).sourceHandle}` : "")
      ],
      targets: [
        edge.target + ((edge as any).targetHandle ? `.${(edge as any).targetHandle}` : "")
      ],
    };

    const lca = getLCA(edge.source, edge.target);
    if (lca) {
      const parentElkNode = elkNodesMap.get(lca);
      if (parentElkNode) {
        parentElkNode.edges.push(elkEdge);
        continue;
      }
    }
    
    rootElkEdges.push(elkEdge);
  }

  const graph = {
    id: "root",
    layoutOptions: {
      "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
      "org.eclipse.elk.direction": "DOWN",
      "org.eclipse.elk.edgeRouting": "ORTHOGONAL", 
      "org.eclipse.elk.layered.mergeEdges": "false", 
      "org.eclipse.elk.portConstraints": "FIXED_SIDE",
      "org.eclipse.elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "org.eclipse.elk.spacing.nodeNode": "280",
      "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "260",
      "org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers": "80",
      "org.eclipse.elk.spacing.componentComponent": "280",
      "org.eclipse.elk.spacing.edgeEdge": "24",
      "org.eclipse.elk.spacing.edgeNode": "45"
    },
    children: rootElkNodes,
    edges: rootElkEdges, 
  };

  try {
    const layoutedGraph = await elk.layout(graph);
    const positionMap = new Map<string, { x: number; y: number; width?: number; height?: number }>();
    
    const traverse = (nodeList: any[]) => {
      for (const child of nodeList) {
        if (child.x !== undefined && child.y !== undefined) {
          positionMap.set(child.id, { x: child.x, y: child.y, width: child.width, height: child.height });
        }
        if (child.children && child.children.length > 0) {
          traverse(child.children);
        }
      }
    };

    if (layoutedGraph.children) {
      traverse(layoutedGraph.children);
    }

    const rawPaths = new Map<string, any>();
    
    const collectRawPaths = (nodeList: any[], accumulatedX = 0, accumulatedY = 0) => {
      for (const node of nodeList) {
        const layoutData = positionMap.get(node.id);
        const currentAbsoluteX = accumulatedX + (layoutData?.x || 0);
        const currentAbsoluteY = accumulatedY + (layoutData?.y || 0);

        if (node.edges) {
          for (const elkEdge of node.edges) {
            const section = elkEdge.sections?.[0];
            if (section) {
              rawPaths.set(elkEdge.id, {
                startPoint: { x: section.startPoint.x + currentAbsoluteX, y: section.startPoint.y + currentAbsoluteY },
                bendPoints: (section.bendPoints || []).map((p: any) => ({ x: p.x + currentAbsoluteX, y: p.y + currentAbsoluteY })),
                endPoint: { x: section.endPoint.x + currentAbsoluteX, y: section.endPoint.y + currentAbsoluteY }
              });
            }
          }
        }
        if (node.children && node.children.length > 0) {
          collectRawPaths(node.children, currentAbsoluteX, currentAbsoluteY);
        }
      }
    };

    if (layoutedGraph.children) collectRawPaths(layoutedGraph.children, 0, 0);

    if (layoutedGraph.edges) {
      for (const elkEdge of layoutedGraph.edges) {
        const section = elkEdge.sections?.[0];
        if (section) {
          rawPaths.set(elkEdge.id, { startPoint: section.startPoint, bendPoints: section.bendPoints || [], endPoint: section.endPoint });
        }
      }
    }

    const edgePaths = new Map<string, any>();

    for (const edge of edges) {
      const sourceRoot = getRootCluster(edge.source);
      const targetRoot = getRootCluster(edge.target);

      if (isClusterMode && sourceRoot && targetRoot && sourceRoot !== targetRoot) {
        const segmentOut = rawPaths.get(`${edge.id}-stream-out`);
        const segmentTrunk = rawPaths.get(`trunk-${sourceRoot}-->${targetRoot}`);
        const segmentIn = rawPaths.get(`${edge.id}-stream-in`);

        if (segmentTrunk) {
          const stitchedBends: any[] = [];
          let finalStart = segmentTrunk.startPoint;
          let finalEnd = segmentTrunk.endPoint;

          if (segmentOut) {
            finalStart = segmentOut.startPoint;
            stitchedBends.push(...(segmentOut.bendPoints || []), segmentOut.endPoint);
          }
          
          stitchedBends.push(...(segmentTrunk.bendPoints || []));

          if (segmentIn) {
            finalEnd = segmentIn.endPoint;
            stitchedBends.push(segmentTrunk.endPoint, ...(segmentIn.bendPoints || []));
          }

          edgePaths.set(edge.id, {
            startPoint: finalStart,
            bendPoints: stitchedBends,
            endPoint: finalEnd
          });
        } else {
          const fallback = rawPaths.get(edge.id);
          if (fallback) {
            edgePaths.set(edge.id, fallback);
          } else {
            edgePaths.set(edge.id, {
              startPoint: { x: nodeParentMap.get(edge.source) ? 0 : 0, y: 0 },
              bendPoints: [],
              endPoint: { x: 0, y: 0 }
            });
          }
        }
      } else {
        const standardPath = rawPaths.get(edge.id);
        if (standardPath) {
          edgePaths.set(edge.id, standardPath);
        } else {
          edgePaths.set(edge.id, {
            startPoint: { x: nodeParentMap.get(edge.source) ? 0 : 0, y: 0 },
            bendPoints: [],
            endPoint: { x: 0, y: 0 }
          });
        }
      }
    }

    const mappedNodes = nodes.map((node) => {
      const isExpandedGroup = (node.type === "clusterNode" || node.type === "group" || node.type === "clusterNodePro") && !!node.data?.isExpanded;
      const isSub = node.type === "subClusterNode";
      const layoutData = positionMap.get(node.id);
      
      if (layoutData) {
        const mappedStyle = { ...node.style };
        if (isExpandedGroup || isSub) {
          if (layoutData.width) mappedStyle.width = layoutData.width;
          if (layoutData.height) mappedStyle.height = layoutData.height;
        } else if (node.type === "custom" || node.type === "fileNodePro") {
          mappedStyle.width = Number(node.style?.width) || (positionMap.get(node.id)?.width || 180);
        }

        return { ...node, position: { x: layoutData.x, y: layoutData.y }, style: mappedStyle };
      }
      return node;
    });

    return { nodes: mappedNodes, edgePaths };

  } catch (error) {
    console.error("ELK Layout Engine Error:", error);
    return { nodes, edgePaths: new Map() };
  }
}
