"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { NodeType } from "@/lib/graphStore";

export const CustomNode = memo(({ data, selected }: NodeProps) => {
  const nodeType = data.nodeType as NodeType;
  const isClient = data.isClientComponent as boolean;
  const hasServerAction = data.hasServerAction as boolean;

  // Read overlay data
  const boundaryRole = data?.boundaryRole as string | undefined;
  const boundarySubtreeCount = data?.boundarySubtreeCount as number | undefined;

  const heatColor  = data?.heatColor  as string | undefined;
  const blastRadius = data?.blastRadius as number | undefined;
  
  const dataRoles = data?.dataRoles as string[] | undefined;

  // Compute conditional styles
  const overlayBorderStyle = (() => {
    if (!boundaryRole) return {};
    switch (boundaryRole) {
      case "client-root":
        return { outline: "2px solid #c2410c", outlineOffset: "2px" };
      case "client-inherited":
        return { outline: "1px dashed #fb923c", outlineOffset: "1px" };
      case "server-action":
        return { outline: "2px solid #9333ea", outlineOffset: "2px" };
      case "server":
        return { outline: "2px solid #3b82f6", outlineOffset: "2px" };
      default:
        return {};
    }
  })();

  const overlayBgStyle = (() => {
    if (!boundaryRole) return {};
    switch (boundaryRole) {
      case "client-root":     return { backgroundColor: "rgba(194,65,12,0.12)" };
      case "client-inherited":return { backgroundColor: "rgba(251,146,60,0.07)" };
      case "server-action":   return { backgroundColor: "rgba(147,51,234,0.12)" };
      case "server":          return { backgroundColor: "rgba(59,130,246,0.15)" };
      default:                return {};
    }
  })();

  // Heatmap border override — uses boxShadow to prevent collision with boundary outline
  const heatBorderStyle = heatColor
    ? { boxShadow: `0 0 0 2px ${heatColor}` }
    : {};

  const heatBgStyle = heatColor
    ? { backgroundColor: `${heatColor}18` }   // 18 = ~10% opacity in hex
    : {};

  return (
    <div
      style={{ ...overlayBorderStyle, ...overlayBgStyle, ...heatBorderStyle, ...heatBgStyle, position: "relative" }}
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

      {/* Heatmap blast radius badge */}
      {heatColor && blastRadius !== undefined && (
        <div
          className="absolute top-0.5 right-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-md border border-white/10 backdrop-blur-sm z-20"
          style={{ backgroundColor: `${heatColor}33`, color: heatColor }}
          title={`${blastRadius} files transitively depend on this`}
        >
          ⚡ {blastRadius}
        </div>
      )}

      {/* Server action badge */}
      {hasServerAction && !isClient && (
        <div className="absolute -top-2.5 -right-2.5 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-md border-2 border-white/20">
          S
        </div>
      )}

      <div className="relative z-10 text-sm font-bold tracking-tight text-white max-w-[160px] truncate drop-shadow-sm" title={data.filePath}>
        {data.label}
      </div>
      <div className="relative z-10 text-[10px] text-white/80 font-mono mt-0.5 uppercase tracking-wider font-semibold">
        {nodeType.replace(/-/g, " ")}
      </div>

      {/* Route badge */}
      {data.route && (
        <div className="relative z-10 text-[10px] text-white/90 font-mono mt-2 truncate max-w-[140px] px-1.5 py-0.5 bg-black/30 rounded border border-white/10 backdrop-blur-sm">
          {data.route}
        </div>
      )}

      {boundaryRole && (
        <div className="relative z-10 mt-1 flex flex-col items-center gap-0.5">
          {boundaryRole === "client-root" && (
            <span className="text-[9px] font-bold text-orange-400 bg-orange-950 px-1.5 py-0.5 rounded shadow-sm border border-orange-500/30">
              ⚡ CLIENT BOUNDARY
              {boundarySubtreeCount !== undefined && boundarySubtreeCount > 0
                ? ` · ${boundarySubtreeCount} components`
                : ""}
            </span>
          )}
          {boundaryRole === "client-inherited" && (
            <span className="text-[9px] text-orange-300 bg-orange-950/50 px-1 py-0.5 rounded border border-orange-500/20">
              ⚡ CLIENT
            </span>
          )}
          {boundaryRole === "server-action" && (
            <span className="text-[9px] text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded border border-purple-500/30">
              ⚙ SERVER ACTION
            </span>
          )}
          {boundaryRole === "server" && (
            <span className="text-[9px] font-bold text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-500/30">
              ▣ SERVER
            </span>
          )}
        </div>
      )}

      {dataRoles && dataRoles.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1 justify-center">
          {dataRoles.includes("fetch") && (
            <span className="text-[9px] text-cyan-300 bg-cyan-950/60 px-1 rounded">
              📡 FETCH
            </span>
          )}
          {dataRoles.includes("db") && (
            <span className="text-[9px] text-amber-300 bg-amber-950/60 px-1 rounded">
              🗄 DB
            </span>
          )}
          {dataRoles.includes("action") && (
            <span className="text-[9px] text-purple-300 bg-purple-950/60 px-1 rounded">
              ⚙ ACTION
            </span>
          )}
          {dataRoles.includes("revalidates") && (
            <span className="text-[9px] text-violet-300 bg-violet-950/60 px-1 rounded">
              ↺ REVALIDATES
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-white/50 !w-2 !h-2 !border-0 !min-w-0 !min-h-0" />
    </div>
  );
});

CustomNode.displayName = "CustomNode";

// Export the statically defined nodeTypes object so it survives Next.js Fast Refresh
export const nodeTypes = { custom: CustomNode };
