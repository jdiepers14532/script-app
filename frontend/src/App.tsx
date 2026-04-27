import { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScriptPage from './pages/ScriptPage'
import EditorPage from './pages/EditorPage'
import DokumentEditorPage from './pages/DokumentEditorPage'
import AdminPage from './pages/AdminPage'
import ImportPage from './pages/ImportPage'
import HilfePage from './pages/HilfePage'
import { useFocusMode } from './hooks/useFocusMode'
import { useProduction, Production } from './hooks/useProduction'

interface FocusContextValue {
  focus: boolean
  toggle: () => void
}

export const FocusContext = createContext<FocusContextValue>({
  focus: false,
  toggle: () => {},
})

export function useFocus() {
  return useContext(FocusContext)
}

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

type PanelMode = 'both' | 'treatment' | 'script'
interface PanelModeContextType { panelMode: PanelMode; setPanelMode: (m: PanelMode) => void }
export const PanelModeContext = createContext<PanelModeContextType>({ panelMode: 'both', setPanelMode: () => {} })
export function usePanelMode() { return useContext(PanelModeContext) }

export const DEFAULT_KUERZEL: Record<string, string> = { int: 'I', ext: 'E', tag: 'T', nacht: 'N', daemmerung: 'D', abend: 'A' }

interface AppSettingsContextType { treatmentLabel: string; sceneKuerzel: Record<string, string> }
export const AppSettingsContext = createContext<AppSettingsContextType>({ treatmentLabel: 'Treatment', sceneKuerzel: DEFAULT_KUERZEL })
export function useAppSettings() { return useContext(AppSettingsContext) }

interface UserPrefsContextType { scrollNavDelay: number; showPageShadow: boolean }
export const UserPrefsContext = createContext<UserPrefsContextType>({ scrollNavDelay: 1000, showPageShadow: true })
export function useUserPrefs() { return useContext(UserPrefsContext) }

export default function App() {
  const { focus, toggle } = useFocusMode()
  const productionCtx = useProduction()
  const [treatmentLabel, setTreatmentLabel] = useState('Treatment')
  const [sceneKuerzel, setSceneKuerzel] = useState<Record<string, string>>(DEFAULT_KUERZEL)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.treatment_label) setTreatmentLabel(data.treatment_label)
        if (data?.scene_kuerzel) {
          try { setSceneKuerzel({ ...DEFAULT_KUERZEL, ...JSON.parse(data.scene_kuerzel) }) } catch {}
        }
      })
      .catch(() => {})
  }, [])

  return (
    <AppSettingsContext.Provider value={{ treatmentLabel, sceneKuerzel }}>
      <ProductionContext.Provider value={productionCtx}>
        <FocusContext.Provider value={{ focus, toggle }}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ScriptPage />} />
              <Route path="/editor" element={<EditorPage />} />
              <Route path="/dokument-editor" element={<DokumentEditorPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/hilfe" element={<HilfePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </FocusContext.Provider>
      </ProductionContext.Provider>
    </AppSettingsContext.Provider>
  )
}
