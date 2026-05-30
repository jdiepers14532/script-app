import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api, preloadScene, preloadAllScenes, clearCacheByPrefix } from '../api/client'
import AppShell, { DEFAULT_TWEAKS } from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'
import EditorPanel from '../components/editor/EditorPanel'
import StatistikModal, { DEFAULT_SECTIONS, type StatModalSection } from '../components/StatistikModal'
import { useFocus, useSelectedProduction, PanelModeContext, useTweaks, usePanelMode, type TweakState } from '../contexts'
import { useTerminologie } from '../sw-ui'
import { useWerkstufe } from '../hooks/useDokument'
import SearchReplaceDialog from '../components/SearchReplaceDialog'
import { useSearchReplace } from '../hooks/useSearchReplace'
import StoryRadarPanel from '../components/StoryRadarPanel'
import StrangVerwaltungModal from '../components/StrangVerwaltungModal'
import StoppzeitenModal from '../components/StoppzeitenModal'

// ── Folgen-Dokument-Editor Panels (inline in main layout) ─────────────────────
// Per-scene editing: each editor shows only the currently selected scene's content
function DockedEditorPanels({ produktionId, folgeNummer, freiDokFolgeId, folgeId: folgeIdProp, selectedSzeneId, useDokumentSzenen, stageId, sceneIdentityId, onNavigateNext, onNavigatePrev, onSzeneUpdated, onMarkCommentsRead, onActiveWerkSelected, onSzenesNeedReload }: {
  produktionId: string; folgeNummer: number | null
  freiDokFolgeId?: number | null  // freies Dokument: direkte folge_id statt Auflösung via folgeNummer
  folgeId?: number | null  // direkte folge_id von ScriptPage — verhindert async-Race-Condition
  selectedSzeneId: number | string | null; useDokumentSzenen: boolean
  stageId: number | null; sceneIdentityId: string | null
  onNavigateNext?: () => void; onNavigatePrev?: () => void
  onSzeneUpdated?: (updated: any) => void; onMarkCommentsRead?: (szeneId: number) => void
  onActiveWerkSelected?: (werkId: string | null, typ?: string | null) => void
  onSzenesNeedReload?: () => void
}) {
  const { panelMode, setPanelMode } = usePanelMode()
  const { tweaks } = useTweaks()
  const sceneEditorMode = tweaks.sceneEditorMode ?? 'single'
  const [localFolgeId, setLocalFolgeId] = useState<number | null>(null)
  // Wenn folgeIdProp von ScriptPage übergeben wird, direkt nutzen (kein async-Lookup nötig)
  const folgeId = folgeIdProp !== undefined ? (folgeIdProp ?? null) : localFolgeId
  // Freies Dokument: folge_id direkt, kein folgeNummer-Lookup nötig
  useEffect(() => {
    if (folgeIdProp !== undefined) return  // Prop hat Vorrang — async-Lookup überspringen
    if (freiDokFolgeId != null) { setLocalFolgeId(freiDokFolgeId); return }
    if (!produktionId || !folgeNummer) { setLocalFolgeId(null); return }
    api.getFolgenV2(produktionId)
      .then(folgen => {
        const match = folgen.find((f: any) => f.folge_nummer === folgeNummer)
        setLocalFolgeId(match?.id ?? null)
      })
      .catch(() => setLocalFolgeId(null))
  }, [produktionId, folgeNummer, freiDokFolgeId, folgeIdProp])

  // Load werkstufen for this folge
  const { werkstufen, reload: reloadWerkstufen, createWerkstufe } = useWerkstufe(folgeId)

  // Track selected werkstufe per panel (for SceneEditor per panel)
  const [leftWerkId, setLeftWerkId] = useState<string | null>(null)
  const [rightWerkId, setRightWerkId] = useState<string | null>(null)

  // Scene characters from SceneEditor header → passed to EditorPanels for autocomplete
  const [sceneCharNames, setSceneCharNames] = useState<string[]>([])
  const handleCharsChange = useCallback((chars: { name: string; kategorie_typ?: string }[]) => {
    const rollen = chars.filter(c => c.kategorie_typ !== 'komparse').map(c => c.name)
    const komparsen = chars.filter(c => c.kategorie_typ === 'komparse').map(c => c.name)
    setSceneCharNames([...rollen, ...komparsen])
  }, [])
  // Reset when scene changes
  useEffect(() => { setSceneCharNames([]) }, [selectedSzeneId])

  // Charakter-aus-Editor → SceneEditor-Szenenkopf-Automatik
  const [charToAdd, setCharToAdd] = useState<{ name: string; characterId: string | null; suffix: string | null; key: number } | null>(null)
  const handleCharInserted = useCallback((name: string, characterId: string | null, suffix: string | null) => {
    setCharToAdd({ name, characterId, suffix, key: Date.now() })
  }, [])

  // Propagate dominant werkId + typ to parent — synchronisiert SceneList mit aktivem EditorPanel
  useEffect(() => {
    const dominant = rightWerkId ?? leftWerkId
    const dominantTyp = werkstufen.find((w: any) => w.id === dominant)?.typ ?? null
    onActiveWerkSelected?.(dominant, dominantTyp)
  }, [leftWerkId, rightWerkId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dual-view activation (from NeueWerkstufeModal)
  const [activateLeftWerkId, setActivateLeftWerkId] = useState<string | null>(null)
  const [activateRightWerkId, setActivateRightWerkId] = useState<string | null>(null)

  const handleNewWerkCreated = useCallback((newWerkId: string, oldWerkId: string | null) => {
    setPanelMode('both')
    if (oldWerkId) setActivateLeftWerkId(oldWerkId)
    setActivateRightWerkId(newWerkId)
  }, [setPanelMode])

  // Resizable split
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [isSplitDragging, setIsSplitDragging] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  const onSplitDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsSplitDragging(true)
    const getX = (ev: MouseEvent | TouchEvent) =>
      'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const ratio = (getX(ev) - rect.left) / rect.width
      setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)))
    }
    const onUp = () => {
      setIsSplitDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as EventListener)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as EventListener, { passive: false })
    window.addEventListener('touchend', onUp)
  }, [])

  if (!produktionId || (!folgeNummer && !freiDokFolgeId)) return null

  const showLeft = panelMode !== 'script'
  const showRight = panelMode !== 'treatment'
  const showBoth = showLeft && showRight

  const handleCreate = async (typ: string) => {
    await createWerkstufe(typ)
  }

  // Single SceneEditor: prefer RIGHT panel (drehbuch) when visible; left only when right is hidden
  const singleWerkId = showRight ? (rightWerkId ?? leftWerkId) : leftWerkId
  const singleWerkTyp = werkstufen.find((w: any) => w.id === singleWerkId)?.typ ?? null
  const leftWerkTyp   = werkstufen.find((w: any) => w.id === leftWerkId)?.typ ?? null
  const rightWerkTyp  = werkstufen.find((w: any) => w.id === rightWerkId)?.typ ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Single SceneEditor above both panels */}
      {sceneEditorMode === 'single' && selectedSzeneId && sceneIdentityId && (
        <SceneEditor
          szeneId={selectedSzeneId}
          stageId={stageId}
          produktionId={produktionId}
          folgeNummer={folgeNummer}
          useDokumentSzenen={useDokumentSzenen}
          werkstufId={singleWerkId}
          werkstufTyp={singleWerkTyp}
          sceneIdentityId={sceneIdentityId}
          onSzeneUpdated={onSzeneUpdated}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={onNavigateNext}
          onMarkCommentsRead={onMarkCommentsRead}
          onCharsChange={handleCharsChange}
          addCharTrigger={charToAdd}
        />
      )}
      <div ref={splitContainerRef} style={{ display: 'flex', borderTop: '2px solid var(--border)', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {showLeft && (
        <div style={{
          width: showBoth ? `${splitRatio * 100}%` : undefined,
          flex: showBoth ? undefined : 1,
          overflow: 'hidden', flexShrink: 0,
          pointerEvents: isSplitDragging ? 'none' : 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {sceneEditorMode === 'mirror' && selectedSzeneId && sceneIdentityId && (
            <SceneEditor
              szeneId={selectedSzeneId}
              stageId={stageId}
              produktionId={produktionId}
              folgeNummer={folgeNummer}
              useDokumentSzenen={useDokumentSzenen}
              werkstufId={leftWerkId}
              werkstufTyp={leftWerkTyp}
              sceneIdentityId={sceneIdentityId}
              onSzeneUpdated={onSzeneUpdated}
              onNavigatePrev={onNavigatePrev}
              onNavigateNext={onNavigateNext}
              onMarkCommentsRead={onMarkCommentsRead}
            />
          )}
          <EditorPanel
            key={`${produktionId}-${folgeNummer}-left`}
            produktionId={produktionId}
            folgeNummer={folgeNummer}
            folgeId={folgeId}
            werkstufen={werkstufen}
            defaultTyp={showBoth ? "storyline" : undefined}
            selectedSzeneId={selectedSzeneId}
            sceneIdentityId={sceneIdentityId}
            useDokumentSzenen={useDokumentSzenen}
            activateWerkId={activateLeftWerkId}
            onCreateWerkstufe={handleCreate}
            onReloadWerkstufen={reloadWerkstufen}
            onNavigateNext={onNavigateNext}
            onNavigatePrev={onNavigatePrev}
            onWerkstufSelected={setLeftWerkId}
            onNewWerkCreated={handleNewWerkCreated}
            onSzenesNeedReload={onSzenesNeedReload}
            sceneCharNames={sceneCharNames}
            onCharInserted={handleCharInserted}
          />
        </div>
      )}
      {showBoth && (
        <div
          onMouseDown={onSplitDragStart}
          onTouchStart={onSplitDragStart}
          onDoubleClick={() => setSplitRatio(0.5)}
          style={{
            width: 1, flexShrink: 0, cursor: 'col-resize',
            background: 'var(--border)',
            position: 'relative',
          }}
          title="Ziehen zum Ändern der Breite · Doppelklick = 50/50"
        >
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: -4, width: 9,
            cursor: 'col-resize',
          }} />
        </div>
      )}
      {showRight && (
        <div style={{
          flex: 1, overflow: 'hidden',
          pointerEvents: isSplitDragging ? 'none' : 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {sceneEditorMode === 'mirror' && selectedSzeneId && sceneIdentityId && (
            <SceneEditor
              szeneId={selectedSzeneId}
              stageId={stageId}
              produktionId={produktionId}
              folgeNummer={folgeNummer}
              useDokumentSzenen={useDokumentSzenen}
              werkstufId={rightWerkId}
              werkstufTyp={rightWerkTyp}
              sceneIdentityId={sceneIdentityId}
              onSzeneUpdated={onSzeneUpdated}
              onNavigatePrev={onNavigatePrev}
              onNavigateNext={onNavigateNext}
              onMarkCommentsRead={onMarkCommentsRead}
            />
          )}
          <EditorPanel
            key={`${produktionId}-${folgeNummer}-right`}
            produktionId={produktionId}
            folgeNummer={folgeNummer}
            folgeId={folgeId}
            werkstufen={werkstufen}
            defaultTyp="drehbuch"
            selectedSzeneId={selectedSzeneId}
            sceneIdentityId={sceneIdentityId}
            useDokumentSzenen={useDokumentSzenen}
            activateWerkId={activateRightWerkId}
            onCreateWerkstufe={handleCreate}
            onReloadWerkstufen={reloadWerkstufen}
            onNavigateNext={onNavigateNext}
            onNavigatePrev={onNavigatePrev}
            onWerkstufSelected={setRightWerkId}
            onNewWerkCreated={handleNewWerkCreated}
            onSzenesNeedReload={onSzenesNeedReload}
            sceneCharNames={sceneCharNames}
            onCharInserted={handleCharInserted}
          />
        </div>
      )}
      </div>
    </div>
  )
}

const MIN_WIDTH = 180
const DEFAULT_WIDTH = 276

// ── Gehe-zu-Szene Dialog ──────────────────────────────────────────────────────
function GotoSzeneDialog({ szenen, onNavigate, onClose }: {
  szenen: any[]
  onNavigate: (id: number | string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const match = q ? szenen.find(s =>
    `${s.scene_nummer ?? ''}${s.scene_nummer_suffix ?? ''}`.toLowerCase() === q
  ) : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (match) { onNavigate(match.id); onClose() }
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: '28%', left: '50%', transform: 'translate(-50%, -50%)',
        background: 'var(--bg-page)', borderRadius: 12, padding: '20px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 2001,
        minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Gehe zu Szene</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sz-Nr., z.B. 42 oder 7a"
            autoComplete="off"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 7,
              border: `1px solid ${match ? 'var(--sw-green)' : 'var(--border)'}`,
              background: 'var(--bg-subtle)', color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={!match}
            style={{
              padding: '8px 16px', borderRadius: 7, border: 'none',
              background: match ? 'var(--text-primary)' : 'var(--bg-subtle)',
              color: match ? 'var(--bg-page)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: match ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            Springen
          </button>
        </form>
        {q && !match && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Szene nicht gefunden.</div>
        )}
        {match && (
          <div style={{ fontSize: 12, color: 'var(--sw-green)' }}>
            {match.ort_name ?? `Szene ${match.scene_nummer}${match.scene_nummer_suffix ?? ''}`}
          </div>
        )}
      </div>
    </>
  )
}

// localStorage-Keys (synchrone Initialisierung → kein Race mit loadWerkstufen / AppShell-getSettings)
const LS_KEY_LAST_SCENE = 'script_letzte_szene_pro_episode'
// Cached: ob das Toggle aktiv ist — damit tweaksRef synchron korrekt initialisiert wird,
// bevor AppShell seine async-Einstellungen geladen hat.
const LS_KEY_LETZTE_SZENE_TOGGLE = 'script_letzte_szene_toggle'

// ── TweaksSync — reads useTweaks() inside AppShell context ───────────────────
// useTweaks() darf NICHT in ScriptPage selbst aufgerufen werden (ScriptPage
// rendert AppShell, der TweaksContext existiert erst darin).
function TweaksSync({
  tweaksRef,
  lastSeenMapRef,
  saveLastSeenTimerRef,
  navRestoredRef,
  selectedFolgeId,
  selectedSzeneId,
}: {
  tweaksRef: React.MutableRefObject<TweakState>
  lastSeenMapRef: React.MutableRefObject<Record<string, number | string>>
  saveLastSeenTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  navRestoredRef: React.MutableRefObject<boolean>
  selectedFolgeId: number | null
  selectedSzeneId: number | string | null
}) {
  const { tweaks } = useTweaks()
  tweaksRef.current = tweaks

  // Toggle-Wert in localStorage cachen — aber NUR wenn wir wissen, dass AppShell geladen hat.
  // Problem: DEFAULT_TWEAKS hat letzteSzeneProEpisodeMerken=false. Wenn wir auf dem ersten
  // Render sofort 'false' schreiben, wird der korrekte gespeicherte Wert ('true') zerstört,
  // bevor loadWerkstufen ihn lesen kann.
  // Lösung: nur 'true' schreiben (AppShell hat geladen oder User hat aktiviert);
  //         'false' nur schreiben wenn wir vorher 'true' gesehen haben (= echte Deaktivierung).
  const _toggleCacheLoadedRef = useRef(false)
  useEffect(() => {
    if (tweaks.letzteSzeneProEpisodeMerken) {
      _toggleCacheLoadedRef.current = true
      try { localStorage.setItem(LS_KEY_LETZTE_SZENE_TOGGLE, 'true') } catch {}
    } else if (_toggleCacheLoadedRef.current) {
      // Vorher true gesehen → jetzt false = User hat Feature deaktiviert → localStorage leeren
      try { localStorage.setItem(LS_KEY_LETZTE_SZENE_TOGGLE, 'false') } catch {}
    }
    // Falls immer false (Feature war nie aktiv auf diesem Gerät): nichts schreiben
  }, [tweaks.letzteSzeneProEpisodeMerken])

  useEffect(() => {
    api.getSettings().then((s: any) => {
      const backendMap = s?.ui_settings?.letzte_szene_pro_episode
      // Nur mergen wenn Backend tatsächlich Daten hat — niemals mit leerem Backend
      // den localStorage-Initialwert überschreiben (der ist aktueller als nie gespeichertes Backend)
      if (backendMap && typeof backendMap === 'object' && Object.keys(backendMap).length > 0) {
        // Backend hat Vorrang bei Konflikten (multi-device sync); lokale Einträge bleiben erhalten
        const merged = { ...lastSeenMapRef.current, ...backendMap }
        lastSeenMapRef.current = merged
        try { localStorage.setItem(LS_KEY_LAST_SCENE, JSON.stringify(merged)) } catch {}
      }
    }).catch(() => {})
  }, [lastSeenMapRef])

  useEffect(() => {
    if (!tweaks.letzteSzeneProEpisodeMerken) return
    if (!selectedFolgeId || !selectedSzeneId) return
    // Sofort speichern — "letzte gesehene Szene" gilt für jede Szene, ob auto-selektiert oder manuell.
    // kein navRestored-Check: die zuletzt ANGEZEIGTE Szene ist die korrekte Rückkehrposition.
    const newMap = { ...lastSeenMapRef.current, [String(selectedFolgeId)]: selectedSzeneId }
    lastSeenMapRef.current = newMap
    // Sofort in localStorage — überlebt Unmount + schnellen Seitenwechsel (kein Datenverlust)
    try { localStorage.setItem(LS_KEY_LAST_SCENE, JSON.stringify(newMap)) } catch {}
    // Backend debounced — KEIN cleanup-return, Timer feuert auch nach Unmount
    if (saveLastSeenTimerRef.current) clearTimeout(saveLastSeenTimerRef.current)
    saveLastSeenTimerRef.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { letzte_szene_pro_episode: lastSeenMapRef.current } }).catch(() => {})
    }, 1000)
  }, [selectedSzeneId, selectedFolgeId, tweaks.letzteSzeneProEpisodeMerken, lastSeenMapRef, saveLastSeenTimerRef])

  return null
}

