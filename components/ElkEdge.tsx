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
  label, // Captures aggregated connection tags like "render | call"
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

    // ALIGNMENT CALCULATOR: Trace the segment array to locate the true straight middle segment
    const allPoints = [
      { x: computedStartX, y: computedStartY },
      ...(bendPoints || []),
      { x: endX, y: endY }
    ];
    
    if (allPoints.length >= 2) {
      const midIndex = Math.floor(allPoints.length / 2);
      const p1 = allPoints[midIndex - 1];
      const p2 = allPoints[midIndex];
      // Anchors the center right on the middle orthogonal lane vector line segment
      if (p1 && p2 && !isNaN(p1.x) && !isNaN(p2.x)) {
        labelX = (p1.x + p2.x) / 2;
        labelY = (p1.y + p2.y) / 2;
      }
    }
  } else {
    path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  return (
    <>
      {/* Primary Visual Connection Path Line Line */}
      <BaseEdge 
        id={id} 
        path={path} 
        style={{ ...style, transition: 'stroke 0.2s ease, stroke-width 0.2s ease' }} 
        markerEnd={markerEnd} 
      />

      {/* Starting Anchor Pin - Conditioned on custom startPin parameter */}
      {data?.startPin && (
        <circle 
          cx={computedStartX} 
          cy={computedStartY} 
          r={data.startPin.width ? data.startPin.width / 2 : 4} 
          fill={data.startPin.color ? data.startPin.color : (style?.stroke ? (style.stroke as string) : "#9ca3af")} 
          stroke="#0f0f1a" 
          strokeWidth={1.5} 
        />
      )}
      
      {/* Invisible wider path line interaction layer to capture mouse hover easily */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        style={{ cursor: 'pointer' }}
      />

      {/* HTML Edge Badge Renderer */}
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
              zIndex: 50,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
