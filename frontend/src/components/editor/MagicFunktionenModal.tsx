import { useState, useEffect } from 'react'
import { Wand2, X, Sparkles } from 'lucide-react'
import { api } from '../../api/client'

interface Props {
  open: boolean
  onClose: () => void
  sceneFormat: string | undefined | null
  folgeId: number | null
  onInsert: (doc: any, statusMsg: string) => void
  onStatusMsg: (msg: string) => void
}

function Star({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      width: size, height: size, borderRadius: '50%',
      background: '#fff', opacity: 0, pointerEvents: 'none',
      animation: `magic-star 2.4s ${delay}s ease-in-out infinite`,
    }} />
  )
}

const STARS = [
  { x: 12, y: 18, delay: 0,   size: 3 }, { x: 82, y: 12, delay: 0.6, size: 2 },
  { x: 55, y: 8,  delay: 1.1, size: 4 }, { x: 92, y: 35, delay: 0.3, size: 2 },
  { x: 7,  y: 55, delay: 1.7, size: 3 }, { x: 70, y: 72, delay: 0.9, size: 2 },
  { x: 30, y: 80, delay: 1.4, size: 3 }, { x: 88, y: 78, delay: 0.2, size: 2 },
  { x: 45, y: 90, delay: 2.0, size: 2 }, { x: 20, y: 42, delay: 1.2, size: 2 },
]

export default function MagicFunktionenModal({ open, onClose, sceneFormat, folgeId, onInsert, onStatusMsg }: Props) {
  const [synopsisLoading, setSynopsisLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) setTimeout(() => setVisible(true), 10)
    else { setVisible(false); setSynopsisLoading(false) }
  }, [open])

  // Escape zum Schließen
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const synopsisAvailable = sceneFormat === 'notiz' && folgeId != null

  async function handleSynopsis(e: React.MouseEvent) {
    e.stopPropagation()
    if (!folgeId || synopsisLoading) return
    setSynopsisLoading(true)
    try {
      const result = await api.post('/ki/synopsis', { folge_id: folgeId })
      if (result.disabled) {
        onStatusMsg('KI-Funktion "Episoden-Synopse" ist nicht aktiviert (Admin-Einstellungen).')
        onClose(); return
      }
      if (!result.synopsis) {
        onStatusMsg('Keine Synopse generiert. Sind Szenen und Zusammenfassungen vorhanden?')
        onClose(); return
      }
      const paragraphs = result.synopsis.split(/\n\n+/).map((para: string) => ({
        type: 'paragraph',
        content: para.trim() ? [{ type: 'text', text: para.trim() }] : undefined,
      })).filter((p: any) => p.content)
      const doc = { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] }
      onInsert(doc, `Synopse generiert (${result.szenen_count} Szenen · ${result.werkstufe_typ} V${result.version_nummer}).`)
      onClose()
    } catch (err: any) {
      onStatusMsg('Fehler: ' + (err?.message ?? String(err)))
      onClose()
    } finally {
      setSynopsisLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes magic-star {
          0%   { opacity: 0; transform: scale(0.5); }
          40%  { opacity: 0.85; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes magic-glow {
          0%, 100% { box-shadow: 0 0 18px 4px #AF52DE55, 0 0 40px 8px #AF52DE22; }
          50%       { box-shadow: 0 0 28px 8px #AF52DE88, 0 0 60px 16px #AF52DE44; }
        }
        @keyframes magic-wand-spin {
          0%   { transform: rotate(-10deg) scale(1); }
          25%  { transform: rotate(10deg) scale(1.12); }
          50%  { transform: rotate(-6deg) scale(1); }
          100% { transform: rotate(-10deg) scale(1); }
        }
        @keyframes magic-fade-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes magic-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .magic-synopsis-btn { transition: transform 0.12s, box-shadow 0.12s; }
        .magic-synopsis-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 4px 20px #AF52DE66; }
        .magic-synopsis-btn:not(:disabled):active { transform: translateY(0); }
      `}</style>

      {/* Backdrop — klick außerhalb schließt */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,0,20,0.72)',
          backdropFilter: 'blur(4px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s',
        }}
        onMouseDown={onClose}
      >
        {/* Modal — stoppt Propagation damit Klicks drin nicht schließen */}
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 440, maxWidth: 'calc(100vw - 32px)',
            background: 'linear-gradient(160deg, #1a0a2e 0%, #120820 50%, #0d0518 100%)',
            borderRadius: 16,
            border: '1.5px solid #AF52DE55',
            overflow: 'hidden',
            animation: visible ? 'magic-glow 3s ease-in-out infinite, magic-fade-in 0.28s ease-out forwards' : 'none',
          }}
        >
          {/* Sterne (hinter dem Inhalt) */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
            {STARS.map((s, i) => <Star key={i} {...s} />)}
          </div>

          {/* Inhalt */}
          <div style={{ position: 'relative', zIndex: 1, padding: '26px 24px 22px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, #AF52DE33, #7b2fa055)',
                border: '1.5px solid #AF52DE77',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'magic-wand-spin 3.5s ease-in-out infinite',
              }}>
                <Wand2 size={20} color="#D18AFF" />
              </div>
              <div>
                <div style={{
                  fontSize: 16, fontWeight: 800, letterSpacing: 0.3,
                  background: 'linear-gradient(90deg, #fff 20%, #D18AFF 60%, #fff 80%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'magic-shimmer 4s linear infinite',
                }}>
                  Magic-Funktionen
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                  KI-gestützte Helfer für diese Werkstufe
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
                  display: 'flex', padding: 4, borderRadius: 6,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Trennlinie */}
            <div style={{
              height: 1, marginBottom: 16,
              background: 'linear-gradient(90deg, transparent, #AF52DE44, transparent)',
            }} />

            {/* Funktionen */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Episoden-Synopse — nur wenn notiz + folge */}
              {synopsisAvailable && (
                <div style={{
                  border: '1.5px solid #AF52DE55',
                  borderRadius: 12,
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, #AF52DE18, #7b2fa00c)',
                }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Sparkles size={15} color="#D18AFF" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                        Episoden-Synopse
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55, marginBottom: 14 }}>
                        Erstellt automatisch eine Synopse aus den Szenen-Zusammenfassungen und fügt sie in diese Notiz ein.
                      </div>
                      <button
                        className="magic-synopsis-btn"
                        onClick={handleSynopsis}
                        disabled={synopsisLoading}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7,
                          padding: '7px 16px', borderRadius: 8,
                          background: synopsisLoading
                            ? 'rgba(175,82,222,0.2)'
                            : 'linear-gradient(135deg, #AF52DE, #7b2fa0)',
                          color: '#fff',
                          border: `1px solid ${synopsisLoading ? '#AF52DE44' : '#AF52DE'}`,
                          cursor: synopsisLoading ? 'not-allowed' : 'pointer',
                          fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
                          opacity: synopsisLoading ? 0.6 : 1,
                        }}
                      >
                        <Wand2 size={12} />
                        {synopsisLoading ? 'Generiere…' : 'Synopse generieren'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Platzhalter */}
              <div style={{
                border: '1.5px dashed rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: '11px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Sparkles size={13} color="rgba(255,255,255,0.25)" />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                  Weitere Magic-Funktionen folgen…
                </span>
              </div>

            </div>

            {/* Keyboard Hint */}
            <div style={{ marginTop: 14, textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
              Esc zum Schließen · Ctrl+M zum Öffnen
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
