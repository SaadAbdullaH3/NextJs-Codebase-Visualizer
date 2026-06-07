# Scope Draft — Next.js Codebase Visualizer
> Assessment: AI-Augmented Software Engineer | Manaracloud.ai / Enablers.ai

---

## 1. Chosen Form Factor: Hybrid (CLI Ingest + Web Viewer)

### Decision & Defense

The hybrid form is the strongest choice given the evaluation criteria. Here's the reasoning:

**Why not pure CLI?** A CLI that emits a static HTML file loses interactivity — you can't filter, search, or drill into nodes meaningfully in a 200+ file repo. The assessment explicitly requires navigability.

**Why not pure web tool?** A web tool that accepts a GitHub URL requires GitHub OAuth, rate-limit handling, cloning large repos server-side, and cold-start latency. It adds infrastructure complexity that doesn't score points — and the analysis core is what matters most (~55% of score between correctness + architecture).

**Why hybrid wins:**
- CLI handles ingest: deterministic, fast, offline, no auth needed for private repos
- CLI emits a portable `graph.json` file — a clean, inspectable artifact
- Web viewer (Next.js App Router) consumes `graph.json` and renders the interactive graph
- Separates concerns cleanly: static analysis ≠ visualization
- README can show the handoff interface explicitly, demonstrating architectural judgment

**Stack:**
- CLI: Node.js/TypeScript (same ecosystem as Next.js — zero context switch, reuse of TS compiler API for AST work)
- Web viewer: Next.js 14 (App Router) + shadcn/ui + React Flow
- No backend/auth needed (local file ingest)
- Deployment: Vercel (static export of viewer with `graph.json` uploaded via drag-drop or URL param)

---

## 2. What the Tool Handles (In-Scope)

### 2.1 Graph Nodes

| Node Type | Detection Method |
|---|---|
| App Router pages (`page.tsx`) | File path pattern matching under `app/` |
| App Router layouts (`layout.tsx`) | File path pattern matching |
| Route groups `(group)/` | Directory naming convention |
| Parallel routes `@slot/` | Directory prefix detection |
| Intercepting routes `(..)folder/` | Directory naming detection |
| Pages Router pages (`pages/*.tsx`) | File path under `pages/`, exclude `_app`, `_document`, `api/` |
| Server Components | Default in App Router; absence of `"use client"` directive |
| Client Components | Detection of `"use client"` directive at file top |
| Server Actions | Detection of `"use server"` directive (file-level or function-level) |
| API Routes / Route Handlers | `route.ts` / `route.js` in App Router; `pages/api/` in Pages Router |
| Middleware | `middleware.ts` at project root |
| Hooks | Files in `hooks/` directory OR `use` prefix naming convention |
| Utility Modules | Files in `utils/`, `lib/`, `helpers/` directories |
| Shared Components | Files in `components/` without `"use client"` |

### 2.2 Graph Edges

| Edge Type | Visual | Detection |
|---|---|---|
| **render** | Solid arrow (blue) | JSX usage of a component: `<ComponentName` in TSX/JSX |
| **call** | Dashed arrow (orange) | Function invocation from server action / API route |
| **import-only** | Dotted arrow (gray) | Import present but no JSX render or direct call detected |
| **dynamic import** | Dashed arrow (purple) | `next/dynamic(...)` or `React.lazy(...)` patterns |

### 2.3 Barrel Resolution (Critical Differentiator)

The assessment explicitly calls out barrel files as the #1 failure mode of AST-only tools.

Resolution strategy:
1. Detect `index.ts` / `index.tsx` files
2. Parse their exports: `export { X } from './X'` and `export * from './X'`
3. Build an export map: `{ 'ComponentName' => 'real/path/to/component.tsx' }`
4. When resolving an import, walk the export map until a non-barrel file is reached
5. Edges point to real definition files, never to barrel files

### 2.4 Viewer Capabilities (Required)

- Click a node → side panel shows: file path, component type, RSC/client boundary, direct neighbors (imports in + imports out)
- Filter panel: toggle visibility by node type (page, layout, component, server action, API route, hook, utility)
- Search by filename or module name
- Zoom, pan, minimap (React Flow built-ins)
- Edge type legend always visible
- Usable on 200+ file repos (virtualization / level-of-detail culling)

---

## 3. What the Tool Explicitly Does NOT Handle (Out of Scope, Deferred)

These are consciously deferred — the README will state this clearly, which is what the assessors want to see.

