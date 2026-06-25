# Today's Progress & Key Architectural Decisions
**Project:** Next.js Codebase Visualizer
**Date:** 2026-06-23

## 1. ELKjs Layout Engine Migration
- **Decision:** Abandoned Dagre and manual grid math in favor of ELKjs (`org.eclipse.elk.layered`).
- **Why:** To support dynamic, deeply nested hierarchies (folders expanding to reveal internal files). Manual math loops were causing clipping and clipping states. ELKjs recursively processes the internal children natively when layout options are explicitly passed to both root and compound nodes.

## 2. Dynamic Cluster Transformations
- **Decision:** Built `lib/clusterTransform.ts` to dynamically group files based on top-level paths or `src/` modules.
- **Why:** Visualizing enterprise codebases natively results in a tangled hairball. Collapsing directories into `.react-flow__node-group` wrappers radically simplifies the initial roadmap. 
- **Edge Aggregation:** Cross-module dependency connections are rolled-up into single thick pipelines when folders are collapsed. Added logarithmic density weighting (`strokeWidth: Math.min(2 + Math.log2(count) * 0.5, 6)`) to visually emphasize highly coupled dependencies.

## 3. Strict Phase Segregation
- **Decision:** Strict separation between Filter Phase -> Transform Phase -> Asynchronous Layout Phase.
- **Why:** Enables hot-swapping completely different architectural perspectives without recalculating the AST parsing phase. Hooked into a top-center `ViewModeBar` allowing the user to seamlessly toggle between `"cluster"`, `"routes"`, and `"full"` modes.

## 4. Defensive Guardrails for ELKjs
- **Decision:** Introduced pre-layout edge scrubbing.
- **Why:** Filtering UI nodes dynamically caused `org.eclipse.elk.graph.json.JsonImportException` crashes. ELK will panic if an edge references a missing node ID. The layout layer strictly verifies `knownElkNodeIds.has(edge.source) && knownElkNodeIds.has(edge.target)` before executing calculations.

## 5. Domain Role Pattern Matching
- **Decision:** Automatically categorizing standard Next.js directory patterns into system roles (e.g., `api` -> "Core API Routing Layer", `hooks` -> "State Management").
- **Why:** To provide an immediate executive overview of the software's structural boundaries right on the visual map, rendered cleanly as sub-badges inside the custom `ClusterNode`.

## 6. Executive Codebase Dashboard
- **Decision:** Replaced the empty state `NodeSidebar` with an Executive Summary.
- **Why:** Non-technical stakeholders need to parse the application scale intuitively. The sidebar now aggressively parses the raw AST metadata to print human-readable stats (Total Structural Files, Physical Page Routes, Master Layouts, internal Server Actions/APIs).

## 7. Glassmorphic Interaction Fixes
- **Decision:** Shifted `pointer-events: none` natively into React states (Tailwind overrides) rather than a brute-force global CSS file. Lifted React Flow `<Handle />` components to the outer root level.
- **Why:** Solved deadlock interaction bugs where collapsed folders couldn't be clicked to expand, and solved coordinate trace exceptions where hidden handles crashed the layout calculation logic.

## 8. Orthogonal Port-Bundling Engine & Gitdiagram Layout Spacing
- **Decision:** Forced cross-folder edges to route out via container boundary ports (NORTH/SOUTH) to stop them from cutting through folder walls. Restored massive global node buffers and fixed ELK invalid syntax tyops (`nodeNodeLayered` -> `layered.spacing.nodeNodeBetweenLayers`) to scale up inter-folder spacing (Phase 5 Gitdiagram style spacing at 260px).
- **Why:** Keeps the layout completely rigid, highly legible, and spacious. Cross-hierarchy connections explicitly bypass internal layout packing limits and route on the parent highway.

## 9. Interactive UI & Viewport Stabilization
- **Decision:** Added reactive edge hovering, label alignment calculations via ElkEdge (midpoint snapping + NaN safety guards), and a smooth runtime active camera controller in GraphCanvas via `setCenter`.
- **Why:** Clicking a target inside deep nested hierarchies previously caused drifting bounds; we added an absolute canvas offset aggregator (`getAbsoluteCenter`) iterating over the `parentId` tree to accurately focus the camera globally. Also added `fitView` to elegantly transition between View Modes.

## 10. Phase 2 Canvas Disambiguation & Focus Isolation (2026-06-24)
- **Decision:** Implemented interactive dimming for unrelated background nodes/edges upon locking (double-clicking) an edge. Maintained purely within the `GraphCanvas` via `useMemo` map overrides rather than relying on component-level rerenders. Added round `markerStart` pins to identify source origin points instantly.
- **Why:** Deep dependency graphs become a visual hairball. Fading unrelated assets to 25% opacity when isolating an active connection provides instant clarity without altering layout coordinates.

## 11. Integrated Free-Tier Gemini Codebase Chatbot
- **Decision:** Added a persistent `<GeminiChat />` component at the bottom of the right-sidebar layout. The Next.js `/api/graph-chat` API route handles prompt inference via `gemini-2.5-flash-lite` by reading the raw `commerce.json` payload directly from the local workspace via `fs`.
- **Why:** Allows non-technical stakeholders to query the architecture without leaving the interface or sending massive graph payloads across the network on every client chat request.
- **Context Injection:** Hoisted `lockedEdgeId` into the `useGraphStore` so the Chatbot can natively detect which file/connection the user is viewing and inject it as a metadata sub-header for the LLM.
