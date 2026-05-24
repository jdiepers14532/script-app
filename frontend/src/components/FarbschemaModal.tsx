import { useRef, useState } from 'react'
import { X, Check, Pencil, Trash2, Plus, ChevronLeft } from 'lucide-react'
import { useTweaks } from '../contexts'
import {
  BUILTIN_COLOR_SCHEMES, loadCustomSchemes, saveCustomSchemes,
  type ColorScheme,
} from './appShellConstants'
import Tooltip from './Tooltip'

function ColorSwatch({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: 3, background: color,
      border: '1px solid rgba(0,0,0,0.12)',
      flexShrink: 0,
    }} />
  )
}

const SWATCH_TOOLTIPS: Record<keyof ColorScheme['colors'], string> = {
  green:      'Aktion / Erfolg\nSpeichern-Buttons, aktive Zustände, Story-Strang-Farben, Erfolgs-Badges, Offline-Sync',
  info:       'Info / Link\nFokus-Ring (Tastatur-Navigation), Link-Farbe, Info-Badges, Benachrichtigungs-Highlights, Suchmarkierung',
  danger:     'Fehler / Löschen\nFehlermeldungen, Lösch-Buttons, kritische Warnungen, rote Status-Anzeigen',
  warning:    'Warnung\nHinweise, ausstehende Aktionen, unsichere Zustände, Pending-Badges',
  warningAlt: 'Orange (Akzent)\nSekundäre Warnungen, Werkleistungsverträge (C2), unsichere Match-Status, Timestamp-Hinweise',
}

function SchemeSwatches({ colors }: { colors: ColorScheme['colors'] }) {
  return (
    <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {(Object.keys(SWATCH_TOOLTIPS) as (keyof ColorScheme['colors'])[]).map(key => (
        <Tooltip key={key} text={SWATCH_TOOLTIPS[key]}>
          <ColorSwatch color={colors[key]} />
        </Tooltip>
      ))}
    </span>
  )
}

const EMPTY_COLORS: ColorScheme['colors'] = {
  green: '#00C853', info: '#007AFF', danger: '#FF3B30',
  warning: '#FFCC00', warningAlt: '#FF9500',
}

const COLOR_FIELDS: { key: keyof ColorScheme['colors']; label: string; hint: string }[] = [
  { key: 'green',      label: 'Aktion / Erfolg',    hint: 'Speichern-Buttons, aktive Zustände, Story-Strang-Farben, Erfolgs-Badges, Offline-Sync-Anzeige' },
  { key: 'info',       label: 'Info / Link',         hint: 'Fokus-Ring (Tastatur-Nav), Links, Info-Badges, Benachrichtigungs-Highlights, Suchmarkierungen — Fokus-Ring wird automatisch abgeleitet' },
  { key: 'danger',     label: 'Fehler / Löschen',   hint: 'Fehlermeldungen, Lösch-Buttons, kritische Warnungen, rote Status-Anzeigen' },
  { key: 'warning',    label: 'Warnung',             hint: 'Hinweise, ausstehende Aktionen, unsichere Zustände, Pending-Badges' },
  { key: 'warningAlt', label: 'Orange (Akzent)',     hint: 'Sekundäre Warnungen, Werkleistungsverträge (C2), unsichere Match-Status, Timestamp-Hinweise' },
]

