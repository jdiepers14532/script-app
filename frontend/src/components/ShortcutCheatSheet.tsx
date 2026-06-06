// ── Tastenkürzel-Übersicht (Overlay, Taste „?") ─────────────────────────────
// Rendert dieselbe zentrale Referenz wie der Hilfe-Tab und die Befehlspalette
// (data/shortcutReference.ts). Schließt mit Esc oder Klick auf Backdrop.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useShortcut } from '../hooks/useShortcut'
import { buildShortcutGroups } from '../data/shortcutReference'

export default function ShortcutCheatSheet({ onClose }: { onClose: () => void }) {
  const { label, isMac } = useShortcut()
  const mod = isMac ? '⌘' : 'Strg'
  const alt = isMac ? '⌥' : 'Alt'
  const groups = buildShortcutGroups(label, mod, alt)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(960px, 94vw)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--bg-page)', borderRadius: 14, boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
        zIndex: 3001, padding: '22px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Tastenkürzel</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {mod}+K öffnet die Befehlspalette · ausführliches Handbuch unter /hilfe → Tastenkürzel
            </div>
          </div>
          <button onClick={onClose} aria-label="Schließen" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', padding: 6, borderRadius: 8,
          }}><X size={20} /></button>
        </div>

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
      </div>
    </>,
    document.body,
  )
}
