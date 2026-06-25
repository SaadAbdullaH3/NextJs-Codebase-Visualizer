# CMP-3 — Visible Square Port Indicators on Cluster Boundaries
## Agentic Implementation Prompt for Antigravity

---

## Visual Reference

From the reference image (Image 3 — AI-generated, reference only for port/trunk style):
Focus ONLY on: the small square "Port" markers at cluster boundaries where thick blue
trunk lines connect between containers. Everything else in that image should be ignored.

Target visual for Cluster Mode Pro:
```
┌─────── app ──────────────────────────────────────┐
│   [page]    [sitemap]    [app/layout]             │
│                                                   │
│                             ┌──┐  ← PORT square  │
└─────────────────────────────┤→ ├─────────────────┘
                              └──┘
                        ══════════════  ← thick trunk (3px, typed color)
                              ┌──┐
┌─────────────────────────────┤← ├─────────────────┐
│                             └──┘  ← PORT square  │
│   [utils]    [seo]    [queries/page]              │
└─────── lib ──────────────────────────────────────┘
```

---

## Mission

Replace the invisible handle connection points on cluster boxes in Cluster Mode Pro with
visually explicit square PORT badges that show exactly where inter-cluster trunk edges
attach. This turns the bus route from an invisible internal mechanism into a readable,
professional-looking connection system.

---

## Files to Create / Modify

| Action | File |
|---|---|
| CREATE | `components/pro/ClusterNodePro.tsx` |
| MODIFY | `components/pro/index.ts` — export ClusterNodePro instead of stub |
| MODIFY | `lib/clusterTransformPro.ts` — own implementation (no longer delegates) |
| MODIFY | `lib/graphLayoutPro.ts` — own implementation for port registration |

---

## Step 1 — Own Implementation of clusterTransformPro.ts

Replace the current stub (`export { buildClusteredFlow as buildClusteredFlowPro }`) with
a proper implementation. This is a copy of `buildClusteredFlow` from `clusterTransform.ts`
with Port data injected into cluster node data.

Copy the full `buildClusteredFlow` function body into `lib/clusterTransformPro.ts` and
rename it `buildClusteredFlowPro`. Then make these additions:

**A — Track active ports per cluster node:**

```typescript
// After computing trunkGroups (the inter-cluster edge groups),
// build a port activity map: clusterNodeId → { exits: EdgeType[], entries: EdgeType[] }

const portActivity = new Map<string, { exits: string[]; entries: string[] }>();

for (const [, group] of trunkGroups.entries()) {
  const { sourceClusterId, targetClusterId, edgeType } = group;

  if (!portActivity.has(sourceClusterId)) {
    portActivity.set(sourceClusterId, { exits: [], entries: [] });
  }
  portActivity.get(sourceClusterId)!.exits.push(edgeType);

  if (!portActivity.has(targetClusterId)) {
    portActivity.set(targetClusterId, { exits: [], entries: [] });
  }
  portActivity.get(targetClusterId)!.entries.push(edgeType);
}
```

**B — Inject port data into cluster parent nodes:**

When constructing each `parentNode`, add port activity to its data:

```typescript
const parentNode: Node = {
  id: parentId,
  type: "clusterNodePro",             // ← Pro type, not "clusterNode"
  position: { x: 0, y: 0 },
  data: {
    label: clusterKey,
    isExpanded,
    childCount: children.length,
    domainRole,
    // NEW: port activity data for rendering PORT squares
    portExits: portActivity.get(parentId)?.exits ?? [],
    portEntries: portActivity.get(parentId)?.entries ?? [],
  },
  style: isExpanded
    ? { zIndex: -1 }
    : { width: 240, height: 85 },
};
```

---

## Step 2 — Create components/pro/ClusterNodePro.tsx

