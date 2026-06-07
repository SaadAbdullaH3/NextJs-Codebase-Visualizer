/**
 * types.ts — Shared type definitions for the CLI scanner.
 *
 * These types mirror the graph.json schema from the scope doc,
 * but are scoped to the scanner's output. The graph builder (Phase 3)
 * will consume these and produce the final GraphOutput.
 */

// ── Node Types ──────────────────────────────────────────────────────────
// Priority-ordered: classifyFile applies rules top-to-bottom and returns
// the first match. This ordering matters — e.g., a page.tsx inside a
// route group is still a "page", not a "route-group".
export type NodeType =
  | "page"
  | "layout"
  | "route-group"
  | "parallel-route"
  | "intercepting-route"
  | "server-component"
  | "client-component"
  | "server-action"
  | "api-route"
  | "middleware"
  | "hook"
  | "utility"
  | "context"
  | "unknown";

// ── Directive Detection Result ──────────────────────────────────────────
export interface DirectiveInfo {
  /** True if "use client" directive found at file scope */
  isClientComponent: boolean;

  /**
   * True if the file is in the App Router tree AND is NOT a client component.
   * For Pages Router files, this is always false — Pages Router predates RSC.
   */
  isServerComponent: boolean;

  /**
   * True if "use server" directive found at FILE scope (top of file).
   * A "use server" inside a function body marks that function as a server action
   * but does NOT make the whole file a server-action module.
   */
  hasServerAction: boolean;
}

// ── File Discovery Result ───────────────────────────────────────────────
export interface DiscoveredFile {
  /** Fully resolved absolute path */
  absolutePath: string;

  /** Path relative to the project root, always using forward slashes */
  relativePath: string;
}

// ── Scanned File (Final Output of Phase 1) ──────────────────────────────
export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  nodeType: NodeType;
  directives: DirectiveInfo;
}

// ── Resolved Import (Phase 2 Output) ────────────────────────────────────
export interface ResolvedImport {
  /** The raw import path as written in source code */
  rawPath: string;

  /** Resolved absolute file path, or null if external/unresolvable */
  resolvedPath: string | null;

  /** Whether this is a dynamic import (import(), next/dynamic, React.lazy) */
  isDynamic: boolean;

  /**
   * Local binding names used in this file.
   * These are the names the developer actually uses in code (after aliasing).
   * Used by Phase 3 to match against JSX usage for render edge classification.
   *
   * Examples:
   *   import { Button } from '...'       → ["Button"]
   *   import { Button as Btn } from '...' → ["Btn"]
   *   import Carousel from '...'          → ["Carousel"]
   */
  namedImports: string[];
}

// ── Parsed File (Final Output of Phase 2) ───────────────────────────────
export interface ParsedFile extends ScannedFile {
  /** All resolved imports from this file */
  imports: ResolvedImport[];

  /** React component names used in JSX (PascalCase only) */
  jsxUsages: string[];

  /** Named exports from this file (for graph.json Node.exports field) */
  exports: string[];
}
