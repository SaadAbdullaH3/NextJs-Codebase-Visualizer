# CMP-1 — Cluster Mode Pro: Pipeline Scaffold
## Agentic Implementation Prompt for Antigravity

---

## Mission

Create a completely isolated "Cluster Mode Pro" view mode that runs a parallel pipeline
separate from existing Cluster Mode. After this phase, switching to Cluster Pro renders
identically to switching to Cluster Mode — it is a clean copy that will receive upgrades
in subsequent phases. Existing Cluster Mode must be pixel-identical before and after.

---

## Safety Rule (Read First)

You must NOT modify any of these files:
- `lib/clusterTransform.ts`
- `lib/graphLayout.ts`
- `components/ClusterNode.tsx`
- `components/CustomNode.tsx`
- `components/ElkEdge.tsx`

You ARE allowed to modify only:
- `lib/graphStore.ts` (add one new viewMode value)
- `components/ViewModeBar.tsx` (add one button)
- `components/GraphCanvas.tsx` (add one new else-if branch and imports)

And you will CREATE:
- `lib/clusterTransformPro.ts` (new file)
- `lib/graphLayoutPro.ts` (new file)
- `components/pro/` (new folder)
- `components/pro/index.ts` (re-exports stub)

---

## Step 1 — Extend Zustand viewMode Union

In `lib/graphStore.ts`, find the `viewMode` type and add `"cluster-pro"`:

```typescript
// BEFORE:
viewMode: "cluster" | "routes" | "full" | "dataflow";

// AFTER:
viewMode: "cluster" | "cluster-pro" | "routes" | "full" | "dataflow";
```

No other changes to graphStore.ts.

---

## Step 2 — Add Button to ViewModeBar

In `components/ViewModeBar.tsx`, add a "Cluster Pro" button immediately after the
existing "Cluster Mode" button. Use the exact same styling pattern as existing buttons.
Do not change any existing button's className logic.

```tsx
// Add this button after the Cluster Mode button, before Routes Mode:
<button
  onClick={() => setViewMode("cluster-pro")}
  className={/* same activeButtonClass helper as existing buttons */
    viewMode === "cluster-pro" ? activeClass : inactiveClass
  }
  title="Cluster Mode Pro — distributed ports, sub-sectors, visible port indicators"
>
  Cluster Pro ✦
</button>
```

The `✦` suffix visually distinguishes it as an upgraded mode without requiring a new icon.

---

## Step 3 — Create lib/clusterTransformPro.ts

This file starts as an exact re-export of the existing `buildClusteredFlow` function
renamed. It will be extended in later phases. Do NOT copy-paste the implementation —
import and re-export from the original to avoid code drift in this phase:

```typescript
// lib/clusterTransformPro.ts

// CMP Phase 1: Stub that delegates to existing implementation.
// Each subsequent CMP phase will replace this with Pro-specific logic.

export { buildClusteredFlow as buildClusteredFlowPro } from "./clusterTransform";
export { buildRouteFlow } from "./clusterTransform"; // shared, untouched

// Placeholder for sub-sector key (CMP-4 will implement this properly)
export function getSubClusterKey(_filePath: string): string | null {
  return null; // returns null in stub phase — no sub-sectors yet
}
```

---

## Step 4 — Create lib/graphLayoutPro.ts

Same pattern — stub that delegates to existing implementation:

```typescript
// lib/graphLayoutPro.ts

// CMP Phase 1: Stub that delegates to existing implementation.
// CMP-3, CMP-4, CMP-5 will replace this with Pro-specific ELK configuration.

export { layoutGraphWithElk as layoutGraphWithElkPro } from "./graphLayout";
```

---

## Step 5 — Create components/pro/ folder

Create the folder and a stub index file:

```typescript
// components/pro/index.ts

// CMP Phase 1: All Pro components are stubs that re-export existing components.
// Each subsequent CMP phase replaces these exports with Pro-specific implementations.

export { ClusterNode as ClusterNodePro } from "../ClusterNode";
export { nodeTypes as fileNodeProTypes } from "../CustomNode";
```

---

## Step 6 — Wire Cluster Pro in GraphCanvas.tsx

In `components/GraphCanvas.tsx`, make these three targeted additions:

**6a — Add imports at the top:**
```typescript
import { buildClusteredFlowPro } from "@/lib/clusterTransformPro";
import { layoutGraphWithElkPro } from "@/lib/graphLayoutPro";
import { ClusterNodePro } from "@/components/pro";
```

**6b — Add ClusterNodePro to NODE_TYPES constant:**
```typescript
const NODE_TYPES = {
  ...defaultNodeTypes,
  clusterNode: ClusterNode,
  clusterNodePro: ClusterNodePro,   // ← ADD THIS LINE
};
```

**6c — Add the cluster-pro branch in the useEffect pipeline:**

Find the existing block that checks `viewMode`:
```typescript
if (viewMode === "cluster") {
  ...
} else if (viewMode === "routes") {
  ...
}
```

Add the pro branch between "cluster" and "routes":
```typescript
if (viewMode === "cluster") {
  const clusterResult = buildClusteredFlow(filteredNodes, filteredEdges, expandedClusters);
  processedNodes = clusterResult.nodes;
  processedEdges = clusterResult.edges;

} else if (viewMode === "cluster-pro") {         // ← NEW BLOCK
  const proResult = buildClusteredFlowPro(filteredNodes, filteredEdges, expandedClusters);
  processedNodes = proResult.nodes;
  processedEdges = proResult.edges;

  // Pro pipeline uses its own layout engine
  layoutGraphWithElkPro(processedNodes, processedEdges).then(({ nodes: laidOutNodes, edgePaths }) => {
    if (isMounted) {
      const enhancedEdges = processedEdges.map(edge => ({
        ...edge,
        data: { ...edge.data, elkPath: edgePaths.get(edge.id) }
      }));
      setBaseLayout({ baseNodes: laidOutNodes, baseEdges: enhancedEdges });
    }
  });
  return; // Early return — Pro pipeline handles its own async layout call above

} else if (viewMode === "routes") {
  ...
}
```

Note: The early `return` in the cluster-pro branch is critical. It prevents the existing
`layoutGraphWithElk()` call at the bottom of the useEffect from running again after the
Pro layout call has already been dispatched.

---

## Verification Checklist (Run Before Proceeding to CMP-2)

| Test | Expected |
|---|---|
| Switch to "Cluster Mode" | Renders identically to before this phase |
| Switch to "Cluster Pro ✦" | Renders identically to Cluster Mode (stub delegates to same function) |
| Switch between both modes rapidly | No crashes, no stale state |
| Switch to Routes Mode | Unaffected |
| Switch to Full Mode | Unaffected |
| Switch to Data Flow | Unaffected |
| TypeScript build | Zero new type errors |
| Browser console | No new errors or warnings |
