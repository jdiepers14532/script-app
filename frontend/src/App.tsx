import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScriptPage from './pages/ScriptPage'
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
import PrivatModeTokenPage from './pages/PrivatModeTokenPage'
import AnalysisPage from './pages/AnalysisPage'
import AnalyseHilfePage from './pages/AnalyseHilfePage'
import FreieDokumentePage from './pages/FreieDokumentePage'
import NtListePage from './pages/NtListePage'
import ThemeAnpassenPage from './pages/ThemeAnpassenPage'
import FreigabenPage from './pages/FreigabenPage'
import FreigabePublicPage from './pages/FreigabePublicPage'
import EmpfaengerPortalPage from './pages/EmpfaengerPortalPage'
import PlanungsPage from './pages/planung/PlanungsPage'
import BeziehungsbaumPage from './pages/BeziehungsbaumPage'
import { useFocusMode } from './hooks/useFocusMode'
import { useProduction } from './hooks/useProduction'
import {
  FocusContext,
  ProductionContext,
  AppSettingsContext,
  DEFAULT_KUERZEL,
  LN_SETTINGS_DEFAULTS,
  DEFAULT_PAGE_MARGINS,
  REPLIK_SETTINGS_DEFAULTS,
  SUFFIX_SETTINGS_DEFAULTS,
  SNAPSHOT_SETTINGS_DEFAULTS,
  type LnSettings,
  type PageMargins,
  type ReplikSettings,
  type SuffixSettings,
  type SnapshotSettings,
} from './contexts'
import { setEnvColors, setEnvColorsDark, resetEnvColors } from './data/scenes'
import { TerminologieProvider, TERM_DEFAULTS, OfflineQueueProvider } from './sw-ui'
import type { TerminologieConfig } from './sw-ui'
import { checkAndStartTour, setTreatmentLabel as setTourTreatmentLabel } from './utils/onboardingGuide'

