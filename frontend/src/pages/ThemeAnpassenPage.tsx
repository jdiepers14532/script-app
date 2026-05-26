import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AppShell from '../components/AppShell'
import { DesignTokenEditor } from '../components/DesignTokenEditor'
import AppPreviewWindow from '../components/AppPreviewWindow'
import FarbschemaModal from '../components/FarbschemaModal'
import Tooltip from '../components/Tooltip'
import { useTweaks, useSelectedProduction } from '../contexts'
import { LIGHT_PALETTES, DARK_PALETTES, CUSTOM_IDX } from '../components/appShellConstants'
import { productionLabel } from '../hooks/useProduction'

/*
 * ThemeAnpassenPage — Split-Layout
 *
 * Links:  Token-Editor (scrollbar, flex: 1)
 * Rechts: AppPreviewWindow (STARR — 420px, flex-shrink: 0)
 *
 * ⚠️  Die rechte Spalte ist intentional Desktop-only und NICHT mobiloptimiert.
 * Der Wrapper hat overflow: hidden — bei kleinen Viewports wird sie abgeschnitten.
 * NICHT in Mobile-Optimierungsdurchläufen anfassen.
 *
 * ⚠️  useTweaks() darf NUR in ThemeAnpassenContent aufgerufen werden (Kind von AppShell),
 * nicht im ThemeAnpassenPage-Wrapper selbst.
 */

// ── Inner component — läuft innerhalb des AppShell TweaksContext ──────────────
function ThemeAnpassenContent() {
  const navigate = useNavigate()
  const { tweaks, set } = useTweaks()
  const { selectedProduction } = useSelectedProduction()
  const [farbschemaOpen, setFarbschemaOpen] = useState(false)
  const [companyName, setCompanyName] = useState<string>('script')
  const lightColorRef = useRef<HTMLInputElement>(null)
  const darkColorRef  = useRef<HTMLInputElement>(null)

  // Firmennamen von auth.app laden
  useEffect(() => {
    fetch('https://auth.serienwerft.studio/api/public/company-info')
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.company_name) setCompanyName(data.company_name)
      })
      .catch(() => {})
  }, [])

  const isDark      = tweaks.theme === 'dark'
  const palettes    = isDark ? DARK_PALETTES : LIGHT_PALETTES
  const activeIdx   = isDark ? tweaks.darkBgIndex : tweaks.lightBgIndex
  const customColor = isDark ? tweaks.darkCustomBg : tweaks.lightCustomBg

  const prodLabel = selectedProduction
    ? productionLabel(selectedProduction)
    : 'Produktion'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Sub-Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/')}
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

      {/* Darstellung-Bar (Hell/Dunkel + Palette + Farbschema) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '7px 20px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-subtle)', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Darstellung
        </span>
        {/* Hell / Dunkel */}
        <div className="seg">
          <button
            className={tweaks.theme === 'light' ? 'on' : ''}
            onClick={() => set('theme', 'light')}
          >Hell</button>
          <button
            className={tweaks.theme === 'dark' ? 'on' : ''}
            onClick={() => set('theme', 'dark')}
          >Dunkel</button>
        </div>
        {/* Hintergrundfarbe */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {palettes.map((p, i) => (
            <Tooltip key={i} text={p.name}>
              <button
                style={{
                  width: 18, height: 18, borderRadius: 4, padding: 0,
                  border: activeIdx === i ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                  background: p.preview, cursor: 'pointer',
                }}
                onClick={() => isDark ? set('darkBgIndex', i) : set('lightBgIndex', i)}
              />
            </Tooltip>
          ))}
          <div style={{ position: 'relative' }}>
            <Tooltip text="Eigene Farbe">
              <button
                style={{
                  width: 18, height: 18, borderRadius: 4, padding: 0,
                  border: activeIdx === CUSTOM_IDX ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                  background: activeIdx === CUSTOM_IDX ? customColor : 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  if (isDark) { set('darkBgIndex', CUSTOM_IDX); darkColorRef.current?.click() }
                  else        { set('lightBgIndex', CUSTOM_IDX); lightColorRef.current?.click() }
                }}
              />
            </Tooltip>
            <input ref={isDark ? darkColorRef : lightColorRef} type="color"
              value={customColor}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
              onChange={e => isDark ? set('darkCustomBg', e.target.value) : set('lightCustomBg', e.target.value)}
            />
          </div>
        </div>
        {/* Farbschema-Button */}
        <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
        <button
          onClick={() => setFarbschemaOpen(true)}
          style={{
            fontSize: 11, padding: '3px 9px', borderRadius: 5,
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Farbschema
        </button>
      </div>

      {/* Split-Body
          overflow: hidden am Container → AppPreviewWindow wird bei kleinen Fenstern abgeschnitten (gewollt)
          NICHT für mobile anpassen — siehe Kommentar oben */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Linke Spalte: Token-Editor (scrollbar) */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 380 }}>
          <DesignTokenEditor
            activeColorSchemeId={tweaks.activeColorSchemeId}
            onSetColorSchemeId={id => set('activeColorSchemeId', id)}
          />
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
            Live-Vorschau — {isDark ? 'Dunkel' : 'Hell'}
          </div>
          {/* AppPreviewWindow: STARR — nicht mobiloptimieren */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <AppPreviewWindow
              companyName={companyName}
              productionLabel={prodLabel}
            />
          </div>
        </div>

      </div>

      {/* Farbschema-Modal */}
      {farbschemaOpen && <FarbschemaModal onClose={() => setFarbschemaOpen(false)} />}
    </div>
  )
}

// ── Outer wrapper — stellt nur AppShell bereit ────────────────────────────────
export default function ThemeAnpassenPage() {
  return (
    <AppShell>
      <ThemeAnpassenContent />
    </AppShell>
  )
}
