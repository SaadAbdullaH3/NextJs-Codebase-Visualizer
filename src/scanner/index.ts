/**
 * index.ts — Scanner orchestrator.
 *
 * This is the public API for Phase 1. It composes walkFiles, classifyFile,
 * and detectDirectives into a single scanProject() function.
 *
 * Usage:
 *   import { scanProject } from './scanner';
 *   const files = scanProject('/path/to/nextjs-project');
 *
 * Monorepo handling:
 *   If the given rootPath doesn't contain a next.config.* file but a
 *   subdirectory does, we warn the user. We do NOT auto-recurse into
 *   subdirectories because:
 *   1. The user should explicitly point to the Next.js project root
 *   2. Auto-detection in monorepos is fragile and violates "no magic"
 *   3. A clear error message is better than silent wrong behavior
 */

import * as fs from "fs";
import * as path from "path";
import { ScannedFile } from "../types";
import { walkFiles } from "./walkFiles";
import { classifyFile, ProjectContext } from "./classifyFile";

// ── Next.js config file names ───────────────────────────────────────────
// We check for these to validate that the root is actually a Next.js project.
const NEXT_CONFIG_FILES = [
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
];

/**
 * Scans a Next.js project and returns classified file information.
 *
 * @param rootPath - Absolute or relative path to the Next.js project root.
 * @returns Array of scanned files with type classification and directive info.
 * @throws If the path doesn't exist or isn't a directory.
 */
export function scanProject(rootPath: string): ScannedFile[] {
  const resolvedRoot = path.resolve(rootPath);

  // ── Validate the project root ──────────────────────────────────────
  validateProjectRoot(resolvedRoot);

  // ── Step 1: Discover all source files ──────────────────────────────
  const discoveredFiles = walkFiles(resolvedRoot);

  if (discoveredFiles.length === 0) {
    console.warn(
      `Warning: No source files (.ts, .tsx, .js, .jsx) found in ${resolvedRoot}. ` +
      `Is this the correct project root?`
    );
    return [];
  }

  // ── Step 2: Detect project-level context ────────────────────────────
  // Check once whether this project uses the App Router. This affects
  // how files outside app/ are classified (e.g., components/carousel.tsx
  // is a server component in App Router projects).
  const projectContext: ProjectContext = {
    projectUsesAppRouter:
      fs.existsSync(path.join(resolvedRoot, "app")) ||
      fs.existsSync(path.join(resolvedRoot, "src", "app")),
  };

  // ── Step 3: Classify each file and detect directives ───────────────
  // classifyFile internally calls detectDirectives, so each file is
  // read once for directive detection, not twice.
  const scannedFiles: ScannedFile[] = discoveredFiles.map((file) => {
    const { nodeType, directives } = classifyFile(file, projectContext);

    return {
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      nodeType,
      directives,
    };
  });

  // ── Log summary statistics ─────────────────────────────────────────
  logScanSummary(scannedFiles);

  return scannedFiles;
}

/**
 * Validates that the given path looks like a Next.js project root.
 * Issues warnings (not errors) if validation fails, because:
 * - The tool should still work on partial or non-standard setups
 * - A hard error on missing next.config.js would break on valid
 *   Next.js 13.4+ projects that use app/ without config
 */
function validateProjectRoot(resolvedRoot: string): void {
  // Check if a next.config file exists at the root
  const hasNextConfig = NEXT_CONFIG_FILES.some((configFile) =>
    fs.existsSync(path.join(resolvedRoot, configFile))
  );

  if (!hasNextConfig) {
    // Check if package.json has next as a dependency — more reliable
    // than config file presence for modern Next.js projects
    const packageJsonPath = path.join(resolvedRoot, "package.json");
    let hasNextDep = false;

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        hasNextDep = "next" in allDeps;
      } catch {
        // Malformed package.json — warn and continue
      }
    }

    if (!hasNextDep) {
      console.warn(
        `Warning: No next.config.* or "next" dependency found at ${resolvedRoot}.\n` +
        `This may not be a Next.js project root. If this is a monorepo, ` +
        `point the tool at the specific Next.js package directory.`
      );
    }
  }

  // Check for common router directories
  const hasAppDir = fs.existsSync(path.join(resolvedRoot, "app")) ||
    fs.existsSync(path.join(resolvedRoot, "src", "app"));
  const hasPagesDir = fs.existsSync(path.join(resolvedRoot, "pages")) ||
    fs.existsSync(path.join(resolvedRoot, "src", "pages"));

  if (!hasAppDir && !hasPagesDir) {
    console.warn(
      `Warning: No app/ or pages/ directory found. ` +
      `The scanner will still discover source files, but classification ` +
      `will rely on directive and naming conventions only.`
    );
  }
}

/**
 * Logs a summary of what the scanner found, grouped by node type.
 * Useful for quick sanity-checking after a scan.
 */
function logScanSummary(files: ScannedFile[]): void {
  const typeCounts = new Map<string, number>();

  for (const file of files) {
    typeCounts.set(file.nodeType, (typeCounts.get(file.nodeType) || 0) + 1);
  }

  console.log(`\n── Scan Summary ──────────────────────────────────`);
  console.log(`Total files discovered: ${files.length}`);
  console.log(`Breakdown by type:`);

  // Sort by count descending for readability
  const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    console.log(`  ${type}: ${count}`);
  }

  // Count directive-based stats
  const clientComponents = files.filter((f) => f.directives.isClientComponent).length;
  const serverComponents = files.filter((f) => f.directives.isServerComponent).length;
  const serverActions = files.filter((f) => f.directives.hasServerAction).length;

  console.log(`\nDirective detection:`);
  console.log(`  "use client" files: ${clientComponents}`);
  console.log(`  Server components (App Router default): ${serverComponents}`);
  console.log(`  "use server" modules: ${serverActions}`);
  console.log(`──────────────────────────────────────────────────\n`);
}

// Re-export types and sub-modules for convenience
export { walkFiles } from "./walkFiles";
export { classifyFile } from "./classifyFile";
export { detectDirectives } from "./detectDirectives";
export type { ScannedFile, NodeType, DirectiveInfo, DiscoveredFile } from "../types";
