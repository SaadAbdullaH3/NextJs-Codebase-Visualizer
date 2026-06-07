/**
 * extractImports.ts — AST-based import extraction.
 *
 * Uses ts-morph to parse a source file and extract all imports:
 * - Static imports (import declarations)
 * - Dynamic imports (import() expressions, next/dynamic, React.lazy)
 *
 * This module does NOT resolve import paths — that's handled by
 * resolveImportPath.ts. It only extracts the raw import paths
 * as they appear in the source code.
 *
 * WHY ts-morph and not regex?
 * The master context says: "All parsing must use the TypeScript Compiler
 * API or direct AST traversal." Regex-based import extraction fails on:
 * - Multi-line imports
 * - Commented-out imports
 * - Template literal dynamic imports
 * - Re-exports that look like imports
 * AST traversal is deterministic and handles all valid TypeScript syntax.
 */

import { Project, SyntaxKind, Node, SourceFile, ts } from "ts-morph";

// ── Types ───────────────────────────────────────────────────────────────

/**
 * A single import specifier binding.
 * Tracks both the exported name (from the source module) and the
 * local name (used in this file) to support:
 * - Barrel resolution (needs exported name, e.g., "Button")
 * - JSX/render edge matching (needs local name, e.g., "Btn")
 */
export interface ImportSpecifier {
  /** Name as exported by the source module. "default" for default imports, "*" for namespace. */
  exported: string;
  /** Name used locally in this file. May differ if aliased (import { X as Y }). */
  local: string;
}

/**
 * Represents a single import statement or dynamic import() expression.
 */
export interface RawImport {
  /** The raw module specifier as written in source (e.g., './Button', '@/lib/utils') */
  rawPath: string;
  /** True for dynamic import() expressions (including next/dynamic, React.lazy wrappers) */
  isDynamic: boolean;
  /**
   * Import specifiers with both exported and local names.
   * Empty for side-effect imports (`import './styles'`) and dynamic imports.
   */
  specifiers: ImportSpecifier[];
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Extracts all imports from a source file using AST traversal.
 *
 * @param absolutePath - Full path to the source file
 * @param _projectRoot - Project root (reserved for future use)
 * @returns Array of raw imports found in the file
 */
export function extractImports(absolutePath: string, _projectRoot: string): RawImport[] {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      // Use ReactJSX (value 4) to parse .tsx/.jsx files correctly.
      // This must match the jsx setting most Next.js projects use.
      jsx: ts.JsxEmit.ReactJSX,
      noEmit: true,
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(absolutePath);
  } catch (err) {
    console.warn(`Warning: Could not parse ${absolutePath} for import extraction.`);
    return [];
  }

  const imports: RawImport[] = [];

  // ── Part 1: Static import declarations ─────────────────────────────
  // Handles all forms:
  //   import X from './foo'              → default import
  //   import { X } from './foo'          → named import
  //   import { X as Y } from './foo'     → aliased named import
  //   import * as X from './foo'         → namespace import
  //   import './foo'                     → side-effect import (no specifiers)
  extractStaticImports(sourceFile, imports);

  // ── Part 2: Dynamic import() expressions ───────────────────────────
  // Finds ALL import() calls anywhere in the file. This automatically
  // handles all three dynamic import patterns from the spec:
  //   (c) next/dynamic(() => import('./foo'))  — import() is inside callback
  //   (d) React.lazy(() => import('./foo'))    — import() is inside callback
  //   (e) Plain: const m = import('./foo')     — standalone import()
  //
  // We don't need to detect the dynamic/lazy wrappers specifically
  // because the import() call is always present inside them.
  extractDynamicImports(sourceFile, imports);

  return imports;
}

// ── Internal extraction functions ───────────────────────────────────────

/**
 * Extracts static import declarations from the source file.
 */
function extractStaticImports(sourceFile: SourceFile, imports: RawImport[]): void {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const rawPath = importDecl.getModuleSpecifierValue();
    const specifiers: ImportSpecifier[] = [];

    // Default import: import Foo from './foo'
    // The source module exports it as "default"; locally it's "Foo".
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      specifiers.push({
        exported: "default",
        local: defaultImport.getText(),
      });
    }

    // Named imports: import { Foo, Bar as Baz } from './foo'
    // getName() returns the original exported name.
    // getAliasNode() returns the local alias if present.
    for (const namedImport of importDecl.getNamedImports()) {
      const exportedName = namedImport.getName();
      const aliasNode = namedImport.getAliasNode();
      specifiers.push({
        exported: exportedName,
        local: aliasNode ? aliasNode.getText() : exportedName,
      });
    }

    // Namespace import: import * as Foo from './foo'
    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      specifiers.push({
        exported: "*",
        local: namespaceImport.getText(),
      });
    }

    imports.push({
      rawPath,
      isDynamic: false,
      specifiers,
    });
  }
}

/**
 * Extracts dynamic import() expressions by visiting all CallExpression
 * nodes in the AST.
 *
 * In TypeScript's AST, `import('./foo')` is a CallExpression where
 * the expression is an ImportKeyword token. This is distinct from
 * static ImportDeclaration nodes.
 *
 * We only extract string literal arguments — template literals or
 * variables can't be resolved statically and would violate our
 * determinism constraint.
 */
function extractDynamicImports(sourceFile: SourceFile, imports: RawImport[]): void {
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = callExpr.getExpression();

    // Check if this is an import() call (expression is ImportKeyword)
    if (expression.getKind() === SyntaxKind.ImportKeyword) {
      const args = callExpr.getArguments();

      if (args.length > 0 && Node.isStringLiteral(args[0])) {
        imports.push({
          rawPath: args[0].getLiteralValue(),
          isDynamic: true,
          // Dynamic imports don't have named specifiers at the import site.
          // The imported module's exports are accessed at runtime.
          specifiers: [],
        });
      }
      // If the argument is not a string literal (e.g., template literal,
      // variable, or computed expression), we skip it — it can't be
      // resolved statically, aligning with our determinism constraint.
    }
  }
}
