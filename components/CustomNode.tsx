import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { NodeType } from "@/lib/graphStore";

export const CustomNode = memo(({ data, selected }: NodeProps) => {
  const nodeType = data.nodeType as NodeType;
  const isClient = data.isClientComponent as boolean;
  const hasServerAction = data.hasServerAction as boolean;

  return (
    <div
      className={`graph-node graph-node--${nodeType} ${selected ? "selected" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/30 !w-2 !h-2 !border-0 !min-w-0 !min-h-0" />

      {/* Client component badge */}
      {isClient && (
        <div className="node-badge bg-amber-500">C</div>
      )}

      {/* Server action badge */}
      {hasServerAction && !isClient && (
        <div className="node-badge bg-red-500">S</div>
      )}

      <div className="node-label" title={data.filePath}>
        {data.label}
      </div>
      <div className="node-type">{nodeType.replace(/-/g, " ")}</div>

      {/* Route badge */}
      {data.route && (
        <div className="text-[8px] mt-1 opacity-60 font-mono truncate max-w-[140px]">
          {data.route}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-white/30 !w-2 !h-2 !border-0 !min-w-0 !min-h-0" />
    </div>
  );
});

CustomNode.displayName = "CustomNode";

// Export the statically defined nodeTypes object so it survives Next.js Fast Refresh
export const nodeTypes = { custom: CustomNode };
