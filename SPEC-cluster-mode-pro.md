# Cluster Mode Pro — Production Specification
## NextVis Advanced Graph Architecture

**Version**: 1.0  
**Safety Principle**: Cluster Mode (original) is NEVER touched. All work lives in `cluster-pro`.  
**Build Order**: CMP-1 → CMP-2 → CMP-3 → CMP-4 → CMP-5

---

## 1. Problem Statement

Three distinct visual failures exist in the current Cluster Mode that cannot be patched
incrementally without risk of regressions. Rather than incrementally patching a working
system, Cluster Mode Pro is a clean-room rebuild of the same pipeline with three
architectural upgrades applied from the start.

### Problem A — Congested Arrows (Image 1)
When many edges arrive at a node, they all attach to the same single handle point. The
result is an unclickable, unreadable pile of arrowheads at the node top/bottom center.
Nodes with 8–12 incoming edges (like `auth` in the screenshot) become visually locked.

**Root cause**: every React Flow edge defaults to the node's center handle when no
explicit `sourceHandle`/`targetHandle` is set. All N edges converge at one pixel.

### Problem B — Edges Visually Passing Through Unconnected Nodes (Image 2)
Long-distance edges route through the same horizontal channel as node rows. Because ELK's
inter-row gap is too narrow, the edge appears flush against the bottom of unrelated nodes,
creating the false impression of a connection.

**Root cause**: Two compounding factors — insufficient `nodeNodeBetweenLayers` inside
expanded cluster groups, and React Flow's default node z-index not reliably placing node
backgrounds above the edge SVG layer.

### Problem C — No Visual Distinction for Inter-Cluster vs Intra-Cluster Edges
The bus route method solved the hairball. But there is no visual signal that tells a user
"this thick line is a highway between two modules" versus "this thin line is a local
dependency inside one module." The square PORT markers from the reference image (Image 3)
solve this by making the cluster boundary a visible, labeled connection terminal.

---

## 2. Architecture Overview

```
Existing Pipeline (UNTOUCHED):
  viewMode === "cluster"
    → buildClusteredFlow()          [lib/clusterTransform.ts]
    → layoutGraphWithElk()          [lib/graphLayout.ts]
    → ClusterNode + CustomNode      [components/]

New Pipeline (Cluster Mode Pro):
  viewMode === "cluster-pro"
    → buildClusteredFlowPro()       [lib/clusterTransformPro.ts]  ← NEW FILE
    → layoutGraphWithElkPro()       [lib/graphLayoutPro.ts]       ← NEW FILE
    → ClusterNodePro + FileNodePro  [components/pro/]             ← NEW FOLDER
```

The Pro pipeline is a complete parallel track. It shares no mutable code with the
original. Both modes coexist and can be switched between live.

---

## 3. Five Architectural Upgrades in Cluster Mode Pro

### Upgrade 1 — Scaffold (CMP-1)
New `viewMode: "cluster-pro"` in Zustand. New button in ViewModeBar. New pipeline stub
that initially renders identically to Cluster Mode to confirm isolation.

### Upgrade 2 — Node Z-Index & Edge Routing Gap Fix (CMP-2)
Applied as a GLOBAL bugfix (also improves existing Cluster Mode):
- Every file node gets `style.zIndex = 10` so node backgrounds visually block any edge
  running at the same Y coordinate
- Inside expanded cluster groups, `nodeNodeBetweenLayers` is corrected to 140px (the Phase
  5 spacing fix that was specified but verify it was applied to the group-level layoutOptions)
- Node backgrounds use `opacity: 1` (no rgba tinting that would make them transparent)

### Upgrade 3 — Visible Square Port Indicators (CMP-3)
Reference: Image 3 — only the square PORT markers and thick trunk edge style.

At every cluster boundary where a trunk edge exits or enters, render a small square PORT
indicator. This makes the bus route physically visible and distinguishes inter-cluster
highways from intra-cluster local edges.

```
┌──── app cluster ────────────────────────┐
│  [page/page]  [sitemap]  [app/layout]  │
│                                         │
│                      ┌───┐              │
└──────────────────────┤ P ├──────────────┘
                       └─┬─┘   ← PORT square (visible, labeled)
                    thick trunk edge
                       ┌─┴─┐
┌──────────────────────┤ P ├──────────────┐
│                      └───┘              │
│  [utils]  [seo]  [queries/page]        │
└──── lib cluster ────────────────────────┘
```

Port squares:
- Rendered as 14×14px square badges overlaid on the cluster border
- Labeled "→" (outgoing) or "←" (incoming) or just "P"
- Color matches the dominant edge type passing through (blue for render, grey for import)
- Trunk edges between ports are 3px thick (vs 1.5px for local edges)
- Trunk edges labeled with type and count ("3× render")

