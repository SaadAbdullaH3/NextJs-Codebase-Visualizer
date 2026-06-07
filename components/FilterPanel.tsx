"use client";

/**
 * FilterPanel.tsx — Left panel for filtering nodes and edges by type.
 *
 * Provides checkboxes for each NodeType and EdgeType with per-type
 * counts. Toggling a type hides those nodes AND their connected edges
 * from the canvas. Includes "Select all" / "Clear all" shortcuts.
 */

import {
  useGraphStore,
  ALL_NODE_TYPES,
  ALL_EDGE_TYPES,
  NodeType,
  EdgeType,
} from "@/lib/graphStore";
import { Filter, Move, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

// ── Node type display config ────────────────────────────────────────────

const NODE_TYPE_CONFIG: Record<
  string,
  { color: string; dot: string }
> = {
  page: { color: "text-blue-400", dot: "bg-blue-500" },
  layout: { color: "text-indigo-400", dot: "bg-indigo-500" },
  "route-group": { color: "text-violet-400", dot: "bg-violet-500" },
  "parallel-route": { color: "text-fuchsia-400", dot: "bg-fuchsia-500" },
  "intercepting-route": { color: "text-rose-400", dot: "bg-rose-500" },
  "server-component": { color: "text-green-400", dot: "bg-green-500" },
  "client-component": { color: "text-amber-400", dot: "bg-amber-500" },
  "server-action": { color: "text-red-400", dot: "bg-red-500" },
  "api-route": { color: "text-orange-400", dot: "bg-orange-500" },
  middleware: { color: "text-purple-400", dot: "bg-purple-500" },
  hook: { color: "text-teal-400", dot: "bg-teal-500" },
  utility: { color: "text-gray-400", dot: "bg-gray-500" },
  context: { color: "text-cyan-400", dot: "bg-cyan-500" },
  unknown: { color: "text-gray-500", dot: "bg-gray-600" },
};

const EDGE_TYPE_CONFIG: Record<
  string,
  { color: string; dot: string; style: string }
> = {
  render: { color: "text-blue-400", dot: "bg-blue-500", style: "solid" },
  call: { color: "text-orange-400", dot: "bg-orange-500", style: "dashed" },
  "import-only": { color: "text-gray-400", dot: "bg-gray-500", style: "dotted" },
  "dynamic-import": { color: "text-purple-400", dot: "bg-purple-500", style: "dashed" },
};

export default function FilterPanel() {
  const graphData = useGraphStore((s) => s.graphData);
  const activeFilters = useGraphStore((s) => s.activeFilters);
  const toggleFilter = useGraphStore((s) => s.toggleFilter);
  const setAllFilters = useGraphStore((s) => s.setAllFilters);
  const activeEdgeFilters = useGraphStore((s) => s.activeEdgeFilters);
  const toggleEdgeFilter = useGraphStore((s) => s.toggleEdgeFilter);
  const isDraggable = useGraphStore((s) => s.isDraggable);
  const toggleDraggable = useGraphStore((s) => s.toggleDraggable);

  const [nodesExpanded, setNodesExpanded] = useState(true);
  const [edgesExpanded, setEdgesExpanded] = useState(true);

  if (!graphData) return null;

  // Count nodes per type
  const nodeCounts = new Map<string, number>();
  for (const node of graphData.nodes) {
    nodeCounts.set(node.type, (nodeCounts.get(node.type) || 0) + 1);
  }

  // Count edges per type
  const edgeCounts = new Map<string, number>();
  for (const edge of graphData.edges) {
    edgeCounts.set(edge.type, (edgeCounts.get(edge.type) || 0) + 1);
  }

  // Only show node types that exist in the data
  const presentNodeTypes = ALL_NODE_TYPES.filter(
    (t) => (nodeCounts.get(t) || 0) > 0
  );

  const presentEdgeTypes = ALL_EDGE_TYPES.filter(
    (t) => (edgeCounts.get(t) || 0) > 0
  );

  const allNodesActive = presentNodeTypes.every((t) => activeFilters.has(t));
  const noNodesActive = presentNodeTypes.every((t) => !activeFilters.has(t));

  return (
    <div className="w-64 glass-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#2a2a3d]">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-[#6b6b7b]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#9898a6]">
            Filters
          </h2>
        </div>

        {/* Project info */}
        <div className="text-xs text-[#6b6b7b] space-y-0.5">
          <div>
            <span className="text-[#9898a6]">{graphData.meta.projectName}</span>
            {" · "}
            {graphData.meta.routerType} router
          </div>
          <div>
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </div>
        </div>
      </div>

      {/* Scrollable filter list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Node type filters */}
        <div>
          <button
            onClick={() => setNodesExpanded(!nodesExpanded)}
            className="flex items-center gap-1.5 w-full text-left text-xs font-bold uppercase tracking-wider text-[#6b6b7b] mb-2 hover:text-[#9898a6] transition-colors"
          >
            {nodesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Node Types
          </button>

          {nodesExpanded && (
            <>
              {/* Select all / Clear all */}
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setAllFilters(true)}
                  disabled={allNodesActive}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#1a1a2e] text-[#9898a6] hover:text-white border border-[#2a2a3d] disabled:opacity-30 transition-colors"
                >
                  All
                </button>
                <button
                  onClick={() => setAllFilters(false)}
                  disabled={noNodesActive}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#1a1a2e] text-[#9898a6] hover:text-white border border-[#2a2a3d] disabled:opacity-30 transition-colors"
                >
                  None
                </button>
              </div>

              <div className="space-y-0.5">
                {presentNodeTypes.map((type) => {
                  const config = NODE_TYPE_CONFIG[type] || NODE_TYPE_CONFIG.unknown;
                  const count = nodeCounts.get(type) || 0;
                  const isActive = activeFilters.has(type);

                  return (
                    <label
                      key={type}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                        isActive
                          ? "hover:bg-[#1e1e2d]"
                          : "opacity-40 hover:opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleFilter(type)}
                        className="sr-only"
                      />
                      <div
                        className={`w-2.5 h-2.5 rounded-sm ${
                          isActive ? config.dot : "bg-[#2a2a3d]"
                        } transition-colors`}
                      />
                      <span className={`text-xs flex-1 ${isActive ? config.color : "text-[#4b4b5b]"}`}>
                        {type.replace(/-/g, " ")}
                      </span>
                      <span className="text-[10px] text-[#4b4b5b] tabular-nums">
                        {count}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Edge type filters */}
        <div>
          <button
            onClick={() => setEdgesExpanded(!edgesExpanded)}
            className="flex items-center gap-1.5 w-full text-left text-xs font-bold uppercase tracking-wider text-[#6b6b7b] mb-2 hover:text-[#9898a6] transition-colors"
          >
            {edgesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Edge Types
          </button>

          {edgesExpanded && (
            <div className="space-y-0.5">
              {presentEdgeTypes.map((type) => {
                const config = EDGE_TYPE_CONFIG[type];
                const count = edgeCounts.get(type) || 0;
                const isActive = activeEdgeFilters.has(type);

                return (
                  <label
                    key={type}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      isActive
                        ? "hover:bg-[#1e1e2d]"
                        : "opacity-40 hover:opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => toggleEdgeFilter(type)}
                      className="sr-only"
                    />
                    <div className="flex items-center w-4">
                      <div
                        className={`w-4 h-0.5 ${
                          isActive ? config.dot : "bg-[#2a2a3d]"
                        } ${config.style === "dashed" ? "border-t border-dashed" : ""}`}
                        style={
                          isActive
                            ? config.style === "dotted"
                              ? { borderTop: "2px dotted", borderColor: "currentColor" }
                              : {}
                            : {}
                        }
                      />
                    </div>
                    <span className={`text-xs flex-1 ${isActive ? config.color : "text-[#4b4b5b]"}`}>
                      {type.replace(/-/g, " ")}
                    </span>
                    <span className="text-[10px] text-[#4b4b5b] tabular-nums">
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Drag toggle (bottom) */}
      <div className="p-3 border-t border-[#2a2a3d]">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            className={`relative w-8 h-4 rounded-full transition-colors ${
              isDraggable ? "bg-blue-500" : "bg-[#2a2a3d]"
            }`}
            onClick={toggleDraggable}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                isDraggable ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <Move size={12} className="text-[#6b6b7b]" />
          <span className="text-xs text-[#9898a6]">
            Drag nodes
          </span>
        </label>
      </div>
    </div>
  );
}