export default function FarbschemaModal({ onClose }: { onClose: () => void }) {
  const { tweaks, set } = useTweaks()
  const [customSchemes, setCustomSchemes] = useState<ColorScheme[]>(loadCustomSchemes)
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [editScheme, setEditScheme] = useState<ColorScheme | null>(null)
  const [editName, setEditName] = useState('')
  const [editColors, setEditColors] = useState<ColorScheme['colors']>(EMPTY_COLORS)

  const [pos, setPos] = useState(() => ({
    left: Math.max(0, Math.round((window.innerWidth - 480) / 2)),
    top: Math.max(0, Math.round(window.innerHeight * 0.04)),
  }))
  const dragStart = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null)

  function handleHeaderMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button,input')) return
    e.preventDefault()
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, posX: pos.left, posY: pos.top }
    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return
      setPos({
        left: Math.max(0, dragStart.current.posX + ev.clientX - dragStart.current.mouseX),
        top: Math.max(0, dragStart.current.posY + ev.clientY - dragStart.current.mouseY),
      })
    }
    function onUp() {
      dragStart.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function openNew() {
    setEditScheme(null)
    setEditName('Mein Schema')
    setEditColors({ ...EMPTY_COLORS })
    setView('edit')
  }

  function openEdit(scheme: ColorScheme) {
    setEditScheme(scheme)
    setEditName(scheme.name)
    setEditColors({ ...scheme.colors })
    setView('edit')
  }

  function saveEdit() {
    const trimmed = editName.trim() || 'Ohne Name'
    const updated = [...customSchemes]
    if (editScheme) {
      const idx = updated.findIndex(s => s.id === editScheme.id)
      if (idx !== -1) updated[idx] = { ...editScheme, name: trimmed, colors: editColors }
    } else {
      const id = `custom-${Date.now()}`
      updated.push({ id, name: trimmed, colors: editColors })
      // Sofort aktivieren
      set('activeColorSchemeId', updated[updated.length - 1].id)
    }
    setCustomSchemes(updated)
    saveCustomSchemes(updated)
    setView('list')
  }

  function deleteScheme(id: string) {
    const updated = customSchemes.filter(s => s.id !== id)
    setCustomSchemes(updated)
    saveCustomSchemes(updated)
    if (tweaks.activeColorSchemeId === id) set('activeColorSchemeId', 'default')
  }

  function activate(id: string) {
    set('activeColorSchemeId', id)
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          zIndex: 10000, animation: 'fadeIn 0.15s',
        }}
      />
      <div style={{
        position: 'fixed', left: pos.left, top: pos.top,
        width: 480, minWidth: 340,
        maxHeight: 'calc(100vh - 60px)',
        background: 'var(--bg-page)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        zIndex: 10001, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div
          onMouseDown={handleHeaderMouseDown}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 20px', borderBottom: '1px solid var(--border)',
            flexShrink: 0, cursor: 'grab', userSelect: 'none',
          }}
        >
          {view === 'edit' && (
            <button
              onClick={() => setView('list')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', padding: 4,
                display: 'flex', alignItems: 'center',
              }}
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, flex: 1, color: 'var(--text-primary)' }}>
            {view === 'list' ? 'Farbschema' : editScheme ? 'Schema bearbeiten' : 'Neues Schema'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 16px' }}>
          {view === 'list' ? (
            <>
              {/* Eingebaut */}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Eingebaut
              </div>
              {BUILTIN_COLOR_SCHEMES.map(scheme => {
                const active = tweaks.activeColorSchemeId === scheme.id
                return (
                  <div key={scheme.id} style={{ ...rowStyle, background: active ? 'var(--bg-subtle)' : undefined, borderRadius: 6, padding: '8px 6px' }}>
                    <div style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
                      {active && <Check size={14} color="var(--sw-green)" />}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400, color: 'var(--text-primary)' }}>
                      {scheme.name}
                    </span>
                    <SchemeSwatches colors={scheme.colors} />
                    {!active && (
                      <button
                        onClick={() => activate(scheme.id)}
                        style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 5,
                          border: '1px solid var(--border)', background: 'var(--bg-surface)',
                          color: 'var(--text-primary)', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        Aktivieren
                      </button>
                    )}
                    {active && (
                      <span style={{ fontSize: 11, color: 'var(--sw-green)', fontWeight: 600, minWidth: 62, textAlign: 'right' }}>Aktiv</span>
                    )}
                  </div>
                )
              })}

              {/* Benutzerdefiniert */}
              {customSchemes.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 6px' }}>
                    Eigene Schemata
                  </div>
                  {customSchemes.map(scheme => {
                    const active = tweaks.activeColorSchemeId === scheme.id
                    return (
                      <div key={scheme.id} style={{ ...rowStyle, background: active ? 'var(--bg-subtle)' : undefined, borderRadius: 6, padding: '8px 6px' }}>
                        <div style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
                          {active && <Check size={14} color="var(--sw-green)" />}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400, color: 'var(--text-primary)' }}>
                          {scheme.name}
                        </span>
                        <SchemeSwatches colors={scheme.colors} />
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {!active && (
                            <button
                              onClick={() => activate(scheme.id)}
                              style={{
                                fontSize: 11, padding: '3px 10px', borderRadius: 5,
                                border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                color: 'var(--text-primary)', cursor: 'pointer',
                              }}
                            >
                              Aktivieren
                            </button>
                          )}
                          {active && (
                            <span style={{ fontSize: 11, color: 'var(--sw-green)', fontWeight: 600, minWidth: 62, textAlign: 'right', lineHeight: '26px' }}>Aktiv</span>
                          )}
                          <Tooltip text="Bearbeiten">
                            <button
                              onClick={() => openEdit(scheme)}
                              style={{
                                background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                                borderRadius: 5, padding: '3px 6px', cursor: 'pointer',
                                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                          </Tooltip>
                          <Tooltip text="Löschen">
                            <button
                              onClick={() => deleteScheme(scheme.id)}
                              style={{
                                background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                                borderRadius: 5, padding: '3px 6px', cursor: 'pointer',
                                color: 'var(--sw-danger)', display: 'flex', alignItems: 'center',
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {/* Neu-Button */}
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={openNew}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, padding: '7px 14px', borderRadius: 7,
                    border: '1px dashed var(--border)', background: 'none',
                    color: 'var(--text-secondary)', cursor: 'pointer', width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={13} /> Neues Schema erstellen
                </button>
              </div>

              {/* Settings-Hinweis */}
              <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                Auswahl wird automatisch in deinen persönlichen Einstellungen gespeichert
              </div>
            </>
          ) : (
            /* Edit-View */
            <>
              {/* Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{
                    width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'var(--input-bg)',
                    color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Vorschau */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 60 }}>Vorschau</span>
                {COLOR_FIELDS.map(f => (
                  <Tooltip key={f.key} text={f.label}>
                    <ColorSwatch color={editColors[f.key]} size={22} />
                  </Tooltip>
                ))}
              </div>

              {/* Farbfelder */}
              {COLOR_FIELDS.map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <ColorSwatch color={editColors[f.key]} size={20} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.hint}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {editColors[f.key].toUpperCase()}
                    </code>
                    <input
                      type="color"
                      value={editColors[f.key]}
                      onChange={e => setEditColors(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={{
                        width: 32, height: 28, borderRadius: 5, border: '1px solid var(--border)',
                        padding: 2, cursor: 'pointer', background: 'var(--bg-subtle)',
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Aktionen */}
              <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setView('list')}
                  style={{
                    fontSize: 12, padding: '7px 16px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={saveEdit}
                  style={{
                    fontSize: 12, padding: '7px 16px', borderRadius: 7,
                    border: 'none', background: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-color)', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  Speichern & Aktivieren
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
