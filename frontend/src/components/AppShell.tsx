import { ReactNode, useState, useMemo, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Minimize2, Maximize2,
  Bell, Sun, Moon, FileUp, FileCheck, CreditCard, BookMarked, ChevronRight,
  X, User, Settings2, ExternalLink, Check,
} from 'lucide-react'
import { useFocus, useSelectedProduction, PanelModeContext } from '../App'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import ProductionSelector from './ProductionSelector'
import { CompanyInfoModal } from '../sw-ui'
import { api } from '../api/client'
import Tooltip from './Tooltip'

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
  lightCustomBg: string
  darkCustomBg: string
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
  { name: 'Naturweiß',    preview: '#FCFCFA', bg: '#FCFCFA', surface: '#FCFCFA', subtle: '#F4F4F2', active: '#EEEEED', hover: '#E8E8E6', border: '#DCDCDA', borderSubtle: '#EBEBEA' },
  { name: 'Warm-Weiß',    preview: '#FAFAF8', bg: '#FAFAF8', surface: '#FAFAF8', subtle: '#F2F1EF', active: '#ECEAE6', hover: '#E5E3DF', border: '#DDDBD7', borderSubtle: '#E9E7E3' },
  { name: 'Elfenbein',    preview: '#FEFCE8', bg: '#FEFCE8', surface: '#FEFCE8', subtle: '#F5F0D8', active: '#EDE8CE', hover: '#E8E3CA', border: '#D6D0BC', borderSubtle: '#EDE9D5' },
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
  { name: 'Hellgrau',     preview: '#2E2E2E', bg: '#2E2E2E', surface: '#353535', subtle: '#3C3C3C', active: '#424242', hover: '#454545', border: '#505050', borderSubtle: '#3D3D3D' },
  { name: 'Silbergrau',   preview: '#3C3C3C', bg: '#3C3C3C', surface: '#444444', subtle: '#4C4C4C', active: '#535353', hover: '#555555', border: '#626262', borderSubtle: '#4E4E4E' },
]

// ── Eigene Farbe ableiten (HSL-basiert) ──────────────────────────────────────
function mixHex(hex: string, target: string, amount: number): string {
  const p = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]
  const [r1,g1,b1] = p(hex), [r2,g2,b2] = p(target)
  const m = (a: number, b: number) => Math.round(a + (b - a) * amount).toString(16).padStart(2,'0')
  return `#${m(r1,r2)}${m(g1,g2)}${m(b1,b2)}`
}

function derivePalette(hex: string, name: string, isDark: boolean): BgPalette {
  const w = '#ffffff', b = '#000000'
  return isDark ? {
    name, preview: hex,
    bg: hex,          surface: mixHex(hex,w,0.04), subtle: mixHex(hex,w,0.08),
    active: mixHex(hex,w,0.10), hover: mixHex(hex,w,0.09),
    border: mixHex(hex,w,0.14), borderSubtle: mixHex(hex,w,0.07),
  } : {
    name, preview: hex,
    bg: hex, surface: hex,
    subtle: mixHex(hex,b,0.04), active: mixHex(hex,b,0.07),
    hover:  mixHex(hex,b,0.05), border: mixHex(hex,b,0.13),
    borderSubtle: mixHex(hex,b,0.06),
  }
}

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

const CUSTOM_IDX = 99  // sentinel: eigene Farbe gewählt

const DEFAULT_TWEAKS: TweakState = {
  theme: 'light',
  colorMode: 'subtle',
  panelMode: 'both',
  density: 'normal',
  breakdown: true,
  conn: 'online',
  lightBgIndex: 0,
  darkBgIndex: 0,
  lightCustomBg: '#FAFAFA',
  darkCustomBg: '#2A2A2A',
  interfaceFont: INTERFACE_FONTS[0].value,
  interfaceFontSize: 13,
  scriptFont: SCRIPT_FONTS[0].value,
  fontSize: 13,
}

function resolvePalette(tweaks: TweakState, mode: 'light' | 'dark'): BgPalette {
  if (mode === 'light') {
    return tweaks.lightBgIndex === CUSTOM_IDX
      ? derivePalette(tweaks.lightCustomBg || '#FAFAFA', 'Eigene Farbe', false)
      : (LIGHT_PALETTES[tweaks.lightBgIndex] ?? LIGHT_PALETTES[0])
  }
  return tweaks.darkBgIndex === CUSTOM_IDX
    ? derivePalette(tweaks.darkCustomBg || '#2A2A2A', 'Eigene Farbe', true)
    : (DARK_PALETTES[tweaks.darkBgIndex] ?? DARK_PALETTES[0])
}

const INTERFACE_FONT_SIZES = [11, 12, 13, 14, 15, 16]

