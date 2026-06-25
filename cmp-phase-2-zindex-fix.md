# CMP-2 — Global Z-Index & Edge-Over-Node Visual Fix
## Agentic Implementation Prompt for Antigravity

---

## Mission

Fix the visual bug where edges appear to pass through or over nodes they are not connected
to. This is a GLOBAL fix applied to all modes (Cluster, Cluster Pro, Routes, Full) because
the root causes are CSS rendering order and ELK spacing configuration — not mode-specific
logic. This phase has zero architectural risk since it touches only styling and spacing
numbers, not any transformation pipeline.

---

## Root Cause Analysis

Two compounding causes:

**Cause A — React Flow node z-index**
React Flow renders the edge SVG layer and the node HTML layer in the same stacking context.
If a node's background is not fully opaque, or if the node's z-index does not reliably
exceed the edge layer's z-index, edges running at the same Y-coordinate as a node appear
to pass through it instead of behind it.

The specific symptom in Image 2: a solid blue render edge runs horizontally at a Y-level
that coincides with several page nodes. These nodes do not block the edge visually.

**Cause B — Insufficient inter-row gap inside expanded cluster groups**
The Phase 5 spacing prompt corrected `nodeNodeBetweenLayers` at the ROOT graph level
(between cluster boxes). The SAME typo and insufficient value likely persists inside the
group-node `layoutOptions` block, meaning file node rows inside an expanded cluster are
separated by only ~20px (ELK default). ELK routes long-distance edges in this 20px channel,
placing them flush against the bottom border of the node row above.

---

## Files to Modify

| File | Change Type |
|---|---|
| `lib/graphLayout.ts` | Fix inter-row spacing inside group layoutOptions |
| `lib/graphLayoutPro.ts` | Apply same fix (since it currently delegates to graphLayout.ts, verify it inherits) |
| `components/CustomNode.tsx` | Add z-index and solid background enforcement |
| `components/ClusterNode.tsx` | Add z-index enforcement on the container |
| Global CSS (globals.css or equivalent) | Enforce React Flow edge/node layer ordering |

---

## Step 1 — Fix Inter-Row Spacing Inside Cluster Groups (graphLayout.ts)

In `lib/graphLayout.ts`, find the `layoutOptions` block that is set on group/cluster ELK
nodes (the `isGroup ? { ... } : undefined` branch).

Verify whether the following corrected property is already present. If it still shows the
INVALID form `"org.eclipse.elk.spacing.nodeNodeLayered"`, replace it:

```typescript
// WRONG (silently ignored by ELK):
"org.eclipse.elk.spacing.nodeNodeLayered": "160",

// CORRECT (controls vertical gap between file node rows inside a cluster):
"org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "140",
```

Also verify the `edgeNode` spacing inside groups is sufficient to push edges away from
node boundaries:

```typescript
// Ensure this value is at least 35 inside the group layoutOptions:
"org.eclipse.elk.spacing.edgeNode": "35",
```

And add this if not present — it prevents ELK from routing edges at the exact boundary
of a node in intermediate layers:
```typescript
"org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers": "50",
```

The complete group-node layoutOptions should include:
```typescript
"org.eclipse.elk.algorithm":                              "org.eclipse.elk.layered",
"org.eclipse.elk.direction":                              "DOWN",
"org.eclipse.elk.edgeRouting":                            "ORTHOGONAL",
"org.eclipse.elk.layered.nodePlacement.strategy":         "BRANDES_KOEPF",
"org.eclipse.elk.spacing.nodeNode":                       "100",
"org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers":  "140",   // ← corrected name + value
"org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers":  "50",    // ← NEW: prevents edge-flush-to-node
"org.eclipse.elk.spacing.edgeEdge":                       "25",
"org.eclipse.elk.spacing.edgeNode":                       "35",
"org.eclipse.elk.padding":                                "[top=100,left=60,bottom=60,right=60]",
```

---

## Step 2 — Enforce Z-Index on File Nodes (CustomNode.tsx)

In `components/CustomNode.tsx`, the root container div of the node must have an explicit
z-index that ensures it renders above the React Flow edge SVG layer.

React Flow renders the edge SVG with a z-index in the range 0–5 by default. Setting
node z-index to 10 guarantees the node background covers any edge passing beneath it.

