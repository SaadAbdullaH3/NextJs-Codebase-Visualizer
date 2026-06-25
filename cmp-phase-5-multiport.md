# CMP-5 — Distributed Multi-Port Edge Distribution
## Agentic Implementation Prompt for Antigravity

---

## Mission

Fix the congested arrow pile-up on high-connectivity nodes (Image 1: `auth` node with 12
incoming edges all converging at one point). Spread each edge's attachment point evenly
across the node's top (incoming) and bottom (outgoing) edges so every connection is
individually visible and clickable.

```
BEFORE (all 12 arrows pile at center):      AFTER (evenly distributed):

         ▼▼▼▼▼▼▼▼▼▼▼▼                       ▼  ▼  ▼  ▼  ▼  ▼
    ┌──────────────────┐                ┌──────────────────────┐
    │       auth       │                │        auth          │
    │     UTILITY      │                │      UTILITY         │
    └──────────────────┘                └──────────────────────┘
                                           ▼  ▼  ▼  ▼  ▼  ▼
```

---

## Architecture

The solution has three interlocked parts:

1. **Topology pre-pass** in `buildClusteredFlowPro()` — scan all edges and assign each
   edge a unique port index on its source and target nodes
2. **Dynamic Handle rendering** in `FileNodePro.tsx` — render one Handle per port slot,
   evenly spaced across the node's top/bottom edge
3. **ELK port registration** in `graphLayoutPro.ts` — tell ELK exactly where each port
   is so it routes edges to the right positions

All three parts must be in sync: the same port ID string must be used in all three.

**Port ID formula:**
```
"port-in-{index}-of-{totalPorts}"   // target handle (incoming edge)
"port-out-{index}-of-{totalPorts}"  // source handle (outgoing edge)
```

---

## Files to Modify / Create

| Action | File |
|---|---|
| MODIFY | `lib/clusterTransformPro.ts` — add topology pre-pass |
| CREATE | `components/pro/FileNodePro.tsx` |
| MODIFY | `components/pro/index.ts` — export FileNodePro |
| MODIFY | `lib/graphLayoutPro.ts` — register distributed ports in ELK |
| MODIFY | `components/GraphCanvas.tsx` — register fileNodePro type |

---

## Step 1 — Topology Pre-Pass in clusterTransformPro.ts

Add this function and call it at the start of `buildClusteredFlowPro()`,
BEFORE constructing final nodes and edges:

```typescript
/**
 * Assigns each edge a unique handle slot on its source and target node.
 * Returns maps that associate each edge ID with its port assignment.
 */
function computePortTopology(edges: Edge[]): {
  edgeSourcePortMap: Map<string, string>; // edgeId → "port-out-{i}-of-{n}"
  edgeTargetPortMap: Map<string, string>; // edgeId → "port-in-{i}-of-{n}"
  nodeOutPortCount: Map<string, number>;  // nodeId → outgoing edge count
  nodeInPortCount: Map<string, number>;   // nodeId → incoming edge count
} {
  // Count edges per node
  const nodeOutCount = new Map<string, number>();
  const nodeInCount  = new Map<string, number>();

  for (const edge of edges) {
    nodeOutCount.set(edge.source, (nodeOutCount.get(edge.source) ?? 0) + 1);
    nodeInCount.set( edge.target, (nodeInCount.get( edge.target) ?? 0) + 1);
  }

  // Assign an incrementing index to each edge for its source and target
  const sourceTracker = new Map<string, number>(); // nodeId → next port index
  const targetTracker = new Map<string, number>();
  const edgeSourcePortMap = new Map<string, string>();
  const edgeTargetPortMap = new Map<string, string>();

  for (const edge of edges) {
    // Source port
    const srcIdx = sourceTracker.get(edge.source) ?? 0;
    const srcTotal = nodeOutCount.get(edge.source) ?? 1;
    edgeSourcePortMap.set(edge.id, `port-out-${srcIdx}-of-${srcTotal}`);
    sourceTracker.set(edge.source, srcIdx + 1);

    // Target port
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
```

**Apply the port topology to nodes and edges before returning from buildClusteredFlowPro:**

```typescript
// At the point where finalEdges are being built (for non-trunk, intra-cluster edges):
const { edgeSourcePortMap, edgeTargetPortMap, nodeOutPortCount, nodeInPortCount }
  = computePortTopology(baseEdges);

// When pushing each intra-cluster edge:
finalEdges.push({
  ...edge,
  sourceHandle: edgeSourcePortMap.get(edge.id),
  targetHandle: edgeTargetPortMap.get(edge.id),
  data: {
    ...((edge as any).data ?? {}),
    edgeType: (edge as any).type ?? "import-only",
  },
});

// When pushing each file node, add port counts to its data:
finalNodes.push({
  ...child,
  type: "fileNodePro",    // ← Pro file node type
  parentId: ...,
  data: {
    ...child.data,
    inPortCount:  nodeInPortCount.get(child.id)  ?? 0,
    outPortCount: nodeOutPortCount.get(child.id) ?? 0,
  },
});
```

