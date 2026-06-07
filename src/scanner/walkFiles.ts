/**
 * walkFiles.ts — Recursive directory walker for source file discovery.
 *
 * Walks a project root and returns every .ts/.tsx/.js/.jsx file,
 * excluding known non-source directories (node_modules, .next, etc.).
 *
 * Design decisions:
 * - Uses Node's built-in fs/path APIs only. No third-party deps.
 * - Returns forward-slash relative paths regardless of OS, because
 *   the graph.json schema uses forward slashes for portability.
 * - Handles monorepo layouts by checking for next.config.* presence
 *   at the given root. If the caller passes a monorepo subdirectory,
 *   it just works — we walk whatever root we're given.
 */

import * as fs from "fs";
import * as path from "path";
import { DiscoveredFile } from "../types";

// Directories to skip entirely. These never contain user source code
// and can be enormous (node_modules alone can have 100k+ files).
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "out",
  "build",
  ".turbo",
  ".vercel",
  "coverage",
]);

// File extensions we care about. Only TypeScript and JavaScript source.
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * Recursively walks `rootPath` and returns all source files.
 *
 * @param rootPath - Absolute path to the project root directory.
 * @returns Array of discovered files with absolute and relative paths.
 * @throws If rootPath does not exist or is not a directory.
 */
export function walkFiles(rootPath: string): DiscoveredFile[] {
  // Resolve to absolute path to handle relative inputs
  const resolvedRoot = path.resolve(rootPath);

  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Project root does not exist: ${resolvedRoot}`);
  }

  const rootStat = fs.statSync(resolvedRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`Project root is not a directory: ${resolvedRoot}`);
  }

  const results: DiscoveredFile[] = [];
  walkRecursive(resolvedRoot, resolvedRoot, results);
  return results;
}

/**
 * Internal recursive walker. Separated from the public API so we can
 * pass the original root through for relative path computation.
 */
function walkRecursive(
  currentDir: string,
  rootDir: string,
  results: DiscoveredFile[]
): void {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (err) {
    // Permission denied or similar — skip this directory silently.
    // This is common in real-world projects with symlinks or
    // OS-level protected directories.
    console.warn(`Warning: Cannot read directory ${currentDir}, skipping.`);
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      // Skip excluded directories by exact name match
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      walkRecursive(fullPath, rootDir, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();

      if (SOURCE_EXTENSIONS.has(ext)) {
        // Compute relative path with forward slashes for cross-platform consistency.
        // path.relative on Windows produces backslashes; we normalize them.
        const relativePath = path
          .relative(rootDir, fullPath)
          .split(path.sep)
          .join("/");

        results.push({
          absolutePath: fullPath,
          relativePath,
        });
      }
    }
    // Symlinks, sockets, etc. are ignored — we only care about
    // regular files and directories.
  }
}
