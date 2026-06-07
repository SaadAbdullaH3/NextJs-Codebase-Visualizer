/**
 * barrelResolver.ts — Barrel file (index.ts/tsx) resolver.
 *
 * This is the most critical module in the tool. The assessment explicitly
 * calls out barrel files as the #1 failure mode of AST-only tools.
 *
 * What this module does:
 * 1. Finds all barrel files (index.ts, index.tsx, index.js, index.jsx)
 * 2. Parses their re-export declarations to build an export map
 * 3. Resolves imports through barrels to real definition files
 * 4. Handles multi-hop barrels (barrel → barrel → real file)
 * 5. Detects and breaks cycles to prevent infinite recursion
 *
 * CRITICAL INVARIANT: Edges in the final graph must point to real
 * definition files, NEVER to barrel/index files. Any edge pointing
 * to a barrel file is a bug.
 *
 * MULTI-HOP TEST CASE (from spec):
 *   components/index.ts         → export { Button } from './Button'
 *   components/Button/index.ts  → export { Button } from './Button'
 *   components/Button/Button.tsx → the actual component
 *
 *   resolveExport('components/index.ts', 'Button')
 *     → follows to components/Button/index.ts (another barrel)
 *     → follows to components/Button/Button.tsx (real file)
 *     → returns components/Button/Button.tsx ✓
 */

import * as path from "path";
import { Project, SourceFile, ts } from "ts-morph";
import { ScannedFile } from "../types";
import { resolveImportPath, TsConfigPaths } from "./resolveImportPath";

// ── Types ───────────────────────────────────────────────────────────────

/**
 * Parsed information about a single barrel file's re-exports.
 */
interface BarrelInfo {
  /**
   * Named re-exports: exportedName → { source file path, original name }
   *
   * For `export { Button } from './Button'`:
   *   "Button" → { sourcePath: ".../Button.tsx", originalName: "Button" }
   *
   * For `export { default as Button } from './Button'`:
   *   "Button" → { sourcePath: ".../Button.tsx", originalName: "default" }
   *
   * The originalName is what the SOURCE module calls the export.
   * The map key (exportedName) is what THIS barrel exports it as.
   */
  namedReExports: Map<string, { sourcePath: string; originalName: string }>;

  /**
   * Star re-exports: list of absolute paths for `export * from '...'` targets.
   * These re-export ALL named exports from the target file.
   * Note: `export *` does NOT re-export default exports (per ES module spec).
   */
  starReExports: string[];
}

// ── Constants ───────────────────────────────────────────────────────────

/**
 * Maximum recursion depth for barrel resolution.
 * In practice, barrel chains rarely exceed 3-4 levels. A depth of 20
 * is generous for any real codebase while catching infinite loops from bugs.
 */
const MAX_RESOLUTION_DEPTH = 20;

/** File names that indicate a barrel file */
const BARREL_FILE_NAMES = new Set([
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
]);

// ── Public API ──────────────────────────────────────────────────────────

export class BarrelResolver {
  /** Maps barrel file absolute path → parsed barrel info */
  private barrelMap: Map<string, BarrelInfo> = new Map();

  /** Cache for file export lookups (non-barrel files) */
  private fileExportsCache: Map<string, Set<string>> = new Map();

  /** Shared ts-morph project for parsing barrel files and checking exports */
  private project: Project;

  /** Project root for import resolution */
  private projectRoot: string;

  /** tsconfig path aliases */
  private tsConfigPaths: TsConfigPaths | null;