Find the outermost `<div>` returned by the CustomNode component and add or merge:

```tsx
// In the node's root container div, add to the style prop:
style={{
  ...existingStyle,
  zIndex: 10,                          // ensures node renders above edge SVG layer
  backgroundColor: resolvedBgColor,    // must be FULLY OPAQUE — see note below
  position: "relative",               // required for z-index to take effect
}}
```

**IMPORTANT — Background opacity**: If `resolvedBgColor` or any existing background
style uses `rgba(r, g, b, alpha)` with alpha < 1.0, change it to the equivalent solid
color. Semi-transparent backgrounds allow edge lines to show through. Use `rgba(r,g,b,1)`
or a hex color. Tinting for overlay features (heatmap, boundary) is done via an inner
overlay div, not by making the outer background semi-transparent.

---

## Step 3 — Enforce Z-Index on ClusterNode (ClusterNode.tsx)

The cluster container node uses `style: { zIndex: -1 }` on expanded groups so that child
file nodes appear in front of the cluster background. This negative z-index is correct
for the cluster background, but it must not cause the cluster HEADER to disappear behind
edges.

In `components/ClusterNode.tsx`, verify the node structure:

```tsx
// The cluster node root div (the container that React Flow positions):
// Keep zIndex: -1 on the container — this is correct and intentional.
// It puts the cluster background behind child nodes.

// The cluster HEADER div (the label bar at the top of the box):
// This must have its own positive z-index so it appears above edges:
<div
  className="cluster-header ..."
  style={{
    position: "relative",
    zIndex: 5,                    // header floats above edge layer
    backgroundColor: "#1a1a2e",   // solid, opaque
  }}
>
  {/* folder icon, label, file count, domain role */}
</div>
```

If the cluster header is currently inside the same div as the container (no separate
header div), wrap the label content in its own div with `position: relative; z-index: 5`.

---

## Step 4 — Global CSS Enforcement (globals.css)

Add these rules to your global CSS file. React Flow renders its layers as:
- `.react-flow__edges` — SVG layer containing all edge paths
- `.react-flow__nodes` — HTML layer containing all node divs

By default these may share the same stacking level. Force the ordering explicitly:

```css
/* Ensure nodes always render above edge lines */
.react-flow__nodes {
  z-index: 10 !important;
}

.react-flow__edges {
  z-index: 5 !important;
}

/* Ensure node backgrounds are never transparent through their container */
.react-flow__node {
  isolation: isolate;
}
```

Also add a rule that makes the selected edge highlight render above the node layer
(so that when a user clicks an edge to highlight it, it becomes visible even under dense
node areas):

```css
/* Selected/highlighted edges float above nodes for visibility */
.react-flow__edge.selected path,
.react-flow__edge:hover path {
  z-index: 20 !important;
  stroke-width: 3px;
}
```

---

## Guard Rails

- **DO NOT** change any ELK layout option at the ROOT graph level — only the group-node
  `layoutOptions` block in `graphLayout.ts`.
- **DO NOT** change `style: { zIndex: -1 }` on the cluster CONTAINER div — it is needed
  for child nodes to appear in front of the cluster background. Only add z-index to the
  cluster HEADER sub-element.
- **DO NOT** make any file node background semi-transparent (rgba alpha < 1). Overlays
  (heatmap, boundary) apply tinting via an inner overlay div, not the node background.
- **DO NOT** modify `graphLayoutPro.ts` separately — since it currently delegates to
  `graphLayout.ts`, it automatically inherits the spacing fixes from Step 1.

---

## Acceptance Criteria

| Test | Expected |
|---|---|
| Full Mode — any codebase | No edge visible "inside" or "through" a node background |
| Routes Mode | Same check |
| Cluster Mode — expanded | Long-distance intra-cluster edges route in clearly visible open channel below the upper node row; ≥ 50px gap between edge path and nearest unconnected node |
| Cluster Mode — dense nodes | Node backgrounds are solid; no edge bleed-through |
| Cluster Node header | Cluster header label visible and not obscured by any edge |
| CSS override check | `.react-flow__nodes` z-index: 10 in computed styles (verify in browser DevTools) |
| Overlay features | Boundary and Heatmap overlays still work correctly after z-index changes |