### Upgrade 4 — Sub-Sector Nesting (CMP-4)
Reference: Image 4 — only the concept of sub-folders within a large cluster box.

Large clusters (>8 files) are automatically sub-divided into sub-sector groups based on
the next level of the folder hierarchy.

```
folder: app/  (cluster)
├── sub-sector: app/(shop)/          (sub-cluster)
│   ├── [handle]/page.tsx
│   └── search/page.tsx
├── sub-sector: app/[page]/          (sub-cluster)
│   └── [page]/page.tsx
└── app/layout.tsx                   (directly in cluster root)
```

ELK handles 3-level nesting natively (cluster → sub-cluster → file node). Sub-clusters
use a distinct but lighter border style (dashed, 1px) and a smaller header label.
Sub-clusters have their own port indicators for intra-cluster-but-inter-sub-sector routing.

Trigger threshold: sub-sectors only appear when a cluster has ≥ 3 distinct sub-directories
AND total file count ≥ 8. Smaller clusters render flat (same as current Cluster Mode).

### Upgrade 5 — Distributed Multi-Port Edge Distribution (CMP-5)
Directly fixes the congested arrow problem in Image 1.

Each file node computes how many edges connect to it (in/out). Those edges are spread
evenly across the node's top edge (incoming) and bottom edge (outgoing), each getting its
own distinct handle position.

```
CURRENT (all edges pile at center):          PRO (evenly distributed):
         ▼▼▼▼▼▼▼▼▼▼▼                                 ▼  ▼  ▼  ▼  ▼
    ┌────────────────┐                           ┌────────────────┐
    │      auth      │                           │      auth      │
    └────────────────┘                           └────────────────┘
```

Each edge is assigned a unique `sourceHandle`/`targetHandle` string computed from its
position in the sorted edge array for that node. ELK receives matching port definitions
so its routing respects these attachment positions.

---

## 4. File Map

```
CREATED (new files only — nothing existing is modified except Zustand store and ViewModeBar):

lib/
├── clusterTransformPro.ts      ← Pro version of clusterTransform.ts
├── graphLayoutPro.ts           ← Pro version of graphLayout.ts

components/
└── pro/
    ├── ClusterNodePro.tsx      ← Cluster box with visible port squares
    ├── SubClusterNode.tsx      ← Sub-sector box (lighter style)
    ├── FileNodePro.tsx         ← File node with dynamic distributed handles
    └── ElkEdgePro.tsx          ← Trunk edge styling (thicker, labeled)

MODIFIED (minimal, surgical additions only):

lib/graphStore.ts               ← Add "cluster-pro" to viewMode union
components/ViewModeBar.tsx      ← Add Cluster Pro button
components/GraphCanvas.tsx      ← Add cluster-pro branch in useEffect + import new pipeline
```

---

## 5. Non-Goals

- Do NOT modify `clusterTransform.ts` — that is the existing mode's file
- Do NOT modify `graphLayout.ts` — same
- Do NOT modify `ClusterNode.tsx` or `CustomNode.tsx` — used by existing mode
- Do NOT add `cluster-pro` logic to `buildClusteredFlow()` — keep them completely separate
- Sub-sectors do NOT apply to the existing Cluster Mode
- Distributed ports do NOT apply to the existing Cluster Mode
- Port indicators are only visible in Cluster Mode Pro, not standard Cluster Mode

---

## 6. Consolidated Guardrails & Risk Factors (System Invariants)

This section details all strict structural constraints, layout guardrails, and hidden architectural risks that **Antigravity** must verify during the implementation of Cluster Mode Pro. Any deviation from these rules will break conversational features, crash layout math, or corrupt existing visualization modes.

---

### 🛡️ 1. Clean-Room Sandbox Isolation (Phase 1 Guardrails)
* **The Golden Rule**: The baseline Cluster Mode (`viewMode === "cluster"`) must remain completely untouched, pixel-identical, and fully functional.
* **File Immunity**: Antigravity is strictly forbidden from editing or adding mutable modifications to `lib/clusterTransform.ts`, `lib/graphLayout.ts`, `components/ClusterNode.tsx`, `components/CustomNode.tsx`, and `components/ElkEdge.tsx`.
* **Parallel Track Execution**: All upgraded logic, type variants, layout overrides, and node structures must reside in isolated parallel tracks: `lib/clusterTransformPro.ts`, `lib/graphLayoutPro.ts`, and the `components/pro/` directory.
* **Asynchronous Early Exit Control**: The new `cluster-pro` condition handler inside the `useEffect` compiler loop of `components/GraphCanvas.tsx` must explicitly implement an early `return` statement. This prevents the standard `layoutGraphWithElk()` core runner function from executing concurrently and double-triggering coordinate transforms.

---

