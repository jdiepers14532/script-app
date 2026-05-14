import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScriptPage from './pages/ScriptPage'
import EditorPage from './pages/EditorPage'
import DokumentEditorPage from './pages/DokumentEditorPage'
import AdminPage from './pages/AdminPage'
import ImportPage from './pages/ImportPage'
import HilfePage from './pages/HilfePage'
import RollenPage from './pages/RollenPage'
import KomparsenPage from './pages/KomparsenPage'
import MotivenPage from './pages/MotivenPage'
import DrehbuchkoordinationPage from './pages/DrehbuchkoordinationPage'
import StatistikPage from './pages/StatistikPage'
import BesetzungPage from './pages/BesetzungPage'
import { useFocusMode } from './hooks/useFocusMode'
import { useProduction } from './hooks/useProduction'
import {
  FocusContext,
  ProductionContext,
  AppSettingsContext,
  DEFAULT_KUERZEL,
  LN_SETTINGS_DEFAULTS,
  type LnSettings,
} from './contexts'
import { setEnvColors, setEnvColorsDark, resetEnvColors } from './data/scenes'
import { TerminologieProvider, TERM_DEFAULTS, OfflineQueueProvider } from './sw-ui'
import type { TerminologieConfig } from './sw-ui'

export default function App() {
  const { focus, toggle, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen, toolbarPos, setToolbarPos, toolbarOpenedVia, setToolbarOpenedVia } = useFocusMode()
  const productionCtx = useProduction()
  const [treatmentLabel, setTreatmentLabel] = useState('Treatment')
  const [sceneKuerzel, setSceneKuerzel] = useState<Record<string, string>>(DEFAULT_KUERZEL)
  const [figurenLabel, setFigurenLabel] = useState('Rollen')
  const [sceneEnvColors, setSceneEnvColors] = useState<Record<string, any> | null>(null)
  const [terminologie, setTerminologie] = useState<TerminologieConfig>({ ...TERM_DEFAULTS })
  const [lnSettings, setLnSettings] = useState<LnSettings>(LN_SETTINGS_DEFAULTS)
  const [pageMarginMm, setPageMarginMm] = useState(25)

  useEffect(() => {
    const loadSettings = (e?: Event) => {
      // If triggered by a CustomEvent with productionId, load merged production-specific settings.
      // Otherwise fall back to global app_settings.
      const productionId = (e as CustomEvent | undefined)?.detail?.productionId
      const url = productionId
        ? `/api/dk-settings/${encodeURIComponent(productionId)}/app-settings`
        : '/api/admin/app-settings'
      fetch(url, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((data: any) => {
          if (data?.treatment_label) setTreatmentLabel(data.treatment_label)
          if (data?.figuren_label) setFigurenLabel(data.figuren_label)
          if (data?.scene_kuerzel) {
            try { setSceneKuerzel({ ...DEFAULT_KUERZEL, ...JSON.parse(data.scene_kuerzel) }) } catch {}
          }
          if (data?.scene_env_colors) {
            try {
              const parsed = JSON.parse(data.scene_env_colors)
              setSceneEnvColors(parsed)
              setEnvColors(parsed)
            } catch {}
          } else {
            resetEnvColors()
            setSceneEnvColors(null)
          }
          if (data?.scene_env_colors_dark) {
            try { setEnvColorsDark(JSON.parse(data.scene_env_colors_dark)) } catch {}
          }
          if (data?.terminologie) {
            try { setTerminologie({ ...TERM_DEFAULTS, ...JSON.parse(data.terminologie) }) } catch {}
          }
          if (data?.ln_settings) {
            try {
              const parsed = JSON.parse(data.ln_settings)
              setLnSettings({ ...LN_SETTINGS_DEFAULTS, ...parsed })
              // When triggered by a DK-Settings save (productionId present), reset the
              // per-user margin override to the new production default.
              if (productionId && typeof parsed.marginCm === 'number') {
                window.dispatchEvent(new CustomEvent('ln-default-changed', { detail: { marginCm: parsed.marginCm } }))
              }
            } catch {}
          }
          if (data?.page_margin_mm) {
            const v = parseFloat(data.page_margin_mm)
            if (v >= 10 && v <= 50) setPageMarginMm(v)
          }
          // PWA Admin-Steuerung (v67): einmalig ausführen, dann sofort zurücksetzen
          if (data?.pwa_update_action === 'update') {
            fetch('/api/admin/app-settings/pwa_update_action', {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: '' }),
            }).catch(() => {})
            // Neuen SW aktivieren (falls einer wartet) und neu laden
            const bc = new BroadcastChannel('sw-update')
            bc.postMessage({ type: 'SKIP_WAITING' })
            bc.close()
            setTimeout(() => window.location.reload(), 400)
          }
          if (data?.pwa_update_action === 'uninstall') {
            fetch('/api/admin/app-settings/pwa_update_action', {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: '' }),
            }).catch(() => {})
            window.dispatchEvent(new CustomEvent('pwa-admin-uninstall'))
          }
        })
        .catch(() => {})
    }
    loadSettings()
    window.addEventListener('app-settings-changed', loadSettings)
    return () => window.removeEventListener('app-settings-changed', loadSettings)
  }, [])

  return (
    <OfflineQueueProvider dbName="script-offline-queue">
    <TerminologieProvider config={terminologie}>
    <AppSettingsContext.Provider value={{ treatmentLabel, sceneKuerzel, figurenLabel, sceneEnvColors, lnSettings, pageMarginMm }}>
      <ProductionContext.Provider value={productionCtx}>
        <FocusContext.Provider value={{ focus, toggle, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen, toolbarPos, setToolbarPos, toolbarOpenedVia, setToolbarOpenedVia }}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ScriptPage />} />
              <Route path="/editor" element={<EditorPage />} />
              <Route path="/dokument-editor" element={<DokumentEditorPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/hilfe" element={<HilfePage />} />
              <Route path="/rollen" element={<RollenPage />} />
              <Route path="/komparsen" element={<KomparsenPage />} />
              <Route path="/motive" element={<MotivenPage />} />
              <Route path="/statistik" element={<StatistikPage />} />
              <Route path="/besetzung" element={<BesetzungPage />} />
              <Route path="/drehbuchkoordination" element={<DrehbuchkoordinationPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </FocusContext.Provider>
      </ProductionContext.Provider>
    </AppSettingsContext.Provider>
    </TerminologieProvider>
    </OfflineQueueProvider>
  )
}
