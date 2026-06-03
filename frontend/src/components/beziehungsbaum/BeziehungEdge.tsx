import { memo } from 'react'
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, MarkerType,
} from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import type { BaumEdgeData } from './types'

export type BeziehungEdgeType = Edge<BaumEdgeData, 'beziehung'>

// Diff-Farben überschreiben die Typ-Farbe
const DIFF_COLORS: Record<string, string> = {
  neu: '#00C853',
  geaendert: '#FFCC00',
  entfallen: '#FF3B30',
}

function linienStilZuStrokeDasharray(linienstil?: string): string | undefined {
  if (linienstil === 'dashed') return '6 3'
  if (linienstil === 'dotted') return '2 3'
  return undefined
}

function BeziehungEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data,
  markerEnd,
}: EdgeProps<BeziehungEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const farbe = data?.diffStatus ? DIFF_COLORS[data.diffStatus] : (data?.farbe ?? '#757575')
  const strokeDasharray = data?.diffStatus === 'entfallen'
    ? '5 5'
    : linienStilZuStrokeDasharray(data?.linienstil)

  const opacity = data?.diffStatus === 'entfallen' ? 0.5 : 1

  const resolvedMarkerEnd = data?.gerichtet
    ? `url(#arrow-${id})`
    : undefined

  return (
    <>
      {data?.gerichtet && (
        <defs>
          <marker
            id={`arrow-${id}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L8,3 z" fill={farbe} />
          </marker>
        </defs>
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={resolvedMarkerEnd ?? (markerEnd as string | undefined)}
        style={{
          stroke: farbe,
          strokeWidth: 2,
          strokeDasharray,
          opacity,
        }}
      />
      {data?.edgeLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              background: 'rgba(255,255,255,0.92)',
              border: `1px solid ${farbe}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 10,
              fontFamily: 'Inter, sans-serif',
              color: '#000',
              whiteSpace: 'nowrap',
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            className="nodrag nopan"
          >
            {data.edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(BeziehungEdge)
