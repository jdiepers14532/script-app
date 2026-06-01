import { createContext, useContext } from 'react'
import type { KeyboardLayout } from './shortcuts'
import type { Production } from './hooks/useProduction'

// Focus Context
interface FocusContextValue {
  focus: boolean
  toggle: () => void
  hoverOpen: boolean
  setHoverOpen: (v: boolean) => void
  toolbarOpen: boolean
  setToolbarOpen: (v: boolean) => void
  toolbarPos: { x: number; y: number }
  setToolbarPos: (pos: { x: number; y: number }) => void
  toolbarOpenedVia: 'button' | 'click' | null
  setToolbarOpenedVia: (via: 'button' | 'click' | null) => void
}
export const FocusContext = createContext<FocusContextValue>({
  focus: false,
  toggle: () => {},
  hoverOpen: false,
  setHoverOpen: () => {},
  toolbarOpen: false,
  setToolbarOpen: () => {},
  toolbarPos: { x: 300, y: 50 },
  setToolbarPos: () => {},
  toolbarOpenedVia: null,
  setToolbarOpenedVia: () => {},
})
export function useFocus() {
  return useContext(FocusContext)
}

// Production Context
interface ProductionContextType {
  productions: Production[]
  selectedId: string | null
  selectedProduction: Production | null
  selectProduction: (id: string) => void
  loading: boolean
}
export const ProductionContext = createContext<ProductionContextType>({
  productions: [],
  selectedId: null,
  selectedProduction: null,
  selectProduction: () => {},
  loading: true,
})
export function useSelectedProduction() {
  return useContext(ProductionContext)
}

// Panel Mode Context
type PanelMode = 'both' | 'treatment' | 'script'
interface PanelModeContextType { panelMode: PanelMode; setPanelMode: (m: PanelMode) => void }
export const PanelModeContext = createContext<PanelModeContextType>({ panelMode: 'both', setPanelMode: () => {} })
export function usePanelMode() { return useContext(PanelModeContext) }

// App Settings Context
export const DEFAULT_KUERZEL: Record<string, string> = { int: 'I', ext: 'E', tag: 'T', nacht: 'N', daemmerung: 'D', abend: 'A' }
export interface LnSettings { fontFamily: string; fontSizePt: number; color: string; marginCm: number }
export const LN_SETTINGS_DEFAULTS: LnSettings = { fontFamily: "'Courier Prime', 'Courier New', monospace", fontSizePt: 10, color: '#999999', marginCm: 1 }
export interface PageMargins { oben: number; unten: number; links: number; rechts: number }
export const DEFAULT_PAGE_MARGINS: PageMargins = { oben: 25, unten: 20, links: 25, rechts: 20 }
export interface ReplikSettings { color: string; mode: 'continuous' | 'per_scene' }
export const REPLIK_SETTINGS_DEFAULTS: ReplikSettings = { color: '#000000', mode: 'continuous' }
export interface SuffixSettings {
  suffix_off_enabled: boolean
  suffix_nt_enabled: boolean
  suffix_oneway_enabled: boolean
  suffix_vo_enabled: boolean
  ac_alle_deaktiviert: boolean
  char_ac_deaktiviert: boolean
  char_ac_alle_erlaubt: boolean
  off_figuren_im_szenenkopf: boolean
  action_ac_enabled: boolean
  action_ac_trigger_chars: number
  action_auto_caps: boolean
}
export const SUFFIX_SETTINGS_DEFAULTS: SuffixSettings = {
  suffix_off_enabled: true,
  suffix_nt_enabled: true,
  suffix_oneway_enabled: true,
  suffix_vo_enabled: true,
  ac_alle_deaktiviert: false,
  char_ac_deaktiviert: false,
  char_ac_alle_erlaubt: true,
  off_figuren_im_szenenkopf: false,
  action_ac_enabled: true,
  action_ac_trigger_chars: 4,
  action_auto_caps: true,
}
export interface SnapshotSettings { szenenIntervalMin: number; werkIntervalMin: number; werkOnSwitch: boolean; szenenMax: number; werkMax: number }
export const SNAPSHOT_SETTINGS_DEFAULTS: SnapshotSettings = { szenenIntervalMin: 5, werkIntervalMin: 30, werkOnSwitch: true, szenenMax: 50, werkMax: 30 }
interface AppSettingsContextType { treatmentLabel: string; sceneKuerzel: Record<string, string>; stimmungKuerzel: Record<string, string>; figurenLabel: string; sceneEnvColors: Record<string, any> | null; lnSettings: LnSettings; pageMargins: PageMargins; replikSettings: ReplikSettings; suffixSettings: SuffixSettings; acAlleDeaktiviert: boolean; charAcDeaktiviert: boolean; charAcAlleErlaubt: boolean; snapshotSettings: SnapshotSettings }
export const AppSettingsContext = createContext<AppSettingsContextType>({ treatmentLabel: 'Treatment', sceneKuerzel: DEFAULT_KUERZEL, stimmungKuerzel: {}, figurenLabel: 'Rollen', sceneEnvColors: null, lnSettings: LN_SETTINGS_DEFAULTS, pageMargins: DEFAULT_PAGE_MARGINS, replikSettings: REPLIK_SETTINGS_DEFAULTS, suffixSettings: SUFFIX_SETTINGS_DEFAULTS, acAlleDeaktiviert: false, charAcDeaktiviert: false, charAcAlleErlaubt: true, snapshotSettings: SNAPSHOT_SETTINGS_DEFAULTS })
export function useAppSettings() { return useContext(AppSettingsContext) }

