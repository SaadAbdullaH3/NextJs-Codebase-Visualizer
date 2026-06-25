"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Folder } from "lucide-react";
import { useGraphStore } from "@/lib/graphStore";

export const ClusterNode = memo(({ data }: NodeProps) => {
  const toggleCluster = useGraphStore((s) => s.toggleCluster);

  const clusterKey = data.label as string;
  const isExpanded = data.isExpanded as boolean;
  const childCount = (data.childCount as number) || 0;
  const domainRole = (data.domainRole as string) || "Feature Module";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleCluster(clusterKey);
  };

  return (
    <div 
      className={`w-full h-full relative ${isExpanded ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer flex flex-col justify-center px-4'}`}
      onClick={!isExpanded ? handleClick : undefined}
    >
      {/* 
        Persistently rendered handles so React Flow can roll up cross-module edges 
        when the folder is collapsed, and maintain layout coordinates.
        Using !pointer-events-auto so they can safely receive connection vectors regardless of wrapper state.
      */}
      <Handle type="target" position={Position.Left} className="opacity-0 !pointer-events-auto" />
      <Handle type="source" position={Position.Right} className="opacity-0 !pointer-events-auto" />
      <Handle type="target" position={Position.Top} className="opacity-0 !pointer-events-auto" />
      <Handle type="source" position={Position.Bottom} className="opacity-0 !pointer-events-auto" />

      {isExpanded ? (
        <div 
          className="absolute -top-3 left-4 bg-neutral-800 px-3 py-1 rounded-full border border-neutral-700 flex items-center gap-2 cursor-pointer pointer-events-auto hover:bg-neutral-700 transition-colors shadow-md z-10"
          onClick={handleClick}
        >
          <Folder size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-neutral-200">{clusterKey}</span>
          <span className="text-[10px] bg-neutral-900 px-1.5 rounded-md text-neutral-400 font-mono">{childCount} files</span>
          <span className="text-[10px] text-blue-400 ml-1 opacity-80">{domainRole}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Folder size={20} className="text-blue-400 shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span className="text-sm font-semibold text-neutral-100 truncate max-w-full">{clusterKey}</span>
            <span className="text-xs text-neutral-400 truncate max-w-full">{domainRole} • {childCount} files</span>
          </div>
        </div>
      )}
    </div>
  );
});
