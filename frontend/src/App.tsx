import { createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScriptPage from './pages/ScriptPage'
import EditorPage from './pages/EditorPage'
import AdminPage from './pages/AdminPage'
import ImportPage from './pages/ImportPage'
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

export default function App() {
  const { focus, toggle } = useFocusMode()
  const productionCtx = useProduction()

  return (
    <ProductionContext.Provider value={productionCtx}>
      <FocusContext.Provider value={{ focus, toggle }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ScriptPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </FocusContext.Provider>
    </ProductionContext.Provider>
  )
}
