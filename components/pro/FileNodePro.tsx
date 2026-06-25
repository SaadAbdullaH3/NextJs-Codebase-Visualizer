// components/pro/FileNodePro.tsx
"use client";

import { Handle, Position, NodeProps } from "reactflow";

// Generate evenly spaced percentage positions for N handles across a node edge
function distributePositions(count: number): string[] {
  if (count === 0) return [];
  if (count === 1) return ["50%"];
  return Array.from({ length: count }, (_, i) =>
    `${((i + 1) / (count + 1)) * 100}%`
  );
}

export function FileNodePro({ data, selected }: NodeProps) {
  const {
    label,
    nodeType,
    inPortCount  = 0,
    outPortCount = 0,
    // overlay data (from applyBoundaryOverlay / applyHeatmapOverlay)
    boundaryRole,
    heatColor,
    blastRadius,
    boundarySubtreeCount,
    // standard node data
    filePath,
  } = data;

  const inPositions  = distributePositions(inPortCount);
  const outPositions = distributePositions(outPortCount);

  // ── Compute visual styles (copy from CustomNode.tsx + overlay additions) ──

  const NODE_TYPE_COLORS: Record<string, { bg: string; label: string }> = {
    "page":               { bg: "#2563eb", label: "#bfdbfe" },
    "layout":             { bg: "#6366f1", label: "#c7d2fe" },
    "client-component":   { bg: "#d97706", label: "#fde68a" },
    "server-component":   { bg: "#16a34a", label: "#bbf7d0" },
    "server-action":      { bg: "#dc2626", label: "#fecaca" },
    "api-route":          { bg: "#ea580c", label: "#fed7aa" },
    "middleware":         { bg: "#9333ea", label: "#e9d5ff" },
    "hook":               { bg: "#0d9488", label: "#99f6e4" },
    "utility":            { bg: "#374151", label: "#d1d5db" },
    "context":            { bg: "#0891b2", label: "#a5f3fc" },
    "unknown":            { bg: "#374151", label: "#d1d5db" },
  };

  const typeStyle = NODE_TYPE_COLORS[nodeType] ?? NODE_TYPE_COLORS["unknown"];

  // Overlay border (boundary or heatmap — same logic as CustomNode.tsx overlays)
  const overlayBorder = heatColor
    ? `2px solid ${heatColor}`
    : boundaryRole === "client-root"
    ? "2px solid #c2410c"
    : boundaryRole === "server-action"
    ? "2px solid #9333ea"
    : undefined;

  return (
    <div
      style={{
        position:        "relative",
        zIndex:          10,
        backgroundColor: typeStyle.bg,
        border:          overlayBorder ?? `1px solid ${typeStyle.bg}`,
        borderRadius:    8,
        padding:         "8px 12px",
        minWidth:        180,
        minHeight:       50,
        boxSizing:       "border-box",
        outline:         selected ? "2px solid #ffffff44" : undefined,
        outlineOffset:   selected ? 2 : undefined,
      }}
    >
      {/* INCOMING (target) handles — top edge, evenly distributed */}
      {inPositions.map((left, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Top}
          id={`port-in-${i}-of-${inPortCount}`}
          style={{
            left,
            top:             -5,
            width:           8,
            height:          8,
            borderRadius:    "50%",
            backgroundColor: "#94a3b8",
            border:          "1px solid #1e293b",
            transform:       "translateX(-50%)",
          }}
        />
      ))}

      {/* Node label */}
      <div style={{ fontWeight: 700, fontSize: 13, color: "#ffffff", marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 9,
          color: typeStyle.label,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {nodeType.replace(/-/g, " ")}
      </div>

      {/* OUTGOING (source) handles — bottom edge, evenly distributed */}
      {outPositions.map((left, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Bottom}
          id={`port-out-${i}-of-${outPortCount}`}
          style={{
            left,
            bottom:          -5,
            width:           8,
            height:          8,
            borderRadius:    "50%",
            backgroundColor: "#64748b",
            border:          "1px solid #1e293b",
            transform:       "translateX(-50%)",
          }}
        />
      ))}

      {/* Heatmap blast badge — top right corner */}
      {heatColor && blastRadius !== undefined && (
        <div
          style={{
            position: "absolute", top: 2, right: 4,
            fontSize: 9, fontWeight: 700,
            color: heatColor,
            backgroundColor: `${heatColor}22`,
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          ⚡ {blastRadius}
        </div>
      )}
      
      {boundaryRole && (
        <div
          style={{
            position: "absolute", top: 2, right: 4,
            fontSize: 9, fontWeight: 700,
            color: boundaryRole === "client-root" ? "#fdba74" : "#d8b4fe",
            backgroundColor: boundaryRole === "client-root" ? "#9a3412" : "#6b21a8",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {boundaryRole === "client-root" ? `"use client"` : `"use server"`}
          {boundarySubtreeCount ? ` (${boundarySubtreeCount})` : ""}
        </div>
      )}
    </div>
  );
}
