import { ReactNode, useState, useMemo, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Settings, Minimize2, Maximize2,
  Bell, SlidersHorizontal, Sun, Moon, Film, BookOpen, Users, Lock, BarChart2,
  X, FileUp, FileCheck, CreditCard, BookMarked, ChevronRight,
} from 'lucide-react'
import { useFocus, useSelectedProduction } from '../App'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import ProductionSelector from './ProductionSelector'
import { CompanyInfoModal } from '../sw-ui'
import { api } from '../api/client'

interface AppShellProps {
  children: ReactNode
  staffeln?: any[]
  selectedStaffelId?: string
  onSelectStaffel?: (id: string) => void
  bloecke?: any[]
  selectedBlock?: any | null
  onSelectBlock?: (block: any) => void
  selectedFolgeNummer?: number | null
  onSelectFolge?: (nr: number) => void
  stages?: any[]
  selectedStageId?: number | null
  onSelectStage?: (id: number) => void
  hideProductionSelector?: boolean
}

type ColorMode = 'full' | 'subtle' | 'off'
type PanelMode = 'both' | 'treatment' | 'script'
type Density = 'compact' | 'normal'

export interface TweakState {
  theme: 'light' | 'dark'
  colorMode: ColorMode
  panelMode: PanelMode
  density: Density
  breakdown: boolean
  conn: 'online' | 'offline'
  lightBgIndex: number
  darkBgIndex: number
  interfaceFont: string
  interfaceFontSize: number
  scriptFont: string
  fontSize: number
}

// ── Wissenschaftlich empfohlene Hintergrundpaletten ──────────────────────────
// Siegenthaler et al. (2011, Ergonomics): Warme Off-White-Töne reduzieren
// visuelle Ermüdung vs. reinem Weiß.
// Bauer & Cavonius (1980): Positive Polarität (dunkler Text auf hellem Grund)
// ist optimal für Lesbarkeit.
// Solarized (Schoonover 2011): Im CIE-Lab-Farbraum optimiert für
// perzeptuelle Gleichmäßigkeit.
// Ware (2008, Information Visualization): Reines Schwarz verursacht
// "Irradiationsillusion" – Off-Blacks reduzieren Halo-Effekte.

interface BgPalette {
  name: string
  preview: string
  bg: string
  surface: string
  subtle: string
  active: string
  hover: string
  border: string
  borderSubtle: string
}

const LIGHT_PALETTES: BgPalette[] = [
  { name: 'Standard',     preview: '#FFFFFF', bg: '#FFFFFF', surface: '#FFFFFF', subtle: '#F5F5F5', active: '#F5F5F5', hover: '#EDEDED', border: '#E0E0E0', borderSubtle: '#EEEEEE' },
  { name: 'Warm-Weiß',    preview: '#FAFAF8', bg: '#FAFAF8', surface: '#FAFAF8', subtle: '#F2F1EF', active: '#ECEAE6', hover: '#E5E3DF', border: '#DDDBD7', borderSubtle: '#E9E7E3' },
  { name: 'Solarized',    preview: '#FDF6E3', bg: '#FDF6E3', surface: '#FDF6E3', subtle: '#EEE8D5', active: '#E8E2CE', hover: '#DDD8C6', border: '#CEC9B8', borderSubtle: '#E5E0CF' },
  { name: 'Leinen',       preview: '#FAF0E6', bg: '#FAF0E6', surface: '#FAF0E6', subtle: '#F0E6DC', active: '#E6DACE', hover: '#DDD2C4', border: '#C8BEB4', borderSubtle: '#E8DFDA' },
  { name: 'Pergament',    preview: '#F5F0E8', bg: '#F5F0E8', surface: '#F5F0E8', subtle: '#ECE7DF', active: '#E0DAD0', hover: '#D5CFC5', border: '#C0BAAE', borderSubtle: '#E5E0D8' },
  { name: 'Warmes Beige', preview: '#F0EBE0', bg: '#F0EBE0', surface: '#F0EBE0', subtle: '#E5E0D5', active: '#DAD4C8', hover: '#CFCABB', border: '#B8B2A5', borderSubtle: '#DDD8CC' },
]

