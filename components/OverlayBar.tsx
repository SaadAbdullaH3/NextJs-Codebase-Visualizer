"use client";

import { useGraphStore } from "@/lib/graphStore";

export function OverlayBar() {
  const showBoundaryOverlay = useGraphStore((s) => s.showBoundaryOverlay);
  const setBoundaryOverlay = useGraphStore((s) => s.setBoundaryOverlay);
  const showHeatmapOverlay = useGraphStore((s) => s.showHeatmapOverlay);
  const setHeatmapOverlay = useGraphStore((s) => s.setHeatmapOverlay);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-neutral-900/80 backdrop-blur-md border border-neutral-700/50 px-3 py-1.5 rounded-2xl shadow-xl text-xs text-gray-400">
      <span className="uppercase tracking-widest text-[10px] text-gray-400 mr-1 font-bold font-mono">
        OVERLAYS
      </span>

      <button
        onClick={() => setBoundaryOverlay(!showBoundaryOverlay)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showBoundaryOverlay
            ? "bg-blue-600/80 text-white shadow-sm"
            : "bg-neutral-950/50 text-neutral-400 hover:text-neutral-200 border border-neutral-800"
          }`}
        title="Show Server/Client rendering boundaries"
      >
        🔲 Boundary
      </button>

      <button
        onClick={() => setHeatmapOverlay(!showHeatmapOverlay)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showHeatmapOverlay
            ? "bg-orange-600/80 text-white shadow-sm"
            : "bg-neutral-950/50 text-neutral-400 hover:text-neutral-200 border border-neutral-800"
          }`}
        title="Show change-risk heatmap: red = many dependents, green = safe to change"
      >
        🌡 Heatmap
      </button>
    </div>
  );
}
