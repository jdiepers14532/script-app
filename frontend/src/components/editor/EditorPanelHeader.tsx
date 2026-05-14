import { useState, useEffect } from 'react'
import { ChevronDown, Plus, Lock, Users, Globe, Tag } from 'lucide-react'
import type { WerkstufeMeta } from '../../hooks/useDokument'
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
}

export default function EditorPanelHeader({
  selectedWerk, werkstufen, produktionId, folgeNummer, folgeId,
  sceneFormat, onSelectWerkstufe, onCreateWerkstufe, onReloadWerkstufen,
  onChangeSceneFormat,
}: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [showLabelMenu, setShowLabelMenu] = useState(false)
  const [showSichtbarkeitMenu, setShowSichtbarkeitMenu] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [stageLabels, setStageLabels] = useState<{ id: number; name: string; is_produktionsfassung: boolean }[]>([])
  const [colabGruppen, setColabGruppen] = useState<Array<{ id: string; name: string }>>([])
  const [sichtbarkeitSaving, setSichtbarkeitSaving] = useState(false)

  useEffect(() => {
    if (!produktionId) return
    api.getStageLabels(produktionId).then(setStageLabels).catch(() => {})
  }, [produktionId])

  // Reload groups fresh every time the menu opens (clears cache so new groups appear)
  useEffect(() => {
    if (!showSichtbarkeitMenu || !produktionId) return
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

  return (
    <div className="editor-panel-header" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, flexWrap: 'wrap' }}>

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

      {/* Version badge */}
      {selectedWerk && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {versionLabel}
        </span>
      )}

      {/* Sichtbarkeits-Badge (klickbar) */}
      {selectedWerk && !selectedWerk.abgegeben && (
        <div style={{ position: 'relative' }}>
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
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowSichtbarkeitMenu(false)} />
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 200, padding: '4px 0',
              }}>
                {[
                  { value: 'privat', label: 'Nur ich (Privat)', icon: <Lock size={11} />, color: '#FF9500' },
                  { value: 'autoren', label: 'Alle Autoren', icon: <Users size={11} />, color: '#007AFF' },
                  { value: 'produktion', label: 'Gesamte Produktion', icon: <Globe size={11} />, color: '#00C853' },
                ].map(opt => (
                  <button
                    key={opt.value}
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
                      padding: '7px 12px', fontSize: 12, background: sichtbarkeit === opt.value ? 'var(--bg-active)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', color: opt.color, fontWeight: sichtbarkeit === opt.value ? 600 : 400,
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
                {colabGruppen.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    {colabGruppen.map(g => (
                      <div key={g.id}>
                        <div style={{ padding: '4px 12px 1px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {g.name}
                        </div>
                        {/* Team: nur sichtbar, kein Yjs */}
                        <button
                          onClick={async () => {
                            setShowSichtbarkeitMenu(false)
                            setSichtbarkeitSaving(true)
                            try {
                              await api.put(`/werkstufen/${selectedWerk.id}/sichtbarkeit`, { sichtbarkeit: `team:${g.id}` })
                              clearCacheByPrefix('/v2/folgen/')
                              onReloadWerkstufen()
                            } catch { /* ignore */ } finally { setSichtbarkeitSaving(false) }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '5px 12px 5px 20px', fontSize: 12,
                            background: sichtbarkeit === `team:${g.id}` ? 'var(--bg-active)' : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                            fontFamily: 'inherit', color: '#007AFF', fontWeight: sichtbarkeit === `team:${g.id}` ? 600 : 400,
                          }}
                        >
                          <Users size={11} />
                          Team (nur sichtbar)
                        </button>
                        {/* Colab: sichtbar + Yjs Echtzeit */}
                        <button
                          onClick={async () => {
                            setShowSichtbarkeitMenu(false)
                            setSichtbarkeitSaving(true)
                            try {
                              await api.put(`/werkstufen/${selectedWerk.id}/sichtbarkeit`, { sichtbarkeit: `colab:${g.id}` })
                              clearCacheByPrefix('/v2/folgen/')
                              onReloadWerkstufen()
                            } catch { /* ignore */ } finally { setSichtbarkeitSaving(false) }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '5px 12px 5px 20px', fontSize: 12,
                            background: sichtbarkeit === `colab:${g.id}` ? 'var(--bg-active)' : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                            fontFamily: 'inherit', color: '#AF52DE', fontWeight: sichtbarkeit === `colab:${g.id}` ? 600 : 400,
                          }}
                        >
                          <Globe size={11} />
                          Colab (Echtzeit)
                        </button>
                      </div>
                    ))}
                  </>
                )}
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

      {/* Fassungs-Label */}
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

      <div style={{ flex: 1 }} />
    </div>
  )
}