const DARK_PALETTES: BgPalette[] = [
  { name: 'Near-Black',   preview: '#0D0D0D', bg: '#0D0D0D', surface: '#141414', subtle: '#1A1A1A', active: '#1F1F1F', hover: '#262626', border: '#2A2A2A', borderSubtle: '#1F1F1F' },
  { name: 'Dunkelgrau',   preview: '#1A1A1A', bg: '#1A1A1A', surface: '#202020', subtle: '#272727', active: '#2D2D2D', hover: '#333333', border: '#383838', borderSubtle: '#2A2A2A' },
  { name: 'VS Code',      preview: '#1E1E1E', bg: '#1E1E1E', surface: '#252526', subtle: '#2D2D2D', active: '#37373D', hover: '#3E3E3E', border: '#3F3F3F', borderSubtle: '#2D2D2D' },
  { name: 'Warm Dark',    preview: '#1C1A17', bg: '#1C1A17', surface: '#242018', subtle: '#2C281F', active: '#333026', hover: '#3A3628', border: '#3D3929', borderSubtle: '#28241C' },
  { name: 'Mittelgrau',   preview: '#242424', bg: '#242424', surface: '#2A2A2A', subtle: '#313131', active: '#383838', hover: '#3E3E3E', border: '#454545', borderSubtle: '#323232' },
  { name: 'One Dark',     preview: '#21252B', bg: '#21252B', surface: '#282C34', subtle: '#2C313C', active: '#323842', hover: '#393F4A', border: '#3E4451', borderSubtle: '#2C313C' },
]

// ── Wissenschaftlich empfohlene Schriften ────────────────────────────────────
// Interface: Inter (für Bildschirme optimiert, Andersson 2016)
// Atkinson Hyperlegible (Braille Institute 2019): ~20% bessere
//   Zeichenerkennung in Studien, besonders bei ähnlichen Zeichen (l/1/I)
// Text/Script: Courier Prime (Drehbuch-Industriestandard)
// Source Code Pro (Adobe Research), Inconsolata (humanistische Proportionen),
// JetBrains Mono (optimierte Laufweiten für lange Lesesitzungen)

interface FontOption {
  name: string
  value: string
}

const INTERFACE_FONTS: FontOption[] = [
  { name: 'Inter (Standard)',      value: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { name: 'System UI',             value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { name: 'Atkinson Hyperlegible', value: "'Atkinson Hyperlegible', sans-serif" },
  { name: 'Nunito',                value: "'Nunito', sans-serif" },
]

const SCRIPT_FONTS: FontOption[] = [
  { name: 'Courier Prime (Standard)', value: "'Courier Prime', 'Courier New', Courier, monospace" },
  { name: 'Source Code Pro',          value: "'Source Code Pro', 'Courier New', monospace" },
  { name: 'Inconsolata',              value: "'Inconsolata', 'Courier New', monospace" },
  { name: 'JetBrains Mono',           value: "'JetBrains Mono', 'Courier New', monospace" },
]

const FONT_SIZES = [11, 12, 13, 14, 15, 16]

const DEFAULT_TWEAKS: TweakState = {
  theme: 'light',
  colorMode: 'subtle',
  panelMode: 'both',
  density: 'normal',
  breakdown: true,
  conn: 'online',
  lightBgIndex: 0,
  darkBgIndex: 0,
  interfaceFont: INTERFACE_FONTS[0].value,
  interfaceFontSize: 13,
  scriptFont: SCRIPT_FONTS[0].value,
  fontSize: 13,
}

const INTERFACE_FONT_SIZES = [11, 12, 13, 14]

// ── CSS-Variablen via injiziertem <style>-Tag anwenden ───────────────────────
// Wirkt auf alle Seiten inkl. EditorPage (.editor-app hat kein data-theme).
function applyViewSettings(tweaks: TweakState) {
  const light = LIGHT_PALETTES[tweaks.lightBgIndex] ?? LIGHT_PALETTES[0]
  const dark = DARK_PALETTES[tweaks.darkBgIndex] ?? DARK_PALETTES[0]

  let style = document.getElementById('sw-view-settings') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'sw-view-settings'
    document.head.appendChild(style)
  }

  style.textContent = `
    :root {
      --font-sans: ${tweaks.interfaceFont};
      --font-mono: ${tweaks.scriptFont};
      --user-interface-size: ${tweaks.interfaceFontSize}px;
      --user-script-size: ${tweaks.fontSize}px;
    }
    [data-theme='light'], .editor-app {
      --bg-page: ${light.bg} !important;
      --bg-surface: ${light.surface} !important;
      --bg-subtle: ${light.subtle} !important;
      --bg-active: ${light.active} !important;
      --bg-hover: ${light.hover} !important;
      --border: ${light.border} !important;
      --border-subtle: ${light.borderSubtle} !important;
      --input-bg: ${light.bg} !important;
    }
    [data-theme='dark'] {
      --bg-page: ${dark.bg} !important;
      --bg-surface: ${dark.surface} !important;
      --bg-subtle: ${dark.subtle} !important;
      --bg-active: ${dark.active} !important;
      --bg-hover: ${dark.hover} !important;
      --border: ${dark.border} !important;
      --border-subtle: ${dark.borderSubtle} !important;
      --input-bg: ${dark.subtle} !important;
    }
  `
}

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: '2px 4px',
  borderRadius: 4,
  outline: 'none',
}

