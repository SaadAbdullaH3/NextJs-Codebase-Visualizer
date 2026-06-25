// components/pro/ClusterNodePro.tsx
"use client";

import { Handle, Position, NodeProps } from "reactflow";
import { useMemo } from "react";
import { useGraphStore } from "@/lib/graphStore";

// Dominant color for a set of edge types
function portColor(edgeTypes: string[]): string {
  if (edgeTypes.includes("render"))         return "#60a5fa"; // blue
  if (edgeTypes.includes("call"))           return "#fb923c"; // orange
  if (edgeTypes.includes("dynamic-import")) return "#c084fc"; // purple
  return "#9ca3af";                                           // grey (import-only)
}

function PortSquare({
  direction,
  edgeTypes,
  position,
  handleId,
}: {
  direction: "in" | "out";
  edgeTypes: string[];
  position: Position;
  handleId: string;
}) {
  const color = portColor(edgeTypes);
  const label = direction === "out" ? "→" : "←";

  return (
    <div
      style={{
        position: "absolute",
        // Positioning is handled by the Handle component below
        // This div is purely decorative — it sits inside the Handle's space
        width: 14,
        height: 14,
        backgroundColor: "#0f0f1a",
        border: `2px solid ${color}`,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 8,
        color,
        fontWeight: 700,
        zIndex: 20,
        pointerEvents: "none",
        transform: "translate(-50%, -50%)",
      }}
    >
      {label}
      <Handle
        type={direction === "out" ? "source" : "target"}
        position={position}
        id={handleId}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          opacity: 0,     // invisible — the Port square div above is the visual
          border: "none",
          background: "none",
          top: 0,
          left: 0,
          transform: "none",
        }}
      />
    </div>
  );
}

export function ClusterNodePro({ data }: NodeProps) {
  const {
    label,
    isExpanded,
    childCount,
    domainRole,
    portExits = [],
    portEntries = [],
  } = data;

  const toggleCluster = useGraphStore((s) => s.toggleCluster);
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleCluster(label as string);
  };

  const hasExits   = portExits.length > 0;
  const hasEntries = portEntries.length > 0;

  return (
    <div
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
        border: "1px dashed rgba(100,120,180,0.4)",
        borderRadius: 8,
        backgroundColor: "rgba(15,15,26,0.7)",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Cluster header */}
      <div
        onClick={handleClick}
        style={{
          position: "relative",
          cursor: "pointer",
          zIndex: 5,
          padding: "8px 12px",
          borderBottom: isExpanded ? "1px solid rgba(100,120,180,0.2)" : "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          backgroundColor: "#0f0f1a",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <span style={{ fontSize: 12, color: "#94a3b8" }}>📁</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: "#64748b" }}>
          {childCount} files
        </span>
        {domainRole && (
          <span
            style={{
              fontSize: 9,
              color: "#475569",
              marginLeft: "auto",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {domainRole}
          </span>
        )}
      </div>

      {/* PORT SQUARE — Exit (right side of cluster, outgoing trunk) */}
      {hasExits && (
        <div
          style={{
            position: "absolute",
            right: -7,
            top: "50%",
          }}
        >
          <PortSquare
            direction="out"
            edgeTypes={portExits}
            position={Position.Right}
            handleId="port-right-out"
          />
        </div>
      )}

      {/* PORT SQUARE — Entry (left side of cluster, incoming trunk) */}
      {hasEntries && (
        <div
          style={{
            position: "absolute",
            left: -7,
            top: "50%",
          }}
        >
          <PortSquare
            direction="in"
            edgeTypes={portEntries}
            position={Position.Left}
            handleId="port-left-in"
          />
        </div>
      )}

      {/* Standard top/bottom ports (for vertical routing) */}
      <Handle
        type="target"
        position={Position.Top}
        id="port-top-in"
        style={{ opacity: 0, border: "none", background: "none" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="port-bottom-out"
        style={{ opacity: 0, border: "none", background: "none" }}
      />
    </div>
  );
}
