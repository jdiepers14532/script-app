import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, Plus, Lock, Users, Globe, Tag, GitBranch, User } from 'lucide-react'
import type { WerkstufeMeta, SaveStatus } from '../../hooks/useDokument'
import Tooltip from '../Tooltip'
import { api, clearCacheByPrefix } from '../../api/client'

const SICHTBARKEIT_ICONS: Record<string, React.ReactNode> = {
  privat:     <Lock size={11} />,
  team:       <Users size={11} />,
  autoren:    <Users size={11} />,
  produktion: <Globe size={11} />,
  alle:       <Globe size={11} />,
  colab:      <Users size={11} />,
}

const SICHTBARKEIT_COLORS: Record<string, string> = {
  privat:     '#FF9500',
  team:       '#007AFF',
  autoren:    '#007AFF',
  produktion: '#00C853',
  alle:       '#00C853',
  colab:      '#AF52DE',
}

function getSichtbarkeitLabel(s: string) {
  if (s === 'privat') return 'Nur ich'
  if (s === 'autoren') return 'Alle Autoren'
  if (s === 'produktion') return 'Gesamte Produktion'
  if (s.startsWith('team:')) return 'Team'
  if (s.startsWith('colab:')) return 'Colab-Team'
  return s
}

const TYP_LABELS: Record<string, string> = {
  drehbuch: 'Drehbuch',
  storyline: 'Storyline',
  notiz: 'Notiz',
  abstrakt: 'Abstrakt',
}

const FORMAT_OPTIONS = [
  { value: 'drehbuch', label: 'Drehbuch' },
  { value: 'storyline', label: 'Storyline' },
  { value: 'notiz', label: 'Notiz' },
]

interface Props {
  selectedWerk: WerkstufeMeta | null
  werkstufen: WerkstufeMeta[]
  produktionId: string
  folgeNummer: number
  folgeId: number | null
  sceneFormat?: string | null
  onSelectWerkstufe: (id: string) => void
  onCreateWerkstufe: (typ: string) => void
  onReloadWerkstufen: () => void
  onChangeSceneFormat?: (format: string) => void
  saveStatus?: SaveStatus
  updatedBy?: string | null
  updatedAt?: string | null
  collabSlot?: React.ReactNode
}