export default function App() {
  const { focus, toggle, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen, toolbarPos, setToolbarPos, toolbarOpenedVia, setToolbarOpenedVia } = useFocusMode()
  const productionCtx = useProduction()
  const [treatmentLabel, setTreatmentLabel] = useState('Treatment')
  const [sceneKuerzel, setSceneKuerzel] = useState<Record<string, string>>(DEFAULT_KUERZEL)
  const [stimmungKuerzel, setStimmungKuerzel] = useState<Record<string, string>>({})
  const lastProdIdRef = useRef<string | null>(null)
  const [figurenLabel, setFigurenLabel] = useState('Rollen')
  const [sceneEnvColors, setSceneEnvColors] = useState<Record<string, any> | null>(null)
  const [terminologie, setTerminologie] = useState<TerminologieConfig>({ ...TERM_DEFAULTS })
  const [lnSettings, setLnSettings] = useState<LnSettings>(LN_SETTINGS_DEFAULTS)
  const [pageMargins, setPageMargins] = useState<PageMargins>(DEFAULT_PAGE_MARGINS)
  const [replikSettings, setReplikSettings] = useState<ReplikSettings>(REPLIK_SETTINGS_DEFAULTS)
  const [suffixSettings, setSuffixSettings] = useState<SuffixSettings>(SUFFIX_SETTINGS_DEFAULTS)
  const [acAlleDeaktiviert, setAcAlleDeaktiviert] = useState(false)
  const [charAcDeaktiviert, setCharAcDeaktiviert] = useState(false)
  const [charAcAlleErlaubt, setCharAcAlleErlaubt] = useState(true)
  const [snapshotSettings, setSnapshotSettings] = useState<SnapshotSettings>(SNAPSHOT_SETTINGS_DEFAULTS)

  useEffect(() => {
    const fetchStimmungen = (productionId: string) => {
      fetch(`/api/dk-settings/${encodeURIComponent(productionId)}/stimmungen`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((rows: any) => {
          if (!Array.isArray(rows)) return
          const map: Record<string, string> = {}
          rows.forEach((s: any) => { if (s.name && s.kuerzel) map[s.name.toLowerCase()] = s.kuerzel })
          setStimmungKuerzel(map)
        })
        .catch(() => {})
    }

    const loadSettings = (e?: Event) => {
      // If triggered by a CustomEvent with productionId, load merged production-specific settings.
      // Otherwise fall back to global app_settings.
      const productionId = (e as CustomEvent | undefined)?.detail?.productionId
      if (productionId) {
        lastProdIdRef.current = productionId
        fetchStimmungen(productionId)
      }
      const url = productionId
        ? `/api/dk-settings/${encodeURIComponent(productionId)}/app-settings`
        : '/api/admin/app-settings'
      fetch(url, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((data: any) => {
          if (data?.treatment_label) { setTreatmentLabel(data.treatment_label); setTourTreatmentLabel(data.treatment_label) }
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
            } catch {}
          }
          if (data?.page_margin_mm) {
            try {
              const pm = typeof data.page_margin_mm === 'string' ? JSON.parse(data.page_margin_mm) : data.page_margin_mm
              setPageMargins(prev => ({ ...DEFAULT_PAGE_MARGINS, ...prev, ...pm }))
            } catch {}
          }
          if (data?.replik_settings) {
            try {
              const parsed = JSON.parse(data.replik_settings)
              setReplikSettings({ ...REPLIK_SETTINGS_DEFAULTS, ...parsed })
            } catch {}
          }
          if (data?.suffix_settings) {
            try {
              const parsed = JSON.parse(data.suffix_settings)
              setSuffixSettings({ ...SUFFIX_SETTINGS_DEFAULTS, ...parsed })
              if (parsed.ac_alle_deaktiviert !== undefined) setAcAlleDeaktiviert(!!parsed.ac_alle_deaktiviert)
              if (parsed.char_ac_deaktiviert !== undefined) setCharAcDeaktiviert(!!parsed.char_ac_deaktiviert)
              if (parsed.char_ac_alle_erlaubt !== undefined) setCharAcAlleErlaubt(!!parsed.char_ac_alle_erlaubt)
            } catch {}
          }
          if (data?.snapshot_settings) {
            try {
              const parsed = JSON.parse(data.snapshot_settings)
              setSnapshotSettings({ ...SNAPSHOT_SETTINGS_DEFAULTS, ...parsed })
            } catch {}
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
    const onStimmungenChanged = (e: Event) => {
      const pid = (e as CustomEvent).detail?.productionId ?? lastProdIdRef.current
      if (pid) fetchStimmungen(pid)
    }

    loadSettings()
    window.addEventListener('app-settings-changed', loadSettings)
    window.addEventListener('stimmungen-changed', onStimmungenChanged)
    return () => {
      window.removeEventListener('app-settings-changed', loadSettings)
      window.removeEventListener('stimmungen-changed', onStimmungenChanged)
    }
  }, [])

  // Onboarding-Tour beim ersten Login automatisch starten (prüft Server-Setting)
  useEffect(() => {
    checkAndStartTour()
  }, [])

  return (
    <OfflineQueueProvider dbName="script-offline-queue">
    <TerminologieProvider config={terminologie}>
    <AppSettingsContext.Provider value={{ treatmentLabel, sceneKuerzel, stimmungKuerzel, figurenLabel, sceneEnvColors, lnSettings, pageMargins, replikSettings, suffixSettings, acAlleDeaktiviert, charAcDeaktiviert, charAcAlleErlaubt, snapshotSettings }}>
      <ProductionContext.Provider value={productionCtx}>
        <FocusContext.Provider value={{ focus, toggle, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen, toolbarPos, setToolbarPos, toolbarOpenedVia, setToolbarOpenedVia }}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ScriptPage />} />
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
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/analysis/hilfe" element={<AnalyseHilfePage />} />
              <Route path="/freie-dokumente" element={<FreieDokumentePage />} />
              <Route path="/nt-liste" element={<NtListePage />} />
              <Route path="/privat-mode-token/:token" element={<PrivatModeTokenPage />} />
              <Route path="/theme-anpassen" element={<ThemeAnpassenPage />} />
              <Route path="/freigaben" element={<FreigabenPage />} />
              <Route path="/freigabe/:token" element={<FreigabePublicPage />} />
              <Route path="/v/:token" element={<EmpfaengerPortalPage />} />
              <Route path="/planung/*" element={<PlanungsPage />} />
              <Route path="/beziehungsbaum" element={<BeziehungsbaumPage />} />
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
