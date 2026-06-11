import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Eye } from 'lucide-react'

const THUMB_SIZE = 42   // px — Thumbnail-Größe in der Liste
const PREVIEW_SIZE = 126 // px — Hover-Vorschau (300% von THUMB_SIZE)

interface Entity {
  id: string
  name: string
  rollen_nummer?: number | null
  komparsen_nummer?: number | null
  is_active?: boolean
  primaerFoto?: string | null
  badge?: string | null
  freigabe_status?: string | null
}

interface EntitySidebarProps {
  entities: Entity[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onAktivieren?: (id: string) => void
  loading?: boolean
  numberKey?: 'rollen_nummer' | 'komparsen_nummer'
  /** Rendered between search bar and entity list */
  belowSearch?: React.ReactNode
  /** When true, hides the entity list (e.g. when a different view mode is active) */
  hideList?: boolean
  /** Called on ArrowLeft (-1) / ArrowRight (+1) — e.g. to switch between view modes */
  onHorizontalNav?: (dir: -1 | 1) => void
}

const MIN_WIDTH = 180
const DEFAULT_WIDTH = 281
const MAX_WIDTH = 360

export default function EntitySidebar({
  entities,
  selectedId,
  onSelect,
  onNew,
  onAktivieren,
  loading = false,
  numberKey = 'rollen_nummer',
  belowSearch,
  hideList = false,
  onHorizontalNav,
}: EntitySidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [search, setSearch] = useState('')
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)))
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const q = search.toLowerCase()
  const filtered = entities.filter(e => e.name.toLowerCase().includes(q))
  const active = filtered.filter(e => e.is_active !== false)
  const inactive = filtered.filter(e => e.is_active === false)
  // Reihenfolge der Tastatur-Navigation entspricht der Render-Reihenfolge (aktiv, dann inaktiv)
  const ordered = [...active, ...inactive]

  // Pfeiltasten-Navigation: ↑/↓ wechselt die Auswahl, ←/→ schaltet (optional) den Ansichtsmodus.
  // Greift nur, wenn der Fokus nicht in einem Eingabefeld liegt (Ausnahme: Suchfeld erlaubt ↑/↓).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      const isSearch = el === searchRef.current
      const tag = el?.tagName
      const isTextField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (isTextField) return
        if (!onHorizontalNav) return
        onHorizontalNav(e.key === 'ArrowRight' ? 1 : -1)
        e.preventDefault()
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (hideList) return
        if (isTextField && !isSearch) return
        if (ordered.length === 0) return
        const idx = ordered.findIndex(en => en.id === selectedId)
        let next: number
        if (idx === -1) next = e.key === 'ArrowDown' ? 0 : ordered.length - 1
        else if (e.key === 'ArrowDown') next = Math.min(ordered.length - 1, idx + 1)
        else next = Math.max(0, idx - 1)
        const target = ordered[next]
        if (target && target.id !== selectedId) {
          onSelect(target.id)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ordered, selectedId, onSelect, onHorizontalNav, hideList])

  return (
    <div style={{ width, minWidth: MIN_WIDTH, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', position: 'relative', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--text)' }}
        />
        <button
          onClick={onNew}
          title="Neu anlegen"
          style={{ padding: '4px 7px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Slot below search */}
      {belowSearch}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', display: hideList ? 'none' : undefined }}>
        {loading && <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>Lädt…</div>}

        {active.map(e => (
          <EntityRow
            key={e.id}
            entity={e}
            selected={e.id === selectedId}
            onSelect={onSelect}
            numberKey={numberKey}
          />
        ))}

        {inactive.length > 0 && (
          <>
            <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Inaktiv
            </div>
            {inactive.map(e => (
              <EntityRow
                key={e.id}
                entity={e}
                selected={e.id === selectedId}
                onSelect={onSelect}
                numberKey={numberKey}
                inactive
                onAktivieren={onAktivieren}
              />
            ))}
          </>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
            {search ? 'Keine Treffer' : 'Noch keine Einträge'}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={e => { dragging.current = true; startX.current = e.clientX; startW.current = width }}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 10 }}
      />
    </div>
  )
}

function EntityRow({ entity, selected, onSelect, numberKey, inactive = false, onAktivieren }: {
  entity: Entity
  selected: boolean
  onSelect: (id: string) => void
  numberKey: 'rollen_nummer' | 'komparsen_nummer'
  inactive?: boolean
  onAktivieren?: (id: string) => void
}) {
  const nr = entity[numberKey]
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null)
  const thumbRef = useRef<HTMLImageElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // Bei Auswahl (auch per Pfeiltaste) die Zeile in den sichtbaren Bereich scrollen
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const showPreview = useCallback(() => {
    if (!thumbRef.current) return
    const rect = thumbRef.current.getBoundingClientRect()
    setPreviewPos({
      top: rect.top + rect.height / 2 - PREVIEW_SIZE / 2,
      left: rect.right + 8,
    })
  }, [])

  const hidePreview = useCallback(() => setPreviewPos(null), [])

  return (
    <div
      ref={rowRef}
      onClick={() => onSelect(entity.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        cursor: 'pointer',
        background: selected ? 'var(--bg-active)' : 'transparent',
        borderLeft: selected ? '2px solid var(--text)' : '2px solid transparent',
        opacity: inactive ? 0.5 : 1,
      }}
    >
      <span style={{ width: 32, flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {nr != null ? nr : ''}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entity.name}
          {entity.freigabe_status === 'ausstehend' && (
            <span title="Freigabe ausstehend" style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFCC00', flexShrink: 0, display: 'inline-block' }} />
          )}
          {entity.freigabe_status === 'abgelehnt' && (
            <span title="Freigabe abgelehnt" style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF3B30', flexShrink: 0, display: 'inline-block' }} />
          )}
        </span>
        {entity.badge && (
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginTop: 1 }}>
            {entity.badge}
          </span>
        )}
      </span>
      {entity.primaerFoto && !inactive && (
        <>
          <img
            ref={thumbRef}
            src={entity.primaerFoto}
            alt=""
            onMouseEnter={showPreview}
            onMouseLeave={hidePreview}
            style={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 4, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
          />
          {previewPos && (
            <div style={{
              position: 'fixed',
              top: previewPos.top,
              left: previewPos.left,
              width: PREVIEW_SIZE,
              height: PREVIEW_SIZE,
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
              zIndex: 9999,
            }}>
              <img src={entity.primaerFoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}
        </>
      )}
      {inactive && onAktivieren && (
        <button
          onClick={ev => { ev.stopPropagation(); onAktivieren(entity.id) }}
          title="Aktivieren"
          style={{ padding: '2px 5px', fontSize: 10, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <Eye size={10} /> Aktivieren
        </button>
      )}
    </div>
  )
}