export default function EditorPanelHeader({
  selectedWerk, werkstufen, produktionId, folgeNummer, folgeId,
  sceneFormat, onSelectWerkstufe, onCreateWerkstufe, onReloadWerkstufen,
  onChangeSceneFormat, saveStatus, updatedBy, updatedAt, collabSlot,
}: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [showLabelMenu, setShowLabelMenu] = useState(false)
  const [showSichtbarkeitMenu, setShowSichtbarkeitMenu] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState<'team' | 'colab' | null>(null)
  const [submenuOpenLeft, setSubmenuOpenLeft] = useState(false)
  const sichtbarkeitContainerRef = useRef<HTMLDivElement>(null)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [stageLabels, setStageLabels] = useState<{ id: number; name: string; is_produktionsfassung: boolean }[]>([])
  const [colabGruppen, setColabGruppen] = useState<Array<{ id: string; name: string }>>([])
  const [sichtbarkeitSaving, setSichtbarkeitSaving] = useState(false)
  const [revisionColors, setRevisionColors] = useState<{ id: number; name: string; color: string }[]>([])
  const [showRevisionMenu, setShowRevisionMenu] = useState(false)
  const [revisionSaving, setRevisionSaving] = useState(false)

  // Hover device detection (mouse = true, touch-only = false)
  const isHoverDevice = useRef(
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openSubmenu(id: 'team' | 'colab') {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setActiveSubmenu(id)
  }
  function scheduleCloseSubmenu() {
    hoverTimeoutRef.current = setTimeout(() => setActiveSubmenu(null), 150)
  }

  useEffect(() => {
    if (!produktionId) return
    api.getStageLabels(produktionId).then(setStageLabels).catch(() => {})
    api.getRevisionColors(produktionId).then(setRevisionColors).catch(() => {})
  }, [produktionId])

  // Reload groups fresh every time the menu opens + check viewport for submenu direction
  useEffect(() => {
    if (!showSichtbarkeitMenu) { setActiveSubmenu(null); return }
    if (!produktionId) return
    // Detect if submenu would overflow right edge
    if (sichtbarkeitContainerRef.current) {
      const rect = sichtbarkeitContainerRef.current.getBoundingClientRect()
      setSubmenuOpenLeft(rect.right + 200 > window.innerWidth)
    }
    clearCacheByPrefix('/colab-gruppen')
    api.getColabGruppen(produktionId).then(gs => setColabGruppen(gs.map((g: any) => ({ id: g.id, name: g.name })))).catch(() => {})
  }, [showSichtbarkeitMenu, produktionId])

  // Group werkstufen by typ
  const grouped = new Map<string, WerkstufeMeta[]>()
  for (const w of werkstufen) {
    const list = grouped.get(w.typ) || []
    list.push(w)
    grouped.set(w.typ, list)
  }

  const typLabel = selectedWerk ? (TYP_LABELS[selectedWerk.typ] ?? selectedWerk.typ) : 'Typ wählen'
  const versionLabel = selectedWerk ? `V${selectedWerk.version_nummer}` : ''
  const sichtbarkeit = selectedWerk?.sichtbarkeit ?? 'team'

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : null

  const saveColor = saveStatus === 'saved' ? 'var(--sw-green)'
    : saveStatus === 'queued' ? '#FF9500'
    : saveStatus === 'error' ? 'var(--sw-danger)'
    : 'var(--text-muted)'

  const saveLabel = saveStatus === 'saving' ? 'Speichert…'
    : saveStatus === 'saved' ? '● Gespeichert'
    : saveStatus === 'queued' ? '⏸ Lokal'
    : saveStatus === 'error' ? '● Fehler'
    : ''

  return (
    <div className="editor-panel-header" style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>

      {/* LEFT: Werkfassung, Fassungslabel, Version */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>

      {/* Werkstufen-Selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}
        >
          {typLabel}
          <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
        {showMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 220, padding: '4px 0' }}>
              {Array.from(grouped.entries()).map(([typ, versions]) => (
                <div key={typ}>
                  <div style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {TYP_LABELS[typ] ?? typ}
                  </div>
                  {versions.sort((a, b) => b.version_nummer - a.version_nummer).map(w => (
                    <button
                      key={w.id}
                      onClick={() => { onSelectWerkstufe(w.id); setShowMenu(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '7px 12px 7px 20px', fontSize: 12,
                        background: w.id === selectedWerk?.id ? 'var(--bg-active)' : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        color: 'var(--text-primary)', fontWeight: w.id === selectedWerk?.id ? 600 : 400,
                      }}
                    >
                      V{w.version_nummer}
                      {w.label && <span style={{ color: 'var(--text-secondary)' }}>{w.label}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                        {w.szenen_count} Sz.
                      </span>
                      {w.abgegeben && <span style={{ fontSize: 9, background: 'var(--bg-subtle)', padding: '1px 4px', borderRadius: 3, color: 'var(--text-muted)' }}>Abg.</span>}
                    </button>
                  ))}
                </div>
              ))}

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              {/* New werkstufe options */}
              {['drehbuch', 'storyline', 'notiz'].map(typ => (
                <button
                  key={typ}
                  onClick={() => { onCreateWerkstufe(typ); setShowMenu(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sw-info)', fontFamily: 'inherit' }}
                >
                  <Plus size={11} /> Neue {TYP_LABELS[typ] ?? typ}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Fassungs-Label — nach Werkfassung, vor Version */}
      {selectedWerk && stageLabels.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowLabelMenu(v => !v); setShowMenu(false) }}
            title="Fassungs-Label zuweisen"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px',
              border: `1px solid ${selectedWerk.label ? '#00C853' : 'var(--border)'}`,
              borderRadius: 999, fontSize: 11, fontWeight: 500,
              color: selectedWerk.label ? '#00C853' : 'var(--text-muted)',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Tag size={11} />
            {selectedWerk.label || 'Label'}
          </button>
          {showLabelMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowLabelMenu(false)} />
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 180, padding: '4px 0' }}>
                {stageLabels.map(sl => (
                  <button
                    key={sl.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={async (e) => {
                      e.stopPropagation()
                      const newLabel = selectedWerk.label === sl.name ? '' : sl.name
                      setLabelError(null)
                      try {
                        await api.updateWerkstufe(selectedWerk.id, { label: newLabel })
                        clearCacheByPrefix('/v2/folgen/')
                        onReloadWerkstufen()
                      } catch (err: any) {
                        clearCacheByPrefix('/v2/folgen/')
                        onReloadWerkstufen()
                        setLabelError('Fassung nicht mehr vorhanden – Ansicht wurde aktualisiert.')
                        console.error('Label update failed:', err)
                      }
                      setShowLabelMenu(false)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                      background: selectedWerk.label === sl.name ? 'var(--bg-active)' : 'transparent',
                      color: 'var(--text-primary)', fontWeight: selectedWerk.label === sl.name ? 600 : 400,
                    }}
                  >
                    {sl.name}
                    {sl.is_produktionsfassung && (
                      <Lock size={10} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
                    )}
                  </button>
                ))}
                {selectedWerk.label && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={async (e) => {
                        e.stopPropagation()
                        setLabelError(null)
                        try {
                          await api.updateWerkstufe(selectedWerk.id, { label: '' })
                          clearCacheByPrefix('/v2/folgen/')
                          onReloadWerkstufen()
                        } catch (err: any) {
                          clearCacheByPrefix('/v2/folgen/')
                          onReloadWerkstufen()
                          setLabelError('Fassung nicht mehr vorhanden – Ansicht wurde aktualisiert.')
                          console.error('Label remove failed:', err)
                        }
                        setShowLabelMenu(false)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                        padding: '7px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                        color: '#FF3B30', background: 'transparent', fontFamily: 'inherit',
                      }}
                    >
                      Label entfernen
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {labelError && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: '#FF3B30', color: '#fff', fontSize: 11, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', maxWidth: 300 }}>
              {labelError}
            </div>
          )}
        </div>
      )}

      {/* Version badge — klickbar, öffnet Werkfassung-Dropdown */}
      {selectedWerk && (
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}
        >
          {versionLabel}
          <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
      )}

      </div>{/* end LEFT */}

      {/* RIGHT: Save+User, Sichtbarkeit, Dokument-Typ, Revision */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, justifyContent: 'flex-end' }}>

      {/* Save status + User — rechtsbündig, links neben Sichtbarkeit */}
      {(saveStatus && saveStatus !== 'idle' || updatedBy || collabSlot) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4, borderRight: '1px solid var(--border)' }}>
          {saveStatus && saveStatus !== 'idle' && (
            <span style={{ fontSize: 11, color: saveColor, fontWeight: saveStatus === 'saved' || saveStatus === 'queued' ? 500 : 400, whiteSpace: 'nowrap' }}>
              {saveLabel}
            </span>
          )}
          {updatedBy && (
            <Tooltip text={`Zuletzt: ${updatedBy}${formattedDate ? '\n' + formattedDate : ''}`}>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'default', padding: '2px 2px' }}>
                <User size={12} />
              </span>
            </Tooltip>
          )}
          {collabSlot}
        </div>
      )}

      {/* Sichtbarkeits-Badge (klickbar) */}
      {selectedWerk && !selectedWerk.abgegeben && (
        <div ref={sichtbarkeitContainerRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowSichtbarkeitMenu(v => !v); setShowMenu(false); setShowLabelMenu(false) }}
            title={`Sichtbarkeit ändern (aktuell: ${getSichtbarkeitLabel(sichtbarkeit)})`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px',
              border: `1px solid ${SICHTBARKEIT_COLORS[sichtbarkeit.split(':')[0]] ?? '#ccc'}`,
              borderRadius: 999, fontSize: 11, fontWeight: 500,
              color: SICHTBARKEIT_COLORS[sichtbarkeit.split(':')[0]] ?? '#ccc',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {SICHTBARKEIT_ICONS[sichtbarkeit.split(':')[0]] ?? SICHTBARKEIT_ICONS['autoren']}
            {getSichtbarkeitLabel(sichtbarkeit)}
            {sichtbarkeitSaving && <span style={{ marginLeft: 2, opacity: 0.6 }}>…</span>}
          </button>

          {showSichtbarkeitMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setShowSichtbarkeitMenu(false); setActiveSubmenu(null) }} />
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 200, padding: '4px 0',
              }}>
                {[
                  { value: 'privat', label: 'Nur ich (Privat)', icon: <Lock size={11} />, color: '#FF9500', permanent: false },
                  { value: 'privat', label: 'Nur ich (dauerhaft)', icon: <Lock size={11} />, color: '#FF9500', permanent: true },
                  { value: 'autoren', label: 'Alle Autoren', icon: <Users size={11} />, color: '#007AFF', permanent: false },
                  { value: 'produktion', label: 'Gesamte Produktion', icon: <Globe size={11} />, color: '#00C853', permanent: false },
                ].map((opt, i) => (
                  <button
                    key={`${opt.value}-${i}`}
                    onClick={async () => {
                      setShowSichtbarkeitMenu(false)
                      setSichtbarkeitSaving(true)
                      try {
                        await api.put(`/werkstufen/${selectedWerk.id}/sichtbarkeit`, { sichtbarkeit: opt.value, privat_permanent: opt.permanent })
                        clearCacheByPrefix('/v2/folgen/')
                        onReloadWerkstufen()
                      } catch { /* ignore */ } finally { setSichtbarkeitSaving(false) }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: opt.permanent ? '5px 12px 5px 24px' : '7px 12px',
                      fontSize: opt.permanent ? 11 : 12,
                      background: sichtbarkeit === opt.value && (opt.permanent ? selectedWerk.privat_permanent : (!selectedWerk.privat_permanent || opt.value !== 'privat'))
                        ? 'var(--bg-active)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', color: opt.permanent ? '#FF950099' : opt.color,
                      fontWeight: sichtbarkeit === opt.value ? 600 : 400,
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                    {opt.permanent && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#FF950066' }}>kein Auto-Ablauf</span>}
                  </button>
                ))}
                {/* Team flyout */}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={isHoverDevice.current ? () => openSubmenu('team') : undefined}
                  onMouseLeave={isHoverDevice.current ? scheduleCloseSubmenu : undefined}
                >
                  <button
                    onClick={!isHoverDevice.current ? () => setActiveSubmenu(v => v === 'team' ? null : 'team') : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 12px', fontSize: 12,
                      background: sichtbarkeit.startsWith('team:') ? 'var(--bg-active)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', color: '#007AFF',
                      fontWeight: sichtbarkeit.startsWith('team:') ? 600 : 400,
                    }}
                  >
                    <Users size={11} />
                    Team
                    <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                  </button>
                  {activeSubmenu === 'team' && (
                    <div
                      style={{
                        position: 'absolute', top: -4,
                        ...(submenuOpenLeft ? { right: '100%' } : { left: '100%' }), zIndex: 100,
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 180, padding: '4px 0',
                      }}
                      onMouseEnter={isHoverDevice.current ? () => openSubmenu('team') : undefined}
                      onMouseLeave={isHoverDevice.current ? scheduleCloseSubmenu : undefined}
                    >
                      {colabGruppen.length === 0 ? (
                        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>
                          Noch keine Gruppen.{' '}
                          <button
                            onClick={() => { setShowSichtbarkeitMenu(false); setActiveSubmenu(null); window.dispatchEvent(new CustomEvent('open-team-work')) }}
                            style={{ background: 'none', border: 'none', color: '#007AFF', cursor: 'pointer', fontSize: 11, padding: 0 }}
                          >
                            Gruppe anlegen
                          </button>
                        </div>
                      ) : colabGruppen.map(g => (
                        <button
                          key={g.id}
                          onClick={async () => {
                            setShowSichtbarkeitMenu(false); setActiveSubmenu(null); setSichtbarkeitSaving(true)
                            try {
                              await api.put(`/werkstufen/${selectedWerk!.id}/sichtbarkeit`, { sichtbarkeit: `team:${g.id}` })
                              clearCacheByPrefix('/v2/folgen/')
                              onReloadWerkstufen()
                            } catch { /* ignore */ } finally { setSichtbarkeitSaving(false) }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '7px 12px', fontSize: 12,
                            background: sichtbarkeit === `team:${g.id}` ? 'var(--bg-active)' : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                            fontFamily: 'inherit', color: 'var(--text-primary)',
                            fontWeight: sichtbarkeit === `team:${g.id}` ? 600 : 400,
                          }}
                        >
                          {sichtbarkeit === `team:${g.id}` && <span style={{ color: '#007AFF', fontSize: 10 }}>✓</span>}
                          {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Colab flyout */}
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={isHoverDevice.current ? () => openSubmenu('colab') : undefined}
                  onMouseLeave={isHoverDevice.current ? scheduleCloseSubmenu : undefined}
                >
                  <button
                    onClick={!isHoverDevice.current ? () => setActiveSubmenu(v => v === 'colab' ? null : 'colab') : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 12px', fontSize: 12,
                      background: sichtbarkeit.startsWith('colab:') ? 'var(--bg-active)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', color: '#AF52DE',
                      fontWeight: sichtbarkeit.startsWith('colab:') ? 600 : 400,
                    }}
                  >
                    <Users size={11} />
                    Colab
                    <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                  </button>
                  {activeSubmenu === 'colab' && (
                    <div
                      style={{
                        position: 'absolute', top: -4,
                        ...(submenuOpenLeft ? { right: '100%' } : { left: '100%' }), zIndex: 100,
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 180, padding: '4px 0',
                      }}
                      onMouseEnter={isHoverDevice.current ? () => openSubmenu('colab') : undefined}
                      onMouseLeave={isHoverDevice.current ? scheduleCloseSubmenu : undefined}
                    >
                      {colabGruppen.length === 0 ? (
                        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>
                          Noch keine Gruppen.{' '}
                          <button
                            onClick={() => { setShowSichtbarkeitMenu(false); setActiveSubmenu(null); window.dispatchEvent(new CustomEvent('open-team-work')) }}
                            style={{ background: 'none', border: 'none', color: '#AF52DE', cursor: 'pointer', fontSize: 11, padding: 0 }}
                          >
                            Gruppe anlegen
                          </button>
                        </div>
                      ) : colabGruppen.map(g => (
                        <button
                          key={g.id}
                          onClick={async () => {
                            setShowSichtbarkeitMenu(false); setActiveSubmenu(null); setSichtbarkeitSaving(true)
                            try {
                              await api.put(`/werkstufen/${selectedWerk!.id}/sichtbarkeit`, { sichtbarkeit: `colab:${g.id}` })
                              clearCacheByPrefix('/v2/folgen/')
                              onReloadWerkstufen()
                            } catch { /* ignore */ } finally { setSichtbarkeitSaving(false) }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '7px 12px', fontSize: 12,
                            background: sichtbarkeit === `colab:${g.id}` ? 'var(--bg-active)' : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                            fontFamily: 'inherit', color: 'var(--text-primary)',
                            fontWeight: sichtbarkeit === `colab:${g.id}` ? 600 : 400,
                          }}
                        >
                          {sichtbarkeit === `colab:${g.id}` && <span style={{ color: '#AF52DE', fontSize: 10 }}>✓</span>}
                          {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Teams verwalten */}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => { setShowSichtbarkeitMenu(false); setActiveSubmenu(null); window.dispatchEvent(new CustomEvent('open-team-work')) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 12px', fontSize: 12,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'inherit', color: 'var(--text-secondary)',
                  }}
                >
                  <Users size={11} />
                  Teams verwalten
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {selectedWerk?.abgegeben && (
        <Tooltip text="Abgegeben — Sichtbarkeit kann nicht geändert werden">
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px',
            border: `1px solid ${SICHTBARKEIT_COLORS[sichtbarkeit.split(':')[0]] ?? '#ccc'}`,
            borderRadius: 999, fontSize: 11, fontWeight: 500,
            color: SICHTBARKEIT_COLORS[sichtbarkeit.split(':')[0]] ?? '#ccc',
          }}>
            {SICHTBARKEIT_ICONS[sichtbarkeit.split(':')[0]] ?? SICHTBARKEIT_ICONS['autoren']}
            {getSichtbarkeitLabel(sichtbarkeit)}
          </span>
        </Tooltip>
      )}

      {/* Scene format switcher */}
      {selectedWerk && sceneFormat && onChangeSceneFormat && (
        <Tooltip text="Szenen-Format ändern (bestimmt Editor-Typ und Absatzformate)">
          <select
            value={sceneFormat}
            onChange={e => onChangeSceneFormat(e.target.value)}
            style={{
              fontSize: 11, padding: '3px 6px', borderRadius: 4,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {FORMAT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Tooltip>
      )}

      {/* Revision UI */}
      {selectedWerk && (
        <div style={{ position: 'relative' }}>
          {selectedWerk.revision_color_id ? (
            // Active revision: show colored badge + stop button
            <>
              {(() => {
                const rc = revisionColors.find(c => c.id === selectedWerk.revision_color_id)
                return (
                  <Tooltip text={`Revision aktiv: ${rc?.name ?? '…'} — Geänderte Absätze werden mit * markiert`}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${rc?.color ?? '#888'}`,
                      color: rc?.color ?? '#888',
                    }}>
                      <GitBranch size={11} />
                      * {rc?.name ?? 'Revision'}
                    </span>
                  </Tooltip>
                )
              })()}
              <button
                onClick={async () => {
                  if (!confirm('Revision beenden? Alle Revisionsmarkierungen werden gelöscht.')) return
                  setRevisionSaving(true)
                  try {
                    await api.stopRevision(selectedWerk.id)
                    onReloadWerkstufen()
                  } catch { /* ignore */ } finally { setRevisionSaving(false) }
                }}
                disabled={revisionSaving}
                style={{
                  marginLeft: 4, padding: '3px 8px', borderRadius: 6, fontSize: 11,
                  border: '1px solid #FF3B30', background: 'transparent',
                  color: '#FF3B30', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                }}
              >
                Revision beenden
              </button>
            </>
          ) : (
            // No active revision: show "Revision starten" button
            revisionColors.length > 0 && (
              <>
                <button
                  onClick={() => setShowRevisionMenu(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                    border: '1px solid var(--border)', borderRadius: 6, fontSize: 11,
                    color: 'var(--text-muted)', background: 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                  }}
                >
                  <GitBranch size={11} />
                  Revision starten
                  <ChevronDown size={10} />
                </button>
                {showRevisionMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowRevisionMenu(false)} />
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 99, marginTop: 4,
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 200, padding: '4px 0',
                    }}>
                      <div style={{ padding: '5px 12px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Revisionsfarbe wählen
                      </div>
                      {revisionColors.map(rc => (
                        <button
                          key={rc.id}
                          onClick={async () => {
                            setShowRevisionMenu(false)
                            setRevisionSaving(true)
                            try {
                              await api.startRevision(selectedWerk.id, rc.id)
                              onReloadWerkstufen()
                            } catch { /* ignore */ } finally { setRevisionSaving(false) }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '7px 12px', fontSize: 12, border: 'none',
                            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                            background: 'transparent', color: 'var(--text-primary)',
                          }}
                        >
                          <span style={{ width: 12, height: 12, borderRadius: '50%', background: rc.color, flexShrink: 0 }} />
                          {rc.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )
          )}
        </div>
      )}

      </div>{/* end RIGHT */}
    </div>
  )
}
