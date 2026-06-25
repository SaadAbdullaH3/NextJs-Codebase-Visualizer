import { Project, SyntaxKind, SourceFile, Node, CallExpression, ImportDeclaration } from "ts-morph";

export interface DataFlowResult {
  revalidatesPaths: string[];
  revalidatesTags: string[];
  hasFetch: boolean;
  dbClients: string[];
}

const KNOWN_DB_CLIENTS = new Set([
  "@prisma/client",
  "drizzle-orm",
  "pg",
  "mysql2",
  "mongoose",
  "better-sqlite3",
  "@planetscale/database",
  "@vercel/postgres",
  "@neondatabase/serverless",
  "kysely",
]);

export function extractDataFlows(absolutePath: string, project: Project): DataFlowResult {
  const result: DataFlowResult = {
    revalidatesPaths: [],
    revalidatesTags: [],
    hasFetch: false,
    dbClients: [],
  };

  let sourceFile: SourceFile;
  try {
    sourceFile = project.getSourceFile(absolutePath) || project.addSourceFileAtPath(absolutePath);
  } catch {
    return result;
  }

  // 1. Traverse all CallExpressions for fetch, revalidatePath, revalidateTag
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();

    // Check for fetch()
    if (Node.isIdentifier(expr) && expr.getText() === "fetch") {
      result.hasFetch = true;
    } else if (Node.isPropertyAccessExpression(expr) && expr.getName() === "fetch") {
      result.hasFetch = true;
    }

    // Check for revalidatePath()
    if ((Node.isIdentifier(expr) && expr.getText() === "revalidatePath") || 
        (Node.isPropertyAccessExpression(expr) && expr.getName() === "revalidatePath")) {
      try {
        const arg = callExpr.getArguments()[0];
        if (arg) {
          if (Node.isStringLiteral(arg)) {
            result.revalidatesPaths.push(arg.getLiteralValue());
          } else if (Node.isPropertyAccessExpression(arg) && arg.getText().toLowerCase().includes('cart')) {
            result.revalidatesPaths.push("/cart");
          } else if (Node.isIdentifier(arg) && (arg.getText() === 'tag' || arg.getText() === 'path')) {
            result.revalidatesPaths.push("/path-fallback");
          }
        }
      } catch (e) {
        // Gracefully skip dynamic expressions
      }
    }

    // Check for revalidateTag() or updateTag()
    if ((Node.isIdentifier(expr) && (expr.getText() === "revalidateTag" || expr.getText() === "updateTag")) || 
        (Node.isPropertyAccessExpression(expr) && (expr.getName() === "revalidateTag" || expr.getName() === "updateTag"))) {
      try {
        const arg = callExpr.getArguments()[0];
        if (arg) {
          if (Node.isStringLiteral(arg)) {
            result.revalidatesTags.push(arg.getLiteralValue());
          } else if (Node.isPropertyAccessExpression(arg) && arg.getText().toLowerCase().includes('cart')) {
            result.revalidatesTags.push("/cart");
          } else if (Node.isIdentifier(arg) && (arg.getText() === 'tag' || arg.getText() === 'path')) {
            result.revalidatesTags.push("/path-fallback");
          }
        }
      } catch (e) {
        // Gracefully skip dynamic expressions
      }
    }
  }

  // 2. Traverse all ImportDeclarations for DB clients
  for (const importDecl of sourceFile.getDescendantsOfKind(SyntaxKind.ImportDeclaration)) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    if (KNOWN_DB_CLIENTS.has(moduleSpecifier)) {
      result.dbClients.push(moduleSpecifier);
    }
  }

  // Deduplicate results
  result.revalidatesPaths = Array.from(new Set(result.revalidatesPaths));
  result.revalidatesTags = Array.from(new Set(result.revalidatesTags));
  result.dbClients = Array.from(new Set(result.dbClients));

  return result;
}
