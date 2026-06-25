// components/pro/SubClusterNode.tsx
"use client";

import { Handle, Position, NodeProps } from "reactflow";

export function SubClusterNode({ data }: NodeProps) {
  const { label, childCount } = data;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        // HARMONIZED CONTRAST: Subtle structural dark border with deep charcoal background slate
        border: "1px dashed #312e81", // Deep muted indigo dash outline
        borderRadius: 8,
        backgroundColor: "#111118", // Deep matching charcoal slate (eliminates muddy colors)
        position: "relative",
        boxSizing: "border-box",
        boxShadow: "inset 0 0 10px rgba(99, 102, 241, 0.05), 0 4px 12px rgba(0,0,0,0.4)"
      }}
    >
      {/* Sub-cluster folder tab banner layout split */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          backgroundColor: "#161625", // Soft header panel divide split
          borderRadius: "6px 6px 0 0",
          borderBottom: "1px solid rgba(49, 46, 129, 0.3)",
        }}
      >
        <span style={{ fontSize: 11, color: "#6366f1" }}>📂</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", fontFamily: "monospace" }}>
          {label}/
        </span>
        <span style={{ 
          fontSize: 9, 
          fontWeight: 600,
          color: "#818cf8", 
          backgroundColor: "rgba(99, 102, 241, 0.08)",
          padding: "1px 5px",
          borderRadius: 4,
          marginLeft: "auto",
          fontFamily: "monospace"
        }}>
          {childCount} files
        </span>
      </div>

      {/* Standard background coordinate handles for ELK routing passes */}
      <Handle type="target" position={Position.Top} id="sub-port-top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="sub-port-bottom" style={{ opacity: 0 }} />
    </div>
  );
}