  constructor(
    projectRoot: string,
    scannedFiles: ScannedFile[],
    tsConfigPaths: TsConfigPaths | null
  ) {
    this.projectRoot = projectRoot;
    this.tsConfigPaths = tsConfigPaths;

    // Create a single shared ts-morph project for all barrel parsing.
    // This avoids creating hundreds of Project instances.
    // skipFileDependencyResolution = true because we handle resolution
    // manually through the barrel map.
    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        jsx: ts.JsxEmit.ReactJSX,
        noEmit: true,
      },
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });

    this.buildBarrelMap(scannedFiles);
  }

  /**
   * Checks if a resolved file path is a barrel file.
   */
  isBarrelFile(absolutePath: string): boolean {
    return this.barrelMap.has(absolutePath);
  }

  /**
   * Resolves a single export name through a barrel file chain to the
   * real definition file.
   *
   * @param barrelPath - Absolute path to the barrel file
   * @param exportName - The export name to resolve ("default", "Button", etc.)
   * @returns Absolute path to the real definition file, or null if unresolvable
   *
   * @example
   *   // Given: components/index.ts has `export { Button } from './Button'`
   *   resolver.resolveExport('/project/components/index.ts', 'Button')
   *   // Returns: '/project/components/Button.tsx'
   */
  resolveExport(barrelPath: string, exportName: string): string | null {
    return this.resolveWithCycleDetection(barrelPath, exportName, new Set(), 0);
  }

  /**
   * Returns the barrel map for debugging/testing.
   */
  getBarrelMap(): ReadonlyMap<string, BarrelInfo> {
    return this.barrelMap;
  }

  // ── Private: Barrel map construction ────────────────────────────────

  /**
   * Builds the barrel map by finding and parsing all barrel files
   * among the scanned project files.
   */
  private buildBarrelMap(scannedFiles: ScannedFile[]): void {
    // Step 1: Find all barrel files among scanned files
    const barrelFiles = scannedFiles.filter((f) => {
      const basename = path.basename(f.absolutePath);
      return BARREL_FILE_NAMES.has(basename);
    });

    if (barrelFiles.length === 0) return;

    // Step 2: Parse each barrel file's re-export declarations
    for (const barrelFile of barrelFiles) {
      const info = this.parseBarrelExports(barrelFile.absolutePath);
      if (info) {
        this.barrelMap.set(barrelFile.absolutePath, info);
      }
    }

    // Log summary for debugging
    const totalNamedReExports = [...this.barrelMap.values()].reduce(
      (sum, info) => sum + info.namedReExports.size,
      0
    );
    const totalStarReExports = [...this.barrelMap.values()].reduce(
      (sum, info) => sum + info.starReExports.length,
      0
    );

    console.log(
      `Barrel resolver: found ${this.barrelMap.size} barrel files ` +
        `(${totalNamedReExports} named re-exports, ${totalStarReExports} star re-exports)`
    );
  }

  /**
   * Parses a barrel file's export declarations to build its BarrelInfo.
   *
   * We look specifically at ExportDeclaration nodes (ts-morph's
   * getExportDeclarations()), which represent:
   *   - `export { X } from './component'`    → named re-export
   *   - `export { X as Y } from './component'` → aliased re-export
   *   - `export * from './component'`         → star re-export
   *
   * We do NOT look at local exports (export const, export function)
   * because those are not re-exports — they're definitions in the
   * barrel file itself. If someone imports a locally-defined export
   * from a barrel, the barrel IS the real file.
   */
  private parseBarrelExports(absolutePath: string): BarrelInfo | null {
    let sourceFile: SourceFile;
    try {
      // Reuse source file if already parsed, otherwise add it
      sourceFile =
        this.project.getSourceFile(absolutePath) ||
        this.project.addSourceFileAtPath(absolutePath);
    } catch {
      console.warn(`Warning: Could not parse barrel file ${absolutePath}`);
      return null;
    }

    const info: BarrelInfo = {
      namedReExports: new Map(),
      starReExports: [],
    };

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();

      // Skip local re-exports: `export { X }` without a `from` clause.
      // These re-export local bindings, not imported modules.
      if (!moduleSpecifier) continue;

      // Resolve the module specifier to an absolute file path
      const resolvedPath = resolveImportPath(
        moduleSpecifier,
        absolutePath,
        this.projectRoot,
        this.tsConfigPaths
      );

      if (!resolvedPath) {
        // External module or unresolvable — skip
        continue;
      }

      const namespaceExport = exportDecl.getNamespaceExport();

      if (namespaceExport) {
        // ── Namespace re-export: export * as Foo from './component' ──
        info.namedReExports.set(namespaceExport.getName(), {
          sourcePath: resolvedPath,
          originalName: "*",
        });
      } else if (exportDecl.isNamespaceExport()) {
        // ── Star re-export: export * from './component' ──────────────
        // All named exports from the target become available through
        // this barrel. Note: default exports are NOT included
        // (per ES module specification).
        info.starReExports.push(resolvedPath);
      } else {
        // ── Named re-exports ─────────────────────────────────────────
        // export { X } from './component'
        // export { X as Y } from './component'
        // export { default as X } from './component'
        for (const namedExport of exportDecl.getNamedExports()) {
          // getName() returns the original name from the source module.
          // For `export { default as Button }`, getName() returns "default".
          const originalName = namedExport.getName();

          // getAliasNode() returns the alias if present.
          // For `export { X as Y }`, this returns "Y".
          // For `export { X }`, this returns undefined.
          const aliasNode = namedExport.getAliasNode();
          const exportedName = aliasNode ? aliasNode.getText() : originalName;

          info.namedReExports.set(exportedName, {
            sourcePath: resolvedPath,
            originalName,
          });
        }
      }
    }

    return info;
  }

  // ── Private: Resolution with cycle detection ───────────────────────

  /**
   * Resolves an export name through the barrel chain with cycle detection.
   *
   * Algorithm:
   * 1. If currentPath is NOT a barrel → it's the real file, return it.
   * 2. If currentPath IS a barrel:
   *    a. Check named re-exports for exact match → recurse into source
   *    b. Check star re-exports (export * from '...'):
   *       - If star source is a barrel → recurse
   *       - If star source is a regular file → check if it exports the name
   *    c. If nothing found → return null (the barrel itself may have
   *       a local definition, but we can't confirm without more info)
   *
   * Cycle detection uses a Set of "path::exportName" keys. If we see
   * the same (path, name) pair twice, we've hit a cycle and bail out.
   */
  private resolveWithCycleDetection(
    currentPath: string,
    exportName: string,
    visited: Set<string>,
    depth: number
  ): string | null {
    // ── Guard: max depth ─────────────────────────────────────────────
    if (depth > MAX_RESOLUTION_DEPTH) {
      console.warn(
        `Barrel resolution exceeded max depth (${MAX_RESOLUTION_DEPTH}) ` +
          `for "${exportName}" at ${currentPath}`
      );
      return null;
    }

    // ── Guard: cycle detection ───────────────────────────────────────
    const key = `${currentPath}::${exportName}`;
    if (visited.has(key)) {
      console.warn(
        `Barrel resolution cycle detected: "${exportName}" at ${currentPath}`
      );
      return null;
    }
    visited.add(key);

    // ── Base case: not a barrel file ─────────────────────────────────
    // If the current path is NOT in our barrel map, it's a regular file.
    // This IS the real definition file we're looking for.
    const barrelInfo = this.barrelMap.get(currentPath);
    if (!barrelInfo) {
      return currentPath;
    }

    // ── Check named re-exports first (highest priority) ──────────────
    // Named re-exports are explicit mappings, so they take precedence
    // over star re-exports.
    const namedEntry = barrelInfo.namedReExports.get(exportName);
    if (namedEntry) {
      // Follow the chain: the source might itself be another barrel.
      // Use the ORIGINAL name, not the exported name, because the
      // source module knows the export by its original name.
      return this.resolveWithCycleDetection(
        namedEntry.sourcePath,
        namedEntry.originalName,
        visited,
        depth + 1
      );
    }

    // ── Check star re-exports ────────────────────────────────────────
    // For `export * from './foo'`, we need to check if foo provides
    // the requested export.
    for (const starSource of barrelInfo.starReExports) {
      const starBarrelInfo = this.barrelMap.get(starSource);

      if (starBarrelInfo) {
        // Star source is itself a barrel — recurse into it.
        // The barrel's own resolution logic will check its re-exports.
        const result = this.resolveWithCycleDetection(
          starSource,
          exportName,
          visited,
          depth + 1
        );
        if (result) return result;
      } else {
        // Star source is a regular file — check if it actually
        // exports the requested name. We can't just assume it does.
        const exports = this.getFileExports(starSource);
        if (exports.has(exportName)) {
          return starSource;
        }
      }
    }

    // ── Export not found in any re-export ─────────────────────────────
    // Possible explanations:
    // 1. The barrel has a local definition (export const X = ...)
    //    that isn't in our re-export map. The barrel IS the real file.
    // 2. The import is genuinely broken in the source code.
    //
    // We return null and let the caller fall back to the barrel path.
    return null;
  }

  // ── Private: File export inspection ────────────────────────────────

  /**
   * Gets the set of export names from a non-barrel file.
   * Results are cached for performance.
   *
   * Uses ts-morph's getExportedDeclarations() which returns all named
   * exports declared in the file. With skipFileDependencyResolution,
   * this includes locally declared exports but NOT exports from
   * `export * from '...'` in non-barrel files.
   *
   * Known limitation: if a non-barrel file has `export * from './other'`,
   * the re-exported names from './other' won't be discoverable here.
   * This is rare in practice and doesn't affect the vercel/commerce
   * codebase or most real-world Next.js projects.
   */
  private getFileExports(absolutePath: string): Set<string> {
    const cached = this.fileExportsCache.get(absolutePath);
    if (cached) return cached;

    let sourceFile: SourceFile;
    try {
      sourceFile =
        this.project.getSourceFile(absolutePath) ||
        this.project.addSourceFileAtPath(absolutePath);
    } catch {
      const empty = new Set<string>();
      this.fileExportsCache.set(absolutePath, empty);
      return empty;
    }

    const exports = new Set<string>();

    // getExportedDeclarations() returns a Map<string, ExportedDeclarations[]>.
    // The key is the export name, the value is the declaration node(s).
    // We only need the names, not the declaration details.
    for (const [name] of sourceFile.getExportedDeclarations()) {
      exports.add(name);
    }

    this.fileExportsCache.set(absolutePath, exports);
    return exports;
  }
}