| Deferred Feature | Reason |
|---|---|
| RSC/client boundary violation detector | Stretch feature; core correctness first |
| Circular import detection | Nice to have; not blocking core graph |
| Unused export detection | Requires cross-file symbol tracking beyond initial scope |
| Codebase diff between two commits | Git integration adds surface area |
| Dead route detection | Requires understanding `Link` usage across all pages |
| LLM-powered plain-English side panel | Stretch; addable post-core |
| GitHub URL ingest (web) | OAuth complexity not needed for CLI hybrid |
| Monorepo support (nx, turborepo) | Edge case; single Next.js package only |
| CSS Modules / styled-components graph | Style dependencies out of scope |

---

## 4. Analysis Engine Architecture

```
Input: /path/to/nextjs-project

Step 1: Project Scanner
  └── Walk file tree, identify all .ts/.tsx/.js/.jsx files
  └── Classify each file by Next.js convention (page, layout, component, etc.)
  └── Detect App Router vs Pages Router vs hybrid

Step 2: Directive Detector
  └── For each file: scan first 5 lines for "use client" / "use server"
  └── Assign RSC boundary flags

Step 3: AST Parser (TypeScript Compiler API)
  └── Parse each file into AST
  └── Extract: all import declarations, JSX element usages, function calls
  └── Store raw import paths (not yet resolved)

Step 4: Barrel Resolver
  └── Build barrel export map from all index.ts/tsx files
  └── Resolve all import paths through the map to real definition files
  └── Flag unresolvable imports (node_modules, external) — exclude from graph

Step 5: Edge Classifier
  └── For each resolved import: determine edge type (render / call / import-only)
  └── Dynamic import detection pass (next/dynamic, React.lazy)

Step 6: Graph Builder
  └── Nodes: deduplicated file entries with metadata
  └── Edges: typed, directed relationships
  └── Serialize to graph.json

Output: graph.json (nodes[], edges[], metadata{})
```

---

## 5. graph.json Schema

```typescript
interface GraphOutput {
  meta: {
    generatedAt: string;
    projectName: string;
    routerType: "app" | "pages" | "hybrid";
    totalFiles: number;
    analysisVersion: string;
  };
  nodes: Node[];
  edges: Edge[];
}

interface Node {
  id: string;              // relative file path
  label: string;           // display name (filename without extension)
  type: NodeType;          // see enum below
  filePath: string;        // relative path from project root
  isClientComponent: boolean;
  isServerComponent: boolean;
  hasServerAction: boolean;
  route?: string;          // URL route if applicable
  exports: string[];       // named exports from this file
}

type NodeType =
  | "page" | "layout" | "route-group"
  | "parallel-route" | "intercepting-route"
  | "server-component" | "client-component"
  | "server-action" | "api-route" | "middleware"
  | "hook" | "utility" | "context" | "unknown";

interface Edge {
  id: string;
  source: string;          // node id
  target: string;          // node id
  type: "render" | "call" | "import-only" | "dynamic-import";
}
```

---

## 6. Target Demo Repository

**Recommended: `vercel/commerce`**
- Public, maintained by Vercel
- Non-trivial structure: App Router, heavy component composition, server actions, barrel exports
- ~150-200 files — right in the sweet spot for demonstrating navigability
- Well-known: assessors can verify output independently

Alternative: `shadcn-ui/ui` (if they want a component-heavy repo)

---

## 7. Timeline (5 Days)

| Day | Focus |
|---|---|
| Day 1 | Project scaffold (CLI + web), file scanner, Next.js classifier, directive detector |
| Day 2 | AST parser (TypeScript Compiler API), import extractor, barrel resolver |
| Day 3 | Edge classifier, graph builder, `graph.json` serialization, CLI wiring |
| Day 4 | Web viewer: React Flow rendering, side panel, filter/search, node type styling |
| Day 5 | Demo on `vercel/commerce`, README, AI workflow writeup, polish + submission |

---

## 8. Key Risk Areas

**Risk 1: Barrel resolution edge cases**
Some repos re-export through 3+ levels of barrels. The resolver must be iterative (not just one-hop).
Mitigation: Build with cycle detection from the start.

**Risk 2: Dynamic imports**
`next/dynamic(() => import('./Component'))` uses a callback — the import path is inside a lambda, not a top-level import declaration. Standard AST import extraction will miss it.
Mitigation: Dedicated visitor for `CallExpression` nodes where callee is `dynamic` or matches `import()` patterns.

**Risk 3: Server Actions in non-obvious locations**
`"use server"` can appear inside a function body (not just at file top). File-level scanning misses these.
Mitigation: AST visitor that checks directive nodes at both file scope and function scope.

**Risk 4: Large repo performance**
200+ files × full AST parse = potential slowness.
Mitigation: Parallel file processing, cache parsed ASTs if re-running.