**Note on trunk edges**: Trunk edges (inter-cluster) use fixed cluster port handles
(`port-right-out`, `port-left-in`) already set in CMP-3. Do NOT apply the distributed
port topology to trunk edges — only to intra-cluster file-to-file edges.

---

## Step 2 — Create components/pro/FileNodePro.tsx

This is the Pro version of `CustomNode.tsx`. It renders dynamic distributed handles
based on `data.inPortCount` and `data.outPortCount`. Copy the visual design from
`CustomNode.tsx` and add the handle distribution logic.

```tsx
// components/pro/FileNodePro.tsx
"use client";

import { Handle, Position, NodeProps } from "reactflow";

// Generate evenly spaced percentage positions for N handles across a node edge
function distributePositions(count: number): string[] {
  if (count === 0) return [];
  if (count === 1) return ["50%"];
  return Array.from({ length: count }, (_, i) =>
    `${((i + 1) / (count + 1)) * 100}%`
  );
}

export function FileNodePro({ data, selected }: NodeProps) {
  const {
    label,
    nodeType,
    inPortCount  = 0,
    outPortCount = 0,
    // overlay data (from applyBoundaryOverlay / applyHeatmapOverlay)
    boundaryRole,
    heatColor,
    blastRadius,
    boundarySubtreeCount,
    // standard node data
    filePath,
  } = data;

  const inPositions  = distributePositions(inPortCount);
  const outPositions = distributePositions(outPortCount);

  // ── Compute visual styles (copy from CustomNode.tsx + overlay additions) ──

  const NODE_TYPE_COLORS: Record<string, { bg: string; label: string }> = {
    "page":               { bg: "#2563eb", label: "#bfdbfe" },
    "layout":             { bg: "#6366f1", label: "#c7d2fe" },
    "client-component":   { bg: "#d97706", label: "#fde68a" },
    "server-component":   { bg: "#16a34a", label: "#bbf7d0" },
    "server-action":      { bg: "#dc2626", label: "#fecaca" },
    "api-route":          { bg: "#ea580c", label: "#fed7aa" },
    "middleware":         { bg: "#9333ea", label: "#e9d5ff" },
    "hook":               { bg: "#0d9488", label: "#99f6e4" },
    "utility":            { bg: "#374151", label: "#d1d5db" },
    "context":            { bg: "#0891b2", label: "#a5f3fc" },
    "unknown":            { bg: "#374151", label: "#d1d5db" },
  };

  const typeStyle = NODE_TYPE_COLORS[nodeType] ?? NODE_TYPE_COLORS["unknown"];

  // Overlay border (boundary or heatmap — same logic as CustomNode.tsx overlays)
  const overlayBorder = heatColor
    ? `2px solid ${heatColor}`
    : boundaryRole === "client-root"
    ? "2px solid #c2410c"
    : boundaryRole === "server-action"
    ? "2px solid #9333ea"
    : undefined;

  return (
    <div
      style={{
        position:        "relative",
        zIndex:          10,
        backgroundColor: typeStyle.bg,
        border:          overlayBorder ?? `1px solid ${typeStyle.bg}`,
        borderRadius:    8,
        padding:         "8px 12px",
        minWidth:        180,
        minHeight:       50,
        boxSizing:       "border-box",
        outline:         selected ? "2px solid #ffffff44" : undefined,
        outlineOffset:   selected ? 2 : undefined,
      }}
    >
      {/* INCOMING (target) handles — top edge, evenly distributed */}
      {inPositions.map((left, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Top}
          id={`port-in-${i}-of-${inPortCount}`}
          style={{
            left,
            top:             -5,
            width:           8,
            height:          8,
            borderRadius:    "50%",
            backgroundColor: "#94a3b8",
            border:          "1px solid #1e293b",
            transform:       "translateX(-50%)",
          }}
        />
      ))}

      {/* Node label */}
      <div style={{ fontWeight: 700, fontSize: 13, color: "#ffffff", marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 9,
          color: typeStyle.label,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {nodeType.replace(/-/g, " ")}
      </div>

      {/* Overlay badges (same logic as CustomNode.tsx — copy from there) */}
      {/* ... boundary badge, heatmap badge ... */}

      {/* OUTGOING (source) handles — bottom edge, evenly distributed */}
      {outPositions.map((left, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Bottom}
          id={`port-out-${i}-of-${outPortCount}`}
          style={{
            left,
            bottom:          -5,
            width:           8,
            height:          8,
            borderRadius:    "50%",
            backgroundColor: "#64748b",
            border:          "1px solid #1e293b",
            transform:       "translateX(-50%)",
          }}
        />
      ))}

      {/* Heatmap blast badge — top right corner */}
      {heatColor && blastRadius !== undefined && (
        <div
          style={{
            position: "absolute", top: 2, right: 4,
            fontSize: 9, fontWeight: 700,
            color: heatColor,
            backgroundColor: `${heatColor}22`,
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          ⚡ {blastRadius}
        </div>
      )}
    </div>
  );
}
```

