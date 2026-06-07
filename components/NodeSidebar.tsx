"use client";

/**
 * NodeSidebar.tsx — Right panel showing selected node details.
 *
 * Displays file path, node type, directives, route, exports,
 * and incoming/outgoing edges when a node is selected.
 * Each neighbor node is clickable to navigate the graph.
 */

import {
  useGraphStore,
  GraphNode,
  GraphEdge,
  NodeType,
} from "@/lib/graphStore";
import {
  X,
  FileCode,
  ArrowRightFromLine,
  ArrowLeftToLine,
  Route,
  Package,
  Server,
  Monitor,
  Zap,
} from "lucide-react";

// ── Node type display config ────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  page: "bg-blue-500/20 text-blue-400",
  layout: "bg-indigo-500/20 text-indigo-400",
  "client-component": "bg-amber-500/20 text-amber-400",
  "server-component": "bg-green-500/20 text-green-400",
  "server-action": "bg-red-500/20 text-red-400",
  "api-route": "bg-orange-500/20 text-orange-400",
  middleware: "bg-purple-500/20 text-purple-400",
  hook: "bg-teal-500/20 text-teal-400",
  utility: "bg-gray-500/20 text-gray-400",
  context: "bg-cyan-500/20 text-cyan-400",
  unknown: "bg-gray-500/20 text-gray-400",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  render: "text-blue-400",
  call: "text-orange-400",
  "import-only": "text-gray-400",
  "dynamic-import": "text-purple-400",
};

export default function NodeSidebar() {
  const graphData = useGraphStore((s) => s.graphData);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);

  if (!graphData || !selectedNodeId) {
    return (
      <div className="w-80 glass-panel p-6 flex items-center justify-center">
        <div className="text-center">
          <FileCode size={32} className="mx-auto mb-3 text-[#4b4b5b]" />
          <p className="text-sm text-[#6b6b7b]">Click a node to inspect it</p>
        </div>
      </div>
    );
  }

  const node = graphData.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  // Compute incoming and outgoing edges
  const outgoing = graphData.edges.filter((e) => e.source === node.id);
  const incoming = graphData.edges.filter((e) => e.target === node.id);

  // Map edge targets/sources to node labels
  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));

  return (
    <div className="w-80 glass-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a3d] flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold truncate" title={node.label}>
            {node.label}
          </h2>
          <p className="text-xs text-[#6b6b7b] font-mono mt-1 truncate" title={node.filePath}>
            {node.filePath}
          </p>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="ml-2 p-1 rounded hover:bg-[#2a2a3d] text-[#6b6b7b] hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Type badge */}
        <div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${TYPE_COLORS[node.type] || TYPE_COLORS.unknown}`}
          >
            {node.type.replace(/-/g, " ")}
          </span>
        </div>

        {/* Directive badges */}
        <div className="flex flex-wrap gap-2">
          {node.isClientComponent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Monitor size={10} />
              Client
            </span>
          )}
          {node.isServerComponent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">
              <Server size={10} />
              Server
            </span>
          )}
          {node.hasServerAction && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              <Zap size={10} />
              Server Action
            </span>
          )}
        </div>

        {/* Route */}
        {node.route && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-[#6b6b7b] font-semibold uppercase tracking-wide mb-1.5">
              <Route size={12} />
              Route
            </div>
            <code className="block text-sm font-mono text-purple-300 bg-[#0a0a0f] px-2.5 py-1.5 rounded-md">
              {node.route}
            </code>
          </div>
        )}

        {/* Exports */}
        {node.exports.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-[#6b6b7b] font-semibold uppercase tracking-wide mb-1.5">
              <Package size={12} />
              Exports ({node.exports.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {node.exports.slice(0, 12).map((exp) => (
                <span
                  key={exp}
                  className="px-2 py-0.5 rounded text-xs font-mono bg-[#1a1a2e] text-[#9898a6] border border-[#2a2a3d]"
                >
                  {exp}
                </span>
              ))}
              {node.exports.length > 12 && (
                <span className="px-2 py-0.5 text-xs text-[#6b6b7b]">
                  +{node.exports.length - 12} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Outgoing edges (imports) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#6b6b7b] font-semibold uppercase tracking-wide mb-1.5">
            <ArrowRightFromLine size={12} />
            Imports ({outgoing.length})
          </div>
          {outgoing.length === 0 ? (
            <p className="text-xs text-[#4b4b5b] italic">No imports</p>
          ) : (
            <div className="space-y-0.5">
              {outgoing.map((edge) => {
                const target = nodeMap.get(edge.target);
                return (
                  <button
                    key={edge.id}
                    onClick={() => setSelectedNodeId(edge.target)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#1e1e2d] transition-colors flex items-center justify-between group"
                  >
                    <span className="text-xs truncate text-[#e8e8ed] group-hover:text-white">
                      {target?.label || edge.target}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${EDGE_TYPE_COLORS[edge.type] || "text-gray-500"}`}
                    >
                      {edge.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Incoming edges (imported by) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#6b6b7b] font-semibold uppercase tracking-wide mb-1.5">
            <ArrowLeftToLine size={12} />
            Imported by ({incoming.length})
          </div>
          {incoming.length === 0 ? (
            <p className="text-xs text-[#4b4b5b] italic">Not imported by any file</p>
          ) : (
            <div className="space-y-0.5">
              {incoming.map((edge) => {
                const source = nodeMap.get(edge.source);
                return (
                  <button
                    key={edge.id}
                    onClick={() => setSelectedNodeId(edge.source)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#1e1e2d] transition-colors flex items-center justify-between group"
                  >
                    <span className="text-xs truncate text-[#e8e8ed] group-hover:text-white">
                      {source?.label || edge.source}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${EDGE_TYPE_COLORS[edge.type] || "text-gray-500"}`}
                    >
                      {edge.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
