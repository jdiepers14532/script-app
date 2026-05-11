import { createContext, useContext } from 'react'
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
interface AppSettingsContextType { treatmentLabel: string; sceneKuerzel: Record<string, string>; figurenLabel: string; sceneEnvColors: Record<string, any> | null }
export const AppSettingsContext = createContext<AppSettingsContextType>({ treatmentLabel: 'Treatment', sceneKuerzel: DEFAULT_KUERZEL, figurenLabel: 'Rollen', sceneEnvColors: null })
export function useAppSettings() { return useContext(AppSettingsContext) }

// User Prefs Context
interface UserPrefsContextType { scrollNavDelay: number; showPageShadow: boolean; showTooltips: boolean; spellcheck: 'off' | 'browser' | 'languagetool' }
export const UserPrefsContext = createContext<UserPrefsContextType>({ scrollNavDelay: 1000, showPageShadow: true, showTooltips: true, spellcheck: 'off' })
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
  showReplikNumbers: boolean
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
