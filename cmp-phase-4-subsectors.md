# CMP-4 — Sub-Sector Nesting Within Large Clusters
## Agentic Implementation Prompt for Antigravity

---

## Visual Reference

From Image 4 (AI-generated — reference ONLY for the concept of sub-directories within
a large folder box, nothing else):
- `folder: app-core/` contains labeled sub-sections: `pages/`, `layout/`, `components/`
- Each sub-section is a lighter-styled box inside the parent
- Sub-sections have their own Port indicators for cross-sub-section routing

Target visual in Cluster Pro:
```
┌────────────────────── app ─────────────────────────────────┐
│  17 files · Application Views                               │
│                                                             │
│  ┌─── (shop)/ ──────────┐    ┌─── [page]/ ─────────────┐  │
│  │ [handle]/page.tsx    │    │ [page]/page.tsx           │  │
│  │ search/page.tsx      │    │ [page]/layout.tsx         │  │
│  └──────────────────────┘    └───────────────────────────┘  │
│                                                             │
│  app/layout.tsx   app/error.tsx   app/loading.tsx           │
└─────────────────────────────────────────────────────────────┘
```

Sub-sector boxes have a lighter, dashed border and a smaller header.
Files that live directly in the cluster root (not inside a sub-folder) render normally
alongside the sub-sector boxes.

---

## Mission

Extend `buildClusteredFlowPro()` to detect whether a cluster is large enough to warrant
sub-sectors, and if so, create a 3-level ELK hierarchy:
- Level 0: root graph
- Level 1: cluster node (folder like `app`, `components`, `src/lib`)
- Level 2: sub-cluster node (sub-folder like `(shop)/`, `cart/`, `ui/`)
- Level 3: file nodes (individual .tsx / .ts files)

---

## Activation Threshold

Sub-sectors are ONLY created when ALL of the following are true:
1. The cluster has ≥ 8 total file nodes, AND
2. There are ≥ 3 distinct sub-directory paths within that cluster

If a cluster does not meet this threshold, it renders exactly as in CMP-3 (flat list of
file nodes inside the cluster box) — no sub-sector boxes created.

---

## Files to Modify / Create

| Action | File |
|---|---|
| MODIFY | `lib/clusterTransformPro.ts` — add sub-sector logic |
| CREATE | `components/pro/SubClusterNode.tsx` |
| MODIFY | `components/pro/index.ts` — export SubClusterNode |
| MODIFY | `lib/graphLayoutPro.ts` — handle 3-level ELK hierarchy |
| MODIFY | `components/GraphCanvas.tsx` — register SubClusterNode in NODE_TYPES |

---

## Step 1 — Sub-Cluster Key Detection

Add this function to `lib/clusterTransformPro.ts`:

```typescript
/**
 * Returns the sub-folder name for a file within its parent cluster.
 * Returns null if the file is directly in the cluster root (no sub-folder).
 *
 * Examples:
 *   clusterKey = "src/app", filePath = "src/app/(shop)/page.tsx"  → "(shop)"
 *   clusterKey = "src/app", filePath = "src/app/layout.tsx"       → null (root file)
 *   clusterKey = "components", filePath = "components/cart/modal.tsx" → "cart"
 */
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
```

---

## Step 2 — Extend buildClusteredFlowPro() with Sub-Sector Logic

Inside `buildClusteredFlowPro()`, after grouping nodes by cluster key, add the sub-sector
pass. This replaces the simple flat child rendering for qualifying clusters:

```typescript
for (const [clusterKey, children] of clusters.entries()) {
  const parentId = `cluster-${clusterKey}`;
  const shouldSubSector = shouldActivateSubSectors(children, clusterKey);

  if (!shouldSubSector) {
    // Existing flat rendering — unchanged from CMP-3
    buildFlatCluster(clusterKey, children, parentId, ...);
    continue;
  }

  // ── Sub-Sector Path ──────────────────────────────────────────
  
  // Group children by sub-folder
  const subGroups = new Map<string, Node[]>(); // subFolderName → [nodes]
  const rootFiles: Node[] = [];              // files directly in cluster root

  for (const child of children) {
    const filePath = (child.data?.filePath as string) || child.id;
    const subKey = getSubClusterKey(clusterKey, filePath);

    if (subKey === null) {
      rootFiles.push(child); // sits at cluster root level
    } else {
      if (!subGroups.has(subKey)) subGroups.set(subKey, []);
      subGroups.get(subKey)!.push(child);
    }
  }

  // Create the parent cluster node (always created)
  const parentNode = buildClusterParentNode(parentId, clusterKey, children.length, ...);
  finalNodes.push(parentNode);

  // Create each sub-cluster node and nest children inside it
  for (const [subKey, subChildren] of subGroups.entries()) {
    const subClusterId = `subcluster-${clusterKey}-${subKey}`;

    const subClusterNode: Node = {
      id: subClusterId,
      type: "subClusterNode",
      parentId: parentId,           // ← nested inside the parent cluster
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

    // Nest file nodes inside the sub-cluster
    for (const child of subChildren) {
      finalNodes.push({
        ...child,
        parentId: subClusterId,     // ← nested inside sub-cluster
        extent: "parent",
        position: { x: 0, y: 0 },
        zIndex: 2,
      });
      nodeToVisibleId.set(child.id, child.id);
    }
  }

  // Root files sit directly inside the parent cluster (not in any sub-cluster)
  for (const child of rootFiles) {
    finalNodes.push({
      ...child,
      parentId: parentId,           // ← directly in parent cluster
      extent: "parent",
      position: { x: 0, y: 0 },
      zIndex: 2,
    });
    nodeToVisibleId.set(child.id, child.id);
  }
}
```

