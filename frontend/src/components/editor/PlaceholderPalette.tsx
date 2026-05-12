import type { Editor } from '@tiptap/react'
import { getPlaceholdersForZone, type PlaceholderZone } from '../../tiptap/PlaceholderChipExtension'

interface PlaceholderPaletteProps {
  editor: Editor | null
  zone: PlaceholderZone
  label?: string
}

export default function PlaceholderPalette({ editor, zone, label }: PlaceholderPaletteProps) {
  const defs = getPlaceholdersForZone(zone)

  const insert = (key: string) => {
    if (!editor) return
    editor.chain().focus().insertPlaceholderChip(key).run()
  }

  return (
    <div>
      {label && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {defs.map(p => (
          <button
            key={p.key}
            onMouseDown={e => { e.preventDefault(); insert(p.key) }}
            title={p.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: p.color + '1A',
              color: p.color,
              border: `1px solid ${p.color}55`,
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
