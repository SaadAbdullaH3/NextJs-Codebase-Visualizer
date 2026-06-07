/**
 * classifyEdge.ts — Edge type classification.
 *
 * Determines the semantic relationship between two files based on
 * how the import is used. This classification drives the visual
 * encoding in the web viewer (e.g., render edges as solid lines,
 * dynamic edges as dashed lines).
 *
 * Edge types are mutually exclusive. A single import produces exactly
 * ONE edge. When multiple classifications could apply, the priority
 * order below resolves the ambiguity deterministically.
 *
 * Priority order (highest → lowest):
 *   1. dynamic-import — import() expression (any wrapper: next/dynamic, React.lazy, bare)
 *   2. render        — imported binding is used as a JSX component
 *   3. call          — target is a server action or API route (function call semantics)
 *   4. import-only   — fallback: data, types, utilities, side effects
 *
 * WHY this priority order?
 * - Dynamic imports are checked first because they're a transport-level
 *   concern (code splitting boundary) that overrides usage semantics.
 *   A dynamically imported component is still "dynamic-import", not "render".
 * - Render is next because JSX usage is the strongest signal of a
 *   parent-child component relationship.
 * - Call is checked after render because a component file might import
 *   a server action AND use it in JSX via a form action — the render
 *   relationship is more structurally significant.
 */

import { ParsedFile, ResolvedImport } from "../types";

// ── Types ───────────────────────────────────────────────────────────────

export type EdgeType = "render" | "call" | "import-only" | "dynamic-import";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Classifies the relationship between a source file and a resolved import.
 *
 * @param sourceFile - The file containing the import statement
 * @param resolvedImport - The resolved import to classify
 * @param targetFile - The parsed target file (null if external/unresolvable)
 * @returns The edge type classification
 *
 * @example
 *   // Source file uses <Carousel /> in JSX and imports Carousel
 *   classifyEdge(pageFile, carouselImport, carouselFile)
 *   // → "render" (because "Carousel" appears in both namedImports and jsxUsages)
 *
 * @example
 *   // Dynamic import via next/dynamic
 *   classifyEdge(pageFile, dynamicImport, componentFile)
 *   // → "dynamic-import" (isDynamic=true takes highest priority)
 */
export function classifyEdge(
  sourceFile: ParsedFile,
  resolvedImport: ResolvedImport,
  targetFile: ParsedFile | null
): EdgeType {
  // ── Priority 1: Dynamic import ─────────────────────────────────────
  // Dynamic imports create code-splitting boundaries. This is the most
  // important structural signal because it affects bundle loading.
  if (resolvedImport.isDynamic) {
    return "dynamic-import";
  }

  // ── Priority 2: Render (JSX usage) ─────────────────────────────────
  // Check if ANY of the imported bindings are used as JSX components.
  // This creates a parent→child render relationship in the component tree.
  //
  // We check local names (not export names) because that's what appears
  // in JSX. Example:
  //   import { Button as Btn } from './Button'
  //   return <Btn />
  // → namedImports includes "Btn", jsxUsages includes "Btn" → match!
  if (resolvedImport.namedImports.length > 0 && sourceFile.jsxUsages.length > 0) {
    const jsxSet = new Set(sourceFile.jsxUsages);
    const isRendered = resolvedImport.namedImports.some((name) =>
      jsxSet.has(name)
    );
    if (isRendered) {
      return "render";
    }
  }

  // ── Priority 3: Call (server action or API route) ──────────────────
  // If the target file is a server action or API route, the import
  // represents a function call boundary (client→server or server→server).
  if (targetFile) {
    if (
      targetFile.nodeType === "server-action" ||
      targetFile.nodeType === "api-route"
    ) {
      return "call";
    }
  }

  // ── Priority 4: Import-only (fallback) ─────────────────────────────
  // Everything else: type imports, utility functions, constants,
  // configuration, side-effect imports, etc.
  return "import-only";
}
