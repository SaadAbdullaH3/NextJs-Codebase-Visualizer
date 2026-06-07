/**
 * index.ts — Parser orchestrator.
 *
 * Combines import extraction, JSX usage detection, import path resolution,
 * and barrel resolution into a single parseFile() function.
 *
 * Public API:
 *   const tsConfig = loadTsConfigPaths(root);
 *   const resolver = buildBarrelResolver(root, scannedFiles);
 *   const parsed = parseFile(scannedFile, root, resolver, tsConfig);
 *
 * Key design: barrel imports are EXPANDED. If an import like
 * `import { Button, Input } from './components'` resolves through a barrel
 * and Button/Input come from different real files, we create separate
 * ResolvedImport entries — one per real target file. This ensures
 * edges in the graph point to the correct files, not barrel intermediaries.
 */

import { Project, SourceFile, ts } from "ts-morph";
import { ScannedFile, ResolvedImport, ParsedFile } from "../types";
import { extractImports, RawImport } from "./extractImports";
import { extractJsxUsage } from "./extractJsxUsage";
import {
  resolveImportPath,
  loadTsConfigPaths,
  TsConfigPaths,
} from "./resolveImportPath";
import { BarrelResolver } from "./barrelResolver";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Builds a barrel resolver for the given project.
 * Call this ONCE before parsing individual files.
 *
 * @param projectRoot - Absolute path to the project root
 * @param scannedFiles - All scanned files from Phase 1
 * @param tsConfigPaths - Optional pre-loaded tsconfig paths
 * @returns A configured BarrelResolver instance
 */
export function buildBarrelResolver(
  projectRoot: string,
  scannedFiles: ScannedFile[],
  tsConfigPaths?: TsConfigPaths | null
): BarrelResolver {
  const paths = tsConfigPaths ?? loadTsConfigPaths(projectRoot);
  return new BarrelResolver(projectRoot, scannedFiles, paths);
}

/**
 * Parses a single scanned file: extracts imports, resolves them through
 * barrels, extracts JSX usage, and extracts exports.
 *
 * This is the core function that transforms a Phase 1 ScannedFile into
 * a Phase 2 ParsedFile, ready for graph building in Phase 3.
 *
 * @param scannedFile - The scanned file from Phase 1
 * @param projectRoot - Absolute path to the project root
 * @param barrelResolver - Pre-built barrel resolver
 * @param tsConfigPaths - Optional tsconfig paths (loaded internally if not provided)
 * @returns Fully parsed file with resolved imports and JSX usage
 */
export function parseFile(
  scannedFile: ScannedFile,
  projectRoot: string,
  barrelResolver: BarrelResolver,
  tsConfigPaths?: TsConfigPaths | null
): ParsedFile {
  const { absolutePath } = scannedFile;

  // Load tsconfig paths if not provided
  const paths = tsConfigPaths ?? loadTsConfigPaths(projectRoot);

  // ── Step 1: Extract raw imports ────────────────────────────────────
  const rawImports = extractImports(absolutePath, projectRoot);

  // ── Step 2: Resolve imports and expand barrel re-exports ───────────
  const resolvedImports = resolveAndExpandImports(
    rawImports,
    absolutePath,
    projectRoot,
    barrelResolver,
    paths
  );

  // ── Step 3: Extract JSX component usage ────────────────────────────
  const jsxUsages = extractJsxUsage(absolutePath);

  // ── Step 4: Extract this file's exports ────────────────────────────
  const fileExports = extractFileExports(absolutePath);

  return {
    ...scannedFile,
    imports: resolvedImports,
    jsxUsages,
    exports: fileExports,
  };
}

// ── Internal: Import resolution and barrel expansion ─────────────────

/**
 * Resolves raw imports to absolute paths and expands barrel imports.
 *
 * BARREL EXPANSION explained:
 * When an import points to a barrel file and has named specifiers,
 * each specifier might resolve to a DIFFERENT real file. We must
 * expand the single raw import into multiple resolved imports.
 *
 * Example:
 *   // Source code:
 *   import { Button, Input } from './components';
 *   // components/index.ts is a barrel that maps:
 *   //   Button → ./Button/Button.tsx
 *   //   Input  → ./Input/Input.tsx
 *
 *   // Expanded to two ResolvedImports:
 *   { resolvedPath: '.../Button/Button.tsx', namedImports: ['Button'] }
 *   { resolvedPath: '.../Input/Input.tsx',   namedImports: ['Input'] }
 *
 * This ensures edges in the dependency graph point to the real files.
 */