```tsx
// components/pro/ClusterNodePro.tsx
"use client";

import { Handle, Position, NodeProps } from "reactflow";
import { useMemo } from "react";

// Dominant color for a set of edge types
function portColor(edgeTypes: string[]): string {
  if (edgeTypes.includes("render"))         return "#60a5fa"; // blue
  if (edgeTypes.includes("call"))           return "#fb923c"; // orange
  if (edgeTypes.includes("dynamic-import")) return "#c084fc"; // purple
  return "#9ca3af";                                           // grey (import-only)
}

function PortSquare({
  direction,
  edgeTypes,
  position,
  handleId,
}: {
  direction: "in" | "out";
  edgeTypes: string[];
  position: Position;
  handleId: string;
}) {
  const color = portColor(edgeTypes);
  const label = direction === "out" ? "→" : "←";

  return (
    <div
      style={{
        position: "absolute",
        // Positioning is handled by the Handle component below
        // This div is purely decorative — it sits inside the Handle's space
        width: 14,
        height: 14,
        backgroundColor: "#0f0f1a",
        border: `2px solid ${color}`,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 8,
        color,
        fontWeight: 700,
        zIndex: 20,
        pointerEvents: "none",
        transform: "translate(-50%, -50%)",
      }}
    >
      {label}
      <Handle
        type={direction === "out" ? "source" : "target"}
        position={position}
        id={handleId}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          opacity: 0,     // invisible — the Port square div above is the visual
          border: "none",
          background: "none",
          top: 0,
          left: 0,
          transform: "none",
        }}
      />
    </div>
  );
}

export function ClusterNodePro({ data }: NodeProps) {
  const {
    label,
    isExpanded,
    childCount,
    domainRole,
    portExits = [],
    portEntries = [],
  } = data;

  const hasExits   = portExits.length > 0;
  const hasEntries = portEntries.length > 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: "1px dashed rgba(100,120,180,0.4)",
        borderRadius: 8,
        backgroundColor: "rgba(15,15,26,0.7)",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Cluster header */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          padding: "8px 12px",
          borderBottom: isExpanded ? "1px solid rgba(100,120,180,0.2)" : "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          backgroundColor: "#0f0f1a",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <span style={{ fontSize: 12, color: "#94a3b8" }}>📁</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: "#64748b" }}>
          {childCount} files
        </span>
        {domainRole && (
          <span
            style={{
              fontSize: 9,
              color: "#475569",
              marginLeft: "auto",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {domainRole}
          </span>
        )}
      </div>

      {/* PORT SQUARE — Exit (right side of cluster, outgoing trunk) */}
      {hasExits && (
        <div
          style={{
            position: "absolute",
            right: -7,
            top: "50%",
          }}
        >
          <PortSquare
            direction="out"
            edgeTypes={portExits}
            position={Position.Right}
            handleId="port-right-out"
          />
        </div>
      )}

      {/* PORT SQUARE — Entry (left side of cluster, incoming trunk) */}
      {hasEntries && (
        <div
          style={{
            position: "absolute",
            left: -7,
            top: "50%",
          }}
        >
          <PortSquare
            direction="in"
            edgeTypes={portEntries}
            position={Position.Left}
            handleId="port-left-in"
          />
        </div>
      )}

      {/* Standard top/bottom ports (for vertical routing) */}
      <Handle
        type="target"
        position={Position.Top}
        id="port-top-in"
        style={{ opacity: 0, border: "none", background: "none" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="port-bottom-out"
        style={{ opacity: 0, border: "none", background: "none" }}
      />
    </div>
  );
}
```

---

## Step 3 — Update components/pro/index.ts

```typescript
// components/pro/index.ts
export { ClusterNodePro } from "./ClusterNodePro";
// FileNodePro and SubClusterNode will be added in CMP-4 and CMP-5
```

---

## Step 4 — Update Trunk Edge Styling in GraphCanvas.tsx

The Pro pipeline should render trunk edges with a visibly thicker stroke than local edges.
Trunk edges are identifiable by `data.isTrunk === true` (set in clusterTransformPro.ts).

In `ElkEdge.tsx` (or `ElkEdgePro.tsx` if created), check for `data.isTrunk` and apply:

```typescript
// In ElkEdge.tsx, modify the style application:
const isTrunk = data?.isTrunk === true;
const appliedStyle = {
  ...style,
  strokeWidth: isTrunk ? 3 : (style?.strokeWidth ?? 1.5),
  opacity:     isTrunk ? 0.95 : (style?.opacity ?? 0.8),
};

// Use appliedStyle instead of style in the BaseEdge render
```

Trunk edges with `strokeWidth: 3` are visually unmistakable as inter-cluster highways,
matching the visual weight of the thick blue lines in the reference image.

---

## Step 5 — Verify Port Registration in graphLayoutPro.ts

Replace the stub with a proper implementation that registers the two visible port
positions on cluster nodes so ELK routes trunk edges through them correctly.

Copy `layoutGraphWithElk` from `graphLayout.ts` into `graphLayoutPro.ts` and rename it
`layoutGraphWithElkPro`. Then in the Step 1 initialization loop, for group nodes,
update the ports array to use the positions matching ClusterNodePro's Handle positions:

```typescript
// In graphLayoutPro.ts, inside the node initialization loop:
if (isGroup) {
  const approxW = isExpanded ? 300 : (Number(node.style?.width) || 240);
  const approxH = isExpanded ? 250 : (Number(node.style?.height) || 85);

  elkNode.ports = [
    // Right-side exit port (matches ClusterNodePro's "port-right-out")
    { id: `${node.id}.port-right-out`, x: approxW,     y: approxH * 0.5 },
    // Left-side entry port (matches ClusterNodePro's "port-left-in")
    { id: `${node.id}.port-left-in`,   x: 0,           y: approxH * 0.5 },
    // Top/Bottom for vertical routing
    { id: `${node.id}.port-top-in`,    x: approxW / 2, y: 0 },
    { id: `${node.id}.port-bottom-out`,x: approxW / 2, y: approxH },
  ];

  elkNode.layoutOptions = {
    ...elkNode.layoutOptions,
    "org.eclipse.elk.portConstraints": "FIXED_POS",
  };
}
```

---

## Acceptance Criteria

| Test | Expected |
|---|---|
| Cluster Pro — any codebase with cross-cluster edges | PORT squares visible on cluster box boundaries |
| PORT square color | Matches the dominant edge type (blue for render, orange for call, grey for import) |
| Trunk edge visual weight | Trunk edges (3px) clearly thicker than local edges (1.5px) |
| PORT squares hidden when no inter-cluster edges | A cluster that only has intra-cluster edges shows no PORT squares |
| Clicking a PORT square area | Does not trigger node selection (port is not a node) |
| Existing Cluster Mode | No PORT squares visible — ClusterNode unchanged |
| Existing Full / Routes / Data Flow | Unaffected |
