// ── Tastenkürzel-Übersicht (Overlay) — generisch, app-übergreifend ───────────
// Rendert eine gruppierte Kürzel-Liste, die die App liefert. Optional zusätzlich eine
// druckbare Grafik (graphicSrc) als zweites Register „Grafik". Schließt mit Esc oder
// Klick auf den Backdrop. Theme über CSS-Variablen.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ShortcutRow { keys: string; desc: string }
export interface ShortcutGroup { title: string; color: string; icon: string; rows: ShortcutRow[] }

export type CheatSheetView = 'liste' | 'grafik'

export function ShortcutCheatSheet({
  groups,
  onClose,
  title = 'Tastenkürzel',
  subtitle,
  graphicSrc,
  view,
  onViewChange,
}: {
  groups: ShortcutGroup[]
  onClose: () => void
  title?: string
  subtitle?: string
  /** Optional: URL einer druckbaren Grafik → aktiviert das Register „Grafik" */
  graphicSrc?: string
  /** Aktuelle Ansicht (kontrolliert). Ohne diese prop verwaltet die Komponente den Tab selbst. */
  view?: CheatSheetView
  /** Wird bei Tab-Wechsel aufgerufen (z. B. zum Persistieren der zuletzt gewählten Ansicht) */
  onViewChange?: (v: CheatSheetView) => void
}) {
  const [internalView, setInternalView] = useState<CheatSheetView>(view ?? 'liste')
  const activeView: CheatSheetView = graphicSrc ? (view ?? internalView) : 'liste'
  const setView = (v: CheatSheetView) => {
    setInternalView(v)
    onViewChange?.(v)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const tabBtn = (v: CheatSheetView, label: string) => (
    <button
      onClick={() => setView(v)}
      style={{
        padding: '5px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
        border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
        background: activeView === v ? 'var(--text-primary)' : 'transparent',
        color: activeView === v ? 'var(--bg-page)' : 'var(--text-secondary)',
      }}
    >{label}</button>
  )

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(960px, 94vw)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--bg-page)', borderRadius: 14, boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
        zIndex: 3001, padding: '22px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {graphicSrc && (
              <div style={{ display: 'flex', gap: 6 }}>
                {tabBtn('liste', 'Liste')}
                {tabBtn('grafik', 'Grafik')}
              </div>
            )}
            <button onClick={onClose} aria-label="Schließen" style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
              fontSize: 20, lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>
        </div>

        {activeView === 'grafik' && graphicSrc ? (
          <div style={{ textAlign: 'center' }}>
            <img
              src={graphicSrc}
              alt="Tastatur-Kurzbefehle"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <div style={{ marginTop: 10 }}>
              <a
                href={graphicSrc}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: 'var(--sw-info, #007AFF)', textDecoration: 'none' }}
              >In neuem Tab öffnen / drucken ↗</a>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {groups.map(g => (
              <div key={g.title} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderLeft: `4px solid ${g.color}`, fontWeight: 700, fontSize: 13, color: g.color }}>
                  <span>{g.icon}</span><span>{g.title}</span>
                </div>
                <div style={{ padding: '2px 12px 10px' }}>
                  {g.rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{
                        flex: '0 0 150px', fontFamily: 'monospace', fontSize: 10.5, fontWeight: 600,
                        color: 'var(--text-primary)', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', lineHeight: 1.5,
                      }}>{r.keys}</span>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}

export default ShortcutCheatSheet
