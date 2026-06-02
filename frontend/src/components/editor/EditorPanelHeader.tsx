import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, Plus, Lock, Users, Globe, Tag, GitBranch, User, Snowflake, GitCompare } from 'lucide-react'
import type { WerkstufeMeta, SaveStatus } from '../../hooks/useDokument'
import Tooltip from '../Tooltip'
import { api, clearCacheByPrefix } from '../../api/client'
import { useTerminologie } from '../../sw-ui'
import ChecklistenModal from '../ChecklistenModal'

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


interface Props {
  selectedWerk: WerkstufeMeta | null
  werkstufen: WerkstufeMeta[]
  produktionId: string
  folgeNummer: number | null
  folgeId: number | null
  sceneFormat?: string | null
  onSelectWerkstufe: (id: string) => void
  onCreateWerkstufe: (typ: string) => void
  onNeueFassungClick?: (requestedTyp: 'drehbuch' | 'storyline' | 'notiz') => void
  onReloadWerkstufen: () => void
  onDiffRequest?: (compareWerkId: string | null) => void
  onChangeSceneFormat?: (format: string) => void
  saveStatus?: SaveStatus
  updatedBy?: string | null
  updatedAt?: string | null
  collabSlot?: React.ReactNode
  verlaufSlot?: React.ReactNode
  rightSlot?: React.ReactNode
}

