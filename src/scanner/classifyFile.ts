/**
 * classifyFile.ts — Next.js file classifier.
 *
 * Determines the NodeType for a source file based on its path and,
 * when necessary, its file-scope directives. Classification rules
 * are applied in strict priority order — the FIRST match wins.
 *
 * Priority ordering rationale:
 * - Middleware is highest priority because it's a unique, project-root file.
 * - Page/layout/route patterns come next because they're defined by
 *   Next.js file conventions and take precedence over directive-based
 *   classification. A page.tsx with "use client" is still a "page",
 *   not a "client-component" — the directive info is stored separately
 *   in DirectiveInfo.
 * - Directive-based types (server-action, client-component) come after
 *   structural patterns.
 * - Convention-based types (hook, context, utility) come last.
 * - Default fallback depends on whether the file is in App Router or Pages Router.
 *
 * IMPORTANT: The classifier now accepts a ProjectContext so it can make
 * project-level decisions. In an App Router project, ANY .tsx/.jsx file
 * without "use client" is a server component by default — not just files
 * under the app/ directory. This matches Next.js RSC semantics.
 */

import * as path from "path";
import { DiscoveredFile, NodeType } from "../types";
import { detectDirectives, DirectiveResult } from "./detectDirectives";

/**
 * Project-level context that affects how individual files are classified.
 * Determined once by the orchestrator (index.ts) and passed to every call.
 */
export interface ProjectContext {
  /**
   * True if the project has an app/ (or src/app/) directory.
   * When true, .tsx/.jsx files without "use client" default to
   * server-component instead of "unknown".
   */
  projectUsesAppRouter: boolean;
}

/**
 * Result of classifying a single file.
 */
export interface ClassificationResult {
  nodeType: NodeType;
  directives: DirectiveResult;
}

/**
 * Classifies a discovered file into a NodeType.
 *
 * @param file - The discovered file with absolute and relative paths.
 * @param context - Project-level context (e.g., does the project use App Router?).
 * @returns The node type and directive information.
 */