export default function ScriptPage() {
  const { t } = useTerminologie()
  const { focus } = useFocus()
  const location = useLocation()
  const { selectedProduction, productions, loading } = useSelectedProduction()
  const [bloecke, setBloecke] = useState<any[]>([])
  const [szenen, setSzenen] = useState<any[]>([])
  const [selectedWerkstufeTyp, setSelectedWerkstufeTyp] = useState<string | null>(null)
  const [useDokumentSzenen, setUseDokumentSzenen] = useState(false)
  const [folgenMitDaten, setFolgenMitDaten] = useState<number[]>([])
  const [folgenMeta, setFolgenMeta] = useState<Record<number, { typ?: string; version?: number; label?: string | null }>>({})
  // refreshKey: increment to force all data re-fetches
  // Initialize from Date.now() so every mount gets a unique key (forces fresh load)
  const [refreshKey, setRefreshKey] = useState(() => Date.now())

  // Auto-refresh after import event
  useEffect(() => {
    const handler = () => {
      clearCacheByPrefix('/v2/folgen/')
      clearCacheByPrefix('/werkstufen/')
      setRefreshKey(Date.now())  // refreshKey-Änderung triggert alle Data-useEffects neu
    }
    window.addEventListener('script-import-complete', handler)
    // If navigated from import with ?imported= param, clean URL
    const params = new URLSearchParams(window.location.search)
    if (params.has('imported')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => window.removeEventListener('script-import-complete', handler)
  }, [])

  // Parse deep-link URL params once on init
  // Supports ?scene=<int> (Messenger-App, old) and ?szene=<uuid> (Email-Links, NT-Liste)
  const [deepLink] = useState<{
    produktionId?: string; folgeNummer?: number; stageId?: number
    szeneId?: number; szeneUuid?: string
  } | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const scene = params.get('scene')
    const szene = params.get('szene')
    if (!scene && !szene) return null
    const produktion = params.get('produktion') || params.get('staffel')
    const folge = params.get('folge')
    const stage = params.get('stage')
    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname)
    if (szene) {
      // UUID deep-link (new system) — resolve folge_nummer async later
      return { szeneUuid: szene }
    }
    if (produktion && folge && stage) {
      return { produktionId: produktion, folgeNummer: parseInt(folge), stageId: parseInt(stage), szeneId: parseInt(scene!) }
    }
    return { szeneId: parseInt(scene!) }
  })

  // Freies Dokument: aus URL-Param ?freidok_id=<id> laden
  const [freiDokId, setFreiDokId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('freidok_id')
    if (!id) return null
    window.history.replaceState({}, '', window.location.pathname)
    return parseInt(id) || null
  })
  const [freiDokTitel, setFreiDokTitel] = useState<string | null>(null)
  const [freiDokLabel, setFreiDokLabel] = useState<string | null>(null)

  const [selectedProduktionId, setSelectedProduktionId] = useState<string>('')
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)
  const [showStatModal, setShowStatModal] = useState(false)
  const [showRadar, setShowRadar] = useState(false)
  const [showStrangPanel, setShowStrangPanel] = useState(false)
  const [showStoppzeiten, setShowStoppzeiten] = useState(false)
  const [gotoOpen, setGotoOpen] = useState(false)
  const [statSections, setStatSections] = useState<StatModalSection[]>([...DEFAULT_SECTIONS])
  const [allFolgen, setAllFolgen] = useState<any[]>([])
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedSzeneId, setSelectedSzeneId] = useState<number | string | null>(null)
  const [selectedFolgeId, setSelectedFolgeId] = useState<number | null>(null)

  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({})

  // Kommentar-Badges: lade ungelesene Counts wenn Stage wechselt
  useEffect(() => {
    if (!selectedStageId) { setCommentCounts({}); return }
    api.getSceneCommentCounts(selectedStageId).then(setCommentCounts).catch(() => {})
  }, [selectedStageId])

  // Freies Dokument laden wenn freiDokId gesetzt
  useEffect(() => {
    if (!freiDokId) return
    setSzenen([])
    setSelectedFolgeId(null)
    setSelectedSzeneId(null)
    setUseDokumentSzenen(false)
    setSelectedWerkstufeTyp(null)
    api.getFolgeV2(freiDokId)
      .then(folge => {
        setFreiDokTitel(folge.folgen_titel ?? 'Freies Dokument')
        setFreiDokLabel(folge.dokument_label ?? null)
        // ProduktionId aus dem Dokument setzen
        if (folge.produktion_id) setSelectedProduktionId(folge.produktion_id)
        return api.getWerkstufen(freiDokId)
      })
      .then(werkstufen => {
        if (!werkstufen || werkstufen.length === 0) { setUseDokumentSzenen(true); return }
        const prio = ['drehbuch', 'storyline', 'notiz']
        let matching: any[] = []
        for (const typ of prio) {
          matching = werkstufen.filter((w: any) => w.typ === typ)
          if (matching.length > 0) break
        }
        if (matching.length === 0) matching = werkstufen
        matching.sort((a: any, b: any) => b.version_nummer - a.version_nummer)
        const werk = matching.find((w: any) => (w.szenen_count ?? 0) > 0) ?? matching[0]
        if (!werk) { setUseDokumentSzenen(true); return }
        setSelectedStageId(werk.id)
        setSelectedWerkstufeTyp(werk.typ)
        api.getWerkstufenSzenen(werk.id).then(szenen => {
          setSelectedFolgeId(freiDokId)
          if (szenen.length > 0) {
            setSzenen(szenen)
            setSelectedSzeneId(szenen[0].id)
            preloadAllScenes(szenen)
          }
          setUseDokumentSzenen(true)
        }).catch(() => setUseDokumentSzenen(true))
      })
      .catch(() => {})
  }, [freiDokId, refreshKey])

  const [showSearchReplace, setShowSearchReplace] = useState(false)
  const searchReplace = useSearchReplace()

  // Ctrl+H / Cmd+H → open Search & Replace
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        setShowSearchReplace(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const [sidebarWidth, setSidebarWidth] = useState(() =>
    window.matchMedia('(pointer: coarse)').matches ? 200 : DEFAULT_WIDTH
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDragging = useRef(false)
  // Track sidebar state before entering focus mode so it can be restored on exit
  const sidebarCollapsedRef = useRef(sidebarCollapsed)
  sidebarCollapsedRef.current = sidebarCollapsed
  const prevSidebarCollapseRef = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  // Holds saved nav values during initial cascading restore; cleared after use
  const pendingNav = useRef<{
    produktionId?: string; folgeNummer?: number; stageId?: number
    szeneId?: number | string    // number (old) or UUID string (new system)
    sceneIdentityId?: string     // fallback match when szeneId doesn't exist in werkSzenen
  }>({})
  const navRestored = useRef(false)

  // Letzte-Szene-Merken: Map folge_id → szene_id
  // Synchron aus localStorage initialisieren → kein Race mit loadWerkstufen (Backend-Load ist async)
  const lastSeenMapRef = useRef<Record<string, number | string>>((() => {
    try {
      const stored = localStorage.getItem(LS_KEY_LAST_SCENE)
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })())
  // Stabile Tweaks-Ref für async-Closures (loadWerkstufen) — wird von TweaksSync befüllt.
  // HINWEIS: wird sofort von TweaksSync.render() mit tweaks (zunächst DEFAULT_TWEAKS) überschrieben.
  // loadWerkstufen liest letzteSzeneProEpisodeMerken daher direkt aus localStorage (LS_KEY_LETZTE_SZENE_TOGGLE).
  const tweaksRef = useRef<TweakState>(DEFAULT_TWEAKS)
  // Debounce-Timer für Speichern der letzten Szene
  const saveLastSeenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Throttle timestamp for keyboard navigation (max 1 navigation per interval)
  const kbSzeneLastFire = useRef(0)

  // Live refs for keyboard handler (avoid stale closures without re-registering listener)
  const bloeckeRef = useRef(bloecke)
  bloeckeRef.current = bloecke
  const selectedBlockRef = useRef(selectedBlock)
  selectedBlockRef.current = selectedBlock
  const selectedFolgeNummerRef = useRef(selectedFolgeNummer)
  selectedFolgeNummerRef.current = selectedFolgeNummer
  const selectedStageIdRef = useRef(selectedStageId)
  selectedStageIdRef.current = selectedStageId
  const szenenRef = useRef(szenen)
  szenenRef.current = szenen
  const selectedSzeneIdRef = useRef(selectedSzeneId)
  selectedSzeneIdRef.current = selectedSzeneId
  const selectedProduktionIdRef = useRef(selectedProduktionId)
  selectedProduktionIdRef.current = selectedProduktionId

  // Load user settings (sidebar + last navigation position)
  // Deep-link (?scene=...) takes priority over saved settings
  // Re-reads settings when refreshKey changes (e.g. after import)
  useEffect(() => {
    if (deepLink && !deepLink.produktionId) {
      if (deepLink.szeneUuid) {
        // UUID deep-link (new dokument_szenen system) — resolve via nav endpoint
        api.getDokumentSzeneNav(deepLink.szeneUuid).then(ctx => {
          pendingNav.current = {
            produktionId: ctx.produktion_id,
            folgeNummer: ctx.folge_nummer,
            szeneId: deepLink.szeneUuid,
            sceneIdentityId: ctx.scene_identity_id,
          }
          setSettingsLoaded(true)
        }).catch(() => setSettingsLoaded(true))
        return
      }
      // Minimal deep-link (old system) — only scene ID, need to resolve staffel/folge/stage via API
      api.getSzene(deepLink.szeneId!).then(scene =>
        api.getStage(scene.stage_id).then(stage => {
          pendingNav.current = {
            produktionId: stage.produktion_id,
            folgeNummer: stage.folge_nummer,
            stageId: stage.id,
            szeneId: deepLink.szeneId,
          }
          setSettingsLoaded(true)
        })
      ).catch(() => setSettingsLoaded(true))
      return
    }

    api.getSettings().then(s => {
      const ui = s?.ui_settings || {}
      if (typeof ui.scene_list_collapsed === 'boolean') setSidebarCollapsed(ui.scene_list_collapsed)
      if (deepLink) {
        // Full deep-link (staffel + folge + stage + scene) — override saved nav
        if (deepLink.produktionId)   pendingNav.current.produktionId   = deepLink.produktionId
        if (deepLink.folgeNummer) pendingNav.current.folgeNummer = deepLink.folgeNummer
        if (deepLink.stageId)     pendingNav.current.stageId     = deepLink.stageId
        if (deepLink.szeneId)     pendingNav.current.szeneId     = deepLink.szeneId
      } else {
        if (ui.last_produktion_id)    pendingNav.current.produktionId   = ui.last_produktion_id
        if (ui.last_folge_nummer)  pendingNav.current.folgeNummer = ui.last_folge_nummer
        if (ui.last_stage_id)      pendingNav.current.stageId     = ui.last_stage_id
        if (ui.last_szene_id)      pendingNav.current.szeneId     = ui.last_szene_id
      }
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [deepLink, refreshKey])

  // Collapse sidebar on focus-mode enter; restore on exit
  useEffect(() => {
    if (!settingsLoaded) return
    if (focus) {
      prevSidebarCollapseRef.current = sidebarCollapsedRef.current
      setSidebarCollapsed(true)
    } else {
      setSidebarCollapsed(prevSidebarCollapseRef.current)
    }
  }, [focus, settingsLoaded])

  // Debounced save layout to backend
  const saveSettings = useCallback((collapsed: boolean) => {
    if (!settingsLoaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { scene_list_collapsed: collapsed } })
        .catch(() => {})
    }, 800)
  }, [settingsLoaded])

  // Immediate save navigation position to backend
  const saveNavPosition = useCallback((
    produktionId: string, folgeNummer: number | null, stageId: number | null, szeneId: number | string | null
  ) => {
    if (!navRestored.current) return
    api.updateSettings({ ui_settings: {
      last_produktion_id:   produktionId,
      last_folge_nummer: folgeNummer,
      last_stage_id:     stageId,
      last_szene_id:     szeneId,
    }}).catch(() => {})
  }, [])

  // Szene navigation (shared by keyboard + scroll overscroll)
  const navigateSzene = useCallback((dir: 1 | -1) => {
    const currentSzenen = szenenRef.current
    const currentSzeneId = selectedSzeneIdRef.current
    const currentFolge = selectedFolgeNummerRef.current
    const currentStageId = selectedStageIdRef.current
    const produktionId = selectedProduktionIdRef.current
    if (!currentSzenen.length || currentSzeneId == null) return
    const idx = currentSzenen.findIndex(s => s.id === currentSzeneId)
    if (idx === -1) return
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= currentSzenen.length) return
    const nextSzene = currentSzenen[nextIdx]
    setSelectedSzeneId(nextSzene.id)
    navRestored.current = true  // Tastaturnavigation = explizite User-Aktion
    if (produktionId)
      api.updateSettings({ ui_settings: {
        last_produktion_id: produktionId,
        last_folge_nummer: currentFolge,
        last_stage_id: currentStageId,
        last_szene_id: nextSzene.id,
      }}).catch(() => {})
  }, [])

  // Keyboard navigation: ←→ = Szene wechseln, Strg+G = Gehe zu Szene
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      const isEditable = ['input', 'textarea', 'select'].includes(tag) || !!document.activeElement?.getAttribute('contenteditable')

      // Strg+G — Gehe zu Szene Dialog
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyG') {
        if (!isEditable) { e.preventDefault(); setGotoOpen(true) }
        return
      }

      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
      if (isEditable) return

      // ←→ — Szene wechseln, throttled auf 200ms
      e.preventDefault()
      const now = Date.now()
      if (now - kbSzeneLastFire.current < 200) return
      kbSzeneLastFire.current = now
      navigateSzene(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // empty deps — all state accessed via live refs; setGotoOpen ist stabil

  // Drag-to-resize (Mouse + Touch)
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX
    dragStartX.current = startX
    dragStartWidth.current = sidebarWidth

    const getX = (ev: MouseEvent | TouchEvent) =>
      'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX
    const getXUp = (ev: MouseEvent | TouchEvent) =>
      'changedTouches' in ev ? ev.changedTouches[0].clientX : (ev as MouseEvent).clientX

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return
      const delta = getX(ev) - dragStartX.current
      const newWidth = Math.min(window.innerWidth, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
      setSidebarWidth(newWidth)
    }
    const onUp = (ev: MouseEvent | TouchEvent) => {
      isDragging.current = false
      const delta = getXUp(ev) - dragStartX.current
      const newWidth = Math.min(window.innerWidth, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
      saveSettings(sidebarCollapsed)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as EventListener)
      window.removeEventListener('touchend', onUp as EventListener)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as EventListener, { passive: false })
    window.addEventListener('touchend', onUp as EventListener)
  }, [sidebarWidth, sidebarCollapsed, saveSettings])

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v
      saveSettings(next)
      return next
    })
  }, [saveSettings])

  // Sync selected production as staffel — wait for settings first to avoid race condition
  useEffect(() => {
    if (!selectedProduction || !settingsLoaded) return
    fetch('/api/produktionen/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        production_id: selectedProduction.id,
        title: selectedProduction.title,
        staffelnummer: selectedProduction.staffelnummer,
        projektnummer: selectedProduction.projektnummer,
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.produktion_id) setSelectedProduktionId(data.produktion_id) })
      .catch(console.error)
  }, [selectedProduction?.id, settingsLoaded])


  // Load all folgen + stat modal settings for Statistik-Panel
  useEffect(() => {
    if (!selectedProduktionId) return
    api.getFolgenV2(selectedProduktionId).then(setAllFolgen).catch(() => {})
    fetch(`/api/dk-settings/${selectedProduktionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.statistik_modal_config) {
          try {
            const parsed = JSON.parse(data.statistik_modal_config)
            if (Array.isArray(parsed)) setStatSections(parsed)
          } catch {}
        }
      })
      .catch(() => {})
  }, [selectedProduktionId, refreshKey])

  // Load Blöcke — restore saved folgeNummer by finding the right block
  useEffect(() => {
    if (!selectedProduktionId) return
    setBloecke([])
    setSelectedBlock(null)
    api.getBloecke(selectedProduktionId).then(data => {
      setBloecke(data)
      if (!data.length) return
      const savedFolge = pendingNav.current.folgeNummer
      const match = savedFolge && data.find((b: any) =>
        b.folge_von != null && savedFolge >= b.folge_von && (b.folge_bis == null || savedFolge <= b.folge_bis)
      )
      setSelectedBlock(match || data[0])
    }).catch(() => {})
  }, [selectedProduktionId, refreshKey])

  // Set default Folge when Block changes — restore saved folgeNummer if in range
  useEffect(() => {
    if (!selectedBlock) { setSelectedFolgeNummer(null); return }
    const savedFolge = pendingNav.current.folgeNummer
    const inRange = savedFolge != null
      && selectedBlock.folge_von != null
      && savedFolge >= selectedBlock.folge_von
      && (selectedBlock.folge_bis == null || savedFolge <= selectedBlock.folge_bis)
    setSelectedFolgeNummer(inRange ? savedFolge : (selectedBlock.folge_von ?? null))
  }, [selectedBlock?.proddb_id])

  // Load Szenen via werkstufen (only model since v51)
  useEffect(() => {
    if (freiDokId) return  // freies Dokument hat eigenen Load-Pfad
    if (!selectedProduktionId || selectedFolgeNummer == null) return
    setSzenen([])
    setSelectedFolgeId(null)
    setSelectedSzeneId(null)
    setUseDokumentSzenen(false)
    setSelectedWerkstufeTyp(null)

    async function loadWerkstufen() {
      try {
        const folgen = await api.getFolgenV2(selectedProduktionId)
        // Track which folgen have imported data (for UI indicators)
        setFolgenMitDaten(folgen.filter((f: any) => f.werkstufen_count > 0).map((f: any) => f.folge_nummer))
        // Meta für Dropdown (neueste Werkstufe pro Folge)
        const meta: Record<number, { typ?: string; version?: number; label?: string | null }> = {}
        for (const f of folgen as any[]) {
          if (f.latest_werkstufe) meta[f.folge_nummer] = { typ: f.latest_werkstufe.typ, version: f.latest_werkstufe.version_nummer, label: f.latest_werkstufe.label }
        }
        setFolgenMeta(meta)
        let folge = folgen.find((f: any) => f.folge_nummer === selectedFolgeNummer)
        if (!folge) {
          // Folge existiert noch nicht in der DB → anlegen, aber KEINE Werkstufe auto-erstellen
          folge = await api.createFolgeV2({ produktion_id: selectedProduktionId, folge_nummer: selectedFolgeNummer! })
          setSelectedStageId(null)
          setSelectedWerkstufeTyp(null)
          setSzenen([])
          setSelectedFolgeId(folge.id)
          setUseDokumentSzenen(true)
          return
        }
        const werkstufen = await api.getWerkstufen(folge.id)
        if (werkstufen.length === 0) {
          // Noch keine Werkstufe → Empty-State anzeigen (Auswahl per Dropdown im Editor-Header)
          setSelectedStageId(null)
          setSelectedWerkstufeTyp(null)
          setSzenen([])
          setSelectedFolgeId(folge.id)
          setUseDokumentSzenen(true)
          return
        }
        // Prefer drehbuch > storyline > notiz, then latest version
        const prio = ['drehbuch', 'storyline', 'notiz']
        let matching: any[] = []
        for (const typ of prio) {
          matching = werkstufen.filter((w: any) => w.typ === typ)
          if (matching.length > 0) break
        }
        if (matching.length === 0) matching = werkstufen
        matching.sort((a: any, b: any) => b.version_nummer - a.version_nummer)
        // Neueste nicht-leere Werkstufe bevorzugen; nur wenn alle leer → neueste nehmen
        const werk = matching.find((w: any) => (w.szenen_count ?? 0) > 0) ?? matching[0]
        if (!werk) { console.warn('[ScriptPage] No matching werkstufe'); return }
        setSelectedStageId(werk.id)
        setSelectedWerkstufeTyp(werk.typ)
        const werkSzenen = await api.getWerkstufenSzenen(werk.id)
        setSelectedFolgeId(folge.id)
        if (werkSzenen.length > 0) {
          setSzenen(werkSzenen)
          setUseDokumentSzenen(true)
          const savedSzene = pendingNav.current.szeneId
          const savedSceneIdentityId = pendingNav.current.sceneIdentityId
          // Priorität 1: Deep-Link / pendingNav
          const deepLinkMatch = (savedSzene && werkSzenen.find((s: any) => s.id === savedSzene))
            || (savedSceneIdentityId && werkSzenen.find((s: any) => s.scene_identity_id === savedSceneIdentityId))
            || null
          let targetId: number | string
          if (deepLinkMatch) {
            targetId = deepLinkMatch.id
            delete pendingNav.current.szeneId
            navRestored.current = true  // gespeicherte Position exakt gefunden
          } else {
            // Priorität 2: letzte gesehene Szene (wenn Toggle aktiv)
            const currentTweaks = tweaksRef.current
            // letzteSzeneProEpisodeMerken aus localStorage lesen — tweaksRef.current hat beim ersten
            // Aufruf noch DEFAULT_TWEAKS (false), weil TweaksSync ihn sofort überschreibt und
            // AppShell seine Settings async lädt. localStorage ist synchron und zuverlässig.
            const letzteSzeneAktiv = (() => {
              try { return localStorage.getItem(LS_KEY_LETZTE_SZENE_TOGGLE) === 'true' } catch { return false }
            })() || currentTweaks.letzteSzeneProEpisodeMerken
            let resolvedFromLastSeen = false
            if (letzteSzeneAktiv && folge.id != null) {
              const lastId = lastSeenMapRef.current[String(folge.id)]
              const lastMatch = lastId ? werkSzenen.find((s: any) => String(s.id) === String(lastId)) : null
              if (lastMatch) { targetId = lastMatch.id; resolvedFromLastSeen = true; navRestored.current = true }
            }
            if (!resolvedFromLastSeen) {
              // Priorität 3: erste echte Szene (wenn Toggle aktiv), sonst erstes Element
              // navRestored bleibt false — Fallback, nicht vom User ausgewählt; wird erst durch Klick/Tastatur gesetzt
              if (currentTweaks.episodenWechselErsteSzene || letzteSzeneAktiv) {
                const firstReal = werkSzenen.find((s: any) => s.format !== 'notiz' && s.scene_nummer != null && s.scene_nummer !== 0)
                targetId = (firstReal ?? werkSzenen[0]).id
              } else {
                targetId = werkSzenen[0].id
              }
            }
          }
          setSelectedSzeneId(targetId!)
          // Preload all scenes in background so switching is instant throughout the Folge
          preloadAllScenes(werkSzenen)
        } else {
          // Werkstufe vorhanden, aber noch keine Szenen — stageId trotzdem setzen
          // damit der "+ Neue Szene"-Button aktiv ist
          setUseDokumentSzenen(true)
        }
      } catch (err) {
        console.error('[ScriptPage] loadWerkstufen error:', err)
      }
    }
    loadWerkstufen()
  }, [selectedProduktionId, selectedFolgeNummer, refreshKey])

  // Poll unread comment counts from Messenger-App every 60s
  // TODO: Comment counts not yet implemented for new werkstufe model (UUID IDs)
  // Disabled to avoid 404 errors — re-enable when scene-comment integration is complete

  // Save navigation position when selections change
  useEffect(() => {
    if (selectedProduktionId) saveNavPosition(selectedProduktionId, selectedFolgeNummer, selectedStageId, selectedSzeneId)
  }, [selectedProduktionId, selectedFolgeNummer, selectedStageId, selectedSzeneId, saveNavPosition])

  // Preload adjacent scenes (prev + next) for instant switching
  useEffect(() => {
    if (!selectedSzeneId || !useDokumentSzenen || szenen.length < 2) return
    const idx = szenen.findIndex(s => s.id === selectedSzeneId)
    if (idx < 0) return
    const neighbors = [szenen[idx - 1], szenen[idx + 1]].filter(Boolean)
    // Small delay so the current scene loads first
    const timer = setTimeout(() => {
      for (const s of neighbors) {
        preloadScene(s.id, s.scene_identity_id, selectedStageId ? String(selectedStageId) : null)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [selectedSzeneId, szenen, useDokumentSzenen, selectedStageId])

  if (loading) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Lädt…</div>

  return (
    <AppShell
      selectedProduktionId={selectedProduktionId}
      bloecke={freiDokId ? [] : bloecke}
      selectedBlock={freiDokId ? null : selectedBlock}
      onSelectBlock={freiDokId ? undefined : (b => { pendingNav.current = {}; navRestored.current = true; setSelectedBlock(b) })}
      selectedFolgeNummer={freiDokId ? null : selectedFolgeNummer}
      onSelectFolge={freiDokId ? undefined : (nr => {
        pendingNav.current = {}; navRestored.current = true; setSelectedFolgeNummer(nr)
        if (selectedProduktionId)
          api.updateSettings({ ui_settings: { last_produktion_id: selectedProduktionId, last_folge_nummer: nr, last_stage_id: null, last_szene_id: null } }).catch(() => {})
      })}
      selectedStageId={selectedStageId}
      onSelectStage={id => { navRestored.current = true; setSelectedStageId(id) }}
      folgenMitDaten={freiDokId ? [] : folgenMitDaten}
      folgenMeta={freiDokId ? {} : folgenMeta}
      freiDokTitel={freiDokTitel}
      freiDokLabel={freiDokLabel}
    >
      <TweaksSync
        tweaksRef={tweaksRef}
        lastSeenMapRef={lastSeenMapRef}
        saveLastSeenTimerRef={saveLastSeenTimerRef}
        navRestoredRef={navRestored}
        selectedFolgeId={selectedFolgeId}
        selectedSzeneId={selectedSzeneId}
      />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>

        {/* Collapsible + resizable scene list */}
        {!sidebarCollapsed && (
          <div className="scene-list-sidebar" style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
            <SceneList
              szenen={szenen}
              selectedSzeneId={selectedSzeneId}
              onSelectSzene={(id) => {
                setSelectedSzeneId(id)
                navRestored.current = true  // User hat explizit navigiert — ab jetzt speichern
                if (selectedProduktionId)
                  api.updateSettings({ ui_settings: {
                    last_produktion_id: selectedProduktionId,
                    last_folge_nummer: selectedFolgeNummer,
                    last_stage_id: selectedStageId,
                    last_szene_id: id,
                  } }).catch(() => {})
              }}
              produktionId={selectedProduktionId}
              folgeNummer={selectedFolgeNummer}
              stageId={selectedStageId}
              onSzeneCreated={(newSzene) => {
                setSzenen(prev => [...prev, newSzene])
                setSelectedSzeneId(newSzene.id)
                if (navRestored.current && selectedProduktionId)
                  api.updateSettings({ ui_settings: {
                    last_produktion_id: selectedProduktionId,
                    last_folge_nummer: selectedFolgeNummer,
                    last_stage_id: selectedStageId,
                    last_szene_id: newSzene.id,
                  } }).catch(() => {})
              }}
              onSzeneDeleted={(id) => {
                setSzenen(prev => prev.filter(s => s.id !== id))
                if (selectedSzeneId === id) setSelectedSzeneId(null)
              }}
              onSzenesReordered={setSzenen}
              commentCounts={commentCounts}
              onOpenStatistik={() => setShowStatModal(true)}
              onOpenRadar={() => setShowRadar(v => !v)}
              onOpenSearch={() => setShowSearchReplace(true)}
              onOpenStrangPanel={() => setShowStrangPanel(v => !v)}
              onOpenStoppzeiten={() => setShowStoppzeiten(true)}
              werkstufId={selectedStageId ? String(selectedStageId) : null}
              werkstufTyp={selectedWerkstufeTyp}
            />
          </div>
        )}

        {/* Drag handle + collapse arrow */}
        <div className="scene-list-handle" onMouseDown={!sidebarCollapsed ? onDragStart : undefined} onTouchStart={!sidebarCollapsed ? onDragStart : undefined}>
          <button
            className="scene-list-collapse-btn"
            onClick={toggleCollapse}
            title={sidebarCollapsed ? `${t('szene','c')}übersicht öffnen` : `${t('szene','c')}übersicht schließen`}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Editor area — per-panel SceneEditor + DockedEditorPanels OR Strang panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {showStrangPanel && selectedProduktionId ? (
            <StrangVerwaltungModal
              produktionId={selectedProduktionId}
              open={true}
              onClose={() => setShowStrangPanel(false)}
            />
          ) : (
            <>
              {!selectedSzeneId && (
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>
                  Keine {t('szene')} ausgewählt
                </div>
              )}
              <DockedEditorPanels
                produktionId={selectedProduktionId}
                folgeNummer={freiDokId ? null : selectedFolgeNummer}
                freiDokFolgeId={freiDokId ?? undefined}
                folgeId={selectedFolgeId}
                onActiveWerkSelected={(werkId, typ) => {
                  if (!werkId) return
                  setSelectedStageId(werkId as any)
                  if (freiDokId) return
                  if (typ) setSelectedWerkstufeTyp(typ)
                  api.getWerkstufenSzenen(werkId)
                    .then(scenes => {
                      setSzenen(scenes)
                      setSelectedSzeneId(scenes.length > 0 ? scenes[0].id : null)
                    })
                    .catch(() => {})
                }}
                onSzenesNeedReload={() => {
                  if (freiDokId) { setRefreshKey(Date.now()); return }
                  if (!selectedStageId) return
                  clearCacheByPrefix(`/werkstufen/${String(selectedStageId)}/szenen`)
                  api.getWerkstufenSzenen(String(selectedStageId)).then(setSzenen).catch(() => {})
                }}
                selectedSzeneId={selectedSzeneId}
                useDokumentSzenen={useDokumentSzenen}
                stageId={selectedStageId}
                sceneIdentityId={useDokumentSzenen ? szenen.find(s => s.id === selectedSzeneId)?.scene_identity_id ?? null : null}
                onNavigateNext={() => navigateSzene(1)}
                onNavigatePrev={() => navigateSzene(-1)}
                onSzeneUpdated={(updated) => {
                  setSzenen(prev => prev.map(s => s.id === updated.id ? updated : s))
                }}
                onMarkCommentsRead={(szeneId) => {
                  setCommentCounts(prev => ({ ...prev, [szeneId]: 0 }))
                  api.markSceneCommentsRead(szeneId).catch(() => {})
                }}
              />
            </>
          )}
        </div>

        {!focus && <BreakdownPanel
          szeneId={selectedSzeneId}
          produktionId={selectedProduktionId}
          sceneIdentityId={useDokumentSzenen ? szenen.find(s => s.id === selectedSzeneId)?.scene_identity_id ?? null : null}
        />}
      </div>

      {/* Search & Replace */}
      <SearchReplaceDialog
        open={showSearchReplace}
        onClose={() => {
          setShowSearchReplace(false)
          searchReplace.clearSearch()
        }}
        currentSzeneId={typeof selectedSzeneId === 'string' ? selectedSzeneId : undefined}
        currentWerkstufenId={undefined}
        currentFolgeId={selectedFolgeNummer ?? undefined}
        currentProduktionId={selectedProduktionId || undefined}
        currentBlockNummer={selectedBlock?.block_nummer}
        productions={productions}
        // Modus
        searchMode={searchReplace.state.searchMode}
        onSetSearchMode={searchReplace.setSearchMode}
        // Editor
        editorActiveIndex={searchReplace.state.editorActiveIndex}
        editorTotal={searchReplace.state.editorTotal}
        onEditorSearch={searchReplace.searchInEditor}
        onFindNext={searchReplace.findNext}
        onFindPrev={searchReplace.findPrev}
        onReplaceCurrent={searchReplace.replaceCurrent}
        onReplaceAllEditor={searchReplace.replaceAllInEditor}
        // Backend Text
        onBackendSearch={searchReplace.searchBackend}
        onBackendReplace={async (params) => searchReplace.replaceBackend(params)}
        // Backend Szenen
        onSearchSzenen={searchReplace.searchSzenen}
        // Ergebnisse
        backendResults={searchReplace.state.results}
        backendTotal={searchReplace.state.total}
        backendTotalScenes={searchReplace.state.totalScenes}
        backendLockedCount={searchReplace.state.lockedCount}
        backendFallbackCount={false}
        backendLoading={searchReplace.state.loading}
        backendError={searchReplace.state.error}
        sceneResults={searchReplace.state.sceneResults}
        sceneTotal={searchReplace.state.sceneTotal}
        // Entity
        entityType={searchReplace.state.entityType}
        entityMatches={searchReplace.state.entityMatches}
        entityMode={searchReplace.state.entityMode}
        onCheckEntity={searchReplace.checkEntity}
        onSetEntityMode={searchReplace.setEntityMode}
        // Chips
        chips={searchReplace.state.chips}
        onAddChip={searchReplace.addChip}
        onRemoveChip={searchReplace.removeChip}
        onClearChips={searchReplace.clearChips}
        // Review
        reviewStatus={searchReplace.state.reviewStatus}
        reviewAccepted={searchReplace.state.reviewAccepted}
        reviewSkipped={searchReplace.state.reviewSkipped}
        onStartReview={searchReplace.startReview}
        onAcceptMatch={async (match) => {
          const { state } = searchReplace
          await searchReplace.acceptCurrent(match, state.query, state.replacement, state.options,
            (szeneId) => setSelectedSzeneId(szeneId))
        }}
        onSkipMatch={searchReplace.skipCurrent}
        onAcceptAll={async () => {
          const { state } = searchReplace
          await searchReplace.acceptAllRemaining(
            state.query, state.replacement, state.scope, state.scopeId,
            state.options, state.results.map(r => r.dokument_szene_id)
          )
        }}
        onFinishReview={searchReplace.finishReview}
        onResetReview={searchReplace.resetReview}
        // Rollenname
        rollennameMode={searchReplace.state.rollennameMode}
        onReplaceRollenname={async (old_name, new_name) =>
          searchReplace.replaceRollenname({ old_name, new_name, produktion_id: selectedProduktionId || '' })
        }
        // Navigation
        onNavigateToScene={(szeneId) => setSelectedSzeneId(szeneId)}
        bloecke={bloecke?.map((b: any) => ({
          block_nummer: b.block_nummer,
          folge_von: b.folge_von,
          folge_bis: b.folge_bis,
        }))}
      />

      {/* Story-Radar Panel */}
      {selectedProduktionId && (
        <StoryRadarPanel
          produktionId={selectedProduktionId}
          open={showRadar}
          onClose={() => setShowRadar(false)}
        />
      )}

      {/* Stoppzeiten-Übersicht Modal */}
      {selectedStageId && (
        <StoppzeitenModal
          open={showStoppzeiten}
          onClose={() => setShowStoppzeiten(false)}
          werkstufId={String(selectedStageId)}
        />
      )}

      {/* Gehe zu Szene Dialog */}
      {gotoOpen && (
        <GotoSzeneDialog
          szenen={szenen}
          onNavigate={id => setSelectedSzeneId(id)}
          onClose={() => setGotoOpen(false)}
        />
      )}

      {/* Statistik Modal */}
      {showStatModal && selectedProduktionId && (
        <StatistikModal
          onClose={() => setShowStatModal(false)}
          folgen={allFolgen}
          bloecke={bloecke}
          sections={statSections}
          initialFolgeNummer={selectedFolgeNummer}
          szenen={szenen}
          onNavigateToScene={(sceneNum) => {
            const match = szenen.find((s: any) => s.scene_nummer === sceneNum)
            if (match) setSelectedSzeneId(match.id)
          }}
        />
      )}
    </AppShell>
  )
}