// ── CSS-Variablen via injiziertem <style>-Tag anwenden ───────────────────────
// Wirkt auf alle Seiten inkl. EditorPage (.editor-app hat kein data-theme).
function applyViewSettings(tweaks: TweakState) {
  const light = resolvePalette(tweaks, 'light')
  const dark  = resolvePalette(tweaks, 'dark')

  let style = document.getElementById('sw-view-settings') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'sw-view-settings'
    document.head.appendChild(style)
  }

  const zoomFactor = (tweaks.interfaceFontSize / 13).toFixed(4)
  style.textContent = `
    :root {
      --font-sans: ${tweaks.interfaceFont};
      --font-mono: ${tweaks.scriptFont};
      --user-interface-size: ${tweaks.interfaceFontSize}px;
      --user-script-size: ${tweaks.fontSize}px;
    }
    .app, .editor-app { zoom: ${zoomFactor}; }
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
  const [firmendatenOpen, setFirmendatenOpen] = useState(false)
  const [buchMenuOpen, setBuchMenuOpen] = useState(false)
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [appList, setAppList] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ username?: string; email?: string } | null>(null)
  const [treatmentLabel, setTreatmentLabel] = useState<'Treatment' | 'Storylines' | 'Outline'>('Treatment')
  const [adminSaving, setAdminSaving] = useState(false)

  const settingsReady = useRef(false)
  const saveTimer = useRef<number>()
  const lightColorInputRef = useRef<HTMLInputElement>(null)
  const darkColorInputRef  = useRef<HTMLInputElement>(null)
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

  // ── App-Liste + User-Info von auth.app laden ──────────────────────────────
  useEffect(() => {
    fetch('https://auth.serienwerft.studio/api/auth/my-apps', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (!data) return
        setAppList(data.apps || [])
        setIsAdmin(data.is_admin || false)
        setCurrentUser(data.user || null)
      })
      .catch(() => {})
  }, [])

  // ── Treatment-Bezeichnung von Produktions-Backend laden ───────────────────
  useEffect(() => {
    fetch('https://produktion.serienwerft.studio/api/public/settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.treatment_label) setTreatmentLabel(data.treatment_label)
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
          lightCustomBg: s.lightCustomBg ?? '#FAFAFA',
          darkCustomBg:  s.darkCustomBg  ?? '#2A2A2A',
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
  }, [tweaks.lightBgIndex, tweaks.darkBgIndex, tweaks.lightCustomBg, tweaks.darkCustomBg, tweaks.interfaceFont, tweaks.interfaceFontSize, tweaks.scriptFont, tweaks.fontSize])

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

  // Print-only nav (screen: hidden, print: visible)
  const navSections = [
    {
      label: 'Projekt',
      items: [
        { to: '/', icon: <LayoutDashboard size={15} />, label: 'Folgen', active: location.pathname === '/' },
        { to: '/import', icon: <FileUp size={15} />, label: 'Import', active: location.pathname === '/import' },
      ],
    },
  ]

  const activeBgName = resolvePalette(tweaks, tweaks.theme).name

  return (
    <div className="app" data-theme={tweaks.theme}>
      {/* Topbar */}
      <header className="topbar">
        <div className="brand-area">
          <Tooltip text="App wechseln">
            <button
              className="brand-btn"
              onClick={() => { setAppSwitcherOpen(v => !v); setCompanyMenuOpen(false); setUserMenuOpen(false) }}
            >
              <div className="mark">S</div>
              <span>script</span>
            </button>
          </Tooltip>
        </div>

        <button
          className="firm-logo-btn"
          onClick={() => { setCompanyMenuOpen(v => !v); setAppSwitcherOpen(false); setUserMenuOpen(false) }}
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

        <Tooltip text="Benachrichtigungen">
          <button className="iconbtn topbar-extra">
            <Bell size={14} />
          </button>
        </Tooltip>
        <Tooltip text="Fokus-Modus (F10)">
          <button className="focus-toggle" onClick={toggle}>
            {focus ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
        </Tooltip>
        <button
          className="avatar"
          onClick={() => { setUserMenuOpen(v => !v); setAppSwitcherOpen(false); setCompanyMenuOpen(false) }}
        >
          {currentUser?.username
            ? currentUser.username.slice(0, 2).toUpperCase()
            : <User size={14} />}
        </button>
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
        <PanelModeContext.Provider value={{ panelMode: tweaks.panelMode, setPanelMode: (m) => set('panelMode', m) }}>
          {children}
        </PanelModeContext.Provider>
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
            {(() => {
              const isDark = tweaks.theme === 'dark'
              const palettes = isDark ? DARK_PALETTES : LIGHT_PALETTES
              const activeIdx = isDark ? tweaks.darkBgIndex : tweaks.lightBgIndex
              const customColor = isDark ? tweaks.darkCustomBg : tweaks.lightCustomBg
              return (
                <>
                  <div className="swatches" data-dark={isDark ? 'true' : undefined}>
                    {palettes.map((p, i) => (
                      <button
                        key={i}
                        className={`swatch${activeIdx === i ? ' active' : ''}`}
                        style={{ background: p.preview }}
                        title={p.name}
                        onClick={() => isDark ? set('darkBgIndex', i) : set('lightBgIndex', i)}
                      />
                    ))}
                    {/* Eigene Farbe */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        className={`swatch swatch-custom${activeIdx === CUSTOM_IDX ? ' active' : ''}`}
                        style={activeIdx === CUSTOM_IDX ? { background: customColor } : undefined}
                        title="Eigene Farbe"
                        onClick={() => {
                          if (isDark) { set('darkBgIndex', CUSTOM_IDX); darkColorInputRef.current?.click() }
                          else        { set('lightBgIndex', CUSTOM_IDX); lightColorInputRef.current?.click() }
                        }}
                      />
                      <input
                        ref={isDark ? darkColorInputRef : lightColorInputRef}
                        type="color"
                        value={customColor}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                        onChange={e => isDark ? set('darkCustomBg', e.target.value) : set('lightCustomBg', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="swatch-name">{activeBgName}</div>
                </>
              )
            })()}
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

          <TweakGroup label="Breakdown-Sidebar">
            <div className="seg">
              <button className={tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', true)}>An</button>
              <button className={!tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', false)}>Aus</button>
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

      {/* ── Print-only Script Nav ── */}
      <div className="script-menu-print">
        {navSections.map(section => (
          <div key={section.label} className="sm-section">
            <div className="sm-section-label">{section.label}</div>
            {section.items.map(item => (
              <Link key={item.label} to={item.to} className={`sm-item${item.active ? ' active' : ''}`}>
                <span className="sm-icon">{item.icon}</span>
                <span className="sm-label">{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* ── App Switcher ── */}
      {appSwitcherOpen && (
        <>
          <div className="menu-overlay" onClick={() => setAppSwitcherOpen(false)} />
          <div className="app-switcher">
            <div className="as-header">Apps</div>
            <div className="as-grid">
              {appList.map(app => (
                <a
                  key={app.id}
                  href={app.url || `https://${app.subdomain}.serienwerft.studio`}
                  className="as-item"
                  target="_self"
                  onClick={() => setAppSwitcherOpen(false)}
                >
                  {app.icon_url
                    ? <img src={app.icon_url} alt={app.name} className="as-icon-img" />
                    : <div className="as-icon-placeholder" style={{ background: app.color || 'var(--bg-subtle)' }}>
                        {app.name.slice(0, 1).toUpperCase()}
                      </div>
                  }
                  <span className="as-name">{app.name}</span>
                  <ExternalLink size={10} className="as-ext" />
                </a>
              ))}
              {appList.length === 0 && (
                <div className="as-empty">Keine Apps verfügbar</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── User Menu ── */}
      {userMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setUserMenuOpen(false)} />
          <div className="user-menu">
            {currentUser && (
              <div className="um-user">
                <div className="um-name">{currentUser.username || currentUser.email}</div>
                <div className="um-email">{currentUser.email}</div>
              </div>
            )}
            <div className="um-divider" />
            <button className="um-item" onClick={() => { setTweaksOpen(true); setUserMenuOpen(false) }}>
              <Sun size={14} />
              Ansicht
            </button>
            <button className="um-item" onClick={() => { set('theme', tweaks.theme === 'light' ? 'dark' : 'light') }}>
              {tweaks.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              {tweaks.theme === 'light' ? 'Dunkles Theme' : 'Helles Theme'}
            </button>
            {isAdmin && (
              <>
                <div className="um-divider" />
                <button className="um-item" onClick={() => { setAdminOpen(true); setUserMenuOpen(false) }}>
                  <Settings2 size={14} />
                  Admin-Einstellungen
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Admin-Einstellungen Modal ── */}
      {adminOpen && (
        <>
          <div className="modal-backdrop" onClick={() => setAdminOpen(false)} />
          <div className="admin-modal">
            <div className="admin-modal-head">
              <span>Admin-Einstellungen</span>
              <button className="close" onClick={() => setAdminOpen(false)}><X size={14} /></button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-section-label">Treatment-Bezeichnung</div>
              <p className="admin-hint">Legt fest, wie Treatments in allen Apps dieser Produktion bezeichnet werden.</p>
              <div className="seg">
                {(['Treatment', 'Storylines', 'Outline'] as const).map(opt => (
                  <button
                    key={opt}
                    className={treatmentLabel === opt ? 'on' : ''}
                    onClick={() => setTreatmentLabel(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              <div className="admin-section-label" style={{ marginTop: 24 }}>Zugriff</div>
              <p className="admin-hint">User mit Zugriff auf die Script-App (via Auth-App verwaltet).</p>
              <div className="admin-roles-list">
                {appList.find(a => a.subdomain === 'script')?.roles?.map((r: string) => (
                  <span key={r} className="admin-role-chip">{r}</span>
                )) ?? <span className="admin-hint">—</span>}
              </div>
            </div>
            <div className="admin-modal-foot">
              <button
                className="admin-save-btn"
                disabled={adminSaving}
                onClick={async () => {
                  setAdminSaving(true)
                  try {
                    await fetch('https://produktion.serienwerft.studio/api/admin/einstellungen/treatment_label', {
                      method: 'PUT',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ value: treatmentLabel }),
                    })
                    setAdminOpen(false)
                  } catch { /* ignore */ }
                  finally { setAdminSaving(false) }
                }}
              >
                <Check size={13} />
                {adminSaving ? 'Speichert…' : 'Speichern'}
              </button>
            </div>
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
