"use client";

/**
 * app/graph/page.tsx — Graph viewer page.
 *
 * Assembles the three-panel layout:
 *   [FilterPanel] [GraphCanvas + EdgeLegend] [NodeSidebar]
 *
 * Redirects back to the homepage if no graph data is loaded.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGraphStore } from "@/lib/graphStore";
import GraphCanvas from "@/components/GraphCanvas";
import NodeSidebar from "@/components/NodeSidebar";
import FilterPanel from "@/components/FilterPanel";
import EdgeLegend from "@/components/EdgeLegend";
import { ArrowLeft } from "lucide-react";

export default function GraphPage() {
  const router = useRouter();
  const graphData = useGraphStore((s) => s.graphData);

  // Redirect if no data loaded
  useEffect(() => {
    if (!graphData) {
      router.replace("/");
    }
  }, [graphData, router]);

  if (!graphData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#6b6b7b]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-11 flex items-center px-4 border-b border-[#1e1e2d] bg-[#0d0d14] shrink-0">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-xs text-[#6b6b7b] hover:text-white transition-colors mr-4"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            NextVis
          </span>
          <span className="text-[#2a2a3d]">·</span>
          <span className="text-xs text-[#9898a6]">
            {graphData.meta.projectName}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#6b6b7b] border border-[#2a2a3d]">
            {graphData.meta.routerType}
          </span>
          <span className="text-[#2a2a3d]">·</span>
          <span className="text-[10px] text-[#4b4b5b]">
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </span>
        </div>
      </div>

      {/* Main content: 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Filter panel */}
        <FilterPanel />

        {/* Center: Graph canvas */}
        <div className="flex-1 relative">
          <GraphCanvas />
          <EdgeLegend />
        </div>

        {/* Right: Node sidebar */}
        <NodeSidebar />
      </div>
    </div>
  );
}
