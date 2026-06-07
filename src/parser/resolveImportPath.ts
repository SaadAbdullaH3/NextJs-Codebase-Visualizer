/**
 * resolveImportPath.ts — Import path resolver.
 *
 * Resolves raw import paths to absolute file paths. Handles:
 * - Relative paths (./foo, ../bar)
 * - TypeScript path aliases from tsconfig.json (@/components/foo)
 * - Index file resolution (./foo → ./foo/index.ts)
 * - Extension inference (.ts, .tsx, .js, .jsx)
 * - TypeScript .js→.ts resolution (import './foo.js' → ./foo.ts)
 * - baseUrl absolute imports (components/foo)
 *
 * Returns null for external/node_modules imports since they're
 * not part of the project's internal dependency graph.
 *
 * Design decision: Uses Node's fs.statSync for file existence checks
 * rather than building an in-memory file tree. This is simpler and
 * correct, though slightly slower. For 200-file projects, the
 * difference is negligible.
 */

import * as fs from "fs";
import * as path from "path";
import { ts } from "ts-morph";

// ── Types ───────────────────────────────────────────────────────────────

/**
 * Parsed path alias configuration from tsconfig.json.
 */
export interface TsConfigPaths {
  /** Absolute path to the base URL for path resolution */
  baseUrl: string;
  /** Pattern → replacement paths mapping from compilerOptions.paths */
  paths: Record<string, string[]>;
}

// ── Constants ───────────────────────────────────────────────────────────

/**
 * Extension resolution order. TypeScript-first matches TypeScript's
 * own module resolution algorithm: try .ts and .tsx before .js and .jsx.
 */
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Resolves a raw import path to an absolute file path.
 *
 * @param rawPath - The import path as written in source code
 * @param fromFile - Absolute path of the file containing the import
 * @param projectRoot - Absolute path to the project root
 * @param tsConfigPaths - Optional tsconfig path alias configuration
 * @returns Absolute path to the resolved file, or null if external/unresolvable
 */
export function resolveImportPath(
  rawPath: string,
  fromFile: string,
  projectRoot: string,
  tsConfigPaths?: TsConfigPaths | null
): string | null {
  // ── Early exit for bare package specifiers ─────────────────────────
  if (isBarePackageSpecifier(rawPath, tsConfigPaths)) {
    return null;
  }

  // ── Try relative path resolution ───────────────────────────────────
  if (rawPath.startsWith(".")) {
    const fromDir = path.dirname(fromFile);
    const absoluteBase = path.resolve(fromDir, rawPath);
    return tryResolveFile(absoluteBase);
  }

  // ── Try path alias resolution ──────────────────────────────────────
  if (tsConfigPaths) {
    const resolved = resolvePathAlias(rawPath, tsConfigPaths);
    if (resolved) return resolved;
  }

  // ── Try as absolute-from-baseUrl import ────────────────────────────
  // Some projects use non-relative, non-aliased paths that resolve
  // from the baseUrl (e.g., `import 'components/Button'` with
  // baseUrl: "./src" or ".").
  // If rawPath is an external module like 'react', tryResolveFile will
  // simply return null because '/project/react.ts' doesn't exist.
  if (tsConfigPaths) {
    const absoluteBase = path.resolve(tsConfigPaths.baseUrl, rawPath);
    return tryResolveFile(absoluteBase);
  }

  return null;
}

/**
 * Loads tsconfig.json path aliases from a project root.
 *
 * Uses TypeScript's built-in config parser (via ts-morph's re-exported
 * `ts` namespace) to correctly handle:
 * - JSON with comments (both line comments and block comments)
 * - `extends` directives (inheriting from parent configs)
 * - Path resolution relative to the config file location
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Parsed path configuration, or null if no tsconfig or no paths found
 */
export function loadTsConfigPaths(projectRoot: string): TsConfigPaths | null {
  // Use TypeScript's findConfigFile to locate tsconfig.json.
  // This handles the standard search algorithm (walk up directories).
  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    "tsconfig.json"
  );

  if (!configPath) return null;

  // Read and parse the config file. readConfigFile handles JSON with
  // comments, which JSON.parse cannot.
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    console.warn(
      `Warning: Error reading tsconfig.json: ${
        typeof configFile.error.messageText === "string"
          ? configFile.error.messageText
          : configFile.error.messageText.messageText
      }`
    );
    return null;
  }

  // parseJsonConfigFileContent resolves `extends`, computes effective
  // compiler options, and resolves relative paths.
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot
  );

  const rawPaths = parsedConfig.options.paths;
  const baseUrl = parsedConfig.options.baseUrl || projectRoot;

  if (!rawPaths || Object.keys(rawPaths).length === 0) {
    // No path aliases configured, but baseUrl might still be useful
    // for non-relative imports.
    return { baseUrl, paths: {} };
  }

  return { baseUrl, paths: rawPaths };
}

// ── Internal helpers ────────────────────────────────────────────────────

