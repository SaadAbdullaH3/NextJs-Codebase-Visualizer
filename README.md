# nextgraph — Next.js Codebase Visualizer

## What it does
NextVis is a hybrid developer tool that analyzes Next.js codebases and generates an interactive, visual dependency graph. It reveals the architectural structure of your project by surfacing the relationships between components, identifying Server vs. Client boundaries, and tracking multi-hop barrel file re-exports.

## Form factor choice and rationale (CLI + local viewer)
The tool consists of two distinct parts:
1. **Node.js CLI**: Performs deterministic static analysis using the TypeScript Compiler API (`ts-morph`) to scan directories and parse ASTs locally. This ensures your source code never leaves your machine and avoids the unpredictability/hallucinations of LLMs.
2. **Next.js Web Viewer**: A modern, interactive UI built with React Flow and Dagre. It ingests the JSON output from the CLI and renders the graph locally.

This decoupled architecture allows the analyzer to run flawlessly in CI/CD pipelines without UI overhead, while providing a rich, high-performance visualization experience in the browser.

## How to run

### 1. Generate the graph
Run the analyzer against your Next.js project directory.
```bash
npm run build:cli
npm run scan -- /path/to/your/nextjs/project -o my-graph.json
```
or use already generated graphs in Public folder to test. 

### 2. View the graph
either use the deployed link 

 https://nexjs-codebase-visualizer.vercel.app

or use the local viewer
```bash
npm run dev
```
Open `http://localhost:3000` in your browser and drag-and-drop the generated `my-graph.json` file.

## What it handles well
- **Barrel resolution**: Intelligently follows and resolves multi-hop re-exports (e.g., `export { X } from './barrel'`) back to their true origin file.
- **RSC boundary detection**: Clearly identifies and visually distinguishes Server Components, Client Components (marked with "C"), and Server Actions (marked with "S").
- **App Router + Pages Router**: Automatically detects and derives appropriate URL routes from file paths.
- **Dynamic imports**: Detects lazy-loaded modules (`next/dynamic`, `React.lazy`) and highlights them as distinct code-splitting boundaries.
- **Edge classification**: Distinguishes structural relationships: Render (JSX usage), Call (Server Actions/APIs), Import-only, and Dynamic Import.

## Known limitations / conscious deferrals
- **Wildcard re-exports in deeply nested barrels (partial support)**: Deeply chained `export * from './module'` might lose track of the specific named binding if the AST gets excessively convoluted.
- **Turborepo / monorepos (not supported)**: The current path resolution logic assumes a single Next.js application root directory. Cross-workspace package resolution is not supported.
- **Circular import detection**: The graph builds correctly without crashing, but circular dependencies are not explicitly highlighted in the UI.

## Sample output: cal.com
*(Run the analyzer against cal.com and upload the graph.json here)*
![Viewer Screenshot](/public/graph_viewer.png)

## Design decisions
- **Deterministic AST over LLMs**: Static analysis guarantees 100% accuracy for dependency tracing and avoids hallucinations.
- **Zustand over Context**: Chosen for high-performance state management, avoiding unnecessary re-renders in the large React Flow canvas.
- **Dagre over Force-directed**: Dagre's top-to-bottom layout naturally fits dependency graphs, aligning pages at the top and leaf components at the bottom.
- **React Flow's nodesDraggable={false}**: Disabled by default to maintain smooth rendering for 200+ node graphs.

## Tech stack
- **Analyzer**: Node.js, TypeScript, `ts-morph` (TypeScript Compiler API).
- **Viewer**: Next.js 14 (App Router), React, Tailwind CSS, `reactflow`, `dagre`, `zustand`, `lucide-react`.