export default function AppShell({
  children,
  staffeln = [],
  selectedStaffelId = '',
  onSelectStaffel,
  bloecke = [],
  selectedBlock = null,
  onSelectBlock,
  selectedFolgeNummer = null,
  onSelectFolge,
  stages = [],
  selectedStageId = null,
  onSelectStage,
  hideProductionSelector = false,
}: AppShellProps) {
  const location = useLocation()
  const { focus, toggle } = useFocus()
  const { isOnline, pendingCount, isSyncing } = useOfflineQueue()
  const { productions, selectedId: selectedProdId, selectProduction } = useSelectedProduction()

  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [tweaks, setTweaks] = useState<TweakState>(DEFAULT_TWEAKS)

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [scriptMenuOpen, setScriptMenuOpen] = useState(false)
  const [firmendatenOpen, setFirmendatenOpen] = useState(false)
  const [buchMenuOpen, setBuchMenuOpen] = useState(false)

  const settingsReady = useRef(false)
  const saveTimer = useRef<number>()
  const [companyLogo, setCompanyLogo] = useState<{ light: string | null; dark: string | null }>({ light: null, dark: null })

  const set = <K extends keyof TweakState>(k: K, v: TweakState[K]) =>
    setTweaks(t => ({ ...t, [k]: v }))

  // ── Firmenlogo von auth.app laden ─────────────────────────────────────────
  useEffect(() => {
    fetch('https://auth.serienwerft.studio/api/public/company-info')
      .then(r => r.json())
      .then((data: any) => {
        if (data?.logos) {
          setCompanyLogo({
            light: data.logos.light || null,
            dark:  data.logos.dark  || null,
          })
        }
      })
      .catch(() => {})
  }, [])

  // ── Einstellungen beim Start vom Backend laden ────────────────────────────
  useEffect(() => {
    api.getSettings().then((data: any) => {
      if (data?.ui_settings) {
        const s = data.ui_settings
        setTweaks(prev => ({
          ...prev,
          theme:         s.theme         ?? prev.theme,
          colorMode:     s.colorMode     ?? prev.colorMode,
          panelMode:     s.panelMode     ?? prev.panelMode,
          density:       s.density       ?? prev.density,
          breakdown:     s.breakdown     ?? prev.breakdown,
          lightBgIndex:  typeof s.lightBgIndex  === 'number' ? s.lightBgIndex  : 0,
          darkBgIndex:   typeof s.darkBgIndex   === 'number' ? s.darkBgIndex   : 0,
          interfaceFont:     s.interfaceFont     ?? INTERFACE_FONTS[0].value,
          interfaceFontSize: typeof s.interfaceFontSize === 'number' ? s.interfaceFontSize : 13,
          scriptFont:        s.scriptFont        ?? SCRIPT_FONTS[0].value,
          fontSize:          typeof s.fontSize === 'number' ? s.fontSize : 13,
        }))
      }
    }).catch(() => {}).finally(() => {
      settingsReady.current = true
    })
  }, [])

  // ── Einstellungen debounced (800ms) speichern ─────────────────────────────
  useEffect(() => {
    if (!settingsReady.current) return
    clearTimeout(saveTimer.current)
    const { conn, ...toSave } = tweaks
    saveTimer.current = window.setTimeout(() => {
      api.updateSettings({ ui_settings: toSave }).catch(() => {})
    }, 800)
    return () => clearTimeout(saveTimer.current)
  }, [tweaks])

  // ── CSS-Variablen bei Änderung sofort anwenden ────────────────────────────
  useEffect(() => {
    applyViewSettings(tweaks)
  }, [tweaks.lightBgIndex, tweaks.darkBgIndex, tweaks.interfaceFont, tweaks.interfaceFontSize, tweaks.scriptFont, tweaks.fontSize])

  const allFolgen = useMemo(() => {
    const result: { nr: number; block: any }[] = []
    for (const b of bloecke) {
      if (b.folge_von != null && b.folge_bis != null) {
        for (let nr = b.folge_von; nr <= b.folge_bis; nr++) {
          result.push({ nr, block: b })
        }
      }
    }
    return result
  }, [bloecke])

  const handleFolgeSelect = (nr: number) => {
    const entry = allFolgen.find(f => f.nr === nr)
    if (!entry) return
    if (entry.block.proddb_id !== selectedBlock?.proddb_id) onSelectBlock?.(entry.block)
    onSelectFolge?.(nr)
  }

  const selectedStaffel = staffeln.find(s => s.id === selectedStaffelId)
  const selectedStage = stages.find(s => s.id === selectedStageId)
  const crumbStaffel = selectedStaffel?.titel ?? selectedStaffelId ?? 'Script'
  const crumbStage = selectedStage ? selectedStage.stage_type : null

  const navSections = [
    {
      label: 'Projekt',
      items: [
        { to: '/', icon: <LayoutDashboard size={15} />, label: 'Folgen', count: '12', active: location.pathname === '/' },
        { to: '/editor', icon: <FileText size={15} />, label: 'Editor', active: location.pathname === '/editor' },
        { to: '/import', icon: <FileUp size={15} />, label: 'Import', active: location.pathname === '/import' },
        { to: '/', icon: <Film size={15} />, label: 'Drehplan', active: false },
      ],
    },
    {
      label: 'Autor',
      items: [
        { to: '/', icon: <BookOpen size={15} />, label: 'Treatments', count: '4', active: false },
      ],
    },
    {
      label: 'Blöcke',
      items: [
        { to: '/', icon: <BarChart2 size={15} />, label: 'Breakdown', active: false },
        { to: '/', icon: <Lock size={15} />, label: 'Lock-Status', active: false },
      ],
    },
    {
      label: 'Verwaltung',
      items: [
        { to: '/admin', icon: <Settings size={15} />, label: 'Einstellungen', active: location.pathname === '/admin' },
        { to: '/', icon: <Users size={15} />, label: 'Benutzer', active: false },
      ],
    },
  ]

  const activeBgName = tweaks.theme === 'light'
    ? (LIGHT_PALETTES[tweaks.lightBgIndex] ?? LIGHT_PALETTES[0]).name
    : (DARK_PALETTES[tweaks.darkBgIndex] ?? DARK_PALETTES[0]).name

  return (
    <div className="app" data-theme={tweaks.theme}>
      {/* Topbar */}
      <header className="topbar">
        <div className="brand-area">
          <button
            className="brand-btn"
            onClick={() => { setScriptMenuOpen(v => !v); setCompanyMenuOpen(false) }}
            title="Navigation"
          >
            <div className="mark">S</div>
            <span>script</span>
          </button>
        </div>

        <button
          className="firm-logo-btn"
          onClick={() => { setCompanyMenuOpen(v => !v); setScriptMenuOpen(false) }}
          title="Firmenprofil"
        >
          {(tweaks.theme === 'dark' ? companyLogo.dark : companyLogo.light) ? (
            <img
              src={(tweaks.theme === 'dark' ? companyLogo.dark : companyLogo.light)!}
              alt="Firmenlogo"
              className="firm-logo-img"
            />
          ) : (
            <span className="firm-logo-text">Serienwerft</span>
          )}
        </button>

        <div className="divider" />

        <div className="crumbs">
          {!hideProductionSelector && productions.length > 0 ? (
            <ProductionSelector productions={productions} selectedId={selectedProdId} onSelect={selectProduction} />
          ) : !hideProductionSelector && staffeln.length > 0 && onSelectStaffel ? (
            <select style={selectStyle} value={selectedStaffelId} onChange={e => onSelectStaffel(e.target.value)}>
              {staffeln.map(s => <option key={s.id} value={s.id}>{s.titel}</option>)}
            </select>
          ) : (
            <span>{crumbStaffel}</span>
          )}

          {bloecke.length > 0 && onSelectBlock && (
            <>
              <span>·</span>
              <select style={selectStyle} value={selectedBlock?.proddb_id ?? ''} onChange={e => onSelectBlock(bloecke.find(b => b.proddb_id === e.target.value))}>
                {bloecke.map(b => (
                  <option key={b.proddb_id} value={b.proddb_id}>
                    Block {b.block_nummer}{b.folge_von != null ? ` (${b.folge_von}–${b.folge_bis})` : ''}
                  </option>
                ))}
              </select>
            </>
          )}

          {allFolgen.length > 0 && onSelectFolge && (
            <>
              <span>·</span>
              <select style={selectStyle} value={selectedFolgeNummer ?? ''} onChange={e => handleFolgeSelect(Number(e.target.value))}>
                {allFolgen.map(({ nr, block }) => (
                  <option key={nr} value={nr} style={{ fontWeight: block.proddb_id === selectedBlock?.proddb_id ? 700 : 400 }}>
                    Folge {nr}
                  </option>
                ))}
              </select>
            </>
          )}

          {stages.length > 0 && onSelectStage && crumbStage && (
            <span className="chip topbar-extra">{crumbStage}</span>
          )}
        </div>

        <div className="spacer" />

        <div className="status-pill topbar-extra" style={{ borderColor: isOnline ? undefined : 'var(--sw-warning)' }}>
          <span className="dot" style={{ background: isOnline && pendingCount === 0 ? 'var(--sw-green)' : isOnline ? 'var(--sw-warning)' : 'var(--sw-danger)' }} />
          <span>
            {!isOnline ? `Offline${pendingCount > 0 ? ` · ${pendingCount} ausstehend` : ''}` : isSyncing ? 'Synchronisiert…' : pendingCount > 0 ? `${pendingCount} ausstehende Änderungen` : 'Online · Synced'}
          </span>
        </div>

        <button className="iconbtn topbar-extra" onClick={() => set('theme', tweaks.theme === 'light' ? 'dark' : 'light')} title="Theme wechseln">
          {tweaks.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <button className="iconbtn topbar-extra" onClick={() => setTweaksOpen(v => !v)} title="Ansichtsoptionen">
          <SlidersHorizontal size={14} />
        </button>
        <button className="iconbtn topbar-extra" title="Benachrichtigungen">
          <Bell size={14} />
        </button>
        <button className="focus-toggle" onClick={toggle} title="Fokus-Modus (F10)">
          {focus ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>
        <div className="avatar" title="Jan Diepers">JD</div>
      </header>

      {/* Main content */}
      <main
        className="app-main app-main-full"
        data-colormode={tweaks.colorMode}
        data-panelmode={tweaks.panelMode}
        data-density={tweaks.density}
        data-breakdown={tweaks.breakdown ? 'on' : 'off'}
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {children}
      </main>

      {/* ── Ansichtsoptionen-Panel ── */}
      <div className={`tweaks${tweaksOpen ? ' open' : ''}`}>
        <div className="th">
          <span className="title">Ansicht</span>
          <span className="spacer" />
          <button className="close" onClick={() => setTweaksOpen(false)}><X size={12} /></button>
        </div>
        <div className="body">

          <TweakGroup label="Theme">
            <div className="seg">
              <button className={tweaks.theme === 'light' ? 'on' : ''} onClick={() => set('theme', 'light')}>Hell</button>
              <button className={tweaks.theme === 'dark' ? 'on' : ''} onClick={() => set('theme', 'dark')}>Dunkel</button>
            </div>
          </TweakGroup>

          <TweakGroup label="Hintergrundfarbe">
            <div className="swatches">
              {(tweaks.theme === 'light' ? LIGHT_PALETTES : DARK_PALETTES).map((p, i) => {
                const activeIdx = tweaks.theme === 'light' ? tweaks.lightBgIndex : tweaks.darkBgIndex
                return (
                  <button
                    key={i}
                    className={`swatch${activeIdx === i ? ' active' : ''}`}
                    style={{ background: p.preview }}
                    title={p.name}
                    onClick={() => tweaks.theme === 'light' ? set('lightBgIndex', i) : set('darkBgIndex', i)}
                  />
                )
              })}
            </div>
            <div className="swatch-name">{activeBgName}</div>
          </TweakGroup>

          <TweakGroup label="Farbcodierung">
            <div className="seg">
              <button className={tweaks.colorMode === 'full' ? 'on' : ''} onClick={() => set('colorMode', 'full')}>Vollfarbe</button>
              <button className={tweaks.colorMode === 'subtle' ? 'on' : ''} onClick={() => set('colorMode', 'subtle')}>Subtil</button>
              <button className={tweaks.colorMode === 'off' ? 'on' : ''} onClick={() => set('colorMode', 'off')}>Aus</button>
            </div>
          </TweakGroup>

          <TweakGroup label="Panelmodus">
            <div className="seg">
              <button className={tweaks.panelMode === 'both' ? 'on' : ''} onClick={() => set('panelMode', 'both')}>Beide</button>
              <button className={tweaks.panelMode === 'treatment' ? 'on' : ''} onClick={() => set('panelMode', 'treatment')}>Treatment</button>
              <button className={tweaks.panelMode === 'script' ? 'on' : ''} onClick={() => set('panelMode', 'script')}>Drehbuch</button>
            </div>
          </TweakGroup>

          <TweakGroup label="Interface-Schrift">
            <select
              className="font-select"
              value={tweaks.interfaceFont}
              onChange={e => set('interfaceFont', e.target.value)}
            >
              {INTERFACE_FONTS.map(f => (
                <option key={f.value} value={f.value}>{f.name}</option>
              ))}
            </select>
            <div className="seg" style={{ marginTop: 4 }}>
              {INTERFACE_FONT_SIZES.map(s => (
                <button key={s} className={tweaks.interfaceFontSize === s ? 'on' : ''} onClick={() => set('interfaceFontSize', s)}>
                  {s}
                </button>
              ))}
            </div>
          </TweakGroup>

          <TweakGroup label="Text-Schrift (Drehbuch)">
            <select
              className="font-select"
              value={tweaks.scriptFont}
              onChange={e => set('scriptFont', e.target.value)}
              style={{ fontFamily: tweaks.scriptFont }}
            >
              {SCRIPT_FONTS.map(f => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.name}</option>
              ))}
            </select>
          </TweakGroup>

          <TweakGroup label={`Schriftgröße (${tweaks.fontSize}px)`}>
            <div className="seg">
              {FONT_SIZES.map(s => (
                <button key={s} className={tweaks.fontSize === s ? 'on' : ''} onClick={() => set('fontSize', s)}>
                  {s}
                </button>
              ))}
            </div>
          </TweakGroup>

          <TweakGroup label="Dichte">
            <div className="seg">
              <button className={tweaks.density === 'compact' ? 'on' : ''} onClick={() => set('density', 'compact')}>Kompakt</button>
              <button className={tweaks.density === 'normal' ? 'on' : ''} onClick={() => set('density', 'normal')}>Normal</button>
            </div>
          </TweakGroup>

          <TweakGroup label="Breakdown">
            <div className="seg">
              <button className={tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', true)}>An</button>
              <button className={!tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', false)}>Aus</button>
            </div>
          </TweakGroup>

          <TweakGroup label="Verbindung">
            <div className="seg">
              <button className={tweaks.conn === 'online' ? 'on' : ''} onClick={() => set('conn', 'online')}>Online</button>
              <button className={tweaks.conn === 'offline' ? 'on' : ''} onClick={() => set('conn', 'offline')}>Offline</button>
            </div>
          </TweakGroup>

          <button
            className="reset-link"
            onClick={() => setTweaks(DEFAULT_TWEAKS)}
          >
            Auf Standard zurücksetzen
          </button>

        </div>
      </div>

      {/* ── Company Menu ── */}
      {companyMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setCompanyMenuOpen(false)} />
          <div className="company-menu">
            <div className="cm-menu">
              <button className="cm-menu-item" onClick={() => { setFirmendatenOpen(true); setCompanyMenuOpen(false) }}>
                <span className="cm-menu-item-icon"><FileCheck size={14} /></span>
                <span className="cm-menu-item-label">Firmendaten</span>
                <ChevronRight size={12} className="cm-menu-item-arrow" />
              </button>
              <div
                className="cm-menu-item-wrap"
                onMouseEnter={() => setBuchMenuOpen(true)}
                onMouseLeave={() => setBuchMenuOpen(false)}
              >
                <button className="cm-menu-item disabled">
                  <span className="cm-menu-item-icon"><CreditCard size={14} /></span>
                  <span className="cm-menu-item-label">Buchhaltung</span>
                  <ChevronRight size={12} className="cm-menu-item-arrow" />
                </button>
                {buchMenuOpen && (
                  <div className="cm-submenu">
                    <div className="cm-submenu-item disabled">
                      <span className="cm-submenu-item-label">Buchhaltung kontaktieren</span>
                      <span className="cm-bald">Bald</span>
                    </div>
                    <div className="cm-submenu-item disabled">
                      <span className="cm-submenu-item-label">Übersicht gestellte Rechnungen</span>
                      <span className="cm-bald">Bald</span>
                    </div>
                    <div className="cm-submenu-item disabled">
                      <span className="cm-submenu-item-label">Rechnung erstellen</span>
                      <span className="cm-bald">Bald</span>
                    </div>
                    <div className="cm-submenu-item disabled">
                      <span className="cm-submenu-item-label">Upload Dokumente &amp; Nachweise</span>
                      <span className="cm-bald">Bald</span>
                    </div>
                  </div>
                )}
              </div>
              <button className="cm-menu-item disabled">
                <span className="cm-menu-item-icon"><BookMarked size={14} /></span>
                <span className="cm-menu-item-label">VG Wort</span>
                <span className="cm-bald">Bald</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Firmendaten Modal ── */}
      <CompanyInfoModal
        open={firmendatenOpen}
        onClose={() => setFirmendatenOpen(false)}
        dark={tweaks.theme === 'dark'}
      />

      {/* ── Script / Nav Menu ── */}
      {scriptMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setScriptMenuOpen(false)} />
          <div className="script-menu">
            <div className="sm-header">Navigation</div>
            {navSections.map(section => (
              <div key={section.label} className="sm-section">
                <div className="sm-section-label">{section.label}</div>
                {section.items.map(item => (
                  <Link key={item.label} to={item.to} className={`sm-item${item.active ? ' active' : ''}`} onClick={() => setScriptMenuOpen(false)}>
                    <span className="sm-icon">{item.icon}</span>
                    <span className="sm-label">{item.label}</span>
                    {(item as any).count && <span className="sm-count">{(item as any).count}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TweakGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group">
      <div className="lbl">{label}</div>
      {children}
    </div>
  )
}