/**
 * Resolves a path alias using tsconfig.json paths configuration.
 *
 * Algorithm for wildcard patterns (e.g., "@/*": ["./src/*"]):
 * 1. Match import path against pattern prefix ("@/")
 * 2. Capture the wildcard portion ("components/Button")
 * 3. Replace * in mapping target with captured portion ("./src/components/Button")
 * 4. Resolve to absolute path and try file resolution
 *
 * TypeScript's path aliases can have multiple fallback targets — we try
 * each one in order and return the first that resolves to a real file.
 */
function resolvePathAlias(
  rawPath: string,
  config: TsConfigPaths
): string | null {
  for (const [pattern, mappings] of Object.entries(config.paths)) {
    const starIndex = pattern.indexOf("*");

    if (starIndex === -1) {
      // ── Exact match pattern ────────────────────────────────────────
      // Rare but valid: "jquery": ["./vendor/jquery.js"]
      if (rawPath === pattern) {
        for (const mapping of mappings) {
          const absoluteBase = path.resolve(config.baseUrl, mapping);
          const resolved = tryResolveFile(absoluteBase);
          if (resolved) return resolved;
        }
      }
    } else {
      // ── Wildcard pattern ───────────────────────────────────────────
      // Common: "@/*": ["./src/*"]
      const prefix = pattern.substring(0, starIndex);
      const suffix = pattern.substring(starIndex + 1);

      // Check if the import path matches the pattern
      const matchesPrefix = rawPath.startsWith(prefix);
      const matchesSuffix = suffix === "" || rawPath.endsWith(suffix);

      if (matchesPrefix && matchesSuffix) {
        // Extract the captured wildcard portion.
        // For "@/components/Button" with pattern "@/*":
        //   prefix = "@/", suffix = ""
        //   captured = "components/Button"
        const capturedEnd = suffix.length > 0 ? rawPath.length - suffix.length : undefined;
        const captured = rawPath.substring(prefix.length, capturedEnd);

        // Try each mapping target
        for (const mapping of mappings) {
          const mappedPath = mapping.replace("*", captured);
          const absoluteBase = path.resolve(config.baseUrl, mappedPath);
          const resolved = tryResolveFile(absoluteBase);
          if (resolved) return resolved;
        }
      }
    }
  }

  return null;
}

/**
 * Attempts to resolve a base path to an actual file on disk.
 *
 * Resolution order (matches TypeScript's algorithm):
 * 1. Exact path (file exists with given extension)
 * 2. Path + each extension (.ts, .tsx, .js, .jsx)
 * 3. Path as directory + index file with each extension
 * 4. .js → .ts swapping (TypeScript's module resolution compatibility)
 *
 * @param basePath - Absolute base path to try resolving
 * @returns Resolved absolute path, or null if no file found
 */
function tryResolveFile(basePath: string): string | null {
  // 1. Exact match — file already exists with the given path
  if (isFile(basePath)) {
    return basePath;
  }

  // 2. Try appending source extensions
  for (const ext of EXTENSIONS) {
    const withExt = basePath + ext;
    if (isFile(withExt)) {
      return withExt;
    }
  }

  // 3. Try as directory with index file
  //    ./foo → ./foo/index.ts, ./foo/index.tsx, etc.
  if (isDirectory(basePath)) {
    for (const ext of EXTENSIONS) {
      const indexPath = path.join(basePath, "index" + ext);
      if (isFile(indexPath)) {
        return indexPath;
      }
    }
  }

  // 4. TypeScript .js → .ts resolution compatibility
  //    In TypeScript projects, import paths sometimes use .js extensions
  //    that should resolve to .ts files. This is by design — TypeScript
  //    says "write the extension of the output file, not the source file."
  const ext = path.extname(basePath);
  if (ext === ".js") {
    const withoutExt = basePath.slice(0, -3);
    for (const tsExt of [".ts", ".tsx"]) {
      if (isFile(withoutExt + tsExt)) {
        return withoutExt + tsExt;
      }
    }
  } else if (ext === ".jsx") {
    const tsxPath = basePath.slice(0, -4) + ".tsx";
    if (isFile(tsxPath)) {
      return tsxPath;
    }
  }

  return null;
}

/**
 * Checks if a path is an existing regular file.
 */
function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Checks if a path is an existing directory.
 */
function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Detects if a path is a bare package specifier (e.g., 'react', '@radix-ui/react-icons').
 * Used to safely early-exit before hitting fs.statSync for external modules.
 */
function isBarePackageSpecifier(rawPath: string, tsConfigPaths?: TsConfigPaths | null): boolean {
  // Not a bare package if it's relative or absolute
  if (rawPath.startsWith(".") || path.isAbsolute(rawPath)) {
    return false;
  }

  // If it matches a configured path alias, it's not a bare package
  if (tsConfigPaths?.paths) {
    for (const pattern of Object.keys(tsConfigPaths.paths)) {
      const prefix = pattern.replace("*", "");
      if (prefix && rawPath.startsWith(prefix)) {
        return false;
      }
    }
  }

  // Identify scoped packages (@org/pkg) and top-level packages (react)
  // This catches 95%+ of external imports without breaking baseUrl imports like `components/Button`
  const isScopedPackage = rawPath.startsWith("@") && rawPath.includes("/");
  const isTopLevelPackage = !rawPath.startsWith("@") && !rawPath.includes("/");

  return isScopedPackage || isTopLevelPackage;
}
