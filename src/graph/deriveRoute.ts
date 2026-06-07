/**
 * deriveRoute.ts — File path to URL route converter.
 *
 * Converts a file's relative path (e.g., "app/dashboard/page.tsx")
 * to the URL route it serves (e.g., "/dashboard"). This only applies
 * to page and layout files — other file types don't have URL routes.
 *
 * Next.js App Router conventions handled:
 *   - Route groups: (marketing) → stripped from URL
 *   - Dynamic segments: [slug] → preserved as-is
 *   - Catch-all: [...slug] → preserved
 *   - Optional catch-all: [[...slug]] → preserved
 *   - Parallel routes: @modal → preserved (marked differently in viewer)
 *   - Intercepting routes: (.) (..) (...) → preserved
 *
 * Next.js Pages Router conventions handled:
 *   - pages/blog/[slug].tsx → /blog/[slug]
 *   - pages/index.tsx → /
 *   - pages/api/hello.ts → /api/hello
 */

import * as path from "path";

// ── Types ───────────────────────────────────────────────────────────────

export type RouterType = "app" | "pages" | "hybrid";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Derives the URL route for a file based on its path and router type.
 *
 * @param relativePath - File path relative to project root (forward slashes)
 * @param routerType - The router type detected for this project
 * @returns The URL route string, or undefined if the file doesn't serve a route
 *
 * @example
 *   deriveRoute("app/dashboard/page.tsx", "app")        → "/dashboard"
 *   deriveRoute("app/(marketing)/about/page.tsx", "app") → "/about"
 *   deriveRoute("app/@modal/login/page.tsx", "app")      → "/@modal/login"
 *   deriveRoute("pages/blog/[slug].tsx", "pages")        → "/blog/[slug]"
 *   deriveRoute("app/page.tsx", "app")                   → "/"
 *   deriveRoute("components/Button.tsx", "app")          → undefined
 */
export function deriveRoute(
  relativePath: string,
  routerType: RouterType
): string | undefined {
  // Normalize to forward slashes (Windows compat)
  const normalized = relativePath.replace(/\\/g, "/");

  if (routerType === "app" || routerType === "hybrid") {
    const appRoute = deriveAppRoute(normalized);
    if (appRoute !== undefined) return appRoute;
  }

  if (routerType === "pages" || routerType === "hybrid") {
    const pagesRoute = derivePagesRoute(normalized);
    if (pagesRoute !== undefined) return pagesRoute;
  }

  return undefined;
}

/**
 * Detects the router type for a project based on directory presence.
 *
 * @param scannedPaths - Array of relative file paths from the scanner
 * @returns Detected router type
 */
export function detectRouterType(scannedPaths: string[]): RouterType {
  let hasApp = false;
  let hasPages = false;

  for (const p of scannedPaths) {
    const normalized = p.replace(/\\/g, "/");
    if (normalized.startsWith("app/") || normalized.startsWith("src/app/")) {
      hasApp = true;
    }
    if (normalized.startsWith("pages/") || normalized.startsWith("src/pages/")) {
      hasPages = true;
    }
    // Early exit if we've found both
    if (hasApp && hasPages) return "hybrid";
  }

  if (hasApp) return "app";
  if (hasPages) return "pages";

  // No router directories found — default to app since it's the modern standard
  return "app";
}

// ── Internal: App Router route derivation ───────────────────────────────

/**
 * Derives a route from an App Router file path.
 *
 * Only page.tsx and layout.tsx files have routes. Other special files
 * like loading.tsx, error.tsx, template.tsx serve a route but aren't
 * navigable — we include layout because it's structural context.
 */
function deriveAppRoute(normalizedPath: string): string | undefined {
  // Check if path is inside the app directory
  let routePart: string | null = null;

  if (normalizedPath.startsWith("app/")) {
    routePart = normalizedPath.slice("app/".length);
  } else if (normalizedPath.startsWith("src/app/")) {
    routePart = normalizedPath.slice("src/app/".length);
  }

  if (routePart === null) return undefined;

  // Extract the filename to check if it's a routable file
  const filename = path.basename(normalizedPath);
  const filenameWithoutExt = filename.replace(/\.(tsx?|jsx?)$/, "");

  // Only page and layout files have meaningful routes
  if (filenameWithoutExt !== "page" && filenameWithoutExt !== "layout") {
    return undefined;
  }

  // Get the directory portion (everything before the filename)
  // e.g., "dashboard/settings/page.tsx" → "dashboard/settings"
  const dirPortion = path.dirname(routePart).replace(/\\/g, "/");

  // Split into segments and process each one
  const segments = dirPortion === "." ? [] : dirPortion.split("/");
  const routeSegments: string[] = [];

  for (const segment of segments) {
    // Route groups: (marketing), (auth), etc. → stripped from URL
    // These are organizational groupings that don't affect routing.
    if (segment.startsWith("(") && segment.endsWith(")")) {
      continue;
    }

    // Parallel routes: @modal, @sidebar, etc. → preserved
    // These represent parallel rendering slots in the layout.
    // We keep the @ prefix so the viewer can style them differently.
    if (segment.startsWith("@")) {
      routeSegments.push(segment);
      continue;
    }

    // Intercepting routes: (.), (..), (...) prefix → preserved
    // These intercept navigation to show content in a different context.
    // Note: the parentheses are part of the segment name, not route groups.
    // Example: "(.)photo/[id]" intercepts "/photo/[id]" within the same layout.
    // We just pass them through — the viewer can decode the convention.

    // Dynamic segments, catch-all, etc. → preserved as-is
    // [slug], [...slug], [[...slug]] are all valid Next.js conventions
    routeSegments.push(segment);
  }

  // Build the final route
  const route = "/" + routeSegments.join("/");

  // Clean up trailing slash (except for root "/")
  return route === "/" ? "/" : route.replace(/\/$/, "");
}

// ── Internal: Pages Router route derivation ─────────────────────────────

/**
 * Derives a route from a Pages Router file path.
 *
 * In Pages Router, every file in pages/ is a route (except _app, _document).
 * The filename becomes the route segment, unlike App Router where only
 * page.tsx files are routes.
 */
function derivePagesRoute(normalizedPath: string): string | undefined {
  let routePart: string | null = null;

  if (normalizedPath.startsWith("pages/")) {
    routePart = normalizedPath.slice("pages/".length);
  } else if (normalizedPath.startsWith("src/pages/")) {
    routePart = normalizedPath.slice("src/pages/".length);
  }

  if (routePart === null) return undefined;

  // Strip file extension
  const withoutExt = routePart.replace(/\.(tsx?|jsx?)$/, "");

  // Skip Next.js special files — they're not routes
  const basename = path.basename(withoutExt);
  if (basename.startsWith("_")) {
    return undefined;
  }

  // "index" files map to their parent directory route
  // pages/index.tsx → /
  // pages/blog/index.tsx → /blog
  const segments = withoutExt.split("/");
  if (segments[segments.length - 1] === "index") {
    segments.pop();
  }

  const route = "/" + segments.join("/");
  return route === "/" ? "/" : route.replace(/\/$/, "");
}
