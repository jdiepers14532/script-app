import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AppShell from '../components/AppShell'
import { DesignTokenEditor } from '../components/DesignTokenEditor'
import AppPreviewWindow from '../components/AppPreviewWindow'

/*
 * ThemeAnpassenPage — Split-Layout
 *
 * Links:  Token-Editor (scrollbar, flex: 1)
 * Rechts: AppPreviewWindow (STARR — 420px, flex-shrink: 0)
 *
 * ⚠️  Die rechte Spalte ist intentional Desktop-only und NICHT mobiloptimiert.
 * Der Wrapper hat overflow: hidden — bei kleinen Viewports wird sie abgeschnitten.
 * NICHT in Mobile-Optimierungsdurchläufen anfassen.
 */
export default function ThemeAnpassenPage() {
  const navigate = useNavigate()

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Sub-Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)', flexShrink: 0,
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 13, padding: '4px 8px',
              borderRadius: 6, fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={14} />
            Zurück
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ansicht</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>›</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Theme anpassen</span>
        </div>

        {/* Split-Body
            overflow: hidden am Container → AppPreviewWindow wird bei kleinen Fenstern abgeschnitten (gewollt)
            NICHT für mobile anpassen — siehe Kommentar oben */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Linke Spalte: Token-Editor (scrollbar) */}
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 380 }}>
            <DesignTokenEditor />
          </div>

          {/* Rechte Spalte: App-Vorschau
              STARR — NICHT ÄNDERN. width/min-width/flex-shrink sind intentional fest.
              Diese Spalte wird bei kleinen Fenstern abgeschnitten, nicht umgebrochen. */}
          <div style={{
            width: 460,         /* STARR */
            minWidth: 460,      /* STARR */
            flexShrink: 0,      /* STARR */
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            padding: 20,
            overflow: 'hidden', /* STARR — kein Scroll, kein Umbruch */
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 12 }}>
              Live-Vorschau
            </div>
            {/* AppPreviewWindow: STARR — nicht mobiloptimieren */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <AppPreviewWindow />
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  )
}
