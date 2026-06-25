// components/ElkEdge.tsx
import React from 'react';
import { BaseEdge, EdgeProps, EdgeLabelRenderer } from 'reactflow';

export default function ElkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
  label, 
}: EdgeProps) {
  let path = '';
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  let computedStartX = sourceX;
  let computedStartY = sourceY;

  if (data?.elkPath) {
    const { startPoint, bendPoints, endPoint } = data.elkPath;
    
    computedStartX = startPoint?.x ?? sourceX;
    computedStartY = startPoint?.y ?? sourceY;
    path = `M ${computedStartX} ${computedStartY} `;

    if (bendPoints && bendPoints.length > 0) {
      bendPoints.forEach((point: { x: number; y: number }) => {
        path += `L ${point.x} ${point.y} `;
      });
    }

    const endX = endPoint?.x ?? targetX;
    const endY = endPoint?.y ?? targetY;
    path += `L ${endX} ${endY}`;
  } else {
    path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  // RESPECT FOREGROUND HIGHLIGHT BYPASS RULES
  const isHighlighted = data?.isHighlighted === true;
  const edgeStroke = isHighlighted ? data.highlightColor : (style?.stroke || "#737373");
  const edgeWidth = isHighlighted ? 4 : (data?.isTrunk ? 3 : (style?.strokeWidth || 1.5));
  const edgeOpacity = isHighlighted ? 1 : (data?.isTrunk ? 0.95 : (style?.opacity || 0.85));

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          stroke: edgeStroke,
          strokeWidth: edgeWidth,
          opacity: edgeOpacity,
        }}
        markerEnd={markerEnd}
      />
      
      {/* Target connection circular anchor pins */}
      {data?.startPin && (
        <circle 
          cx={computedStartX} 
          cy={computedStartY} 
          r={4} 
          fill={isHighlighted ? data.highlightColor : "#64748b"} 
          stroke="#0f0f1a" 
          strokeWidth={1.5} 
        />
      )}
      
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        style={{ cursor: 'pointer' }}
      />

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#1a1a2e',
              color: '#c084fc',
              border: '1px solid #4338ca',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: 'monospace',
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
