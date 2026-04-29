import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Columns, Square, Settings, Eye, EyeOff } from 'lucide-react'
import { useDokument } from '../hooks/useDokument'
import { useEditorPrefs } from '../hooks/useEditorPrefs'
import { useAppSettings } from '../contexts'
import EditorPanel from '../components/editor/EditorPanel'
import { api } from '../api/client'
import Tooltip from '../components/Tooltip'

export default function DokumentEditorPage() {
  const [searchParams] = useSearchParams()
  const staffelId = searchParams.get('staffel') ?? ''
  const folgeNummer = parseInt(searchParams.get('folge') ?? '0', 10)

  const { treatmentLabel } = useAppSettings()
  const { prefs, updatePrefs } = useEditorPrefs()

  // Side-by-side vs single panel
  const [sideMode, setSideMode] = useState<'single' | 'split'>('single')

  // Resizable split ratio (left panel fraction 0.2–0.8)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)

    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)))
    }
    const onUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Document data
  const { dokumente, loading, createDokument, reload: reloadDokumente } = useDokument(
    staffelId || null,
    folgeNummer || null
  )

  // Format templates from backend
  const [formatElements, setFormatElements] = useState<any[]>([])
  const [customTypen, setCustomTypen] = useState<{ name: string; editor_modus: string }[]>([])

  useEffect(() => {
    // Load format template
    api.getFormatTemplates().then(templates => {
      const standard = templates.find(t => t.ist_standard)
      if (standard?.elemente) setFormatElements(standard.elemente)
    }).catch(() => {})

    // Load custom types
    if (staffelId) {
      api.getDokumentTypen(staffelId).then(typen => {
        setCustomTypen(typen.map(t => ({ name: t.name, editor_modus: t.editor_modus })))
      }).catch(() => {})
    }
  }, [staffelId])

  const handleCreateDokument = async (typ: string) => {
    await createDokument(typ)
  }

  if (!staffelId || !folgeNummer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Keine Staffel / Folge angegeben</p>
        <Link to="/" style={{ fontSize: 13, color: 'var(--sw-info)' }}>← Zurück zur Übersicht</Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-page)' }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 48, flexShrink: 0,
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={12} />
          Zurück
        </Link>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{staffelId}</span>
          <span style={{ margin: '0 6px' }}>·</span>
          <span>Folge {folgeNummer}</span>
        </div>

        {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lädt…</span>}

        <div style={{ flex: 1 }} />

        {/* Side-by-side Toggle */}
        <Tooltip text={sideMode === 'split' ? 'Einzelansicht' : 'Side-by-Side'}>
          <button
            onClick={() => setSideMode(m => m === 'single' ? 'split' : 'single')}
            style={{
              width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 6,
              background: sideMode === 'split' ? 'var(--text-primary)' : 'transparent',
              color: sideMode === 'split' ? 'var(--text-inverse)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            {sideMode === 'split' ? <Square size={13} /> : <Columns size={13} />}
          </button>
        </Tooltip>

        {/* Shadow Toggle */}
        <Tooltip text={prefs.showShadow ? 'Seitenschatten aus' : 'Seitenschatten ein'}>
          <button
            onClick={() => updatePrefs({ showShadow: !prefs.showShadow })}
            style={{
              width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 6,
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            {prefs.showShadow ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        </Tooltip>

        {/* Seitenformat Toggle */}
        <Tooltip text={`Seitenformat: ${prefs.seitenformat === 'a4' ? 'A4' : 'Letter'} — klicken zum Wechseln`}>
          <button
            onClick={() => updatePrefs({ seitenformat: prefs.seitenformat === 'a4' ? 'letter' : 'a4' })}
            style={{
              padding: '0 8px', height: 30, border: '1px solid var(--border)', borderRadius: 6,
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            }}
          >
            {prefs.seitenformat === 'a4' ? 'A4' : 'Letter'}
          </button>
        </Tooltip>

        <Link to="/admin" title="Admin-Einstellungen">
          <button style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <Settings size={13} />
          </button>
        </Link>
      </div>

      {/* Editor area */}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {sideMode === 'single' ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <EditorPanel
              staffelId={staffelId}
              folgeNummer={folgeNummer}
              allDokumente={dokumente}
              customTypen={customTypen}
              formatElements={formatElements}
              onCreateDokument={handleCreateDokument}
              onReloadDokumente={reloadDokumente}
            />
          </div>
        ) : (
          <>
            {/* Left panel */}
            <div style={{
              width: `${splitRatio * 100}%`, overflow: 'hidden', flexShrink: 0,
              pointerEvents: isDragging ? 'none' : 'auto',
            }}>
              <EditorPanel
                staffelId={staffelId}
                folgeNummer={folgeNummer}
                allDokumente={dokumente}
                customTypen={customTypen}
                formatElements={formatElements}
                onCreateDokument={handleCreateDokument}
                onReloadDokumente={reloadDokumente}
              />
            </div>

            {/* Drag handle */}
            <div
              onMouseDown={onDragStart}
              onDoubleClick={() => setSplitRatio(0.5)}
              style={{
                width: 8, flexShrink: 0, cursor: 'col-resize',
                background: isDragging ? 'var(--sw-info)' : 'var(--border)',
                transition: isDragging ? 'none' : 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Ziehen zum Ändern der Breite · Doppelklick = 50/50"
            >
              <div style={{
                width: 3, height: 32, borderRadius: 2,
                background: isDragging ? '#fff' : 'var(--text-muted)',
                opacity: isDragging ? 1 : 0.4,
              }} />
            </div>

            {/* Right panel */}
            <div style={{
              flex: 1, overflow: 'hidden',
              pointerEvents: isDragging ? 'none' : 'auto',
            }}>
              <EditorPanel
                staffelId={staffelId}
                folgeNummer={folgeNummer}
                allDokumente={dokumente}
                customTypen={customTypen}
                formatElements={formatElements}
                onCreateDokument={handleCreateDokument}
                onReloadDokumente={reloadDokumente}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
