/**
 * buildGraph.ts — Graph builder and serializer.
 *
 * Takes the full set of ParsedFiles from Phase 2 and produces the
 * final GraphOutput conforming to the graph.json schema from the scope doc.
 *
 * Key responsibilities:
 * 1. Node creation — one node per unique relative file path
 * 2. Edge creation — one edge per (source, target, type) triple
 * 3. Deduplication — no duplicate nodes or edges in the output
 * 4. External exclusion — edges to null targets (npm packages) are dropped
 * 5. Self-loop exclusion — a file importing itself creates no edge
 * 6. Route derivation — page/layout nodes get a URL route
 * 7. Metadata — generation timestamp, project info, analysis version
 *
 * The output is designed to be consumed directly by the web viewer
 * (D3.js force graph, React Flow, etc.) without any transformation.
 */

import * as fs from "fs";
import * as path from "path";
import { ParsedFile, ResolvedImport, NodeType } from "../types";
import { classifyEdge, EdgeType } from "./classifyEdge";
import { deriveRoute, detectRouterType, RouterType } from "./deriveRoute";

// ── Output Types ────────────────────────────────────────────────────────

export interface GraphMeta {
  generatedAt: string;
  projectName: string;
  routerType: RouterType;
  totalFiles: number;
  analysisVersion: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  filePath: string;
  isClientComponent: boolean;
  isServerComponent: boolean;
  hasServerAction: boolean;
  route?: string;
  exports: string[];
  revalidatesPaths: string[];
  revalidatesTags: string[];
  hasFetch: boolean;
  dbClients: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
}

export interface GraphOutput {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Constants ───────────────────────────────────────────────────────────

const ANALYSIS_VERSION = "1.0.0";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Builds the complete dependency graph from parsed files.
 *
 * @param parsedFiles - All parsed files from Phase 2
 * @param projectRoot - Absolute path to the project root
 * @returns Complete graph output ready for JSON serialization
 */
export function buildGraph(
  parsedFiles: ParsedFile[],
  projectRoot: string
): GraphOutput {
  // ── Detect router type ─────────────────────────────────────────────
  const relativePaths = parsedFiles.map((f) => f.relativePath);
  const routerType = detectRouterType(relativePaths);

  // ── Build lookup maps ──────────────────────────────────────────────
  // absolutePath → ParsedFile for O(1) target lookups during edge creation
  const fileByAbsolutePath = new Map<string, ParsedFile>();
  // relativePath → ParsedFile for deduplication check
  const fileByRelativePath = new Map<string, ParsedFile>();

  for (const file of parsedFiles) {
    fileByAbsolutePath.set(file.absolutePath, file);

    // Deduplication: one node per unique relative path.
    // In practice, each file should have a unique relative path, but
    // this guard protects against edge cases in monorepos.
    if (!fileByRelativePath.has(file.relativePath)) {
      fileByRelativePath.set(file.relativePath, file);
    }
  }

  // ── Build nodes ────────────────────────────────────────────────────
  const nodes: GraphNode[] = [];

  for (const [relativePath, file] of fileByRelativePath) {
    const label = deriveLabel(relativePath);
    const route = deriveRoute(relativePath, routerType);

    const node: GraphNode = {
      id: relativePath,
      label,
      type: file.nodeType,
      filePath: relativePath,
      isClientComponent: file.directives.isClientComponent,
      isServerComponent: file.directives.isServerComponent,
      hasServerAction: file.directives.hasServerAction,
      exports: file.exports,
      revalidatesPaths: file.revalidatesPaths ?? [],
      revalidatesTags: file.revalidatesTags ?? [],
      hasFetch: file.hasFetch ?? false,
      dbClients: file.dbClients ?? [],
    };

    // Only set route if defined (avoid cluttering JSON with undefined)
    if (route !== undefined) {
      node.route = route;
    }

    nodes.push(node);
  }

  // ── Build edges ────────────────────────────────────────────────────
  // Track (source, target, type) triples for deduplication.
  // A file might import the same target through different raw paths
  // (e.g., './Button' and '../components/Button' resolving to the same
  // file). We only want one edge per semantic relationship.
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const sourceFile of parsedFiles) {
    for (const imp of sourceFile.imports) {
      // Skip external/unresolvable imports (null resolvedPath)
      if (!imp.resolvedPath) continue;

      // Look up the target file in our parsed files
      const targetFile = fileByAbsolutePath.get(imp.resolvedPath) ?? null;

      // Skip if target isn't part of our scanned project.
      // This handles edge cases where a resolved path points outside
      // the project (e.g., a symlinked node_modules package).
      if (!targetFile) continue;

      // Skip self-loops — a file importing itself has no useful meaning
      if (sourceFile.relativePath === targetFile.relativePath) continue;

      // Classify the edge type
      const edgeType = classifyEdge(sourceFile, imp, targetFile);

      // Deduplicate: one edge per (source, target, type) triple
      const edgeKey = `${sourceFile.relativePath}--${edgeType}--${targetFile.relativePath}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);

      edges.push({
        id: edgeKey,
        source: sourceFile.relativePath,
        target: targetFile.relativePath,
        type: edgeType,
      });
    }
  }

  // ── Build metadata ─────────────────────────────────────────────────
  const projectName = deriveProjectName(projectRoot);

  const meta: GraphMeta = {
    generatedAt: new Date().toISOString(),
    projectName,
    routerType,
    totalFiles: nodes.length,
    analysisVersion: ANALYSIS_VERSION,
  };

  return { meta, nodes, edges };
}

// ── Internal helpers ────────────────────────────────────────────────────

/**
 * Derives a display label for a graph node from its file path.
 *
 * For most files, this is the filename without extension:
 *   "components/carousel.tsx" → "carousel"
 *
 * For index files, we include the parent directory to avoid ambiguity:
 *   "components/grid/index.tsx" → "grid/index"
 *   "lib/shopify/index.ts" → "shopify/index"
 *
 * For page/layout files, we include the route segment:
 *   "app/dashboard/page.tsx" → "dashboard/page"
 *   "app/layout.tsx" → "app/layout"
 */
function deriveLabel(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const basename = path.basename(normalized);
  const nameWithoutExt = basename.replace(/\.(tsx?|jsx?)$/, "");

  // Index files: include parent directory for disambiguation
  if (nameWithoutExt === "index") {
    const parentDir = path.basename(path.dirname(normalized));
    return `${parentDir}/index`;
  }

  // Page and layout files: include parent directory for context
  if (nameWithoutExt === "page" || nameWithoutExt === "layout") {
    const parentDir = path.basename(path.dirname(normalized));
    return `${parentDir}/${nameWithoutExt}`;
  }

  // Route file: include parent directory
  if (nameWithoutExt === "route") {
    const parentDir = path.basename(path.dirname(normalized));
    return `${parentDir}/route`;
  }

  return nameWithoutExt;
}

/**
 * Derives a human-readable project name from the project root path.
 * Falls back to the directory basename if package.json is unavailable.
 */
function deriveProjectName(projectRoot: string): string {
  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const raw = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(raw);
    if (pkg.name && typeof pkg.name === "string") {
      return pkg.name;
    }
  } catch {
    // No package.json or invalid JSON — fall through
  }

  return path.basename(projectRoot);
}
