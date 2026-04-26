import { ReactNode, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Minimize2, Maximize2,
  Bell, Sun, Moon, FileUp, FileCheck, CreditCard, BookMarked, ChevronRight,
  X, User, Settings2, ExternalLink, Check, LogOut, BookOpen,
  Wifi, WifiOff, Download, RefreshCw, HardDrive, Smartphone,
} from 'lucide-react'
import { useFocus, useSelectedProduction, PanelModeContext, useAppSettings } from '../App'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import ProductionSelector from './ProductionSelector'
import { CompanyInfoModal } from '../sw-ui'
import { api } from '../api/client'
import Tooltip from './Tooltip'

interface AppShellProps {
  children: ReactNode
  selectedStaffelId?: string
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
  selectedStaffelId = '',
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
  const { isOnline, pendingCount, isSyncing, syncQueue } = useOfflineQueue()
  const { productions, selectedId: selectedProdId, selectProduction } = useSelectedProduction()
  const { treatmentLabel } = useAppSettings()

  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [tweaks, setTweaks] = useState<TweakState>(DEFAULT_TWEAKS)

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [firmendatenOpen, setFirmendatenOpen] = useState(false)
  const [buchMenuOpen, setBuchMenuOpen] = useState(false)
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false)
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [appList, setAppList] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ username?: string; email?: string } | null>(null)
  const [sendedatum, setSendedatum] = useState<{ datum: string; ist_ki_prognose: boolean } | null>(null)

  // ── Offline-Modal ──────────────────────────────────────────────────────────
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [offlineView, setOfflineView] = useState<'main' | 'export' | 'import'>('main')
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  )
  const [cacheStats, setCacheStats] = useState<{ name: string; count: number; label: string }[]>([])
  const [cacheLoading, setCacheLoading] = useState(false)

  // Export sub-view
  const [exportStageId, setExportStageId] = useState<number | null>(null)
  const [exportFormat, setExportFormat]   = useState<'fountain' | 'fdx' | 'pdf'>('fountain')
  const [exportLoading, setExportLoading] = useState(false)

  // Import sub-view
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile]               = useState<File | null>(null)
  const [importPreview, setImportPreview]         = useState<any>(null)
  const [importPreviewLoading, setImportPreviewLoading] = useState(false)
  const [importStaffelId, setImportStaffelId]     = useState('')
  const [importFolge, setImportFolge]             = useState('')
  const [importStageType, setImportStageType]     = useState('draft')
  const [importSaveMeta, setImportSaveMeta]       = useState(false)
  const [importLoading, setImportLoading]         = useState(false)
  const [importResult, setImportResult]           = useState<any>(null)

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setIsInstalled(true))
    return () => { window.removeEventListener('beforeinstallprompt', handler) }
  }, [])

  const openOfflineModal = useCallback(async () => {
    setOfflineOpen(true)
    setOfflineView('main')
    loadCacheStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openImportView = useCallback(() => {
    setOfflineView('import')
    setImportFile(null); setImportPreview(null); setImportResult(null)
    if (!importStaffelId && productions.length > 0) setImportStaffelId(productions[0].id)
  }, [importStaffelId, productions])

  const handleImportFile = useCallback(async (file: File) => {
    setImportFile(file)
    setImportPreview(null)
    setImportResult(null)
    setImportPreviewLoading(true)
    try {
      const preview = await api.importPreview(file)
      setImportPreview(preview)
    } catch { /* ignore */ }
    finally { setImportPreviewLoading(false) }
  }, [])

  const handleImportCommit = useCallback(async () => {
    if (!importFile || !importStaffelId || !importFolge) return
    setImportLoading(true)
    try {
      const result = await api.importCommit(importFile, {
        staffel_id: importStaffelId,
        folge_nummer: parseInt(importFolge),
        stage_type: importStageType,
        save_metadata: importSaveMeta,
      })
      setImportResult(result)
    } catch (e: any) {
      setImportResult({ error: e.message })
    } finally { setImportLoading(false) }
  }, [importFile, importStaffelId, importFolge, importStageType, importSaveMeta])

  const handleExportDownload = useCallback(async () => {
    const stageId = exportStageId ?? (stages.length > 0 ? stages[0].id : null)
    if (!stageId) return
    setExportLoading(true)
    try {
      let res: Response
      if (exportFormat === 'fountain') res = await api.exportFountain(stageId)
      else if (exportFormat === 'fdx')  res = await api.exportFdx(stageId)
      else                              res = await api.exportPdf(stageId)

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const cd   = res.headers.get('Content-Disposition') || ''
      const fnMatch = cd.match(/filename="([^"]+)"/)
      a.download = fnMatch ? fnMatch[1] : `fassung.${exportFormat}`
      a.href = url; a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    finally { setExportLoading(false) }
  }, [exportStageId, exportFormat, stages])

  const loadCacheStats = async () => {
    if (!('caches' in window)) return
    setCacheLoading(true)
    try {
      const keys = await caches.keys()
      const LABELS: Record<string, string> = {
        'api-staffeln': 'Staffeln (NetworkFirst)',
        'api-episoden': 'Episoden (NetworkFirst)',
        'api-szenen': 'Szenen (Stale-While-Revalidate)',
        'workbox-precache-v2-https://script.serienwerft.studio/': 'App-Shell (CacheFirst)',
      }
      const stats = await Promise.all(keys.map(async name => {
        const cache = await caches.open(name)
        const entries = await cache.keys()
        const shortName = Object.keys(LABELS).find(k => name.startsWith(k)) ?? name
        return { name, label: LABELS[shortName] ?? name, count: entries.length }
      }))
      setCacheStats(stats.filter(s => s.count > 0))
    } catch { /* ignore */ } finally { setCacheLoading(false) }
  }


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

  // ── Sendedatum live aus ProdDB ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedStaffelId || selectedFolgeNummer == null) { setSendedatum(null); return }
    api.getSendedatum(selectedStaffelId, selectedFolgeNummer)
      .then(d => setSendedatum(d))
      .catch(() => setSendedatum(null))
  }, [selectedStaffelId, selectedFolgeNummer])

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

  const selectedStaffel = productions.find(p => p.id === selectedStaffelId)
  const selectedStage = stages.find(s => s.id === selectedStageId)
  const crumbStaffel = selectedStaffel
    ? (() => {
        const title = selectedStaffel.staffelnummer ? `${selectedStaffel.title} Staffel ${selectedStaffel.staffelnummer}` : selectedStaffel.title
        return selectedStaffel.projektnummer ? `${selectedStaffel.projektnummer} · ${title}` : title
      })()
    : selectedStaffelId ?? 'Script'
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
          {/* Icon → App-Switcher */}
          <Tooltip text="App wechseln">
            <button
              className="brand-icon-btn"
              onClick={() => { setAppSwitcherOpen(v => !v); setNavMenuOpen(false); setCompanyMenuOpen(false); setUserMenuOpen(false) }}
            >
              {(() => {
                const scriptApp = appList.find(a => a.subdomain === 'script')
                return scriptApp?.icon_url
                  ? <img src={scriptApp.icon_url} alt="Script" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
                  : <div className="mark">S</div>
              })()}
            </button>
          </Tooltip>
          {/* Text → App-Nav-Menü */}
          <button
            className="brand-label-btn"
            onClick={() => { setNavMenuOpen(v => !v); setAppSwitcherOpen(false); setCompanyMenuOpen(false); setUserMenuOpen(false) }}
          >
            script
          </button>
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
          ) : (
            <span>{crumbStaffel}</span>
          )}

          {bloecke.length > 0 && onSelectBlock && (
            <>
              <span>·</span>
              <select style={selectStyle} value={selectedBlock?.proddb_id ?? ''} onChange={e => onSelectBlock(bloecke.find(b => b.proddb_id === e.target.value))}>
                {bloecke.map(b => (
                  <option key={b.proddb_id} value={b.proddb_id}>
                    Block {b.block_nummer}{b.folge_von != null && b.folge_bis != null ? ` (${b.folge_von}–${b.folge_bis}) · ${b.folge_bis - b.folge_von + 1} Folgen` : ''}
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

          {selectedBlock?.dreh_von && selectedBlock?.dreh_bis && (() => {
            const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
            const yr = new Date(selectedBlock.dreh_bis + 'T00:00:00').getFullYear()
            return <span className="chip topbar-extra">Drehzeit: {fmt(selectedBlock.dreh_von)} – {fmt(selectedBlock.dreh_bis)}.{yr}</span>
          })()}
          {sendedatum?.datum && (() => {
            const d = new Date(sendedatum.datum + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            return <span className="chip topbar-extra">vorauss.: {d}{sendedatum.ist_ki_prognose ? ' (Prognose)' : ''}</span>
          })()}
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
              <button className={tweaks.panelMode === 'treatment' ? 'on' : ''} onClick={() => set('panelMode', 'treatment')}>{treatmentLabel}</button>
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

      {/* ── App-Nav-Menü ── */}
      {navMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setNavMenuOpen(false)} />
          <div className="user-menu" style={{ left: 8, right: 'auto', minWidth: 180 }}>
            {[
              { to: '/',       label: 'Folgen',   icon: <LayoutDashboard size={14} /> },
              { to: '/import', label: 'Import',   icon: <FileUp size={14} /> },
              { to: '/hilfe',  label: 'Handbuch', icon: <BookOpen size={14} /> },
              ...(isAdmin ? [{ to: '/admin', label: 'Einstellungen', icon: <Settings2 size={14} /> }] : []),
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={`um-item${location.pathname === item.to ? ' um-item-active' : ''}`}
                onClick={() => setNavMenuOpen(false)}
                style={{ textDecoration: 'none' }}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}

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
            <button className="um-item" onClick={() => { setUserMenuOpen(false); openOfflineModal() }}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} style={{ color: 'var(--sw-danger)' }} />}
              Offline-Modus
              {pendingCount > 0 && (
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  background: 'var(--sw-warning)', color: '#000',
                  borderRadius: 10, padding: '1px 6px',
                }}>{pendingCount}</span>
              )}
            </button>
            <Link
              to="/hilfe"
              className="um-item"
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => setUserMenuOpen(false)}
            >
              <BookOpen size={14} />
              Handbuch
            </Link>
            <button className="um-item" onClick={() => { set('theme', tweaks.theme === 'light' ? 'dark' : 'light') }}>
              {tweaks.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              {tweaks.theme === 'light' ? 'Dunkles Theme' : 'Helles Theme'}
            </button>
            {isAdmin && (
              <>
                <div className="um-divider" />
                <Link
                  to="/admin"
                  className="um-item"
                  onClick={() => setUserMenuOpen(false)}
                  style={{ textDecoration: 'none' }}
                >
                  <Settings2 size={14} />
                  Admin-Einstellungen
                </Link>
              </>
            )}
            <div className="um-divider" />
            <button
              className="um-item um-item-danger"
              onClick={async () => {
                setUserMenuOpen(false)
                await fetch('https://auth.serienwerft.studio/api/auth/logout', {
                  method: 'POST',
                  credentials: 'include',
                }).catch(() => {})
                window.location.href = 'https://auth.serienwerft.studio'
              }}
            >
              <LogOut size={14} />
              Ausloggen
            </button>
          </div>
        </>
      )}

      {/* ── Offline-Modus Modal ── */}
      {offlineOpen && (
        <>
          <div className="modal-backdrop" onClick={() => setOfflineOpen(false)} />
          <div className="admin-modal" style={{ maxWidth: 480 }}>

            {/* Header */}
            <div className="admin-modal-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {offlineView !== 'main' && (
                  <button onClick={() => setOfflineView('main')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '0 4px 0 0' }}>
                    ←
                  </button>
                )}
                {isOnline ? <Wifi size={15} /> : <WifiOff size={15} style={{ color: 'var(--sw-danger)' }} />}
                {offlineView === 'main'   ? 'Offline-Modus'
                : offlineView === 'export' ? 'Fassung exportieren'
                : 'Fassung importieren'}
              </span>
              <button className="close" onClick={() => setOfflineOpen(false)}><X size={14} /></button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Export sub-view ── */}
            {offlineView === 'export' && (() => {
              const currentStage = stages.find(s => s.id === (exportStageId ?? selectedStageId)) || stages[0] || null
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    Die exportierte Datei enthält ein unsichtbares Wasserzeichen, das dem Export-Vorgang zugeordnet ist.
                    Beim Reimport wird das Wasserzeichen automatisch entfernt.
                  </p>

                  {/* Stage selector */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Fassung</div>
                    {stages.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                        Öffne zuerst eine Folge im Script-Bereich, dann steht der Export hier zur Verfügung.
                      </div>
                    ) : (
                      <select
                        value={exportStageId ?? stages[0]?.id ?? ''}
                        onChange={e => setExportStageId(Number(e.target.value))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 13, fontFamily: 'inherit' }}
                      >
                        {stages.map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.version_label || s.stage_type} {s.folge_nummer ? `· Folge ${s.folge_nummer}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Format selector */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Format</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {([
                        { id: 'fountain', label: 'Fountain (.fountain)', desc: 'Offenes Textformat — lesbar in jedem Editor, empfohlen' },
                        { id: 'fdx',      label: 'Final Draft (.fdx)',   desc: 'Industriestandard D/A/CH TV-Produktion' },
                        { id: 'pdf',      label: 'PDF (Druckansicht)',   desc: 'HTML-basiert, im Browser drucken / als PDF speichern' },
                      ] as const).map(f => (
                        <label key={f.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${exportFormat === f.id ? 'var(--text-primary)' : 'var(--border)'}`,
                          background: exportFormat === f.id ? 'var(--bg-subtle)' : 'transparent',
                        }}>
                          <input type="radio" name="exportFormat" value={f.id}
                            checked={exportFormat === f.id}
                            onChange={() => setExportFormat(f.id)}
                            style={{ marginTop: 2, flexShrink: 0 }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{f.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleExportDownload}
                    disabled={exportLoading || stages.length === 0}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '11px 18px', borderRadius: 8,
                      background: stages.length > 0 ? 'var(--text-primary)' : 'var(--bg-subtle)',
                      color: stages.length > 0 ? 'var(--bg-page)' : 'var(--text-secondary)',
                      border: 'none', cursor: stages.length > 0 ? 'pointer' : 'not-allowed',
                      fontWeight: 700, fontSize: 13,
                    }}
                  >
                    <Download size={14} />
                    {exportLoading ? 'Wird erstellt…' : currentStage ? `„${currentStage.version_label || currentStage.stage_type}" exportieren` : 'Exportieren'}
                  </button>
                </div>
              )
            })()}

            {/* ── Import sub-view ── */}
            {offlineView === 'import' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  Importiere eine Fountain- oder FDX-Datei als neue Fassung. Enthaltene Wasserzeichen werden automatisch entfernt.
                </p>

                {/* File drop */}
                {!importResult && (
                <>
                <div
                  onClick={() => importFileRef.current?.click()}
                  style={{
                    border: `1.5px dashed ${importFile ? 'var(--sw-green)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '16px 20px',
                    textAlign: 'center', cursor: 'pointer',
                    background: importFile ? 'rgba(0,200,83,0.05)' : 'var(--bg-subtle)',
                    fontSize: 13, color: importFile ? 'var(--sw-green)' : 'var(--text-secondary)',
                  }}
                >
                  {importFile ? `📄 ${importFile.name}` : '+ .fountain oder .fdx auswählen'}
                  <input ref={importFileRef} type="file" accept=".fountain,.fdx,.txt"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
                  />
                </div>

                {/* Preview */}
                {importPreviewLoading && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Datei wird analysiert…</div>
                )}
                {importPreview && !importPreviewLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {[
                        ['Format', importPreview.format?.toUpperCase()],
                        ['Szenen', importPreview.total_scenes],
                        ['Charaktere', importPreview.charaktere?.length],
                      ].map(([k, v]) => (
                        <div key={k} style={{ padding: '6px 12px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 12 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{k}: </span><strong>{v}</strong>
                        </div>
                      ))}
                    </div>

                    {/* Metadata opt-in */}
                    {Object.keys(importPreview.file_metadata || {}).length > 0 && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6 }}>
                        <input type="checkbox" checked={importSaveMeta} onChange={e => setImportSaveMeta(e.target.checked)} style={{ marginTop: 2 }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>Datei-Metadaten zur Dokumentation speichern</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {Object.entries(importPreview.file_metadata).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                          </div>
                        </div>
                      </label>
                    )}
                    {importPreview.watermark_found && (
                      <div style={{ fontSize: 11, color: 'var(--sw-green)', padding: '6px 10px', background: 'rgba(0,200,83,0.07)', borderRadius: 6 }}>
                        Wasserzeichen gefunden und wird beim Import entfernt.
                      </div>
                    )}

                    {/* Target */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Staffel</div>
                        <select value={importStaffelId} onChange={e => setImportStaffelId(e.target.value)}
                          style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, fontFamily: 'inherit' }}>
                          {productions.filter(p => p.is_active).length > 0 && (
                            <optgroup label="Aktive Produktionen">
                              {productions.filter(p => p.is_active).map(p => {
                                const label = p.staffelnummer ? `${p.title} Staffel ${p.staffelnummer}` : p.title
                                return <option key={p.id} value={p.id}>{p.projektnummer ? `${p.projektnummer} · ${label}` : label}</option>
                              })}
                            </optgroup>
                          )}
                          {productions.filter(p => !p.is_active).length > 0 && (
                            <optgroup label="Inaktive Produktionen">
                              {productions.filter(p => !p.is_active).map(p => {
                                const label = p.staffelnummer ? `${p.title} Staffel ${p.staffelnummer}` : p.title
                                return <option key={p.id} value={p.id}>{p.projektnummer ? `${p.projektnummer} · ${label}` : label}</option>
                              })}
                            </optgroup>
                          )}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Folge</div>
                        <input type="number" value={importFolge} onChange={e => setImportFolge(e.target.value)}
                          placeholder="Nr."
                          style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Fassungstyp</div>
                      <select value={importStageType} onChange={e => setImportStageType(e.target.value)}
                        style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, fontFamily: 'inherit' }}>
                        {[['expose','Exposé'],['treatment', treatmentLabel],['draft','Drehbuch'],['final','Endfassung']].map(([v,l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleImportCommit}
                      disabled={importLoading || !importStaffelId || !importFolge}
                      style={{
                        padding: '11px', borderRadius: 8, border: 'none',
                        background: importStaffelId && importFolge ? 'var(--sw-green)' : 'var(--bg-subtle)',
                        color: importStaffelId && importFolge ? '#fff' : 'var(--text-secondary)',
                        fontWeight: 700, fontSize: 13, cursor: importStaffelId && importFolge ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {importLoading ? 'Importiere…' : 'Als neue Fassung importieren'}
                    </button>
                  </div>
                )}
                </>
                )}

                {/* Result */}
                {importResult && (
                  <div style={{
                    padding: '14px 16px', borderRadius: 8,
                    border: `1px solid ${importResult.error ? 'var(--sw-danger)' : 'var(--sw-green)'}`,
                    background: importResult.error ? 'rgba(255,59,48,0.05)' : 'rgba(0,200,83,0.05)',
                  }}>
                    {importResult.error ? (
                      <div style={{ color: 'var(--sw-danger)', fontSize: 13 }}>Fehler: {importResult.error}</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sw-green)' }}>Import erfolgreich</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {importResult.scenes_imported} Szenen · {importResult.entities_created} neue Charaktere
                          {importResult.metadata_saved ? ' · Metadaten gespeichert' : ''}
                        </div>
                        <button onClick={() => { setImportResult(null); setImportFile(null); setImportPreview(null) }}
                          style={{ marginTop: 4, fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer' }}>
                          Weitere Datei importieren
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {offlineView === 'main' && (<>

              {/* Export / Import Navigation */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => setOfflineView('export')}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 4, padding: '14px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                    <Download size={14} /> Exportieren
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Fountain, FDX oder PDF herunterladen
                  </span>
                </button>
                <button
                  onClick={openImportView}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 4, padding: '14px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                    <FileUp size={14} /> Importieren
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Fountain oder FDX als neue Fassung
                  </span>
                </button>
              </div>

              {/* Status */}
              <div>
                <div className="admin-section-label">Verbindungsstatus</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  border: `1px solid ${isOnline && pendingCount === 0 ? 'var(--sw-green)' : isOnline ? '#FF950044' : 'var(--sw-danger)'}`,
                  borderRadius: 8,
                  background: isOnline && pendingCount === 0 ? 'rgba(0,200,83,0.06)' : isOnline ? 'rgba(255,149,0,0.06)' : 'rgba(255,59,48,0.06)',
                }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: isOnline && pendingCount === 0 ? 'var(--sw-green)' : isOnline ? '#FF9500' : 'var(--sw-danger)',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {!isOnline
                        ? `Offline${pendingCount > 0 ? ` · ${pendingCount} Änderung${pendingCount === 1 ? '' : 'en'} ausstehend` : ''}`
                        : isSyncing ? 'Synchronisiert…'
                        : pendingCount > 0 ? `${pendingCount} ausstehende Änderung${pendingCount === 1 ? '' : 'en'}`
                        : 'Online · Alles synchronisiert'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {!isOnline
                        ? 'Änderungen werden lokal gespeichert und automatisch übertragen, sobald das Netz zurückkommt.'
                        : pendingCount > 0
                        ? 'Die App überträgt deine Änderungen gerade zum Server.'
                        : 'Alle Daten sind auf dem Server gespeichert.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warteschlange */}
              {(pendingCount > 0 || !isOnline) && (
                <div>
                  <div className="admin-section-label">Warteschlange</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      flex: 1, padding: '8px 12px', borderRadius: 6,
                      background: 'var(--bg-subtle)', fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}>
                      {pendingCount === 0
                        ? 'Keine ausstehenden Anfragen'
                        : `${pendingCount} Anfrage${pendingCount === 1 ? '' : 'n'} warten auf Übertragung`}
                    </div>
                    <button
                      onClick={() => { if (isOnline) syncQueue() }}
                      disabled={!isOnline || isSyncing}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', border: '1px solid var(--border)',
                        borderRadius: 6, background: 'var(--bg-surface)',
                        cursor: isOnline ? 'pointer' : 'not-allowed',
                        fontSize: 12, fontWeight: 600,
                        opacity: !isOnline || isSyncing ? 0.5 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <RefreshCw size={13} style={{ animation: isSyncing ? 'spin 1s linear infinite' : undefined }} />
                      {isSyncing ? 'Läuft…' : 'Jetzt sync'}
                    </button>
                  </div>
                  {!isOnline && pendingCount > 0 && (
                    <p style={{ fontSize: 11, color: '#FF9500', margin: '8px 0 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ flexShrink: 0 }}>⚠</span>
                      Tab nicht schließen, solange Änderungen ausstehen — sie könnten verloren gehen.
                    </p>
                  )}
                </div>
              )}

              {/* Cache */}
              <div>
                <div className="admin-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HardDrive size={12} />
                  Lokaler Cache
                </div>
                {cacheLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0' }}>Wird geladen…</div>
                ) : cacheStats.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0' }}>
                    {!('caches' in window) ? 'Cache API nicht verfügbar (kein HTTPS?)' : 'Noch keine Daten gecacht — öffne die App einmal online.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {cacheStats.map(s => (
                      <div key={s.name} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '6px 10px', borderRadius: 6,
                        background: 'var(--bg-subtle)', fontSize: 12,
                      }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                        <span style={{
                          fontWeight: 700, fontSize: 11, fontFamily: 'monospace',
                          color: 'var(--sw-green)',
                        }}>{s.count} Eintr{s.count === 1 ? 'ag' : 'äge'}</span>
                      </div>
                    ))}
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      Cache wird beim nächsten Öffnen automatisch aktualisiert.
                    </p>
                  </div>
                )}
              </div>

              {/* App installieren */}
              <div>
                <div className="admin-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Smartphone size={12} />
                  App installieren
                </div>
                {isInstalled ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--sw-green)',
                    background: 'rgba(0,200,83,0.06)',
                    fontSize: 13,
                  }}>
                    <Check size={16} style={{ color: 'var(--sw-green)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>App ist installiert</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Du kannst die Script-App direkt vom Home-Screen oder Taskbar öffnen.
                      </div>
                    </div>
                  </div>
                ) : installPrompt ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                      Installiere die App auf deinem Gerät — dann öffnet sie sich wie eine native App,
                      auch ohne Browser-Chrome, und ist offline vollständig nutzbar.
                    </p>
                    <button
                      onClick={async () => {
                        if (!installPrompt) return
                        installPrompt.prompt()
                        const { outcome } = await installPrompt.userChoice
                        if (outcome === 'accepted') { setIsInstalled(true); setInstallPrompt(null) }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 16px', borderRadius: 8,
                        background: 'var(--sw-green)', color: '#fff',
                        border: 'none', cursor: 'pointer',
                        fontWeight: 700, fontSize: 13,
                      }}
                    >
                      <Download size={15} />
                      App auf diesem Gerät installieren
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                      Installiere die App als PWA auf deinem Gerät, um sie direkt vom Home-Screen oder der Taskbar zu öffnen — auch offline nutzbar.
                    </p>
                    {/iPad|iPhone|iPod/.test(navigator.userAgent) ? (
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle)',
                        fontSize: 12, lineHeight: 1.6,
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>iOS — Safari</div>
                        <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)' }}>
                          <li>Antippen: <strong>Teilen</strong> <span style={{ fontSize: 14 }}>⎙</span> in der Safari-Menüleiste</li>
                          <li><strong>Zum Home-Bildschirm hinzufügen</strong> wählen</li>
                          <li><strong>Hinzufügen</strong> bestätigen</li>
                        </ol>
                      </div>
                    ) : (
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle)',
                        fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Chrome / Edge</div>
                        In der Adressleiste das <strong>Installieren</strong>-Symbol (⊕) anklicken, oder Menü → <strong>App installieren</strong>.
                      </div>
                    )}
                  </div>
                )}
              </div>

            </>)}

            </div>

            <div className="admin-modal-foot" style={{ justifyContent: 'space-between' }}>
              <Link
                to="/hilfe"
                style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => setOfflineOpen(false)}
              >
                <BookOpen size={12} />
                Mehr im Handbuch
              </Link>
              <button className="admin-save-btn" onClick={() => setOfflineOpen(false)}>
                <Check size={13} />
                Schließen
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
