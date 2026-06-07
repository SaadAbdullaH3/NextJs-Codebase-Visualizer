/**
 * detectDirectives.ts — RSC boundary and server action detection.
 *
 * Reads the first few lines of a file to detect "use client" and
 * "use server" directives. This is intentionally line-based, not
 * AST-based, because:
 *
 * 1. Directives must appear before any other code (per React/Next.js spec)
 * 2. Line scanning is ~100x faster than full AST parse for this check
 * 3. We'll do full AST parsing in Phase 2 anyway — no need to double-parse
 *
 * IMPORTANT DISTINCTION (from the spec):
 * - "use server" at FILE scope (top of file, before any code) means the
 *   entire module is a server-action module. Every exported function
 *   becomes a server action.
 * - "use server" INSIDE a function body marks just that function as a
 *   server action. The file itself is NOT a server-action module.
 *
 * This module only detects FILE-SCOPE directives. Function-level
 * "use server" detection requires AST traversal and will be handled
 * in the AST parser phase (Phase 2).
 */

import * as fs from "fs";

export interface DirectiveResult {
  isClientComponent: boolean;
  isServerComponent: boolean;
  hasServerAction: boolean;
}

/**
 * Maximum number of lines to read for directive detection.
 * Directives must appear before any code, but we allow some slack
 * for comments, blank lines, and shebangs at the top of a file.
 */
const MAX_LINES_TO_SCAN = 20;

/**
 * Detects "use client" and "use server" directives at file scope.
 *
 * @param absolutePath - Full path to the source file.
 * @param isAppRouterFile - Whether this file lives under the `app/` directory.
 *   This matters because only App Router files default to server components.
 *   Pages Router files are neither server nor client components in the RSC sense.
 * @returns Directive detection results.
 */
export function detectDirectives(
  absolutePath: string,
  isAppRouterFile: boolean
): DirectiveResult {
  let fileContent: string;

  try {
    fileContent = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    // If we can't read the file, return safe defaults
    console.warn(`Warning: Cannot read file ${absolutePath}, skipping directive detection.`);
    return {
      isClientComponent: false,
      isServerComponent: false,
      hasServerAction: false,
    };
  }

  const lines = fileContent.split("\n").slice(0, MAX_LINES_TO_SCAN);

  let foundUseClient = false;
  let foundUseServer = false;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inBlockComment) {
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    // Skip empty lines and single-line comments — directives can appear
    // after these without violating the "must be first statement" rule.
    if (trimmed === "" || trimmed.startsWith("//")) {
      continue;
    }

    // Check for "use client" directive.
    // Valid forms: "use client", 'use client', "use client";, 'use client';
    if (isUseClientDirective(trimmed)) {
      foundUseClient = true;
      // "use client" and "use server" are mutually exclusive at file scope.
      // A file cannot be both. If both appear, "use client" takes precedence
      // (this matches Next.js behavior — it errors, but we handle gracefully).
      break;
    }

    // Check for "use server" directive at file scope.
    if (isUseServerDirective(trimmed)) {
      foundUseServer = true;
      break;
    }

    // If we hit any other statement (import, const, function, etc.),
    // directives can no longer appear. Stop scanning.
    break;
  }

  return {
    isClientComponent: foundUseClient,
    // Server component = App Router file that doesn't have "use client".
    // This is the React Server Components default behavior.
    isServerComponent: isAppRouterFile && !foundUseClient,
    hasServerAction: foundUseServer,
  };
}

/**
 * Checks if a trimmed line is a "use client" directive.
 *
 * Valid forms per the React spec:
 *   "use client"
 *   "use client";
 *   'use client'
 *   'use client';
 */
function isUseClientDirective(trimmedLine: string): boolean {
  return (
    trimmedLine === '"use client"' ||
    trimmedLine === '"use client";' ||
    trimmedLine === "'use client'" ||
    trimmedLine === "'use client';"
  );
}

/**
 * Checks if a trimmed line is a "use server" directive.
 * Same pattern as "use client".
 */
function isUseServerDirective(trimmedLine: string): boolean {
  return (
    trimmedLine === '"use server"' ||
    trimmedLine === '"use server";' ||
    trimmedLine === "'use server'" ||
    trimmedLine === "'use server';"
  );
}