function resolveAndExpandImports(
  rawImports: RawImport[],
  fromFile: string,
  projectRoot: string,
  barrelResolver: BarrelResolver,
  tsConfigPaths: TsConfigPaths | null
): ResolvedImport[] {
  const resolvedImports: ResolvedImport[] = [];

  for (const raw of rawImports) {
    // Step 1: Resolve the raw path to an absolute file path
    const resolvedPath = resolveImportPath(
      raw.rawPath,
      fromFile,
      projectRoot,
      tsConfigPaths
    );

    // External or unresolvable — keep with null resolvedPath
    if (!resolvedPath) {
      resolvedImports.push({
        rawPath: raw.rawPath,
        resolvedPath: null,
        isDynamic: raw.isDynamic,
        namedImports: raw.specifiers.map((s) => s.local),
      });
      continue;
    }

    // Step 2: Check if resolved path is a barrel file WITH named specifiers
    if (
      barrelResolver.isBarrelFile(resolvedPath) &&
      raw.specifiers.length > 0
    ) {
      expandBarrelImport(raw, resolvedPath, barrelResolver, resolvedImports);
    } else {
      // Not a barrel, or no named specifiers — use resolved path directly.
      // This handles:
      // - Regular file imports: import X from './Button'
      // - Side-effect imports: import './styles'
      // - Dynamic imports: import('./foo')
      // - Barrel imports with namespace: import * as Components from './components'
      resolvedImports.push({
        rawPath: raw.rawPath,
        resolvedPath,
        isDynamic: raw.isDynamic,
        namedImports: raw.specifiers.map((s) => s.local),
      });
    }
  }

  return resolvedImports;
}

/**
 * Expands a single barrel import into multiple resolved imports,
 * one per real target file.
 *
 * Groups specifiers by the real file they resolve to, since multiple
 * specifiers from the same barrel might point to the same real file.
 */
function expandBarrelImport(
  raw: RawImport,
  barrelPath: string,
  barrelResolver: BarrelResolver,
  resolvedImports: ResolvedImport[]
): void {
  // Group specifiers by their resolved real file path.
  // Key: real file path, Value: array of local binding names
  const byRealFile = new Map<string, string[]>();

  for (const spec of raw.specifiers) {
    // Use the EXPORTED name for barrel resolution.
    // The barrel's export map uses exported names, not local aliases.
    const realPath = barrelResolver.resolveExport(barrelPath, spec.exported);

    // Use the real path if resolved; fall back to barrel path otherwise.
    // Falling back to barrel path means the barrel has a local definition
    // (e.g., export const VERSION = '1.0') that isn't a re-export.
    const targetPath = realPath || barrelPath;

    if (!byRealFile.has(targetPath)) {
      byRealFile.set(targetPath, []);
    }
    // Store the LOCAL name — this is what the developer uses in code,
    // and what Phase 3 will match against JSX usage.
    byRealFile.get(targetPath)!.push(spec.local);
  }

  // Create a separate ResolvedImport for each unique real file
  for (const [realFilePath, localNames] of byRealFile) {
    resolvedImports.push({
      rawPath: raw.rawPath,
      resolvedPath: realFilePath,
      isDynamic: raw.isDynamic,
      namedImports: localNames,
    });
  }
}

// ── Internal: Export extraction ──────────────────────────────────────

/**
 * Extracts all export names from a source file.
 * Used for the Node.exports field in graph.json.
 *
 * Uses ts-morph's getExportedDeclarations() which returns a map
 * of exportName → declaration nodes. We only need the names.
 */
function extractFileExports(absolutePath: string): string[] {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      noEmit: true,
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(absolutePath);
  } catch {
    return [];
  }

  const exports: string[] = [];
  for (const [name] of sourceFile.getExportedDeclarations()) {
    exports.push(name);
  }

  return exports;
}

// ── Re-exports for convenience ──────────────────────────────────────────
export { BarrelResolver } from "./barrelResolver";
export { extractImports } from "./extractImports";
export { extractJsxUsage } from "./extractJsxUsage";
export { resolveImportPath, loadTsConfigPaths } from "./resolveImportPath";
export type { RawImport, ImportSpecifier } from "./extractImports";
export type { TsConfigPaths } from "./resolveImportPath";
export type { ResolvedImport, ParsedFile } from "../types";
