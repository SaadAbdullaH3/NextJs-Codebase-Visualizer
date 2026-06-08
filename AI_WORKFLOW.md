# AI-Augmented Workflow Report: Next.js Codebase Visualizer

## 1. How I Scoped and Decomposed the Work
Early in the planning phase, I recognized that asking a Large Language Model (LLM) to build a full-stack static analysis tool in a single prompt would result in tangled, hallucinated code. To maintain strict architectural control, I decomposed the project into two distinct environments via a Hybrid Architecture:

1. **The Backend (Node.js CLI):** Dedicated strictly to deterministic filesystem scanning, `ts-morph` AST traversal, and recursive barrel resolution.
2. **The Frontend (Next.js App Router):** A pure client-side UI utilizing React Flow and Dagre for layout.

I bridged these environments using a strict JSON contract (`graph.json`). By locking the AI into four sequential phases (Scanner → Parser → Graph Builder → Web Viewer), I prevented the intermingling of React UI logic with Node.js filesystem APIs. 

**My AI Orchestration Strategy:**
I utilized a multi-agent approach. I used **Claude** as my strategic "lead debugger" and sounding board to audit code and catch deep AST edge cases. I used **Gemini** as my primary execution and co-debugging partner to write the implementation, apply fixes, and handle UI polishing. I did not allow the agents to advance to the next phase until the current phase's output perfectly matched my manual verification on real Next.js repositories.

## 2. Prompting Strategy & Verbatim Specs
Instead of relying on broad generation requests, I utilized a "Master Context" system prompt to establish immutable engineering guardrails, followed by tightly scoped, phase-specific execution prompts.

## Initial Prompts Phase by Phase which were used 

### MASTER CONTEXT PROMPT
> Use this as the persistent system/context message at the start of your Antigravity session.

```
You are helping me build a production-quality Next.js Codebase Visualizer as a take-home assessment.
The tool is a hybrid: a CLI that ingests a Next.js project and produces a `graph.json`, plus a Next.js
web viewer that visualizes that graph interactively.

HARD CONSTRAINTS you must never violate:
1. Static analysis must be deterministic. Never use an LLM to infer imports, edges, or module relationships.
   All parsing must use the TypeScript Compiler API or direct AST traversal.
2. Barrel files (index.ts / index.tsx) must be resolved to real definitions. Edges to barrel files are bugs.
3. Distinguish edge types: render (JSX usage), call (function invocation), import-only, dynamic-import.
4. Detect "use client" and "use server" directives to classify RSC boundaries.
5. All code you generate must be code I can read, understand, and defend line-by-line in an interview.
   No black boxes. No magic. If I ask "why does this work?", the code must make it obvious.

Tech stack:
- CLI: Node.js / TypeScript, TypeScript Compiler API (ts-morph or raw ts API) for AST parsing
- Web viewer: Next.js 14 App Router, TypeScript, shadcn/ui, React Flow (reactflow), Tailwind CSS
- Output format: graph.json (schema provided separately per phase)
- No backend, no database, no auth — pure client-side viewer consuming a local graph.json

When I give you a phase prompt, output:
- File path and full file content (no truncation)
- A brief explanation of every non-obvious decision
- Any assumptions you made that I should verify
- Explicit warnings if something could break on a non-trivial real-world codebase

Do not generate tests unless I ask. Do not add features beyond what I specify. 
Prefer explicit, readable code over clever abstractions.
```

---

## PHASE 1 PROMPT — Project Scanner & File Classifier

