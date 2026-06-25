/**
 * graphLayout.ts — Advanced Hierarchical Port-Bundling Engine for React Flow.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from 'reactflow';

const elk = new ELK();

export async function layoutGraphWithElk(
  nodes: Node[],
  edges: Edge[]
): Promise<{ nodes: Node[]; edgePaths: Map<string, any> }> {
  
  const elkNodesMap = new Map<string, any>();
  const nodeParentMap = new Map<string, string | undefined>();
  const rootElkNodes: any[] = [];
  
  // Detect view state mode to safeguard Full Graph Mode against modifications
  const isClusterMode = nodes.some(n => n.type === "clusterNode" || n.type === "group");
  
  // Step 1: Initialize ELK representation with Generous Padding & Border Gateways
  for (const node of nodes) {
    const isGroup = node.type === "clusterNode" || node.type === "group";
    const isExpanded = isGroup && !!node.data?.isExpanded;
    
    // CRLAP OVERLAP FIX: Calculate tailored widths based on character counts
    const labelText = node.data?.label || node.id || "";
    const labelLength = labelText.length;
    const dynamicFileWidth = Math.max(200, labelLength * 8 + 60);

    const elkNode: any = {
      id: node.id,
      layoutOptions: isGroup ? {
        "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
        "org.eclipse.elk.direction": "DOWN",
        "org.eclipse.elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "85",
        "elk.spacing.nodeNode": "45",
        "elk.spacing.edgeEdge": "25",
        "elk.layered.spacing.edgeNode": "30",
        "org.eclipse.elk.padding": "[top=100,left=60,bottom=60,right=60]",
        ...(isExpanded ? {
          "org.eclipse.elk.nodeSize.constraints": "COMPUTE_PADDING MINIMUM_SIZE",
          "org.eclipse.elk.nodeSize.minimum": "(280, 240)"
        } : {})
      } : undefined,
      children: [],
      edges: [],
      // RIVER ANALOGY PORTS: Configure high-level entry/exit gates on folder boundaries
      ports: (isGroup && isClusterMode) ? [
        { id: `${node.id}-port-north`, layoutOptions: { "org.eclipse.elk.port.side": "NORTH" } },
        { id: `${node.id}-port-south`, layoutOptions: { "org.eclipse.elk.port.side": "SOUTH" } }
      ] : undefined,
    };

    if (isGroup) {
      elkNode.layoutOptions = elkNode.layoutOptions || {};
      elkNode.layoutOptions["org.eclipse.elk.margins"] = "[top=120, left=120, bottom=120, right=120]";
    }

    if (!isExpanded) {
      // Prioritize recalculated font metrics for standard custom node files
      elkNode.width = isGroup ? (Number(node.style?.width) || 240) : dynamicFileWidth;
      elkNode.height = isGroup ? (Number(node.style?.height) || 85) : 55;
    }

    elkNodesMap.set(node.id, elkNode);
    nodeParentMap.set(node.id, node.parentId);
  }

  // Step 2: Assemble the nested parent-child hierarchy
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

  // Step 3: Distribute & Intercept Cross-Folder Paths into Port Streams
  const knownElkNodeIds = new Set(nodes.map(n => n.id));
  const rootElkEdges: any[] = [];
  const activeTrunks = new Set<string>();

  for (const edge of edges) {
    if (!knownElkNodeIds.has(edge.source) || !knownElkNodeIds.has(edge.target)) continue;

    const sourceParent = edge.source.startsWith("cluster-") ? edge.source : nodeParentMap.get(edge.source);
    const targetParent = edge.target.startsWith("cluster-") ? edge.target : nodeParentMap.get(edge.target);

    // River Bundling Logic: Route cross-folder lines through boundary ports
    if (isClusterMode && sourceParent && targetParent && sourceParent !== targetParent) {
      const outPort = `${sourceParent}-port-south`;
      const inPort = `${targetParent}-port-north`;
      const trunkId = `trunk-${sourceParent}-->${targetParent}`;

      // A. Source Stream: route from inner file node to parent output port if expanded
      if (!edge.source.startsWith("cluster-")) {
        const srcFolder = elkNodesMap.get(sourceParent);
        if (srcFolder) {
          srcFolder.edges.push({ id: `${edge.id}-stream-out`, sources: [edge.source], targets: [outPort] });
        }
      }

      // B. Shared Highway: route between parent ports on the global canvas
      if (!activeTrunks.has(trunkId)) {
        activeTrunks.add(trunkId);
        rootElkEdges.push({ id: trunkId, sources: [outPort], targets: [inPort] });
      }

      // C. Target Stream: route from parent input port to target inner file node if expanded
      if (!edge.target.startsWith("cluster-")) {
        const destFolder = elkNodesMap.get(targetParent);
        if (destFolder) {
          destFolder.edges.push({ id: `${edge.id}-stream-in`, sources: [inPort], targets: [edge.target] });
        }
      }
      continue;
    }

    // Baseline routing for flat mode and internal folder lines
    const elkEdge = { id: edge.id, sources: [edge.source], targets: [edge.target] };

    if (sourceParent && sourceParent === targetParent) {
      const parentElkNode = elkNodesMap.get(sourceParent);
      if (parentElkNode) {
        parentElkNode.edges.push(elkEdge);
        continue;
      }
    }
    rootElkEdges.push(elkEdge);
  }

  // Step 4: Define global layout options with explicit macro-tier spacing cushions
  const graph = {
    id: "root",
    layoutOptions: {
      "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
      "org.eclipse.elk.direction": "DOWN",
      "org.eclipse.elk.edgeRouting": "ORTHOGONAL", 
      "org.eclipse.elk.layered.mergeEdges": "false", 
      "org.eclipse.elk.portConstraints": "FIXED_SIDE", // Retained for correct port routing
      "org.eclipse.elk.hierarchyHandling": "INCLUDE_CHILDREN", // Retained to prevent crashes
      "org.eclipse.elk.spacing.nodeNode": "280",
      "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "260",  // vertical gap between cluster boxes
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

    // Step 4.5: Pull Raw Paths & Convert local offsets into absolute canvas space
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

    // Step 4.9: Dynamic 4-State Vector Path Stitching Accumulator
    const edgePaths = new Map<string, any>();

    for (const edge of edges) {
      const sourceParent = edge.source.startsWith("cluster-") ? edge.source : nodeParentMap.get(edge.source);
      const targetParent = edge.target.startsWith("cluster-") ? edge.target : nodeParentMap.get(edge.target);

      if (isClusterMode && sourceParent && targetParent && sourceParent !== targetParent) {
        const segmentOut = rawPaths.get(`${edge.id}-stream-out`);
        const segmentTrunk = rawPaths.get(`trunk-${sourceParent}-->${targetParent}`);
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

    // Step 5: Map computed coordinates back to React Flow nodes
    const mappedNodes = nodes.map((node) => {
      const isExpandedGroup = (node.type === "clusterNode" || node.type === "group") && !!node.data?.isExpanded;
      const layoutData = positionMap.get(node.id);
      
      if (layoutData) {
        const mappedStyle = { ...node.style };
        if (isExpandedGroup) {
          if (layoutData.width) mappedStyle.width = layoutData.width;
          if (layoutData.height) mappedStyle.height = layoutData.height;
        } else if (node.type === "custom") {
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
