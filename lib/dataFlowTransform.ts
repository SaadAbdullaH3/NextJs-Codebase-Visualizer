import { Node, Edge, MarkerType } from "reactflow";

const DATAFLOW_EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  "revalidates": { stroke: "#a78bfa", strokeDasharray: "6 3" }, // purple dashed
  "data-fetch":  { stroke: "#06b6d4", strokeDasharray: "3 3" }, // cyan dotted
  "call":        { stroke: "#fb923c", strokeDasharray: "8 4" }, // orange call style
  "render":      { stroke: "#60a5fa" },                         // blue render style
};

/**
 * Builds the Data Flow graph by:
 * 1. Filtering nodes to data-moving components (and forcing utility fetch engines)
 * 2. Connecting Server Actions directly to the views refreshed by data tags
 * 3. Synthesizing data-fetch lines to visible components
 */
export function buildDataFlowGraph(
  baseNodes: Node[],
  baseEdges: Edge[]
): { nodes: Node[]; edges: Edge[] } {

  // 1. FILTER NODES: Force inclusion of data-relevant sub-modules regardless of sidebar checkbox settings
  const dataNodes = baseNodes.filter((node) => {
    const d = node.data;
    const type = d?.nodeType || node.type;
    return (
      type === "page"           ||
      type === "layout"         ||
      type === "server-action"  ||
      d?.hasServerAction        ||
      d?.hasFetch               ||
      node.id.includes("shopify/index.ts") || // Guarantees core fetch engine stays visible
      (d?.dbClients && d.dbClients.length > 0)
    );
  });

  const dataNodeIds = new Set(dataNodes.map((n) => n.id));

  // 2. Map structural connections where endpoints are active in our data layer
  const existingEdges = baseEdges.filter(
    (e) => dataNodeIds.has(e.source) && dataNodeIds.has(e.target)
  );

  const syntheticEdges: Edge[] = [];
  const seenSyntheticEdges = new Set<string>();

  const pageNodes = dataNodes.filter(
    (n) => (n.data?.nodeType || n.type) === "page" || (n.data?.nodeType || n.type) === "layout"
  );

  // Locate our core data engine node block for smart tag routing
  const shopifyEngineNode = dataNodes.find(n => n.id.includes("shopify/index.ts"));

  // 3. SYNTHESIZE REVALIDATION TRACK LANES
  for (const serverActionNode of dataNodes) {
    const paths: string[] = serverActionNode.data?.revalidatesPaths ?? [];
    const tags: string[] = serverActionNode.data?.revalidatesTags ?? [];
    const combinedTargets = [...paths, ...tags];

    if (combinedTargets.length === 0) continue;

    for (const rawPath of combinedTargets) {
      const path = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;

      // SMART DATA-TAG ROUTING: If the target purges a data tag, link it to every view consuming our data engine
      if (path.toLowerCase().includes("cart") && shopifyEngineNode) {
        pageNodes.forEach((pageNode) => {
          // Check if this page or layout imports data from our shopify file layer
          const usesShopifyData = baseEdges.some(e => e.source === pageNode.id && e.target === shopifyEngineNode.id);
          
          if (usesShopifyData || pageNode.id.includes("layout.tsx")) {
            const syntheticId = `revalidates|${serverActionNode.id}→${pageNode.id}`;
            if (!seenSyntheticEdges.has(syntheticId)) {
              seenSyntheticEdges.add(syntheticId);
              syntheticEdges.push({
                id: syntheticId,
                source: serverActionNode.id,
                target: pageNode.id,
                type: "elkEdge",
                animated: true,
                style: {
                  stroke: DATAFLOW_EDGE_STYLES["revalidates"].stroke,
                  strokeDasharray: DATAFLOW_EDGE_STYLES["revalidates"].strokeDasharray,
                  strokeWidth: 2,
                  opacity: 0.95,
                },
                markerEnd: { type: MarkerType.ArrowClosed, color: "#a78bfa", width: 14, height: 10 },
                data: { edgeType: "revalidates" },
                label: `↺ tag: ${path}`,
              });
            }
          }
        });
        continue;
      }

      // Fallback: Default path literal string matching
      for (const pageNode of pageNodes) {
        const rawRoute: string = pageNode.data?.route || "";
        const route = rawRoute.endsWith('/') ? rawRoute.slice(0, -1) : rawRoute;
        
        const matches =
          route === path ||
          route.startsWith(path + "/") ||
          (path === "" && route === "") ||
          path === "/";

        if (!matches) continue;

        const syntheticId = `revalidates|${serverActionNode.id}→${pageNode.id}`;
        if (seenSyntheticEdges.has(syntheticId)) continue;
        seenSyntheticEdges.add(syntheticId);

        syntheticEdges.push({
          id: syntheticId,
          source: serverActionNode.id,
          target: pageNode.id,
          type: "elkEdge",
          animated: true,
          style: {
            stroke: DATAFLOW_EDGE_STYLES["revalidates"].stroke,
            strokeDasharray: DATAFLOW_EDGE_STYLES["revalidates"].strokeDasharray,
            strokeWidth: 1.5,
            opacity: 0.85,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#a78bfa", width: 14, height: 10 },
          data: { edgeType: "revalidates" },
          label: `↺ path: ${path}`,
        });
      }
    }
  }

  // 4. SYNTHESIZE DATA-FETCH CONNECTIONS
  for (const fetchNode of dataNodes) {
    if (!fetchNode.data?.hasFetch) continue;

    for (const edge of baseEdges) {
      if (edge.target !== fetchNode.id) continue;
      if (!dataNodeIds.has(edge.source)) continue;

      const syntheticId = `data-fetch|${edge.source}→${fetchNode.id}`;
      if (seenSyntheticEdges.has(syntheticId)) continue;
      seenSyntheticEdges.add(syntheticId);

      syntheticEdges.push({
        id: syntheticId,
        source: edge.source,
        target: fetchNode.id,
        type: "elkEdge",
        style: {
          stroke: DATAFLOW_EDGE_STYLES["data-fetch"].stroke,
          strokeDasharray: DATAFLOW_EDGE_STYLES["data-fetch"].strokeDasharray,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4", width: 14, height: 10 },
        data: { edgeType: "data-fetch" },
        label: "📡 fetches data",
      });
    }
  }

  // 5. Build output semantic data badges array passes
  const enrichedNodes = dataNodes.map((node) => {
    const d = node.data;
    const type = d?.nodeType || node.type;
    const dataRoles: string[] = [];

    if (d?.hasFetch || node.id.includes("shopify/index.ts")) dataRoles.push("fetch");
    if (d?.dbClients?.length > 0)                             dataRoles.push("db");
    if (d?.hasServerAction || type === "server-action")       dataRoles.push("action");
    if (d?.revalidatesPaths?.length > 0 || d?.revalidatesTags?.length > 0) dataRoles.push("revalidates");

    return {
      ...node,
      data: { ...node.data, dataRoles },
    };
  });

  return {
    nodes: enrichedNodes,
    edges: [...existingEdges, ...syntheticEdges],
  };
}