---

## Step 3 — Register Distributed Ports in graphLayoutPro.ts

In `graphLayoutPro.ts`, the node initialization step must register ELK ports matching
the handles defined in `FileNodePro.tsx`. ELK needs these positions to route edges to
the correct attachment points:

```typescript
// In graphLayoutPro.ts, Step 1 (node initialization loop):
if (node.type === "fileNodePro") {
  const nodeW = elkNode.width || 200;
  const nodeH = elkNode.height || 55;
  const inCount  = node.data?.inPortCount  ?? 0;
  const outCount = node.data?.outPortCount ?? 0;

  if (inCount > 0 || outCount > 0) {
    elkNode.ports = [];

    // Incoming ports — NORTH side (top)
    for (let i = 0; i < inCount; i++) {
      const xFraction = (i + 1) / (inCount + 1);
      elkNode.ports.push({
        id: `${node.id}.port-in-${i}-of-${inCount}`,
        x:  nodeW * xFraction,
        y:  0,
        properties: { "org.eclipse.elk.port.side": "NORTH" },
      });
    }

    // Outgoing ports — SOUTH side (bottom)
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
```

And wire the sourceHandle/targetHandle into the ELK edge definitions:

```typescript
// In Step 3 (edge construction in graphLayoutPro.ts):
const elkEdge: any = {
  id:      edge.id,
  sources: [
    edge.source +
    ((edge as any).sourceHandle ? `.${(edge as any).sourceHandle}` : "")
  ],
  targets: [
    edge.target +
    ((edge as any).targetHandle ? `.${(edge as any).targetHandle}` : "")
  ],
};
```

---

## Step 4 — Register FileNodePro in GraphCanvas.tsx

```typescript
import { FileNodePro } from "@/components/pro/FileNodePro";

const NODE_TYPES = {
  ...defaultNodeTypes,
  clusterNode:    ClusterNode,
  clusterNodePro: ClusterNodePro,
  subClusterNode: SubClusterNode,
  fileNodePro:    FileNodePro,    // ← ADD
};
```

---

## Guard Rails

- **DO NOT** apply distributed ports to TRUNK edges (cluster-to-cluster). Those use the
  fixed cluster port handles from CMP-3.
- **DO NOT** apply distributed ports to STUB edges (egress/ingress to cluster boundary).
  Those also use fixed cluster port handles.
- **DO NOT** use this system in existing Cluster Mode — only `cluster-pro` mode.
- **DO NOT** use `distributePositions()` on nodes with 0 incoming or outgoing edges.
  An isolated node has no edges and needs no handles at all (React Flow defaults are fine).
- The port ID strings must be IDENTICAL across all three systems:
  `buildClusteredFlowPro` (topology), `FileNodePro` (handles), `graphLayoutPro` (ELK ports).
  Any mismatch causes ELK to fall back to default attachment, silently breaking distribution.

---

## Acceptance Criteria

| Test | Expected |
|---|---|
| `auth` node with 12 incoming edges | All 12 edges attach at distinct evenly-spaced top-edge positions; all individually clickable |
| `post`, `stripe`, `toc`, `session` nodes (Image 1) | No arrow pile-up; each incoming edge has its own handle dot |
| Single-edge nodes | One centered handle at top and one at bottom — unchanged from normal |
| ELK routing | Edges route to the correct distributed port positions (no crossing between same-node edge paths) |
| Existing Cluster Mode | Single center handle behavior unchanged |
| Overlay compatibility | Heatmap and Boundary overlays apply correctly to FileNodePro nodes |
| Click test | Every edge on a dense node (8+ connections) is individually hoverable and clickable |
| Node width | FileNodePro nodes with many ports are wide enough that handle dots don't overlap (min 8px spacing between handles) |
