"use client";

import { useGraphStore } from "@/lib/graphStore";
import FilterPanel from "@/components/FilterPanel";
import GraphCanvas from "@/components/GraphCanvas";
import NodeSidebar from "@/components/NodeSidebar";

export default function GraphPage() {
  const isLeftSidebarClosed = useGraphStore((s) => s.isLeftSidebarClosed);
  const isRightSidebarClosed = useGraphStore((s) => s.isRightSidebarClosed);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#0a0a14] text-white">
      {/* 1. Left Sidebar panel */}
      <FilterPanel />

      {/* 2. Central Graph Canvas map */}
      <div className="flex-1 h-full relative bg-[#0d0d1a]">
        <GraphCanvas />
      </div>

      {/* 3. Right Node Description panel */}
      <NodeSidebar />
    </div>
  );
}
