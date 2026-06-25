"use client";

/**
 * NodeSidebar.tsx — Right panel showing selected node details.
 */

import { useGraphStore } from "@/lib/graphStore";
import {
  X,
  FileCode,
  ArrowRightFromLine,
  ArrowLeftToLine,
  Route,
  Package,
  Server,
  Zap,
  ShieldAlert,
  Monitor
} from "lucide-react";
import { GeminiChat } from "./GeminiChat";

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
  const showHeatmapOverlay = useGraphStore((s) => s.showHeatmapOverlay);
  const isRightSidebarClosed = useGraphStore((s) => s.isRightSidebarClosed);
  
  // Hoisted hooks to satisfy React Rules of Hooks
  const viewMode = useGraphStore((s) => s.viewMode);
  const showBoundaryOverlay = useGraphStore((s) => s.showBoundaryOverlay);

  if (isRightSidebarClosed) return null;
  if (!graphData) return null;

  if (!selectedNodeId) {
    const totalFiles = graphData.meta?.totalFiles || graphData.nodes.length;
    const totalPages = graphData.nodes.filter(n => n.type === "page").length;
    const totalLayouts = graphData.nodes.filter(n => n.type === "layout").length;
    const totalServerActions = graphData.nodes.filter(n => n.hasServerAction || n.type === "server-action").length;
    const totalApiRoutes = graphData.nodes.filter(n => n.type === "api-route").length;
    
    return (
      <div className="w-80 glass-panel flex flex-col h-full overflow-hidden">
        <div className="p-5 flex flex-col overflow-y-auto space-y-5 flex-1 min-h-0">
          
          {/* Header Summary Tab */}
          <div className="flex items-center gap-3 pb-3 border-b border-[#2a2a3d] shrink-0">
            <FileCode size={20} className="text-blue-400" />
            <h2 className="text-sm font-bold text-neutral-100 uppercase tracking-wider font-mono">Executive Summary</h2>
          </div>
          
          {/* Baseline Codebase Metric Cards */}
          <div className="space-y-3.5 text-xs leading-relaxed text-neutral-300">
            <p>This codebase contains <strong className="text-white font-mono">{totalFiles} structural assets</strong>.</p>
            <p>The layout exposes <strong className="text-white font-mono">{totalPages} web page routes</strong> managed by <strong className="text-white font-mono">{totalLayouts} layout grids</strong>.</p>
            <p>Under the hood, it processes mutations via <strong className="text-white font-mono">{totalServerActions} Server Actions</strong> and <strong className="text-white font-mono">{totalApiRoutes} endpoints</strong>.</p>
          </div>

          {/* SMART CONTEXTUAL RADAR PANELS: Explains active system states for non-technical users */}
          <div className="pt-4 border-t border-[#2a2a3d] space-y-4">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest font-mono mb-1">
              Active Dashboard Context
            </div>

            {/* View Mode Context Descriptor */}
            <div className="bg-[#10101f]/80 border border-[#23233b] rounded-lg p-3 space-y-1.5">
              <div className="text-xs font-bold text-indigo-400 flex items-center justify-between font-mono">
                <span>🎛️ MODE: {viewMode.toUpperCase()}</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-normal">
                {viewMode === "routes" && "Maps out the complete client navigation path. Provides an instant, non-technical sitemap of your application structure."}
                {viewMode === "dataflow" && "Isolates data-moving components. Shows how background database engines fetch information and update your live screens."}
                {viewMode === "cluster" && "Groups related application files into expandable modular directory folders for high-level directory exploration."}
                {viewMode === "full" && "Exposes every single code module inside a single graph canvas layout to evaluate absolute code density."}
              </p>
            </div>

            {/* Overlays Context Descriptor (Renders if either Boundary or Heatmap are active) */}
            {(showBoundaryOverlay || showHeatmapOverlay) && (
              <div className="space-y-3">
                {showBoundaryOverlay && (
                  <div className="bg-[#fb923c]/5 border border-[#fb923c]/20 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-bold text-orange-400 font-mono">⚡ ARCHITECTURE BOUNDARIES</div>
                    <p className="text-[11px] text-gray-400 leading-normal">
                      Clearly segregates secure back-end server environments from client-facing interface modules rendering in user browsers.
                    </p>
                  </div>
                )}
                {showHeatmapOverlay && (
                  <div className="bg-[#dc2626]/5 border border-[#dc2626]/20 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-bold text-red-400 font-mono">🌡️ CHANGE-RISK HEATMAP</div>
                    <p className="text-[11px] text-gray-400 leading-normal">
                      Calculates how many hidden files depend on each module. Acts as a project risk radar to prevent critical regressions before making modifications.
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {!(showBoundaryOverlay || showHeatmapOverlay) && (
              <p className="text-[11px] text-neutral-500 italic text-center pt-2">
                Toggle any overlay filters from the control header bar to inject real-time security or risk radars onto the active file nodes.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-[#2a2a3d] text-center shrink-0 mt-auto">
            <p className="text-[10px] text-neutral-500 italic">Select any canvas node block to inspect its direct dependencies and file exports.</p>
          </div>
        </div>
        
        {/* Persistent Chatbot Anchor */}
        <GeminiChat />
      </div>
    );
  }

  const node = graphData.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const outgoing = graphData.edges.filter((e) => e.source === node.id);
  const incoming = graphData.edges.filter((e) => e.target === node.id);
  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));

  // DYNAMIC SIDEBAR ACCESSIBILITY BADGE CALCULATOR
  let blastRadius = 0;
  let heatBadgeStyle = "";
  let heatLabelText = "";

  if (showHeatmapOverlay) {
    const reverseAdj = new Map<string, string[]>();
    graphData.nodes.forEach(n => reverseAdj.set(n.id, []));
    graphData.edges.forEach(e => {
      if (reverseAdj.has(e.target)) reverseAdj.get(e.target)!.push(e.source);
    });

    const visited = new Set<string>([node.id]);
    const queue = [node.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      (reverseAdj.get(current) || []).forEach(dep => {
        if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
      });
    }
    blastRadius = visited.size - 1;

    const maxRadius = Math.max(...graphData.nodes.map(n => {
      const v = new Set<string>([n.id]);
      const q = [n.id];
      while (q.length > 0) {
        const curr = q.shift()!;
        (reverseAdj.get(curr) || []).forEach(dep => { if (!v.has(dep)) { v.add(dep); q.push(dep); } });
      }
      return v.size - 1;
    }), 1);

    const score = blastRadius / maxRadius;
    if (score >= 0.70) {
      heatBadgeStyle = "bg-red-500/15 text-red-400 border-red-500/30";
      heatLabelText = "Critical Blast Radius";
    } else if (score >= 0.40) {
      heatBadgeStyle = "bg-orange-500/15 text-orange-400 border-orange-500/30";
      heatLabelText = "High Change Risk";
    } else if (score >= 0.15) {
      heatBadgeStyle = "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
      heatLabelText = "Moderate Impact";
    } else {
      heatBadgeStyle = "bg-green-500/15 text-green-400 border-green-500/30";
      heatLabelText = "Safe / Isolated Node";
    }
  }

  return (
    <div data-panel="right-details" className="w-80 glass-panel flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a3d] flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold truncate text-white" title={node.label}>
            {node.label}
          </h2>
          <p className="text-xs text-[#6b6b7b] font-mono mt-1 truncate" title={node.filePath}>
            {node.filePath}
          </p>
        </div>
        <button
          onClick={() => useGraphStore.getState().setIsRightSidebarClosed(true)}
          className="ml-2 p-1 rounded hover:bg-[#2a2a3d] text-[#6b6b7b] hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">
        
        {/* Type & Heatmap Accents badge containers */}
        <div className="flex flex-col gap-2">
          <div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${TYPE_COLORS[node.type] || TYPE_COLORS.unknown}`}>
              {node.type.replace(/-/g, " ")}
            </span>
          </div>

          {/* ACCESSIBILITY ACCENT PANEL BADGE */}
          {showHeatmapOverlay && (
            <div className={`flex items-center gap-2 px-2.5 py-2 border rounded-md text-xs font-mono font-bold ${heatBadgeStyle}`}>
              <ShieldAlert size={14} />
              <div className="flex-1">
                <div>{heatLabelText}</div>
                <div className="text-[10px] opacity-75 font-normal mt-0.5">Transitive Dependents: {blastRadius} files</div>
              </div>
            </div>
          )}
        </div>

        {/* Directive badges */}
        <div className="flex flex-wrap gap-2">
          {node.isClientComponent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Monitor size={10} /> Client
            </span>
          )}
          {node.isServerComponent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">
              <Server size={10} /> Server
            </span>
          )}
          {node.hasServerAction && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              <Zap size={10} /> Server Action
            </span>
          )}
        </div>

        {/* Route */}
        {node.route && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-[#6b6b7b] font-semibold uppercase tracking-wide mb-1.5">
              <Route size={12} /> Route
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
              <Package size={12} /> Exports ({node.exports.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {node.exports.slice(0, 12).map((exp) => (
                <span key={exp} className="px-2 py-0.5 rounded text-xs font-mono bg-[#1a1a2e] text-[#9898a6] border border-[#2a2a3d]">
                  {exp}
                </span>
              ))}
              {node.exports.length > 12 && (
                <span className="px-2 py-0.5 text-xs text-[#6b6b7b]">+{node.exports.length - 12} more</span>
              )}
            </div>
          </div>
        )}

        {/* Outgoing edges (imports) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#6b6b7b] font-semibold uppercase tracking-wide mb-1.5">
            <ArrowRightFromLine size={12} /> Imports ({outgoing.length})
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
                    onClick={() => useGraphStore.getState().setSelectedNodeId(edge.target)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#1e1e2d] transition-colors flex items-center justify-between group"
                  >
                    <span className="text-xs truncate text-[#e8e8ed] group-hover:text-white">
                      {target?.label || edge.target}
                    </span>
                    <span className={`text-[10px] font-mono ${EDGE_TYPE_COLORS[edge.type] || "text-gray-500"}`}>
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
            <ArrowLeftToLine size={12} /> Imported by ({incoming.length})
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
                    onClick={() => useGraphStore.getState().setSelectedNodeId(edge.source)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#1e1e2d] transition-colors flex items-center justify-between group"
                  >
                    <span className="text-xs truncate text-[#e8e8ed] group-hover:text-white">
                      {source?.label || edge.source}
                    </span>
                    <span className={`text-[10px] font-mono ${EDGE_TYPE_COLORS[edge.type] || "text-gray-500"}`}>
                      {edge.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
      
      {/* Persistent Chatbot Anchor */}
      <GeminiChat />
    </div>
  );
}