### 🌡️ 2. Architectural Telemetry & Overlay Compatibility (Critical System Risks)
* **Overlay Filter Collisions**: Existing visualization matrices (`applyBoundaryOverlay` and `applyHeatmapOverlay`) are strictly conditioned to map properties onto nodes with `type === "custom"`. Because Phase 5 introduces `type: "fileNodePro"` to display custom distributed handles, overlays will silently fail to render across Cluster Pro mode.
    * *Antigravity Action*: The loop filters within `lib/overlayCompute.ts` must be extended to evaluate and process both node block parameters simultaneously (`if (node.type === "custom" || node.type === "fileNodePro")`).
* **Solid Background Opacity**: File node backgrounds must remain completely opaque (`opacity: 1`), with zero transparency settings or `rgba` alpha variations. Telemetry highlight maps must apply tinting effects exclusively via localized internal absolute overlay layer divs to maintain standard layout contrast.

---

### 📐 3. Layout Spacing & Stacking Constraints (Phase 2 Guardrails)
* **Root-Level Preservation**: Antigravity must never modify or replace any ELK layout properties or spacing constants defined at the root graph layout configuration level. All row spacing expansions must be applied strictly within individual sub-cluster group-node `layoutOptions` blocks.
* **Container Stacking Invariants**: The structural container `<div>` of a cluster group node must preserve its baseline style property (`style: { zIndex: -1 }`). Raising this wrapper's index will force the folder background canvas layer forward, obscuring nested child custom files. Stacking optimizations must be localized directly to cluster text header tags and file node borders.

---

### 🔀 4. Multi-Port Registry & Edge Routing Safety (Phase 3 & 5 Guardrails)
* **Trunk Edge Isolation**: Multi-port structural index values must be mapped **exclusively** onto intra-cluster, file-to-file connection tracks. They must never be applied to inter-cluster trunk highway edges or egress/ingress stub lines. Trunk edges must remain safely anchored to the fixed cluster container border gateways established during Phase 3 (`port-right-out` / `port-left-in`).
* **Trunk Edge Stub Mismatches**: Applying a dynamic multi-port layout hash (e.g., `port-in-2-of-5`) to a trunk line will result in an unresolved identifier match on the parent container walls, triggering a catastrophic ELK layout coordinator engine crash.
* **String Identifier Invariant**: The string template hash formula for port allocations must remain absolutely identical across all three processing vectors:
    ```typescript
    "port-in-{index}-of-{totalPorts}"   // target handle (incoming edge)
    "port-out-{index}-of-{totalPorts}"  // source handle (outgoing edge)
    ```
    Any typo or casing variance between `buildClusteredFlowPro` (topology extraction), `FileNodePro.tsx` (React Flow handles), and `graphLayoutPro.ts` (ELK registry array) will break string equality checks, forcing ELK to drop to standard single-center stacking.
* **Zero-Connection Safeguard**: The `distributePositions()` mapping function must implement defensive guard rails to check for empty states. If an isolated file contains zero incoming or outgoing connections, the node must skip port processing entirely and rely on standard React Flow default positions to prevent runtime mathematical exceptions.

## 7. Ship Criteria (Full Regression Checklist)

### Isolation check (run immediately after CMP-1):
- [ ] Switching to "Cluster Mode" renders identically to before all CMP work
- [ ] Switching to "Cluster Pro" renders the same as Cluster Mode (initial stub)

### After CMP-2 (Z-Index fix — applies globally):
- [ ] In Full Mode, no edge is visually visible through a node's solid background
- [ ] In Routes Mode, same check
- [ ] In existing Cluster Mode, same check

### After CMP-3 (Port Indicators):
- [ ] Cluster Pro shows PORT squares at every cluster boundary with active trunk edges
- [ ] Trunk edges are visually thicker (3px) than local edges (1.5px)
- [ ] Port squares disappear when all edges to/from that cluster are hidden via filter
- [ ] Existing Cluster Mode: no PORT squares visible (untouched)

### After CMP-4 (Sub-Sectors):
- [ ] Large clusters (≥8 files, ≥3 sub-dirs) split into sub-sector boxes
- [ ] Small clusters render flat — no sub-sector boxes
- [ ] ELK lays out sub-sectors correctly inside the parent cluster
- [ ] Sub-sector labels are visible and not overlapping node labels
- [ ] Existing Cluster Mode: no sub-sector boxes (untouched)

### After CMP-5 (Multi-Port Distribution):
- [ ] Nodes with 8+ incoming edges show all edges separately with no pile-up
- [ ] All distributed edges are individually clickable (click test on a dense node)
- [ ] Existing Cluster Mode: single-center handle behavior unchanged
- [ ] ELK receives correct port definitions and routes to the right attachment points
- [ ] `auth` node in vercel/commerce: 12 incoming edges are individually distinct