export function classifyFile(file: DiscoveredFile, context: ProjectContext): ClassificationResult {
  const { relativePath, absolutePath } = file;

  // Normalize the relative path for pattern matching.
  // relativePath already uses forward slashes (from walkFiles).
  const segments = relativePath.split("/");
  const fileName = segments[segments.length - 1];
  const fileNameNoExt = fileName.replace(/\.(tsx?|jsx?)$/, "");

  // Determine if this file lives directly inside the App Router or Pages Router tree.
  const isInAppDir = segments[0] === "app" || (segments[0] === "src" && segments[1] === "app");
  const isPagesRouterFile = segments[0] === "pages" || (segments[0] === "src" && segments[1] === "pages");

  // For directive detection, a file should be treated as "App Router" if:
  // 1. It lives directly under app/, OR
  // 2. The project uses App Router and the file is a .tsx/.jsx component
  //    (e.g., components/carousel.tsx in an App Router project is an RSC by default)
  const ext = path.extname(fileName).toLowerCase();
  const isReactFile = ext === ".tsx" || ext === ".jsx";
  const isAppRouterContext = isInAppDir || (context.projectUsesAppRouter && !isPagesRouterFile);

  // Detect directives early — we need them for rules 9-10 and for the
  // returned DirectiveInfo regardless of which rule matches.
  const directives = detectDirectives(absolutePath, isAppRouterContext);

  // ── Rule 1: Middleware ─────────────────────────────────────────────
  // middleware.ts or middleware.js at project root (or src/ root)
  if (
    (relativePath === "middleware.ts" || relativePath === "middleware.js") ||
    (relativePath === "src/middleware.ts" || relativePath === "src/middleware.js")
  ) {
    return { nodeType: "middleware", directives };
  }

  // ── Rule 2: App Router page ────────────────────────────────────────
  // app/**/page.tsx or app/**/page.ts (also handles src/app/)
  if (isInAppDir && (fileNameNoExt === "page")) {
    return { nodeType: "page", directives };
  }

  // ── Rule 3: App Router layout ──────────────────────────────────────
  if (isInAppDir && (fileNameNoExt === "layout")) {
    return { nodeType: "layout", directives };
  }

  // ── Rule 4: Parallel route ─────────────────────────────────────────
  // Any file under a directory that starts with @ (e.g., app/@sidebar/)
  if (isInAppDir && segments.some((seg) => seg.startsWith("@"))) {
    // A page.tsx inside a parallel route was already caught by Rule 2.
    // If we're here, it's a non-page file that lives under an @slot dir.
    return { nodeType: "parallel-route", directives };
  }

  // ── Rule 5: Intercepting route ─────────────────────────────────────
  // Directories using (.) (..) (...) patterns for route interception.
  // Patterns: (.), (..), (...), or (..)someRoute
  const interceptingPattern = /^\(\.+\)/;
  if (isInAppDir && segments.some((seg) => interceptingPattern.test(seg))) {
    return { nodeType: "intercepting-route", directives };
  }

  // ── Rule 6: App Router API route (route handler) ───────────────────
  if (isInAppDir && (fileNameNoExt === "route")) {
    return { nodeType: "api-route", directives };
  }

  // ── Rule 7: Pages Router API route ─────────────────────────────────
  // pages/api/** (any file under pages/api/)
  if (isPagesRouterFile && isUnderApiDir(segments)) {
    return { nodeType: "api-route", directives };
  }

  // ── Rule 8: Pages Router page ──────────────────────────────────────
  // pages/** excluding _app.tsx, _document.tsx, _error.tsx, and api/
  if (isPagesRouterFile && !isUnderApiDir(segments) && !isNextInternalPage(fileNameNoExt)) {
    return { nodeType: "page", directives };
  }

  // ── Rule 9: Server action (file-scope "use server") ────────────────
  if (directives.hasServerAction) {
    return { nodeType: "server-action", directives };
  }

  // ── Rule 10: Client component ("use client") ──────────────────────
  if (directives.isClientComponent) {
    return { nodeType: "client-component", directives };
  }

  // ── Rule 11: Hook (filename convention) ────────────────────────────
  // File name starts with "use" and next char is uppercase: useAuth, useState, etc.
  if (fileNameNoExt.startsWith("use") && fileNameNoExt.length > 3 && isUpperCase(fileNameNoExt[3])) {
    return { nodeType: "hook", directives };
  }

  // ── Rule 12: Hook (directory convention) ───────────────────────────
  if (segments.includes("hooks")) {
    return { nodeType: "hook", directives };
  }

  // ── Rule 13: Context ──────────────────────────────────────────────
  // Path contains /context/ OR filename ends with "Context"
  if (segments.includes("context") || segments.includes("contexts") || fileNameNoExt.endsWith("Context")) {
    return { nodeType: "context", directives };
  }

  // ── Rule 14: Utility ──────────────────────────────────────────────
  if (segments.includes("utils") || segments.includes("lib") || segments.includes("helpers")) {
    return { nodeType: "utility", directives };
  }

  // ── Rule 15: Default fallback ──────────────────────────────────────
  // In an App Router project, .tsx/.jsx files without "use client" are
  // server components by default — regardless of which directory they
  // live in. This is how React Server Components work: the boundary is
  // opt-in via "use client", not directory-based.
  //
  // Non-React files (.ts/.js) that don't match any convention above
  // get "unknown" — they're likely config files, type definitions, etc.
  if (isInAppDir) {
    return { nodeType: "server-component", directives };
  }

  if (context.projectUsesAppRouter && isReactFile) {
    return { nodeType: "server-component", directives };
  }

  return { nodeType: "unknown", directives };
}

// ── Helper functions ────────────────────────────────────────────────────

/**
 * Checks if the path segments indicate the file is under an `api/` directory
 * within the pages router.
 */
function isUnderApiDir(segments: string[]): boolean {
  // For `pages/api/...` → segments[1] === "api"
  // For `src/pages/api/...` → segments[2] === "api"
  const pagesIndex = segments.indexOf("pages");
  return pagesIndex !== -1 && segments[pagesIndex + 1] === "api";
}

/**
 * Next.js internal pages that should NOT be classified as user pages.
 * _app, _document, _error are framework files, not routes.
 */
function isNextInternalPage(fileNameNoExt: string): boolean {
  return fileNameNoExt === "_app" || fileNameNoExt === "_document" || fileNameNoExt === "_error";
}

/**
 * Simple uppercase check for a single character.
 */
function isUpperCase(char: string): boolean {
  return char >= "A" && char <= "Z";
}
