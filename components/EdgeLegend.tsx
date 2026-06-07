"use client";

/**
 * EdgeLegend.tsx — Fixed legend showing edge type → color mapping.
 * Positioned at top-right of the canvas for quick reference.
 */

export default function EdgeLegend() {
  return (
    <div className="absolute top-4 right-4 z-10 glass-panel px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7b] mb-2">
        Edge Legend
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-blue-500 rounded" />
          <span className="text-[11px] text-[#9898a6]">Render</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0 border-t-2 border-dashed border-orange-500" />
          <span className="text-[11px] text-[#9898a6]">Call</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0 border-t-2 border-dotted border-gray-500" />
          <span className="text-[11px] text-[#9898a6]">Import-only</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0 border-t-2 border-dashed border-purple-500" />
          <span className="text-[11px] text-[#9898a6]">Dynamic</span>
        </div>
      </div>
    </div>
  );
}
