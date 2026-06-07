/**
 * extractJsxUsage.ts — JSX component usage detector.
 *
 * Scans a source file's AST for JSX elements and returns the names
 * of all React components used. This data is used by the edge
 * classifier (Phase 3) to create "render" type edges.
 *
 * Only PascalCase names are captured — lowercase names are HTML elements
 * (div, span, etc.) per the JSX specification. This is a React convention:
 * components must start with an uppercase letter.
 *
 * For member expressions like <Icons.Logo />, we extract the ROOT
 * identifier ("Icons") because that's what matches against import bindings.
 */

import * as path from "path";
import { Project, SyntaxKind, SourceFile, ts } from "ts-morph";

/**
 * Extracts all React component names used in JSX within a source file.
 *
 * @param absolutePath - Full path to the source file
 * @returns Array of unique component names (PascalCase only)
 */
export function extractJsxUsage(absolutePath: string): string[] {
  // Only .tsx and .jsx files can contain JSX syntax.
  // .ts and .js files would cause parse errors if they contained JSX.
  const ext = path.extname(absolutePath).toLowerCase();
  if (ext !== ".tsx" && ext !== ".jsx") {
    return [];
  }

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

  const componentNames = new Set<string>();

  // ── Find JSX opening elements: <Component ...> ─────────────────────
  // These are the opening tags of JSX elements with children.
  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    addComponentName(node.getTagNameNode().getText(), componentNames);
  }

  // ── Find JSX self-closing elements: <Component ... /> ──────────────
  // These are JSX elements without children.
  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    addComponentName(node.getTagNameNode().getText(), componentNames);
  }

  return Array.from(componentNames);
}

/**
 * Adds a component name to the set if it's a PascalCase React component.
 *
 * For member expressions like "Icons.Logo", extracts the ROOT identifier
 * ("Icons") because that's what maps to the import binding. The developer
 * writes `import { Icons } from './icons'` and then uses `<Icons.Logo />`
 * — the dependency edge goes to the icons module, not "Logo" specifically.
 *
 * Lowercase names (div, span, a, etc.) are HTML elements and are skipped.
 *
 * @param fullTagName - The full JSX tag name (e.g., "Carousel", "Icons.Logo")
 * @param componentNames - Set to add the component name to
 */
function addComponentName(fullTagName: string, componentNames: Set<string>): void {
  if (fullTagName.length === 0) return;

  // Check if the first character is uppercase (React component convention).
  // React requires component names to start with uppercase to distinguish
  // them from HTML elements. This is enforced at the JSX transform level.
  const firstChar = fullTagName.charAt(0);
  if (firstChar < "A" || firstChar > "Z") {
    return;
  }

  // For member expressions (Foo.Bar.Baz), extract only the root identifier.
  // The root is what was imported; the member access is runtime behavior.
  const dotIndex = fullTagName.indexOf(".");
  const rootIdentifier = dotIndex === -1 ? fullTagName : fullTagName.substring(0, dotIndex);

  componentNames.add(rootIdentifier);
}
