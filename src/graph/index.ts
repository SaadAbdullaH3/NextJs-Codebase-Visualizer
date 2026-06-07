/**
 * index.ts — Graph module public API.
 *
 * Re-exports all graph-related types and functions for clean imports.
 */

export { classifyEdge } from "./classifyEdge";
export { buildGraph } from "./buildGraph";
export { deriveRoute, detectRouterType } from "./deriveRoute";

export type { EdgeType } from "./classifyEdge";
export type { RouterType } from "./deriveRoute";
export type {
  GraphOutput,
  GraphNode,
  GraphEdge,
  GraphMeta,
} from "./buildGraph";