```
Phase 1: Build the file scanner and Next.js classifier.

Create the following files:

src/scanner/walkFiles.ts
  - Accepts a project root path (string)
  - Recursively walks the directory tree
  - Returns a list of all .ts, .tsx, .js, .jsx files
  - Excludes: node_modules, .next, .git, dist, out, build directories
  - Returns: Array<{ absolutePath: string, relativePath: string }>

src/scanner/classifyFile.ts
  - Accepts: { relativePath: string, absolutePath: string }
  - Returns a NodeType from this enum:
      "page" | "layout" | "route-group" | "parallel-route" | "intercepting-route"
      | "server-component" | "client-component" | "server-action" | "api-route"
      | "middleware" | "hook" | "utility" | "context" | "unknown"
  - Classification rules (apply in priority order):
      1. If path is exactly `middleware.ts` or `middleware.js` at project root → "middleware"
      2. If path matches `app/**/page.tsx?` → "page"
      3. If path matches `app/**/layout.tsx?` → "layout"
      4. If path matches `app/**/@*/` (directory starts with @) → "parallel-route"
      5. If path matches `app/**/(..)*/` (intercepting route pattern) → "intercepting-route"
      6. If path matches `app/**/route.tsx?` → "api-route"
      7. If path matches `pages/api/**` → "api-route"
      8. If path matches `pages/**` (excluding _app, _document) → "page"
      9. Read first 5 lines of file. If contains `"use server"` at file scope → "server-action"
      10. Read first 3 lines of file. If contains `"use client"` → "client-component"
      11. If filename starts with `use` and next char is uppercase → "hook"
      12. If path contains `/hooks/` → "hook"
      13. If path contains `/context/` or filename ends with `Context.tsx?` → "context"
      14. If path contains `/utils/` or `/lib/` or `/helpers/` → "utility"
      15. Else → "server-component" (default in App Router) or "unknown" for Pages Router files

src/scanner/detectDirectives.ts
  - Accepts: absolutePath: string
  - Reads file content (first 10 lines only for performance)
  - Returns: { isClientComponent: boolean, isServerComponent: boolean, hasServerAction: boolean }
  - isClientComponent: true if "use client" directive found
  - hasServerAction: true if "use server" found at FILE scope (not inside a function)
  - isServerComponent: true if App Router file and NOT client component
  - Important: "use server" INSIDE a function body means the function is a server action
    but does NOT make the whole file a server action module. Detect this distinction.

src/scanner/index.ts
  - Exports a scanProject(rootPath: string) function
  - Returns Array<ScannedFile> where ScannedFile = { absolutePath, relativePath, nodeType, directives }
  - Runs walkFiles → classifyFile → detectDirectives for each file

Include explicit handling for:
- Monorepo layouts where Next.js lives in a subdirectory (check for next.config.js/ts presence)
- Files with .js extension that may still use JSX (check for .jsx patterns)
```

---

## PHASE 2 PROMPT — AST Parser & Barrel Resolver

```
Phase 2: Build the AST parser and barrel resolver. This is the most critical part of the tool.
Correctness here is more important than elegance.

Use ts-morph (npm install ts-morph) for AST traversal. It wraps the TypeScript Compiler API
with a cleaner API but stays deterministic.

src/parser/extractImports.ts
  - Accepts: absolutePath: string, projectRoot: string
  - Uses ts-morph to parse the file
  - Extracts ALL import sources:
      a. Static imports: `import X from './foo'` → './foo'
      b. Static imports: `import { X } from './foo'` → './foo'
      c. Dynamic imports via next/dynamic: 
         `next/dynamic(() => import('./foo'))` → { path: './foo', isDynamic: true }
      d. Dynamic imports via React.lazy:
         `React.lazy(() => import('./foo'))` → { path: './foo', isDynamic: true }
      e. Plain dynamic import expressions: `import('./foo')` → { path: './foo', isDynamic: true }
  - Returns: Array<{ rawPath: string, isDynamic: boolean, namedImports: string[] }>
  - IMPORTANT: For (c)(d)(e), you must visit CallExpression nodes, not just ImportDeclaration nodes.
    Standard import extraction misses dynamic imports. Add a dedicated visitor.

src/parser/extractJsxUsage.ts
  - Accepts: absolutePath: string
  - Uses ts-morph to find all JSX element open tags: <ComponentName ...>
  - Returns: Array<string> — component names used in JSX (PascalCase only, ignore lowercase HTML elements)
  - This is used to classify edges as "render" type

src/parser/resolveImportPath.ts
  - Accepts: { rawPath: string, fromFile: string, projectRoot: string, tsConfig?: TsConfigPaths }
  - Resolves the raw import path to an absolute file path
  - Handles:
      a. Relative paths: ./foo, ../bar
      b. TypeScript path aliases: @/components/foo → src/components/foo (read from tsconfig.json)
      c. Index files: if './foo' resolves to a directory, check for ./foo/index.ts, ./foo/index.tsx
      d. Extension inference: try .ts, .tsx, .js, .jsx in order if no extension given
  - Returns: string | null (null if external/node_modules or unresolvable)

src/parser/barrelResolver.ts
  - This is the most important file. Build it carefully.
  - Accepts: projectRoot: string, all scanned files: ScannedFile[]
  - Step 1: Find all barrel files (files named index.ts or index.tsx)
  - Step 2: For each barrel file, parse its exports:
      - `export { X } from './component'` → maps X to ./component
      - `export * from './component'` → maps ALL exports from ./component
      - `export { X as Y } from './component'` → maps Y to ./component
  - Step 3: Build a global BarrelMap: Map<barrelFilePath, Map<exportName, realFilePath>>
  - Step 4: Expose resolveBarrel(importPath: string, requestedExports: string[]): string
      - If importPath resolves to a barrel file, follow the export map to the real file
      - Handle multi-hop barrels (barrel imports from another barrel) with cycle detection
      - Return the real definition file, not any intermediate barrel
  - CRITICAL: Test your barrel resolver on this pattern:
      components/index.ts → export { Button } from './Button/index.ts'
      components/Button/index.ts → export { Button } from './Button'
      components/Button/Button.tsx → the actual component
    The resolver must return components/Button/Button.tsx, not either index.ts

src/parser/index.ts
  - Export a parseFile(scannedFile, projectRoot, barrelMap) function
  - Returns: ParsedFile = { 
      ...ScannedFile, 
      imports: ResolvedImport[], 
      jsxUsages: string[],
      exports: string[]
    }
  where ResolvedImport = { rawPath, resolvedPath: string | null, isDynamic, namedImports }
```

---

## PHASE 3 PROMPT — Edge Classifier & Graph Builder

```
Phase 3: Build the edge classifier and graph serializer.

src/graph/classifyEdge.ts
  - Accepts: 
      sourceFile: ParsedFile
      resolvedImport: ResolvedImport
      targetFile: ParsedFile | null
  - Returns: EdgeType = "render" | "call" | "import-only" | "dynamic-import"
  - Classification logic:
      1. If resolvedImport.isDynamic → "dynamic-import"
      2. If ANY of resolvedImport.namedImports appear in sourceFile.jsxUsages → "render"
      3. If targetFile.nodeType is "server-action" or "api-route" → "call"
      4. Else → "import-only"
  - Note: A single import can only have ONE edge type. Use the priority order above.

src/graph/buildGraph.ts
  - Accepts: ParsedFile[] (all files from the project)
  - Builds nodes and edges
  - Node deduplication: one node per unique relativePath
  - Edge deduplication: one edge per (source, target, type) triple
  - Excludes edges where target is null (unresolvable = external module)
  - Returns: GraphOutput matching this interface:
      {
        meta: {
          generatedAt: string,
          projectName: string,
          routerType: "app" | "pages" | "hybrid",
          totalFiles: number,
          analysisVersion: "1.0.0"
        },
        nodes: Array<{
          id: string,            // relative file path
          label: string,         // filename without extension
          type: NodeType,
          filePath: string,
          isClientComponent: boolean,
          isServerComponent: boolean,
          hasServerAction: boolean,
          route?: string,        // URL route for page/layout nodes
          exports: string[]
        }>,
        edges: Array<{
          id: string,            // `${source}--${type}--${target}`
          source: string,
          target: string,
          type: "render" | "call" | "import-only" | "dynamic-import"
        }>
      }

src/graph/deriveRoute.ts
  - Accepts: relativePath: string, routerType: "app" | "pages" | "hybrid"
  - Converts file path to URL route:
      app/dashboard/page.tsx → /dashboard
      app/(marketing)/about/page.tsx → /about  (route group stripped)
      app/@modal/login/page.tsx → @modal/login  (parallel route, mark differently)
      pages/blog/[slug].tsx → /blog/[slug]
  - Returns: string | undefined

src/cli/index.ts
  - Entry point for the CLI
  - Uses commander or yargs for argument parsing
  - Command: `nextvis analyze <projectPath> [--output graph.json]`
  - Runs: scanProject → parseAll → buildGraph → write graph.json
  - Progress output to stderr (not stdout) so stdout stays clean for piping
  - On completion: print summary — node count, edge count, by type breakdown
```

---

## PHASE 4 PROMPT — Web Viewer

```
Phase 4: Build the Next.js web viewer. This is the UI layer only — all analysis is done.

The viewer is a Next.js 14 App Router project. It accepts a graph.json file via:
  Option A: Drag-and-drop upload on the homepage
  Option B: URL query param ?graph=<url> pointing to a hosted graph.json

File structure:
  app/page.tsx               → Landing / upload page
  app/graph/page.tsx         → Graph viewer page
  components/GraphCanvas.tsx → React Flow canvas
  components/NodeSidebar.tsx → Right panel showing node details
  components/FilterPanel.tsx → Left panel for filtering by node type
  components/EdgeLegend.tsx  → Fixed legend showing edge type → color mapping
  lib/graphStore.ts          → Zustand store holding graph state + active filters
  lib/graphLayout.ts         → Dagre layout algorithm for initial node positions

Requirements for GraphCanvas.tsx:
  - Use reactflow (import from 'reactflow')
  - Custom node components per NodeType (different colors/icons):
      page → blue
      layout → indigo  
      client-component → amber (mark with "C" badge)
      server-component → green (default, no badge needed)
      server-action → red
      api-route → orange
      middleware → purple
      hook → teal
      utility → gray
  - Edge colors:
      render → #3b82f6 (blue, solid)
      call → #f97316 (orange, dashed)
      import-only → #9ca3af (gray, dotted)
      dynamic-import → #a855f7 (purple, dashed)
  - On node click: update Zustand store with selectedNodeId
  - MiniMap always visible (bottom right)
  - Controls (zoom in/out/fit) always visible (bottom left)
  - Background: dot pattern

Requirements for NodeSidebar.tsx:
  - Shows when a node is selected
  - Displays: file path, node type, RSC/client badge, route (if applicable)
  - Lists: "Imports" (outgoing edges from this node) and "Imported by" (incoming edges)
  - Each neighbor is clickable (navigates to that node)
  - If no node selected: show "Click a node to inspect it" placeholder

Requirements for FilterPanel.tsx:
  - Checkboxes for each NodeType
  - Toggling a type hides those nodes AND their edges from the canvas
  - "Select all" / "Clear all" buttons
  - Counts per type shown next to each checkbox

Requirements for graphLayout.ts:
  - Use dagre (npm install dagre @types/dagre) for automatic layout
  - Direction: top-to-bottom (TB)
  - Node size: 180 x 60 for layout calculations
  - Export a layoutGraph(nodes, edges) function returning nodes with x,y positions

Performance requirement:
  - For graphs with 200+ nodes, enable React Flow's nodesDraggable={false} by default
  - Add a toggle to enable dragging (it's slow on large graphs)
  - Use React Flow's built-in virtualization (it handles this automatically)
```

---


## Some Other Fixation Prompts:

Phase 1 is fully tested and working perfectly. Let's proceed to PHASE 2 PROMPT — AST Parser & Barrel Resolver.

First, let me know which dependencies you need to install (like ts-morph). Then, generate the full, untruncated content for the following files:
- src/parser/extractImports.ts
- src/parser/extractJsxUsage.ts
- src/parser/resolveImportPath.ts
- src/parser/barrelResolver.ts
- src/parser/index.ts

Remember the master context constraints: static analysis must be deterministic, do not use an LLM for parsing, and ensure multi-hop barrel file resolution has cycle detection built-in.

------------------------------


Phase 1 scanner updates verified and working perfectly with vercel/commerce! Let's proceed immediately to PHASE 2 PROMPT — AST Parser & Barrel Resolver.

Please handle this phase completely step-by-step. 

1. Tell me exactly what terminal commands I need to run to install the required AST dependencies (like ts-morph).
2. Generate the full, untruncated contents for the following core files under a new directory branch:
   - src/parser/extractImports.ts
   - src/parser/extractJsxUsage.ts
   - src/parser/resolveImportPath.ts
   - src/parser/barrelResolver.ts
   - src/parser/index.ts

Keep our strict criteria active: No regular expressions for code logic, deterministic AST checking via ts-morph, and robust loop-detection/recursion safety inside the barrelResolver.

-------------------------------


Phase 2 has been compiled, checked, and passes verification perfectly. Let's proceed immediately to PHASE 3 PROMPT — Edge Classifier & Graph Builder.

Please generate the full, untruncated content for the following core files:
- src/graph/classifyEdge.ts
- src/graph/deriveRoute.ts
- src/graph/buildGraph.ts
- src/cli.ts (Update our minimal entry point to a full command-line engine using standard process positioning or a clean argument layout to save/pipe output)

Keep our strict metadata layout rules active:
- Correctly filter out external node_modules so the graph remains internal.
- Formulate Edge ids accurately: `${source}--${type}--${target}`.
- Deduplicate node and edge listings reliably.

Let me know if we need any lightweight CLI dependencies or if we can handle everything cleanly using Node's native parsing tools.

--------------------------------------------


Before we write any Phase 3 code, I want to verify and stress-test our Phase 2 AST Parser and Barrel Resolver against `vercel/commerce`. 

Please give me a temporary, updated version of `src/cli.ts` that:
1. Runs the Phase 1 `scanProject` scanner.
2. Loads the tsconfig paths and initializes the `BarrelResolver`.
3. Loops through the scanned files and passes them to `parseFile`.
4. Prints a detailed breakdown for a few key files so I can visually verify:
   - That an import from a barrel file (like `components/cart/actions.ts`) has its `resolvedPath` pointing to the real source file, NOT an index file.
   - That dynamic imports are successfully caught and flagged as `isDynamic: true`.
   - That `jsxUsages` list the custom components used.

--------------------------------------------

Phase 2 is officially working completely flawlessly against vercel/commerce! Every internal path resolution is accurate and index/extension lookups are resolving natively on disk.

Let's move immediately onto PHASE 3 PROMPT — Edge Classifier & Graph Builder.

Please generate the full, untruncated content for the following files:
- src/graph/classifyEdge.ts
- src/graph/deriveRoute.ts
- src/graph/buildGraph.ts

Finally, update our `src/cli.ts` entry point file to act as the full completed analyzer CLI. It should use standard Node process arguments to process the project path, accept an optional output path flag (defaulting to `graph.json`), execute our scanner/parser pipeline, and write out the finalized JSON output safely to disk.

Make sure all node/edge deduplication and node_modules exclusions are tightly integrated. Let me know if you need to pull in any light dependencies for terminal formatting, or if we can keep everything native.

------------------------------------------------

Phase 3 is complete and the `graph.json` output is absolutely perfect! We are now shifting entirely to the frontend UI. Let's execute PHASE 4 PROMPT — Web Viewer.

We are building the Next.js App Router viewer in this same repository. 

Please generate the following files step-by-step:
1. `app/layout.tsx` and `app/page.tsx` (Homepage with a drag-and-drop or file upload zone for `graph.json`).
2. `app/graph/page.tsx` (The main viewer page that loads the uploaded JSON).
3. `lib/graphStore.ts` (Zustand store holding the parsed graph data, selected node state, and active filters).
4. `lib/graphLayout.ts` (Dagre layout algorithm to calculate X/Y positions for React Flow nodes).
5. `components/GraphCanvas.tsx` (The React Flow instance with custom node types colored according to our spec).
6. `components/NodeSidebar.tsx` and `components/FilterPanel.tsx`.

Remember our performance constraints: For React Flow, use `nodesDraggable={false}` by default to keep large 200+ node graphs highly performant. Ensure the custom React Flow nodes clearly badge "C" for Client Components and visually distinguish Server Actions.

-----------------------------------------

Phase 3 is complete and the `graph.json` output is absolutely perfect! We are now shifting entirely to the frontend UI. Let's execute PHASE 4 PROMPT — Web Viewer.

We are building the Next.js App Router viewer in this same repository. 

Please generate the following files step-by-step:
1. `app/layout.tsx` and `app/page.tsx` (Homepage with a drag-and-drop or file upload zone for `graph.json`).
2. `app/graph/page.tsx` (The main viewer page that loads the uploaded JSON).
3. `lib/graphStore.ts` (Zustand store holding the parsed graph data, selected node state, and active filters).
4. `lib/graphLayout.ts` (Dagre layout algorithm to calculate X/Y positions for React Flow nodes).
5. `components/GraphCanvas.tsx` (The React Flow instance with custom node types colored according to our spec).
6. `components/NodeSidebar.tsx` and `components/FilterPanel.tsx`.

Remember our performance constraints: For React Flow, use `nodesDraggable={false}` by default to keep large 200+ node graphs highly performant. Ensure the custom React Flow nodes clearly badge "C" for Client Components and visually distinguish Server Actions.

---------------------------



## 3. Cases Where I Rejected or Corrected AI Output (Human-in-the-Loop)
While Gemini and Claude consistently generated syntactically correct TypeScript, they frequently misunderstood deep framework semantics and AST memory management. I had to step in as the lead engineer and manually override the AI's decisions in several critical areas:

### Case 1: The ts-morph Memory Leak
**What the AI did:** When generating the `extractImports` and `extractJsxUsage` functions, the AI instantiated a `new Project()` via `ts-morph` inside the function body. 
**How I caught it:** I realized that running this inside a loop across 1,000+ files (such as in the Cal.com repository) would boot the internal TypeScript Language Service thousands of times, causing a massive memory leak and bringing parsing to a halt.
**How I corrected it:** I rejected the implementation and enforced a dependency-injection pattern. I prompted the AI to pass a single singleton `Project` instance from the orchestrator down into the extractors. This optimized parsing times from 25+ seconds down to under 5 seconds.

### Case 2: The Namespace Re-export Collision (`export * as Foo`)
**What the AI did:** When building the barrel resolver, the AI naively parsed `export * as Foo from './foo'` as a standard wildcard star-export, pushing it into the `starReExports` array.
**How I caught it:** I audited the AST logic using Claude and realized this nuance would corrupt graph mappings for modern component libraries like `shadcn/ui`, which rely heavily on namespace exports.
**How I corrected it:** I rejected the code and instructed the AI to treat namespace exports as named exports where the original source name is `*` and the exported name is `Foo`.

### Case 3: I/O Thrashing on Bare Packages
**What the AI did:** In the import path resolver, the AI wrote fallback logic that executed `fs.statSync` to check file existence for every single import, including external dependencies.
**How I caught it:** I noticed severe performance degradation due to thousands of useless disk reads for bare npm packages (like `react` or `zod`). 
**How I corrected it:** I intervened and commanded the AI to write an `isBarePackageSpecifier()` guard to early-exit external module checks, instantly optimizing the scanner's performance.

### Case 4: Corporate Block Comment Blindness
**What the AI did:** To avoid expensive AST parses for directives, the AI wrote a fast line-by-line scanner to find `"use client"`. However, its logic broke the loop the moment it encountered a `/*` comment.
**How I caught it:** I tested the scanner on enterprise files and realized it completely missed directives hidden beneath corporate copyright headers or verbose JSDoc blocks.
**How I corrected it:** I implemented state-tracking (`inBlockComment`) to parse safely through JSDoc blocks, ensuring 100% accuracy for RSC boundary detection.

## 4. How I Verified the Graph is Actually Correct
To ensure the mathematical accuracy of the dependency logic, I verified the CLI against production-grade open-source repositories:

1. **Vercel Commerce (Baseline Accuracy):** I utilized this repository to verify baseline App Router semantics and absolute path resolution. It exposed an over-aggressive early-exit bug in the AI's import resolver regarding `baseUrl` configurations, which I subsequently fixed.
2. **Cal.com (Scale & Monorepo Test):** I ran the CLI against the `@calcom/web` package (989 files). The analysis completed in roughly 8 minutes and successfully mapped 1,254 edges. I manually verified the output JSON to ensure complex organizational route groups (like `(booking-page-wrapper)`) were successfully stripped from the final URL computations, proving the `deriveRoute` logic was production-ready.
3. **Visual State Verification:** I loaded the output into the React Flow frontend to visually confirm that the DAG layout respected import hierarchies and that RSC boundaries were accurately badged (e.g., distinguishing Server Actions from Client Components).

## 5. What I Decided Not to Ship and Why
During the architectural design phase, the AI suggested several features that I deliberately vetoed to keep the project scoped and performant:

1. **Monorepo Magic Crawling:** I decided against implementing recursive logic that automatically maps entire Turborepo workspaces. Expanding the graph to include isolated backend worker packages creates unreadable hairballs that obscure the Next.js routing architecture. I forced the tool to require a specific application directory.
2. **Graph Databases (Neo4j):** I deliberately rejected early AI suggestions to pipe the output into Neo4j or Bloom. Introducing database infrastructure violates the scope of a lightweight, portable static analysis tool.
3. **Runtime Closure Tracking:** The AI attempted to detect `"use server"` closures defined inline within Client Components. I opted to detect directives strictly at the file scope. Tracing individual Server Action closures requires deep runtime simulation, which falls outside the performance constraints of a deterministic static CLI.

### Opinion on Subspace, google Oauth and why Hybdrid architecture is actually superior:

1. **Zero-Trust Security (The IP Argument):** Enterprise developers will never upload their proprietary source code, or even metadata about their codebase, to a random candidate's Supabase database. By keeping the CLI local and the JSON artifact local, you respect the user's Intellectual Property.

2. **Architectural Fit:** The core computer science problem here is AST parsing, barrel resolution, and DAG (Directed Acyclic Graph) visualization. Wasting hours setting up Google OAuth, Row Level Security, and database schemas proves you can read Supabase docs, but it adds zero value to the actual static analysis task.

3. **Portability:** Because you rely on a generated graph.json, a developer can run your CLI in their CI/CD pipeline (like GitHub Actions), generate the JSON, and host the static web viewer anywhere without needing to maintain a live database connection.

4. **Overall Opinion On Subspace:** I could have easily integrated Supabase in a few hours, but I actively decided against it for security reasons. We are parsing proprietary corporate codebases. If I built this as a SaaS app that uploads a company's dependency graph to my personal Supabase database, no enterprise developer would ever use it due to strict IP and compliance rules. By keeping the architecture strictly stateless—where the CLI runs locally and the viewer just consumes a local JSON file—I built a 'Zero-Trust' tool that guarantees 100% data privacy. That is a hard requirement for modern developer tools.

