"use client";

import { useGraphStore, ViewMode } from "@/lib/graphStore";
import { getClusterKey } from "@/lib/clusterTransform";

export function ViewModeBar() {
  const viewMode = useGraphStore((s) => s.viewMode);
  const setViewMode = useGraphStore((s) => s.setViewMode);
  const expandAllClusters = useGraphStore((s) => s.expandAllClusters);
  const collapseAllClusters = useGraphStore((s) => s.collapseAllClusters);
  const graphData = useGraphStore((s) => s.graphData);

  const handleExpandAll = () => {
    if (!graphData) return;
    const allKeys = new Set<string>();
    graphData.nodes.forEach(n => {
      allKeys.add(getClusterKey(n.filePath || n.id));
    });
    expandAllClusters(Array.from(allKeys));
  };

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-neutral-900/80 backdrop-blur-md border border-neutral-700/50 p-1.5 rounded-2xl shadow-xl">
      <div className="flex bg-neutral-950/50 rounded-xl p-1">
        {(["cluster", "cluster-pro", "routes", "full", "dataflow"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              viewMode === mode
                ? "bg-blue-500/20 text-blue-400 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            }`}
            title={mode === "dataflow" ? "Show only data-moving nodes: pages, server actions, fetch calls, DB access" : mode === "cluster-pro" ? "Cluster Mode Pro — distributed ports, sub-sectors, visible port indicators" : undefined}
          >
            {mode === "dataflow" ? "Data Flow" : mode === "cluster-pro" ? "Cluster Pro ✦" : `${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`}
          </button>
        ))}
      </div>
      
      {(viewMode === "cluster" || viewMode === "cluster-pro") && (
        <>
          <div className="w-px h-6 bg-neutral-700 mx-1"></div>
          <button
            onClick={handleExpandAll}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAllClusters}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Collapse All
          </button>
        </>
      )}
    </div>
  );
}
