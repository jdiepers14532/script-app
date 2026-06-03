import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { BaumNodeData } from './types'

export type FigurNodeType = Node<BaumNodeData, 'figur'>

const HANDLE_STYLE: React.CSSProperties = {
  background: '#555',
  width: 8,
  height: 8,
}

function FigurNode({ data, selected }: NodeProps<FigurNodeType>) {
  const initials = (data.name || '?')
    .split(' ')
    .map((w: string) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div style={{
      background: '#fff',
      border: `2px solid ${selected ? '#000' : '#E0E0E0'}`,
      borderRadius: 8,
      padding: '8px 12px',
      minWidth: 160,
      minHeight: 44,
      fontFamily: 'Inter, sans-serif',
      boxShadow: selected
        ? '0 0 0 2px rgba(0,0,0,0.12)'
        : '0 1px 4px rgba(0,0,0,0.08)',
      cursor: 'grab',
      userSelect: 'none',
    }}>
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#F5F5F5', border: '1px solid #E0E0E0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: '#757575', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: '#000',
            lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', maxWidth: 130,
          }}>
            {data.name}
          </div>
          {data.darsteller_name && (
            <div style={{
              fontSize: 11, color: '#757575', lineHeight: 1.3,
              whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis', maxWidth: 130,
            }}>
              {data.darsteller_name}
            </div>
          )}
          {data.kategorie_name && (
            <div style={{ fontSize: 10, color: '#007AFF', lineHeight: 1.2, marginTop: 1 }}>
              {data.kategorie_name}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  )
}

export default memo(FigurNode)
