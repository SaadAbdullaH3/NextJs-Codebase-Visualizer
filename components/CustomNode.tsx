"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { NodeType } from "@/lib/graphStore";

export const CustomNode = memo(({ data, selected }: NodeProps) => {
  const nodeType = data.nodeType as NodeType;
  const isClient = data.isClientComponent as boolean;
  const hasServerAction = data.hasServerAction as boolean;

  return (
    <div
      className={`relative flex flex-col items-center justify-center min-w-[150px] px-4 py-3 rounded-xl border graph-node--${nodeType} shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-all duration-200 ${
        selected
          ? "border-white ring-4 ring-white/30 shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-10"
          : "border-white/10 hover:border-white/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.6)] hover:-translate-y-[1px]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/50 !w-2 !h-2 !border-0 !min-w-0 !min-h-0" />

      {/* Client component badge */}
      {isClient && (
        <div className="absolute -top-2.5 -right-2.5 flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow-md border-2 border-white/20">
          C
        </div>
      )}

      {/* Server action badge */}
      {hasServerAction && !isClient && (
        <div className="absolute -top-2.5 -right-2.5 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-md border-2 border-white/20">
          S
        </div>
      )}

      <div className="text-sm font-bold tracking-tight text-white max-w-[160px] truncate drop-shadow-sm" title={data.filePath}>
        {data.label}
      </div>
      <div className="text-[10px] text-white/80 font-mono mt-0.5 uppercase tracking-wider font-semibold">
        {nodeType.replace(/-/g, " ")}
      </div>

      {/* Route badge */}
      {data.route && (
        <div className="text-[10px] text-white/90 font-mono mt-2 truncate max-w-[140px] px-1.5 py-0.5 bg-black/30 rounded border border-white/10 backdrop-blur-sm">
          {data.route}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-white/50 !w-2 !h-2 !border-0 !min-w-0 !min-h-0" />
    </div>
  );
});

CustomNode.displayName = "CustomNode";

// Export the statically defined nodeTypes object so it survives Next.js Fast Refresh
export const nodeTypes = { custom: CustomNode };
