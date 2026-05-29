import { useRef, useState, useEffect } from 'react'
import {
  Columns2, PanelLeft, PanelRight, BookOpen, AlignLeft, X,
  Minimize2, Maximize2, Square, ChevronDown,
} from 'lucide-react'
import {
  LIGHT_PALETTES, DARK_PALETTES, INTERFACE_FONTS, SCRIPT_FONTS,
  FONT_SIZES, INTERFACE_FONT_SIZES, CUSTOM_IDX,
} from './appShellConstants'
import { useTweaks, useAppSettings } from '../contexts'
import { useTerminologie } from '../sw-ui'
import Tooltip from './Tooltip'

const LS_COLLAPSED_KEY = 'ansichtsmodal-collapsed-v1'

function loadCollapsed(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(LS_COLLAPSED_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { sprache: true, schrift: true }
}

export default function AnsichtsModal({ onClose, onFarbschemaClick, onThemeAnpassenClick }: { onClose: () => void; onFarbschemaClick?: () => void; onThemeAnpassenClick?: () => void }) {
  const { tweaks, set, reset } = useTweaks()
  const { treatmentLabel, figurenLabel } = useAppSettings()
  const { t } = useTerminologie()
  const lightColorRef = useRef<HTMLInputElement>(null)
  const darkColorRef = useRef<HTMLInputElement>(null)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)

  function toggleSection(key: string) {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(LS_COLLAPSED_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const [pos, setPos] = useState(() => ({
    left: Math.max(0, Math.round((window.innerWidth - 520) / 2)),
    top: Math.max(0, Math.round(window.innerHeight * 0.075)),
  }))
  const dragStart = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null)

  function handleHeaderMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return
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

  const isDark = tweaks.theme === 'dark'
  const palettes = isDark ? DARK_PALETTES : LIGHT_PALETTES
  const activeIdx = isDark ? tweaks.darkBgIndex : tweaks.lightBgIndex
  const customColor = isDark ? tweaks.darkCustomBg : tweaks.lightCustomBg

  // Summary-Text für eingeklappte Sektionen
  const spellcheckLabel: Record<string, string> = { off: 'Aus', browser: 'Browser', languagetool: 'LanguageTool' }
  function shortFont(fonts: { name: string; value: string }[], value: string): string {
    const f = fonts.find(f => f.value === value)
    return f ? f.name.replace(' (Standard)', '') : value.split(',')[0].replace(/['"]/g, '').trim()
  }
  const spracheSummary = [
    spellcheckLabel[tweaks.spellcheck] ?? tweaks.spellcheck,
    tweaks.spellcheckLang,
    tweaks.keyboardLayout.toUpperCase(),
  ].join(' · ')
  const schriftSummary = [
    shortFont(INTERFACE_FONTS, tweaks.interfaceFont),
    `${tweaks.interfaceFontSize}px`,
    shortFont(SCRIPT_FONTS, tweaks.scriptFont),
    `${tweaks.fontSize}px`,
  ].join(' · ')

  const fieldsetStyle: React.CSSProperties = {
    marginBottom: 8,
    padding: '0px 12px 6px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    minWidth: 0,
  }
  const legendStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600,
    color: 'var(--text-secondary)',
    padding: '0 5px',
    marginLeft: 4,
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '3px 0',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 12,
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--text-secondary)', fontSize: 12, minWidth: 150,
  }
  const collapsFieldsetStyle: React.CSSProperties = {
    marginBottom: 8,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    minWidth: 0,
    overflow: 'hidden',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 9998, animation: 'fadeIn 0.15s',
        }}
      />
      <div style={{
        position: 'fixed', left: pos.left, top: pos.top,
        width: 520, minWidth: 360, minHeight: 300,
        maxHeight: 'calc(100vh - 40px)',
        background: 'var(--bg-page)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        zIndex: 9999, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', resize: 'both',
      }}>
        {/* Header */}
        <div
          onMouseDown={handleHeaderMouseDown}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            flexShrink: 0, cursor: 'grab', userSelect: 'none',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
            Ansicht
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', padding: 4, display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 8px' }}>

          {/* Editor */}
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>Editor</legend>

            <div style={rowStyle}>
              <span style={labelStyle}>{t('szene', 'c')}kopf</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="seg">
                  <Tooltip text={`Ein ${t('szene', 'c')}kopf (aktuelle Fassung)`}><button className={tweaks.sceneEditorMode === 'single' ? 'on' : ''} onClick={() => set('sceneEditorMode', 'single')}><Square size={8} /></button></Tooltip>
                  <Tooltip text={`Pro Panel ein ${t('szene', 'c')}kopf (Fassungsvergleich)`}><button className={tweaks.sceneEditorMode === 'mirror' ? 'on' : ''} onClick={() => set('sceneEditorMode', 'mirror')}><Columns2 size={8} /></button></Tooltip>
                </div>
                <div className="seg">
                  <Tooltip text="Alle Felder"><button className={!tweaks.sceneHeaderCompact ? 'on' : ''} onClick={() => set('sceneHeaderCompact', false)}><Maximize2 size={8} /></button></Tooltip>
                  <Tooltip text="Kompakt (eine Zeile)"><button className={tweaks.sceneHeaderCompact ? 'on' : ''} onClick={() => set('sceneHeaderCompact', true)}><Minimize2 size={8} /></button></Tooltip>
                </div>
              </div>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Dokument-Editor</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="seg">
                  <Tooltip text="Beide Panels"><button className={tweaks.panelMode === 'both' ? 'on' : ''} onClick={() => set('panelMode', 'both')}><Columns2 size={8} /></button></Tooltip>
                  <Tooltip text={`Nur ${treatmentLabel}`}><button className={tweaks.panelMode === 'treatment' ? 'on' : ''} onClick={() => set('panelMode', 'treatment')}><PanelLeft size={8} /></button></Tooltip>
                  <Tooltip text="Nur Drehbuch"><button className={tweaks.panelMode === 'script' ? 'on' : ''} onClick={() => set('panelMode', 'script')}><PanelRight size={8} /></button></Tooltip>
                </div>
                <div className="seg">
                  <Tooltip text="Blatt mit Schatten"><button className={tweaks.showPageShadow ? 'on' : ''} onClick={() => set('showPageShadow', true)}><BookOpen size={8} /></button></Tooltip>
                  <Tooltip text="Fließtext"><button className={!tweaks.showPageShadow ? 'on' : ''} onClick={() => set('showPageShadow', false)}><AlignLeft size={8} /></button></Tooltip>
                </div>
              </div>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Breakdown-Sidebar</span>
              <div className="seg">
                <Tooltip text="Szenen-Breakdown-Panel einblenden"><button className={tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', true)}>An</button></Tooltip>
                <Tooltip text="Szenen-Breakdown-Panel ausblenden"><button className={!tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', false)}>Aus</button></Tooltip>
              </div>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Zeilennummern</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="seg">
                  <Tooltip text="Zeilennummern im Editor anzeigen"><button className={tweaks.showLineNumbers ? 'on' : ''} onClick={() => set('showLineNumbers', true)}>An</button></Tooltip>
                  <Tooltip text="Zeilennummern ausblenden"><button className={!tweaks.showLineNumbers ? 'on' : ''} onClick={() => set('showLineNumbers', false)}>Aus</button></Tooltip>
                </div>
                {tweaks.showLineNumbers && (
                  <Tooltip text="Abstand vom Textrand (cm)">
                    <input
                      type="number"
                      min={0.5}
                      max={3}
                      step={0.1}
                      value={tweaks.lineNumberMarginCm}
                      onChange={e => set('lineNumberMarginCm', Math.max(0.5, Math.min(3, parseFloat(e.target.value) || 1)))}
                      style={{
                        width: 52, fontSize: 12, padding: '3px 6px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                        color: 'var(--text-primary)', textAlign: 'center',
                      }}
                    />
                  </Tooltip>
                )}
              </div>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Replikennummern</span>
              <div className="seg">
                <Tooltip text="Fortlaufende Nummern pro Replik anzeigen"><button className={tweaks.showReplikNumbers ? 'on' : ''} onClick={() => set('showReplikNumbers', true)}>An</button></Tooltip>
                <Tooltip text="Replikennummern ausblenden"><button className={!tweaks.showReplikNumbers ? 'on' : ''} onClick={() => set('showReplikNumbers', false)}>Aus</button></Tooltip>
              </div>
            </div>

            {/* Autovervollständigung — Überschrift */}
            <div style={{ padding: '6px 0 2px', borderTop: '1px solid var(--border-subtle, #f0f0f0)', marginTop: 2 }}>
              <Tooltip text={`Gilt nur für Drehbuch-Format. Bei Storyline gibt es kein ${figurenLabel}-Format.`}>
                <span style={{ ...labelStyle, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                  Autovervollständigung
                </span>
              </Tooltip>
            </div>

            <div style={{ ...rowStyle, paddingLeft: 8 }}>
              <span style={labelStyle}>Quellenpool</span>
              <div className="seg">
                <Tooltip text="Nur Rollen/Komparsen aus dem Szenenkopf vorschlagen">
                  <button className={tweaks.nurCharAusSzenenkopf === 'szenenkopf' ? 'on' : ''} onClick={() => set('nurCharAusSzenenkopf', 'szenenkopf')}>Nur Szenenkopf</button>
                </Tooltip>
                <Tooltip text={`Alle ${figurenLabel} der Produktion vorschlagen (mit Neu-Anlegen-Option)`}>
                  <button className={tweaks.nurCharAusSzenenkopf === 'alle' ? 'on' : ''} onClick={() => set('nurCharAusSzenenkopf', 'alle')}>Alle</button>
                </Tooltip>
                <Tooltip text="Autovervollständigung deaktivieren">
                  <button className={tweaks.nurCharAusSzenenkopf === 'aus' ? 'on' : ''} onClick={() => set('nurCharAusSzenenkopf', 'aus')}>Aus</button>
                </Tooltip>
              </div>
            </div>

            {tweaks.nurCharAusSzenenkopf !== 'aus' && (
              <div style={{ ...rowStyle, paddingLeft: 8 }}>
                <Tooltip text={tweaks.charAcStyle === 'inline' ? 'Bester Treffer wird grau im Editor vervollständigt · Tab/Enter = übernehmen oder Neu anlegen' : 'Dropdown-Liste mit Vorschlägen · ↑↓ navigieren · Tab/Enter übernehmen'}>
                  <span style={labelStyle}>Darstellung</span>
                </Tooltip>
                <div className="seg">
                  <Tooltip text="Bester Treffer wird grau im Editor vervollständigt · Tab/Enter = übernehmen">
                    <button className={tweaks.charAcStyle === 'inline' ? 'on' : ''} onClick={() => set('charAcStyle', 'inline')}>Inline</button>
                  </Tooltip>
                  <Tooltip text="Klassisches Dropdown-Menü mit allen Treffern">
                    <button className={tweaks.charAcStyle === 'menu' ? 'on' : ''} onClick={() => set('charAcStyle', 'menu')}>Menü</button>
                  </Tooltip>
                </div>
              </div>
            )}

            <div style={rowStyle}>
              <span style={labelStyle}>Automatische Stimmungsanpassung</span>
              <div className="seg">
                <Tooltip text="Tageszeit-Änderung auf alle folgenden Szenen der Folge übertragen"><button className={tweaks.autoStimmungPropagation ? 'on' : ''} onClick={() => set('autoStimmungPropagation', true)}>An</button></Tooltip>
                <Tooltip text="Nur diese Szene ändern"><button className={!tweaks.autoStimmungPropagation ? 'on' : ''} onClick={() => set('autoStimmungPropagation', false)}>Aus</button></Tooltip>
              </div>
            </div>

            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={labelStyle}>Scroll-Nav Verzögerung</span>
              <div className="seg">
                {[500, 1000, 1500, 2000, 3000].map(ms => (
                  <Tooltip key={ms} text={`${ms / 1000}s Wartezeit nach dem letzten Tastendruck, bevor automatisch zur nächsten Szene gescrollt wird`}>
                    <button className={tweaks.scrollNavDelay === ms ? 'on' : ''} onClick={() => set('scrollNavDelay', ms)}>
                      {ms / 1000}s
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
          </fieldset>

          {/* Darstellung */}
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>Darstellung</legend>

            <div style={rowStyle}>
              <span style={labelStyle}>Theme</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={onFarbschemaClick}
                  style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 5,
                    border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  Farbschema
                </button>
                <button
                  onClick={onThemeAnpassenClick}
                  style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 5,
                    border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  Theme anpassen
                </button>
                <div className="seg">
                  <button className={tweaks.theme === 'light' ? 'on' : ''} onClick={() => set('theme', 'light')}>Hell</button>
                  <button className={tweaks.theme === 'dark' ? 'on' : ''} onClick={() => set('theme', 'dark')}>Dunkel</button>
                </div>
              </div>
            </div>

            <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <span style={labelStyle}>Hintergrundfarbe</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {palettes.map((p, i) => (
                  <Tooltip key={i} text={p.name}>
                    <button
                      style={{
                        width: 26, height: 26, borderRadius: 6,
                        border: activeIdx === i ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                        background: p.preview, cursor: 'pointer', padding: 0,
                      }}
                      onClick={() => isDark ? set('darkBgIndex', i) : set('lightBgIndex', i)}
                    />
                  </Tooltip>
                ))}
                <div style={{ position: 'relative' }}>
                  <Tooltip text="Eigene Farbe">
                    <button
                      style={{
                        width: 26, height: 26, borderRadius: 6,
                        border: activeIdx === CUSTOM_IDX ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                        background: activeIdx === CUSTOM_IDX ? customColor : 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff)',
                        cursor: 'pointer', padding: 0,
                      }}
                      onClick={() => {
                        if (isDark) { set('darkBgIndex', CUSTOM_IDX); darkColorRef.current?.click() }
                        else        { set('lightBgIndex', CUSTOM_IDX); lightColorRef.current?.click() }
                      }}
                    />
                  </Tooltip>
                  <input
                    ref={isDark ? darkColorRef : lightColorRef}
                    type="color"
                    value={customColor}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    onChange={e => isDark ? set('darkCustomBg', e.target.value) : set('lightCustomBg', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={labelStyle}>Tooltips</span>
              <div className="seg">
                <button className={tweaks.showTooltips ? 'on' : ''} onClick={() => set('showTooltips', true)}>An</button>
                <button className={!tweaks.showTooltips ? 'on' : ''} onClick={() => set('showTooltips', false)}>Aus</button>
              </div>
            </div>
          </fieldset>

          {/* Sprache — einklappbar */}
          <div style={collapsFieldsetStyle}>
            <div
              onClick={() => toggleSection('sprache')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px 5px', cursor: 'pointer', userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Sprache</span>
                {collapsed.sprache && (
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {spracheSummary}
                  </span>
                )}
              </div>
              <ChevronDown size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8, transform: collapsed.sprache ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
            </div>
            <div style={{ maxHeight: collapsed.sprache ? 0 : 500, overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
              <div style={{ padding: '0 12px 6px' }}>
                <div style={rowStyle}>
                  <span style={labelStyle}>Rechtschreibprüfung</span>
                  <div className="seg">
                    <Tooltip text="Aus"><button className={tweaks.spellcheck === 'off' ? 'on' : ''} onClick={() => set('spellcheck', 'off')}>Aus</button></Tooltip>
                    <Tooltip text="Browser-Spellcheck (rote Wellenlinien)"><button className={tweaks.spellcheck === 'browser' ? 'on' : ''} onClick={() => set('spellcheck', 'browser')}>Browser</button></Tooltip>
                    <Tooltip text="LanguageTool (Grammatik + Stil)"><button className={tweaks.spellcheck === 'languagetool' ? 'on' : ''} onClick={() => set('spellcheck', 'languagetool')}>LanguageTool</button></Tooltip>
                  </div>
                </div>

                <div style={rowStyle}>
                  <Tooltip text="Sprache für LanguageTool und Spellcheck-Korrekturen">
                    <span style={labelStyle}>Sprache</span>
                  </Tooltip>
                  <div className="seg">
                    <Tooltip text="Deutsch (Deutschland)"><button className={tweaks.spellcheckLang === 'de-DE' ? 'on' : ''} onClick={() => set('spellcheckLang', 'de-DE')}>de-DE</button></Tooltip>
                    <Tooltip text="Deutsch (Österreich)"><button className={tweaks.spellcheckLang === 'de-AT' ? 'on' : ''} onClick={() => set('spellcheckLang', 'de-AT')}>de-AT</button></Tooltip>
                    <Tooltip text="Englisch (UK)"><button className={tweaks.spellcheckLang === 'en-GB' ? 'on' : ''} onClick={() => set('spellcheckLang', 'en-GB')}>en-GB</button></Tooltip>
                    <Tooltip text="Englisch (US)"><button className={tweaks.spellcheckLang === 'en-US' ? 'on' : ''} onClick={() => set('spellcheckLang', 'en-US')}>en-US</button></Tooltip>
                  </div>
                </div>

                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <Tooltip text="Tastaturlayout — beeinflusst Anzeige der Tastaturkürzel in Tooltips und Hilfe">
                    <span style={labelStyle}>Tastaturlayout</span>
                  </Tooltip>
                  <div className="seg">
                    <Tooltip text="QWERTZ — Deutsch, Österreich, Schweiz"><button className={tweaks.keyboardLayout === 'qwertz' ? 'on' : ''} onClick={() => set('keyboardLayout', 'qwertz')}>QWERTZ</button></Tooltip>
                    <Tooltip text="QWERTY — Englisch, US, International"><button className={tweaks.keyboardLayout === 'qwerty' ? 'on' : ''} onClick={() => set('keyboardLayout', 'qwerty')}>QWERTY</button></Tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Schrift — einklappbar */}
          <div style={collapsFieldsetStyle}>
            <div
              onClick={() => toggleSection('schrift')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px 5px', cursor: 'pointer', userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Schrift</span>
                {collapsed.schrift && (
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {schriftSummary}
                  </span>
                )}
              </div>
              <ChevronDown size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8, transform: collapsed.schrift ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
            </div>
            <div style={{ maxHeight: collapsed.schrift ? 0 : 400, overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
              <div style={{ padding: '0 12px 6px' }}>
                <div style={rowStyle}>
                  <span style={labelStyle}>Interface-Schrift</span>
                  <select
                    value={tweaks.interfaceFont}
                    onChange={e => set('interfaceFont', e.target.value)}
                    style={{
                      fontSize: 11, padding: '3px 6px', borderRadius: 5,
                      border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                      color: 'var(--text-primary)', fontFamily: 'inherit',
                    }}
                  >
                    {INTERFACE_FONTS.map(f => (
                      <option key={f.value} value={f.value}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div style={rowStyle}>
                  <span style={labelStyle}>Interface-Schriftgrosse</span>
                  <div className="seg">
                    {INTERFACE_FONT_SIZES.map(s => (
                      <button key={s} className={tweaks.interfaceFontSize === s ? 'on' : ''} onClick={() => set('interfaceFontSize', s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={rowStyle}>
                  <span style={labelStyle}>Drehbuch-Schrift</span>
                  <select
                    value={tweaks.scriptFont}
                    onChange={e => set('scriptFont', e.target.value)}
                    style={{
                      fontSize: 11, padding: '3px 6px', borderRadius: 5,
                      border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                      color: 'var(--text-primary)', fontFamily: tweaks.scriptFont,
                    }}
                  >
                    {SCRIPT_FONTS.map(f => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <span style={labelStyle}>Drehbuch-Schriftgrosse</span>
                  <div className="seg">
                    {FONT_SIZES.map(s => (
                      <button key={s} className={tweaks.fontSize === s ? 'on' : ''} onClick={() => set('fontSize', s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div style={{ textAlign: 'center', paddingBottom: 4 }}>
            <button
              onClick={reset}
              style={{
                fontSize: 11, color: 'var(--text-secondary)', background: 'none',
                border: '1px solid var(--border)', borderRadius: 7, padding: '5px 14px',
                cursor: 'pointer',
              }}
            >
              Alle auf Standard zurücksetzen
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
