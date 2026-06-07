/**
 * cli.ts — Full analyzer CLI entry point.
 *
 * Orchestrates the complete pipeline:
 *   Phase 1: scanProject() → file discovery + classification
 *   Phase 2: parseFile()   → AST parsing + barrel resolution
 *   Phase 3: buildGraph()  → edge classification + graph serialization
 *
 * Usage:
 *   npm run build && npm run scan -- <projectPath> [--output graph.json]
 *
 * Design decisions:
 * - No external CLI framework (commander, yargs). The argument surface
 *   is tiny (one positional + one optional flag), so process.argv is fine.
 *   Fewer dependencies = fewer audit issues = better for an assessment.
 * - Progress output goes to stderr so stdout stays clean for piping:
 *   `npm run scan -- ./commerce > graph.json` works correctly.
 * - JSON output is pretty-printed with 2-space indent for readability.
 *   The file size difference is negligible for 200-file projects.
 */

import * as fs from "fs";
import * as path from "path";
import { scanProject } from "./scanner";
import { buildBarrelResolver, loadTsConfigPaths, parseFile } from "./parser";
import { buildGraph } from "./graph";

// ── Types ───────────────────────────────────────────────────────────────

interface CliArgs {
  projectPath: string;
  outputPath: string;
}

// ── Main ────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs();
  const startTime = Date.now();

  // All progress output goes to stderr so stdout is reserved for piping
  const log = (msg: string) => process.stderr.write(msg + "\n");

  log(`\n  nextvis v1.0.0 — Next.js Codebase Visualizer`);
  log(`  ─────────────────────────────────────────────\n`);

  const resolvedProject = path.resolve(args.projectPath);
  log(`  Project: ${resolvedProject}`);
  log(`  Output:  ${path.resolve(args.outputPath)}\n`);

  try {
    // ── Phase 1: File Discovery & Classification ─────────────────────
    log(`  [Phase 1] Scanning project files...`);
    const scannedFiles = scanProject(resolvedProject);
    log(`  [Phase 1] Found ${scannedFiles.length} files.\n`);

    // ── Phase 2: AST Parsing & Barrel Resolution ─────────────────────
    log(`  [Phase 2] Parsing imports and resolving barrels...`);
    const tsConfigPaths = loadTsConfigPaths(resolvedProject);
    const barrelResolver = buildBarrelResolver(
      resolvedProject,
      scannedFiles,
      tsConfigPaths
    );

    const parsedFiles = scannedFiles.map((file) =>
      parseFile(file, resolvedProject, barrelResolver, tsConfigPaths)
    );
    log(`  [Phase 2] Parsed ${parsedFiles.length} files.\n`);

    // ── Phase 3: Graph Building & Serialization ──────────────────────
    log(`  [Phase 3] Building dependency graph...`);
    const graph = buildGraph(parsedFiles, resolvedProject);

    // Write graph.json to disk
    const outputPath = path.resolve(args.outputPath);
    const outputDir = path.dirname(outputPath);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2), "utf-8");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // ── Print summary ────────────────────────────────────────────────
    log(`  [Phase 3] Graph built and written to ${outputPath}\n`);
    log(`  ── Analysis Summary ──────────────────────────────`);
    log(`  Project:     ${graph.meta.projectName}`);
    log(`  Router:      ${graph.meta.routerType}`);
    log(`  Total files: ${graph.meta.totalFiles}`);
    log(`  Total nodes: ${graph.nodes.length}`);
    log(`  Total edges: ${graph.edges.length}`);
    log(`  Time:        ${elapsed}s`);
    log(``);

    // Edge breakdown by type
    const edgeCounts = new Map<string, number>();
    for (const edge of graph.edges) {
      edgeCounts.set(edge.type, (edgeCounts.get(edge.type) || 0) + 1);
    }

    log(`  Edge breakdown:`);
    const edgeTypeOrder = [
      "render",
      "call",
      "import-only",
      "dynamic-import",
    ];
    for (const type of edgeTypeOrder) {
      const count = edgeCounts.get(type) || 0;
      if (count > 0) {
        log(`    ${type.padEnd(16)} ${count}`);
      }
    }

    // Node breakdown by type
    const nodeCounts = new Map<string, number>();
    for (const node of graph.nodes) {
      nodeCounts.set(node.type, (nodeCounts.get(node.type) || 0) + 1);
    }

    log(``);
    log(`  Node breakdown:`);
    const sortedNodeTypes = [...nodeCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    );
    for (const [type, count] of sortedNodeTypes) {
      log(`    ${type.padEnd(20)} ${count}`);
    }

    log(`  ──────────────────────────────────────────────────\n`);

    // Print route map for page nodes
    const pageNodes = graph.nodes.filter(
      (n) => n.route !== undefined && n.type === "page"
    );
    if (pageNodes.length > 0) {
      log(`  Route map:`);
      for (const node of pageNodes) {
        log(`    ${node.route!.padEnd(30)} → ${node.filePath}`);
      }
      log(``);
    }

    log(`  ✓ Analysis complete.\n`);
  } catch (err) {
    log(
      `\n  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    if (err instanceof Error && err.stack) {
      log(`  Stack: ${err.stack}\n`);
    }
    process.exit(1);
  }
}

// ── Argument parsing ────────────────────────────────────────────────────

/**
 * Parses CLI arguments from process.argv.
 *
 * Supports:
 *   npm run scan -- <projectPath>
 *   npm run scan -- <projectPath> --output custom.json
 *   npm run scan -- <projectPath> -o custom.json
 *   npm run scan -- --help
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  let projectPath: string | null = null;
  let outputPath = "graph.json";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--output" || arg === "-o") {
      if (i + 1 >= args.length) {
        process.stderr.write("Error: --output requires a file path argument.\n");
        process.exit(1);
      }
      outputPath = args[++i];
    } else if (arg.startsWith("-")) {
      process.stderr.write(`Error: Unknown option '${arg}'.\n`);
      printUsage();
      process.exit(1);
    } else {
      // Positional argument — the project path
      if (projectPath !== null) {
        process.stderr.write(
          `Error: Unexpected argument '${arg}'. Only one project path is allowed.\n`
        );
        process.exit(1);
      }
      projectPath = arg;
    }
  }

  if (!projectPath) {
    process.stderr.write("Error: Project path is required.\n");
    printUsage();
    process.exit(1);
  }

  return { projectPath, outputPath };
}

function printUsage(): void {
  process.stderr.write(`
  Usage: nextvis <projectPath> [options]

  Analyze a Next.js project and generate a dependency graph.

  Arguments:
    projectPath          Path to the Next.js project root

  Options:
    -o, --output <path>  Output file path (default: graph.json)
    -h, --help           Show this help message

  Examples:
    npm run scan -- ../commerce
    npm run scan -- ../commerce --output analysis/graph.json
    npm run scan -- ../commerce -o custom.json

`);
}

main();
