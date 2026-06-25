"use client";

import { useGraphStore } from "@/lib/graphStore";

const LEGEND_ITEMS = [
  { color: "#dc2626", label: "Critical Risk"  },
  { color: "#f97316", label: "High Risk"      },
  { color: "#eab308", label: "Moderate Risk"  },
  { color: "#22c55e", label: "Safe / Leaf"    },
] as const;

export function HeatmapLegend() {
  const showHeatmapOverlay = useGraphStore((s) => s.showHeatmapOverlay);

  if (!showHeatmapOverlay) return null;

  return (
    <div
      className="absolute bottom-4 left-16 z-50 bg-[#0f0f1a]/95 border border-[#2a2a4a]
                 rounded-lg px-3 py-2 text-xs backdrop-blur-sm shadow-xl"
      style={{ pointerEvents: "none" }} // Keeps canvas background draggable underneath
    >
      <div className="text-gray-500 font-bold uppercase tracking-widest text-[9px] mb-1.5 font-mono">
        Blast Radius
      </div>
      <div className="flex flex-col gap-1.5">
        {LEGEND_ITEMS.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="w-2.5 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-300 text-[11px] font-medium">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-1.5 border-t border-[#1e1e35] text-gray-500 text-[9px] font-mono">
        # = files depending on this module
      </div>
    </div>
  );
}