// User Prefs Context
interface UserPrefsContextType {
  scrollNavDelay: number
  showPageShadow: boolean
  showTooltips: boolean
  spellcheck: 'off' | 'browser' | 'languagetool'
  keyboardLayout: KeyboardLayout
  spellcheckLang: string
  charAcStyle?: string
}
export const UserPrefsContext = createContext<UserPrefsContextType>({
  scrollNavDelay: 1000, showPageShadow: true, showTooltips: true, spellcheck: 'off',
  keyboardLayout: 'qwertz', spellcheckLang: 'de-DE', charAcStyle: 'menu',
})
export function useUserPrefs() { return useContext(UserPrefsContext) }

// Tweaks Context (user-level view settings, managed by AppShell)
export interface TweakState {
  theme: 'light' | 'dark'
  colorMode: 'full' | 'subtle' | 'off'
  panelMode: PanelMode
  density: 'compact' | 'normal'
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
  scrollNavDelay: number
  showPageShadow: boolean
  showTooltips: boolean
  sceneHeaderCompact: boolean
  sceneEditorMode: 'single' | 'mirror'
  spellcheck: 'off' | 'browser' | 'languagetool'
  showLineNumbers: boolean
  lineNumberMarginCm: number
  showReplikNumbers: boolean
  /** Keyboard layout for shortcut labels — see src/shortcuts.ts */
  keyboardLayout: KeyboardLayout
  /** Language code for LanguageTool spellcheck, e.g. 'de-DE', 'en-US' */
  spellcheckLang: string
  /** Tageszeit-Änderung automatisch auf alle folgenden Szenen der Folge übertragen */
  autoStimmungPropagation: boolean
  /** Hover-Popup in der Szenenübersicht (Oneliner + Rollen) */
  sceneListPopup: boolean
  /** Nur echte Szenen anzeigen, Nicht-Szenen-Seiten ausblenden */
  sceneListNurSzenen: boolean
  /** Seitenzahlen in der Szenenübersicht anzeigen */
  sceneListSeitenzahlen: boolean
  /** Aktives Farbschema — ID aus BUILTIN_COLOR_SCHEMES oder benutzerdefiniert */
  activeColorSchemeId: string
  /** Charakter-Autovervollständigung: 'szenenkopf' | 'alle' */
  nurCharAusSzenenkopf: 'szenenkopf' | 'alle'
  /** Darstellung der Charakter-AC: Inline-Ghosttext oder Dropdown-Menü */
  charAcStyle: 'inline' | 'menu'
  /** Bei Episodenwechsel zur ersten echten Szene (nicht Titelseite) springen */
  episodenWechselErsteSzene: boolean
  /** Letzte gesehene Szene pro Episode im Backend merken und beim Zurückkehren wiederherstellen */
  letzteSzeneProEpisodeMerken: boolean
  /** Sticky Suffix: Suffix der letzten Zeile einer Figur (NT/VO/OFF) bei der nächsten Zeile automatisch vorschlagen */
  suffixStickyEnabled: boolean
}
interface TweaksContextType {
  tweaks: TweakState
  set: <K extends keyof TweakState>(key: K, value: TweakState[K]) => void
  reset: () => void
}
export const TweaksContext = createContext<TweaksContextType | null>(null)
export function useTweaks() {
  const ctx = useContext(TweaksContext)
  if (!ctx) throw new Error('useTweaks must be used within AppShell')
  return ctx
}

// Toast Context
export type ToastType = 'error' | 'success' | 'info'
interface ToastContextValue { showToast: (message: string, type?: ToastType) => void }
export const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })
export function useToast() { return useContext(ToastContext) }