export default function EditorPanelHeader({
  selectedWerk, werkstufen, produktionId, folgeNummer, folgeId,
  sceneFormat, onSelectWerkstufe, onCreateWerkstufe, onNeueFassungClick, onReloadWerkstufen,
  onDiffRequest, onChangeSceneFormat, saveStatus, updatedBy, updatedAt, collabSlot, verlaufSlot, rightSlot,
}: Props) {
  const { t } = useTerminologie()
  const typLabels: Record<string, string> = {
    drehbuch: t('drehbuch'),
    storyline: 'Storyline',
    notiz: 'Dokument',
    abstrakt: 'Abstrakt',
  }
  const formatOptions = [
    { value: 'drehbuch', label: t('drehbuch') },
    { value: 'storyline', label: 'Storyline' },
    { value: 'notiz', label: 'Dokument' },
  ]
  const [showMenu, setShowMenu] = useState(false)
  const [showLabelMenu, setShowLabelMenu] = useState(false)
  const [showSichtbarkeitMenu, setShowSichtbarkeitMenu] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState<'team' | 'colab' | null>(null)
  const [submenuOpenLeft, setSubmenuOpenLeft] = useState(false)
  const sichtbarkeitContainerRef = useRef<HTMLDivElement>(null)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [stageLabels, setStageLabels] = useState<{ id: number; name: string; is_produktionsfassung: boolean }[]>([])
  const [checkGateModal, setCheckGateModal] = useState<{ label: string } | null>(null)
  const [colabGruppen, setColabGruppen] = useState<Array<{ id: string; name: string }>>([])
  const [sichtbarkeitSaving, setSichtbarkeitSaving] = useState(false)
  const [revisionColors, setRevisionColors] = useState<{ id: number; name: string; color: string }[]>([])
  const [showRevisionMenu, setShowRevisionMenu] = useState(false)
  const [revisionSaving, setRevisionSaving] = useState(false)
  const [showDiffMenu, setShowDiffMenu] = useState(false)
  const [userRoles, setUserRoles] = useState<string[]>([])
  const [seitenLockSaving, setSeitenLockSaving] = useState(false)

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
    api.getMe().then(me => setUserRoles(me.roles || (me.role ? [me.role] : []))).catch(() => {})
  }, [])

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

  const typLabel = selectedWerk ? (typLabels[selectedWerk.typ] ?? selectedWerk.typ) : 'Typ wählen'
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

  return (<>
    <div className="editor-panel-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>

      {/* LEFT: Werkfassung, Fassungslabel, Version */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

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
                    {typLabels[typ] ?? typ}
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
              {(['drehbuch', 'storyline'] as const).map(typ => (
                <button
                  key={typ}
                  onClick={() => {
                    setShowMenu(false)
                    if (onNeueFassungClick) {
                      onNeueFassungClick(typ)
                    } else {
                      onCreateWerkstufe(typ)
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sw-info)', fontFamily: 'inherit' }}
                >
                  <Plus size={11} /> Neue {typLabels[typ]}-Version
                </button>
              ))}
              <button
                onClick={() => { onCreateWerkstufe('notiz'); setShowMenu(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sw-info)', fontFamily: 'inherit' }}
              >
                <Plus size={11} /> Neues Dokument ohne Formatierung
              </button>
            </div>
          </>
        )}
      </div>

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

      {/* Seitenzahlen-Lock-Badge */}
      {selectedWerk?.seitenzahlen_gesperrt && (() => {
        const isSuperAdmin = userRoles.includes('superadmin')
        const gesperrtseit = selectedWerk.gesperrt_am
          ? new Date(selectedWerk.gesperrt_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
          : '—'
        const tooltipLines = [
          'Seitenzahlen gesperrt',
          `Seit: ${gesperrtseit}`,
          selectedWerk.gesperrt_von ? `Von: ${selectedWerk.gesperrt_von}` : null,
          isSuperAdmin ? '\n(Klicken zum Entsperren)' : null,
        ].filter(Boolean).join('\n')
        return (
          <Tooltip text={tooltipLines}>
            <button
              onClick={isSuperAdmin ? async () => {
                if (!confirm('Seitenzahlen entsperren?\n\nBeim nächsten Speichern werden alle Seitenzahlen neu berechnet — sie können sich verschieben.')) return
                setSeitenLockSaving(true)
                try {
                  await api.unlockSeitenzahlen(selectedWerk.id)
                  onReloadWerkstufen()
                } catch { /* ignore */ } finally { setSeitenLockSaving(false) }
              } : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px',
                border: '1px solid #FF9500', borderRadius: 999, fontSize: 11, fontWeight: 500,
                color: '#FF9500', background: 'transparent',
                cursor: isSuperAdmin ? 'pointer' : 'default', fontFamily: 'inherit',
              }}
            >
              <Lock size={10} />
              {seitenLockSaving ? '…' : 'S. gesperrt'}
            </button>
          </Tooltip>
        )
      })()}

      {/* Fassungs-Label — nach Version */}
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
                      setShowLabelMenu(false)
                      setLabelError(null)
                      // Produktionsfassung-Labels → Check-Gate Modal anzeigen (nur beim Setzen, nicht Entfernen)
                      if (sl.is_produktionsfassung && newLabel) {
                        setCheckGateModal({ label: newLabel })
                        return
                      }
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

      </div>{/* end LEFT */}

      {/* RIGHT: Save+User direkt neben Sichtbarkeit, Dokument-Typ, Revision */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>

      {rightSlot}

      {/* Save status */}
      {saveStatus && saveStatus !== 'idle' && (
        <span style={{ fontSize: 11, color: saveColor, fontWeight: saveStatus === 'saved' || saveStatus === 'queued' ? 500 : 400, whiteSpace: 'nowrap' }}>
          {saveLabel}
        </span>
      )}

      {/* User-Tooltip */}
      {updatedBy && (
        <Tooltip text={`Zuletzt: ${updatedBy}${formattedDate ? '\n' + formattedDate : ''}`}>
          <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'default' }}>
            <User size={12} />
          </span>
        </Tooltip>
      )}

      {collabSlot}

      {verlaufSlot}

      {/* Sichtbarkeits-Badge (klickbar) */}
      {selectedWerk && !selectedWerk.abgegeben && (
        <div ref={sichtbarkeitContainerRef} style={{ position: 'relative' }}>
          <Tooltip text={
            sichtbarkeit === 'privat'
              ? (folgeNummer
                  ? `Sichtbarkeit ändern: nur ich\n\nVergiss nicht die Sichtbarkeit wieder zu ändern, sonst kann keiner das Dokument sehen, wenn du fertig bist.`
                  : `Sichtbarkeit ändern: nur ich`)
              : `Sichtbarkeit ändern: ${getSichtbarkeitLabel(sichtbarkeit)}`
          }>
          <button
            onClick={() => { setShowSichtbarkeitMenu(v => !v); setShowMenu(false); setShowLabelMenu(false) }}
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
          </Tooltip>

          {showSichtbarkeitMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setShowSichtbarkeitMenu(false); setActiveSubmenu(null) }} />
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 200, padding: '4px 0',
              }}>
                {[
                  { value: 'privat',     label: 'Privat',             icon: <Lock size={11} />,  color: '#FF9500' },
                  { value: 'autoren',    label: 'Alle Autoren',       icon: <Users size={11} />, color: '#007AFF' },
                  { value: 'produktion', label: 'Gesamte Produktion', icon: <Globe size={11} />, color: '#00C853' },
                ].map((opt, i) => (
                  <button
                    key={`${opt.value}-${i}`}
                    onClick={async () => {
                      setShowSichtbarkeitMenu(false)
                      setSichtbarkeitSaving(true)
                      try {
                        await api.put(`/werkstufen/${selectedWerk.id}/sichtbarkeit`, { sichtbarkeit: opt.value })
                        clearCacheByPrefix('/v2/folgen/')
                        onReloadWerkstufen()
                      } catch { /* ignore */ } finally { setSichtbarkeitSaving(false) }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 12px', fontSize: 12,
                      background: sichtbarkeit === opt.value ? 'var(--bg-active)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', color: opt.color,
                      fontWeight: sichtbarkeit === opt.value ? 600 : 400,
                    }}
                  >
                    {opt.icon}
                    {opt.label}
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
            {formatOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Tooltip>
      )}

      {/* Revision UI */}
      {selectedWerk && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>

          {/* Frozen badge */}
          {selectedWerk.eingefroren && (
            <Tooltip text={selectedWerk.ist_revisionsstufe
              ? `Revisionsstufe ${selectedWerk.revisionsstufen_nr} — eingefroren, kein Content-Edit möglich`
              : 'Eingefroren — kein Content-Edit möglich'}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                border: '1px solid #007AFF', color: '#007AFF',
              }}>
                <Snowflake size={11} />
                {selectedWerk.ist_revisionsstufe
                  ? `Rev. ${selectedWerk.revisionsstufen_nr}`
                  : 'Eingefroren'}
              </span>
            </Tooltip>
          )}

          {/* Active revision badge + einfrieren button */}
          {!selectedWerk.eingefroren && selectedWerk.revision_color_id ? (
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
              <Tooltip text="Revision abschließen: Werkstufe wird eingefroren und als Revisionsstufe gespeichert. Markierungen bleiben erhalten.">
                <button
                  onClick={async () => {
                    if (!confirm('Revision abschließen und Werkstufe einfrieren?\nDie Fassung kann danach nicht mehr bearbeitet werden. Revisionsmarkierungen bleiben als historischer Nachweis erhalten.')) return
                    setRevisionSaving(true)
                    try {
                      const frozen = await api.einfrierenWerkstufe(selectedWerk.id)
                      await onReloadWerkstufen()
                      // UX: User nach dem Freeze direkt zur nächsten editierbaren Fassung führen
                      if (confirm(`Revisionsstufe ${frozen.revisionsstufen_nr} gespeichert.\n\nMöchtest du jetzt eine neue Fassung für weitere Änderungen anlegen?`)) {
                        onNeueFassungClick?.(selectedWerk.typ as 'drehbuch' | 'storyline' | 'notiz')
                      }
                    } catch { /* ignore */ } finally { setRevisionSaving(false) }
                  }}
                  disabled={revisionSaving}
                  style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: 11,
                    border: '1px solid #007AFF', background: 'transparent',
                    color: '#007AFF', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                  }}
                >
                  <Snowflake size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                  Revision beenden
                </button>
              </Tooltip>
            </>
          ) : !selectedWerk.eingefroren && revisionColors.length > 0 ? (
            // No active revision: show "Revision starten" button
            <div style={{ position: 'relative' }}>
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
            </div>
          ) : null}

          {/* Diff button — nur wenn es Revisionsstufen gibt */}
          {onDiffRequest && (() => {
            const revStufen = werkstufen.filter(w => w.ist_revisionsstufe && w.id !== selectedWerk.id)
            if (revStufen.length === 0) return null
            return (
              <div style={{ position: 'relative' }}>
                <Tooltip text="Aktuelle Fassung mit einer Revisionsstufe vergleichen">
                  <button
                    onClick={() => setShowDiffMenu(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                      border: '1px solid var(--border)', borderRadius: 6, fontSize: 11,
                      color: 'var(--text-muted)', background: 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                    }}
                  >
                    <GitCompare size={11} />
                    Vergleichen
                    <ChevronDown size={10} />
                  </button>
                </Tooltip>
                {showDiffMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowDiffMenu(false)} />
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 99, marginTop: 4,
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 200, padding: '4px 0',
                    }}>
                      <div style={{ padding: '5px 12px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Vergleichen mit …
                      </div>
                      <button
                        onClick={() => { setShowDiffMenu(false); onDiffRequest(null) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '7px 12px', fontSize: 12, border: 'none',
                          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                          background: 'transparent', color: 'var(--text-muted)',
                        }}
                      >
                        Vergleich beenden
                      </button>
                      {revStufen.map(rs => (
                        <button
                          key={rs.id}
                          onClick={() => { setShowDiffMenu(false); onDiffRequest(rs.id) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '7px 12px', fontSize: 12, border: 'none',
                            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                            background: 'transparent', color: 'var(--text-primary)',
                          }}
                        >
                          <Snowflake size={11} style={{ color: '#007AFF', flexShrink: 0 }} />
                          {rs.ist_revisionsstufe ? `Revisionsstufe ${rs.revisionsstufen_nr}` : rs.label ?? rs.typ}
                          {rs.label ? ` (${rs.label})` : ''}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })()}

        </div>
      )}

      </div>{/* end RIGHT */}
    </div>

    {/* ChecklistenModal — Check-Gate vor Produktionsfassung-Label */}
    {checkGateModal && selectedWerk && (
      <ChecklistenModal
        werkstufId={selectedWerk.id}
        targetLabel={checkGateModal.label}
        onCancel={() => setCheckGateModal(null)}
        onConfirm={async (override) => {
          await api.updateWerkstufe(selectedWerk.id, {
            label: checkGateModal.label,
            ...(override ? { allow_check_warnings: true } : {}),
          })
          clearCacheByPrefix('/v2/folgen/')
          onReloadWerkstufen()
          setCheckGateModal(null)
        }}
      />
    )}
  </>)
}