**Helper function for the threshold check:**
```typescript
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
```

---

## Step 3 — Create components/pro/SubClusterNode.tsx

```tsx
// components/pro/SubClusterNode.tsx
"use client";

import { Handle, Position, NodeProps } from "reactflow";

export function SubClusterNode({ data }: NodeProps) {
  const { label, childCount } = data;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: "1px dashed rgba(100,130,180,0.3)",
        borderRadius: 6,
        backgroundColor: "rgba(20,20,40,0.5)",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Sub-cluster header — lighter and smaller than cluster header */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          padding: "5px 10px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          backgroundColor: "rgba(15,15,30,0.8)",
          borderRadius: "6px 6px 0 0",
          borderBottom: "1px solid rgba(80,100,160,0.2)",
        }}
      >
        <span style={{ fontSize: 10, color: "#64748b" }}>📂</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>
          {label}/
        </span>
        <span style={{ fontSize: 9, color: "#475569", marginLeft: "auto" }}>
          {childCount}
        </span>
      </div>

      {/* Standard handles for ELK routing — invisible */}
      <Handle
        type="target"
        position={Position.Top}
        id="sub-port-top"
        style={{ opacity: 0, border: "none", background: "none" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="sub-port-bottom"
        style={{ opacity: 0, border: "none", background: "none" }}
      />
    </div>
  );
}
```

---

## Step 4 — Register SubClusterNode in GraphCanvas.tsx

```typescript
// In the NODE_TYPES constant in GraphCanvas.tsx, add:
import { SubClusterNode } from "@/components/pro/SubClusterNode";

const NODE_TYPES = {
  ...defaultNodeTypes,
  clusterNode:    ClusterNode,
  clusterNodePro: ClusterNodePro,
  subClusterNode: SubClusterNode,    // ← ADD
};
```

---

## Step 5 — Handle 3-Level Hierarchy in graphLayoutPro.ts

The ELK layout already handles nested hierarchies via the `parentId` system. The 3-level
nesting (root → cluster → sub-cluster → file) uses the same parentId approach already
implemented. However, add layout options specifically for sub-cluster nodes:

```typescript
// In graphLayoutPro.ts, Step 1 (node initialization):
const isSubCluster = node.type === "subClusterNode";

if (isSubCluster) {
  elkNode.layoutOptions = {
    "org.eclipse.elk.algorithm":                              "org.eclipse.elk.layered",
    "org.eclipse.elk.direction":                              "DOWN",
    "org.eclipse.elk.spacing.nodeNode":                       "60",
    "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers":  "70",
    "org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers":  "30",
    "org.eclipse.elk.spacing.edgeNode":                       "20",
    "org.eclipse.elk.padding":                                "[top=50,left=30,bottom=30,right=30]",
    "org.eclipse.elk.nodeSize.constraints":                   "COMPUTE_PADDING MINIMUM_SIZE",
    "org.eclipse.elk.nodeSize.minimum":                       "(160, 100)",
  };
  // Sub-clusters are always auto-sized — never provide fixed width/height
}
```

---

## Acceptance Criteria

| Test | Expected |
|---|---|
| Large cluster (≥8 files, ≥3 sub-dirs) — vercel/commerce `components/` | Shows sub-sector boxes (e.g., `cart/`, `ui/`, `icons/`) inside the main cluster |
| Small cluster (<8 files) | Renders flat — no sub-sector boxes |
| Cluster with 1-2 sub-dirs but 10+ files | Renders flat — threshold requires ≥3 distinct sub-dirs |
| Root files (directly in cluster) | Appear as regular nodes alongside sub-sector boxes |
| ELK layout | Sub-sector boxes are properly spaced within the parent cluster |
| Sub-cluster label | Shows sub-folder name with trailing slash (`cart/`) |
| Existing Cluster Mode | No sub-sector boxes — completely unaffected |
| Boundary overlay | Works correctly on file nodes inside sub-sector boxes |
| Heatmap overlay | Works correctly on file nodes inside sub-sector boxes |
