import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import type { WerkstufeMeta, SaveStatus } from '../../hooks/useDokument'
import { useCollaboration } from '../../hooks/useCollaboration'
import EditorPanelHeader from './EditorPanelHeader'
import CollaborationPresence from './CollaborationPresence'
import SnapshotDrawer from './SnapshotDrawer'
const UniversalEditor = lazy(() => import('./UniversalEditor'))
import { api } from '../../api/client'
import { useEditorPrefs } from '../../hooks/useEditorPrefs'
import { useUserPrefs, useSelectedProduction } from '../../contexts'
import { useTweaks } from '../../contexts'
import type { AbsatzFormat } from '../../tiptap/AbsatzExtension'
import { useOfflineQueueContext, DokumentVorlagenEditor } from '../../sw-ui'
import { mergeVorlageWithContent } from '../../utils/mergeVorlage'
import { Clock } from 'lucide-react'
import Tooltip from '../Tooltip'
import NeueWerkstufeModal, { type NeueWerkstufeParams } from '../NeueWerkstufeModal'
import PlatzhalterSzenenDialog from '../PlatzhalterSzenenDialog'

interface Props {
  produktionId: string
  folgeNummer: number
  folgeId: number | null
  werkstufen: WerkstufeMeta[]
  formatElements?: any[]
  defaultTyp?: string
  selectedSzeneId?: number | string | null
  useDokumentSzenen?: boolean
  activateWerkId?: string | null
  onCreateWerkstufe: (typ: string) => void
  onReloadWerkstufen: () => void | Promise<void>
  onNavigateNext?: () => void
  onNavigatePrev?: () => void
  onWerkstufSelected?: (werkId: string | null) => void
  onNewWerkCreated?: (newWerkId: string, oldWerkId: string | null) => void
}

export default function EditorPanel({
  produktionId, folgeNummer, folgeId, werkstufen, formatElements = [],
  defaultTyp, selectedSzeneId, useDokumentSzenen, activateWerkId,
  onCreateWerkstufe, onReloadWerkstufen,
  onNavigateNext, onNavigatePrev, onWerkstufSelected, onNewWerkCreated,
}: Props) {
  const { prefs } = useEditorPrefs()
  const { showPageShadow } = useUserPrefs()
  const { tweaks } = useTweaks()
  const { enqueue } = useOfflineQueueContext()
  const { selectedProduction } = useSelectedProduction()

  // ── State declarations (all before first useEffect to prevent TDZ in minified builds) ──
  const [absatzformate, setAbsatzformate] = useState<AbsatzFormat[]>([])
  const [currentSzene, setCurrentSzene] = useState<any>(null)
  const [sceneContent, setSceneContent] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [vorlagen, setVorlagen] = useState<Array<{ id: string; name: string; zeilennummerierung_unterbinden?: boolean; body_content?: any }>>([])
  const [vorlagePreviewData, setVorlagePreviewData] = useState<any>(null)
  const [showVorlagePreview, setShowVorlagePreview] = useState(false)
  const [isApplyingVorlage, setIsApplyingVorlage] = useState(false)
  const [formatConfirmOpen, setFormatConfirmOpen] = useState(false)
  const [pendingFmt, setPendingFmt] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Neue Werkstufe Modal ──────────────────────────────────────────────────
  const [neueFassungModal, setNeueFassungModal] = useState<'drehbuch' | 'storyline' | null>(null)
  const [platzhalterWerkId, setPlatzhalterWerkId] = useState<string | null>(null)

  // ── Template content reset (Stockshot-Template applied in SceneEditor) ───
  const [contentResetCounter, setContentResetCounter] = useState(0)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.szeneId === selectedSzeneId || detail?.szeneId === String(selectedSzeneId)) {
        setContentResetCounter(c => c + 1)
      }
    }
    window.addEventListener('template-content-applied', handler)
    return () => window.removeEventListener('template-content-applied', handler)
  }, [selectedSzeneId])

  // ── Snapshot state ────────────────────────────────────────────────────────
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSnapshotContentRef = useRef<string>('')   // JSON-string of last snapshotted content
  const pendingSnapshotContentRef = useRef<any>(null) // latest editor content awaiting snapshot

  useEffect(() => {
    if (!produktionId) return
    api.getAbsatzformate(produktionId)
      .then(setAbsatzformate)
      .catch(() => setAbsatzformate([]))
  }, [produktionId])

  // Load dokument_vorlagen for notiz vorlage selector
  useEffect(() => {
    if (!produktionId) return
    api.getDokumentVorlagen(produktionId)
      .then((list: any[]) => setVorlagen(list.map(v => ({
        id: v.id,
        name: v.name,
        zeilennummerierung_unterbinden: v.zeilennummerierung_unterbinden ?? false,
        body_content: typeof v.body_content === 'string' ? JSON.parse(v.body_content) : v.body_content,
      }))))
      .catch(() => setVorlagen([]))
  }, [produktionId])

  // Load full vorlage data when vorlage_id changes (for preview)
  useEffect(() => {
    const vid = currentSzene?.vorlage_id
    setShowVorlagePreview(false)
    if (!vid || !produktionId) { setVorlagePreviewData(null); return }
    api.getDokumentVorlage(produktionId, vid)
      .then(setVorlagePreviewData)
      .catch(() => setVorlagePreviewData(null))
  }, [currentSzene?.vorlage_id, produktionId])

  // Panel state: which werkstufe is selected
  const [selectedWerkId, setSelectedWerkId] = useState<string | null>(null)
  const initialApplied = useRef(false)

  // Auto-select preferred werkstufe type once on first load
  useEffect(() => {
    if (initialApplied.current || werkstufen.length === 0) return
    initialApplied.current = true
    const preferred = defaultTyp
      ? werkstufen.filter(w => w.typ === defaultTyp).sort((a, b) => b.version_nummer - a.version_nummer)[0]
      : null
    setSelectedWerkId(preferred?.id ?? werkstufen[0]?.id ?? null)
  }, [werkstufen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Force-select activateWerkId when it changes (dual-view activation from modal)
  useEffect(() => {
    if (!activateWerkId) return
    if (werkstufen.some(w => w.id === activateWerkId)) {
      setSelectedWerkId(activateWerkId)
    }
  }, [activateWerkId, werkstufen])

  const selectedWerk = werkstufen.find(w => w.id === selectedWerkId) ?? null

  // Report werkstufId changes to parent
  useEffect(() => { onWerkstufSelected?.(selectedWerkId) }, [selectedWerkId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Neue Werkstufe: confirm handler
  const handleNeueFassungConfirm = useCallback(async (params: NeueWerkstufeParams) => {
    if (!folgeId) return
    const oldWerkId = selectedWerkId
    setNeueFassungModal(null)
    try {
      const newWerk = await api.createWerkstufe(folgeId, {
        typ: params.typ,
        mode: params.mode === 'platzhalter' ? 'empty' : params.mode,
        vorgaenger_id: params.vorgaenger_id,
        kopiere_notizen: params.kopiere_notizen,
      })
      await onReloadWerkstufen()
      setSelectedWerkId(newWerk.id)
      if (params.dualview) {
        onNewWerkCreated?.(newWerk.id, oldWerkId)
      }
      if (params.mode === 'platzhalter') {
        setPlatzhalterWerkId(newWerk.id)
      }
    } catch (err) {
      console.error('Fehler beim Erstellen der Werkstufe:', err)
    }
  }, [folgeId, selectedWerkId, onReloadWerkstufen, onNewWerkCreated])

  // Load content for the SELECTED scene only (per-scene editing)
  useEffect(() => {
    if (!selectedSzeneId || !selectedWerkId) { setCurrentSzene(null); setSceneContent(null); return }
    setLoading(true)

    // For werkstufen-based scenes (dokument_szenen), load by szene ID directly
    if (useDokumentSzenen && typeof selectedSzeneId === 'string') {
      api.getDokumentSzene(selectedSzeneId)
        .then(sz => {
          setCurrentSzene(sz)
          const nodes = Array.isArray(sz.content) ? sz.content : (sz.content?.content ?? [])
          setSceneContent(nodes.length > 0 ? { type: 'doc', content: nodes } : null)
        })
        .catch((err) => { console.error('Load dokument-szene error:', err); setCurrentSzene(null); setSceneContent(null) })
        .finally(() => setLoading(false))
    } else if (typeof selectedSzeneId === 'number') {
      // Legacy szenen
      api.getSzene(selectedSzeneId)
        .then(sz => {
          setCurrentSzene(sz)
          const nodes = Array.isArray(sz.content) ? sz.content : (sz.content?.content ?? [])
          setSceneContent(nodes.length > 0 ? { type: 'doc', content: nodes } : null)
        })
        .catch((err) => { console.error('Load szene error:', err); setCurrentSzene(null); setSceneContent(null) })
        .finally(() => setLoading(false))
    } else {
      setCurrentSzene(null); setSceneContent(null); setLoading(false)
    }
  }, [selectedSzeneId, selectedWerkId, useDokumentSzenen, contentResetCounter])

  // Cleanup save timer
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // ── Snapshot helpers ──────────────────────────────────────────────────────
  // Only for dokument_szenen (new model) — isReadOnly guard handled by caller
  const canSnapshot = useDokumentSzenen && typeof selectedSzeneId === 'string'

  /** Extract plain text from Tiptap JSON for human-readable preview */
  const extractTextPreview = useCallback((content: any): string => {
    const nodes = Array.isArray(content) ? content : (content?.content ?? [])
    const texts: string[] = []
    const visit = (node: any) => {
      if (typeof node?.text === 'string') texts.push(node.text)
      if (Array.isArray(node?.content)) node.content.forEach(visit)
    }
    nodes.forEach(visit)
    return texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 150)
  }, [])

  const fireSnapshot = useCallback(async (content: any) => {
    if (!canSnapshot || !selectedSzeneId || typeof selectedSzeneId !== 'string') return
    const json = JSON.stringify(content)
    if (json === lastSnapshotContentRef.current) return // no change since last snapshot
    try {
      const szNr = currentSzene?.scene_nummer != null
        ? `${currentSzene.scene_nummer}${currentSzene.scene_nummer_suffix ?? ''}`
        : null
      const szInfo = currentSzene?.ort_name ?? null
      await api.createSnapshot(selectedSzeneId, {
        content,
        szene_nummer: szNr,
        szene_info: szInfo,
        text_preview: extractTextPreview(content),
      })
      lastSnapshotContentRef.current = json
    } catch { /* non-critical */ }
  }, [canSnapshot, selectedSzeneId, currentSzene, extractTextPreview])

  // Schedule idle snapshot: 5 min after last editor change
  const scheduleSnapshot = useCallback((content: any) => {
    if (!canSnapshot) return
    pendingSnapshotContentRef.current = content
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
    snapshotTimerRef.current = setTimeout(() => {
      if (pendingSnapshotContentRef.current) fireSnapshot(pendingSnapshotContentRef.current)
    }, 5 * 60 * 1000)
  }, [canSnapshot, fireSnapshot])

  // On scene change: flush snapshot for previous scene if content changed
  const prevSzeneIdRef = useRef<string | null>(null)
  const prevSzeneMetaRef = useRef<{ nr: string | null; info: string | null }>({ nr: null, info: null })
  useEffect(() => {
    const prev = prevSzeneIdRef.current
    if (prev && pendingSnapshotContentRef.current) {
      // fire immediately for the PREVIOUS scene — use cached metadata
      const content = pendingSnapshotContentRef.current
      const meta = prevSzeneMetaRef.current
      api.createSnapshot(prev, {
        content,
        szene_nummer: meta.nr,
        szene_info: meta.info,
        text_preview: extractTextPreview(content),
      }).catch(() => {})
      pendingSnapshotContentRef.current = null
    }
    prevSzeneIdRef.current = typeof selectedSzeneId === 'string' ? selectedSzeneId : null
    prevSzeneMetaRef.current = { nr: null, info: null } // reset — will be updated on next save
    lastSnapshotContentRef.current = '' // reset baseline for new scene
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
  }, [selectedSzeneId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep prevSzeneMetaRef up to date with current scene metadata
  useEffect(() => {
    if (!currentSzene) return
    prevSzeneMetaRef.current = {
      nr: currentSzene.scene_nummer != null
        ? `${currentSzene.scene_nummer}${currentSzene.scene_nummer_suffix ?? ''}`
        : null,
      info: currentSzene.ort_name ?? null,
    }
  }, [currentSzene?.scene_nummer, currentSzene?.scene_nummer_suffix, currentSzene?.ort_name])

  // Cleanup snapshot timer on unmount
  useEffect(() => () => { if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current) }, [])

  // ── Session Heartbeat (Szenario 1 + 3: Aktivitätserkennung) ──────────────
  // DSGVO: nur last_active_at — kein Aktivitätslog. Framing: Autorenschutz.
  const [otherActiveUsers, setOtherActiveUsers] = useState<Array<{ user_name: string; last_active_at: string }>>([])
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sendHeartbeat = useCallback(async () => {
    if (!selectedWerkId) return
    try { await api.sessionHeartbeat(selectedWerkId) } catch { /* non-critical */ }
  }, [selectedWerkId])
  const loadOtherUsers = useCallback(async () => {
    if (!selectedWerkId) return
    try {
      const users = await api.getSessionUsers(selectedWerkId)
      setOtherActiveUsers(Array.isArray(users) ? users : [])
    } catch { /* non-critical */ }
  }, [selectedWerkId])
  useEffect(() => {
    if (!selectedWerkId) {
      setOtherActiveUsers([])
      return
    }
    sendHeartbeat()
    loadOtherUsers()
    heartbeatRef.current = setInterval(() => { sendHeartbeat(); loadOtherUsers() }, 7 * 60 * 1000)
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      // End session on unmount (werkstufe deselected or page unloaded)
      if (selectedWerkId) {
        api.sessionEnd(selectedWerkId).catch(() => {})
      }
    }
  }, [selectedWerkId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save: write content directly to the single selected scene
  const scheduleSave = useCallback((editorContent: any) => {
    if (!editorContent || !selectedSzeneId) return
    setSaveStatus('saving')
    scheduleSnapshot(editorContent)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      const content = editorContent?.content ?? []
      try {
        if (useDokumentSzenen && typeof selectedSzeneId === 'string') {
          const updated = await api.updateDokumentSzene(selectedSzeneId, { content })
          // Track updated_at for conflict detection (Tier 2)
          if (updated?.updated_at) {
            setCurrentSzene((prev: any) => prev ? { ...prev, updated_at: updated.updated_at } : prev)
          }
        } else if (typeof selectedSzeneId === 'number') {
          await api.updateSzene(selectedSzeneId, { content })
        }
        setSaveStatus('saved')
      } catch (err) {
        // TypeError = Netzwerkfehler (offline) → in IndexedDB-Queue einreihen
        // Sonstige Fehler (404, 500) = Serverfehler → nicht enqueuen, still verwerfen
        if (err instanceof TypeError) {
          const url = useDokumentSzenen && typeof selectedSzeneId === 'string'
            ? `/api/dokument-szenen/${selectedSzeneId}`
            : `/api/szenen/${selectedSzeneId}`
          const client_version = currentSzene?.updated_at
          enqueue('PUT', url, {
            content,
            _meta: { szene: currentSzene?.scene_nummer, ort: currentSzene?.ort_name },
          }, client_version)
          setSaveStatus('queued')
        } else {
          setSaveStatus('saved')
        }
      }
    }, 1500)
  }, [selectedSzeneId, useDokumentSzenen, currentSzene, enqueue, scheduleSnapshot])

  // Determine kategorie for format filtering
  const sceneFormat = currentSzene?.format
  const kategorie = sceneFormat ?? selectedWerk?.typ ?? 'drehbuch'

  // ── Revision data ─────────────────────────────────────────────────────────
  const [changedBlocks, setChangedBlocks] = useState<Set<number>>(new Set())
  const [revisionColor, setRevisionColor] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedSzeneId) { setChangedBlocks(new Set()); setRevisionColor(null); return }
    const loadRevisions = useDokumentSzenen && typeof selectedSzeneId === 'string'
      ? api.getDokumentSzeneRevisionen(selectedSzeneId)
      : typeof selectedSzeneId === 'number'
        ? api.getSzeneRevisionen(selectedSzeneId)
        : null
    if (!loadRevisions) { setChangedBlocks(new Set()); setRevisionColor(null); return }
    loadRevisions
      .then(deltas => {
        const changed = new Set<number>()
        deltas.forEach((d: any) => {
          if (d.field_type === 'content_block' && d.block_index != null) changed.add(d.block_index)
        })
        setChangedBlocks(changed)
        const colorDelta = deltas.find((d: any) => d.revision_color)
        setRevisionColor(colorDelta?.revision_color ?? null)
      })
      .catch(() => { setChangedBlocks(new Set()); setRevisionColor(null) })
  }, [selectedSzeneId, useDokumentSzenen])

  // ── Replik offsets for numbering ──────────────────────────────────────────
  const [replikOffsets, setReplikOffsets] = useState<Record<string, number>>({})
  const [replikBaseline, setReplikBaseline] = useState<any[] | null>(null)

  useEffect(() => {
    if (!selectedWerkId || !tweaks.showReplikNumbers) { setReplikOffsets({}); setReplikBaseline(null); return }
    api.getReplikOffsets(selectedWerkId)
      .then(data => {
        setReplikOffsets(data.offsets ?? {})
        setReplikBaseline(data.baseline ?? null)
      })
      .catch(() => { setReplikOffsets({}); setReplikBaseline(null) })
  }, [selectedWerkId, tweaks.showReplikNumbers, selectedSzeneId])

  const currentReplikOffset = selectedSzeneId ? (replikOffsets[String(selectedSzeneId)] ?? 0) : 0

  // Live text statistics from current scene content
  const textStats = useMemo(() => {
    const c = currentSzene?.content
    if (!c) return { chars: 0, words: 0, sentences: 0, repliken: 0, isScreenplay: false }
    const nodes: any[] = Array.isArray(c) ? c : (c?.content ?? [])
    let fullText = ''
    let repliken = 0
    let isScreenplay = false
    for (const node of nodes) {
      if (!node) continue
      if (node.type === 'screenplay_element') {
        isScreenplay = true
        if (node.attrs?.element_type === 'character') repliken++
      }
      const text = node.content?.map((ch: any) => ch.text ?? '').join('') ?? ''
      if (text) fullText += (fullText ? '\n' : '') + text
    }
    const chars = fullText.length
    const words = fullText.trim() ? fullText.trim().split(/\s+/).length : 0
    const sentences = fullText.trim() ? (fullText.match(/[.!?]+/g) || []).length : 0
    return { chars, words, sentences, repliken, isScreenplay }
  }, [currentSzene?.content])

  const isReadOnly = selectedWerk?.bearbeitung_status === 'gesperrt' || selectedWerk?.abgegeben

  // Collaboration
  const collabEnabled = (selectedWerk?.sichtbarkeit?.startsWith('colab:') ?? false) && !isReadOnly
  const { ydoc, provider, status: collabStatus, users: collabUsers, idbReady } = useCollaboration({
    fassungId: collabEnabled ? selectedWerkId : null,
    enabled: collabEnabled,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <EditorPanelHeader
        selectedWerk={selectedWerk}
        werkstufen={werkstufen}
        produktionId={produktionId}
        folgeNummer={folgeNummer}
        folgeId={folgeId}
        sceneFormat={currentSzene?.format ?? null}
        onSelectWerkstufe={setSelectedWerkId}
        onCreateWerkstufe={onCreateWerkstufe}
        onNeueFassungClick={folgeId ? (typ) => setNeueFassungModal(typ) : undefined}
        onReloadWerkstufen={onReloadWerkstufen}
        onChangeSceneFormat={async (fmt) => {
          if (!currentSzene?.id || typeof currentSzene.id !== 'string') return
          // If body has content, show confirmation first (destructive)
          const hasContent = (() => {
            const c = currentSzene?.content
            if (!c) return false
            const nodes = Array.isArray(c) ? c : (c?.content ?? [])
            return nodes.length > 0
          })()
          if (hasContent) {
            setPendingFmt(fmt)
            setFormatConfirmOpen(true)
            return
          }
          try {
            await api.updateDokumentSzene(currentSzene.id, { format: fmt })
            setCurrentSzene((prev: any) => prev ? { ...prev, format: fmt } : prev)
          } catch { /* ignore */ }
        }}
        saveStatus={saveStatus}
        updatedBy={currentSzene?.updated_by ?? null}
        updatedAt={currentSzene?.updated_at ?? null}
        collabSlot={collabEnabled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!idbReady && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Lädt…</span>
            )}
            <CollaborationPresence status={collabStatus} users={collabUsers} />
          </div>
        ) : undefined}
        rightSlot={canSnapshot ? (
          <Tooltip text="Verlauf — Auto-Sicherungen">
            <button
              onClick={() => setSnapshotOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: 5,
                border: `1px solid ${snapshotOpen ? 'var(--text-muted)' : 'var(--border)'}`,
                background: snapshotOpen ? 'var(--bg-subtle)' : 'transparent',
                color: snapshotOpen ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <Clock size={12} />
            </button>
          </Tooltip>
        ) : undefined}
      />

      {/* ── Szenario 3: Andere User aktiv auf derselben Werkstufe ── */}
      {otherActiveUsers.length > 0 && !collabEnabled && (
        <div style={{
          padding: '7px 14px',
          background: 'rgba(255,149,0,0.08)',
          borderBottom: '1px solid rgba(255,149,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
          color: '#FF9500',
        }}>
          <span style={{ fontWeight: 600 }}>⚠</span>
          {otherActiveUsers.length === 1
            ? `${otherActiveUsers[0].user_name} hat diese Werkstufe zuletzt bearbeitet und könnte offline sein.`
            : `${otherActiveUsers.map(u => u.user_name).join(', ')} sind auf dieser Werkstufe aktiv.`
          }
          {' '}Deine Änderungen könnten beim nächsten Sync zu einem Konflikt führen.
        </div>
      )}

      {/* ── Notiz-Vorlage-Selector (WYSIWYG-Merge) ── */}
      {currentSzene?.format === 'notiz' && vorlagen.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Vorlage</span>
          <select
            value=""
            disabled={isApplyingVorlage}
            onChange={async (e) => {
              const vorlageId = e.target.value
              if (!vorlageId || !currentSzene?.id) return
              const vorlageItem = vorlagen.find(v => v.id === vorlageId)
              if (!vorlageItem?.body_content) return  // Vorlage hat keinen WYSIWYG-Body
              setIsApplyingVorlage(true)
              try {
                // Originaltext: pre_vorlage_content hat Priorität (falls Vorlage schon angewendet wurde)
                const rawContent = currentSzene?.content
                const preVorlage = currentSzene?.pre_vorlage_content
                const sourceContent = preVorlage ?? rawContent
                const sourceNodes: any[] = Array.isArray(sourceContent)
                  ? sourceContent
                  : (sourceContent?.content ?? [])

                // Chip-Werte für die Auflösung zusammenbauen
                const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                const werkTypLabel = (typ: string) =>
                  ({ storyline: 'Storyline', drehbuch: 'Drehbuch', notiz: 'Notiz', treatment: 'Treatment' }[typ] ?? typ)
                const chipValues: Record<string, string> = {
                  '{{produktion}}':       selectedProduction?.title ?? '',
                  '{{staffel}}':          selectedProduction?.staffelnummer ? String(selectedProduction.staffelnummer) : '',
                  '{{folge}}':            folgeNummer ? String(folgeNummer) : '',
                  '{{aktuelles_datum}}':  today,
                  '{{stand_datum}}':      today,
                  '{{aktuelles_jahr}}':   String(new Date().getFullYear()),
                  '{{aktuelles_uhrzeit}}': new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                  '{{werkstufe}}':        selectedWerk?.typ ? werkTypLabel(selectedWerk.typ) : '',
                  '{{fassung}}':          selectedWerk?.label ?? '',
                  '{{version}}':          selectedWerk?.version_nummer ? `V${selectedWerk.version_nummer}` : '',
                }

                // Merge: Vorlage-Body + Szenentext + Chip-Werte → finales Tiptap-Dokument (reiner Text, keine Chips)
                const merged = mergeVorlageWithContent(vorlageItem.body_content, sourceNodes, chipValues)

                // Editor sofort aktualisieren (Remount via contentResetCounter)
                setSceneContent(merged)
                setContentResetCounter(c => c + 1)
                setCurrentSzene((prev: any) => prev
                  ? { ...prev, vorlage_id: vorlageId, content: merged.content, wysiwyg_merged: true,
                      pre_vorlage_content: prev.pre_vorlage_content ?? sourceContent }
                  : prev
                )
                setVorlagePreviewData(vorlageItem)

                // Persistieren: gemergter Content + vorlage_id + wysiwyg_merged-Flag
                await api.updateDokumentSzene(currentSzene.id, {
                  content: merged.content,
                  vorlage_id: vorlageId,
                  wysiwyg_merged: true,
                  ...(!currentSzene.pre_vorlage_content && { pre_vorlage_content: sourceContent }),
                })
              } catch (err) {
                console.error('[Vorlage apply]', err)
              } finally { setIsApplyingVorlage(false) }
            }}
            style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', maxWidth: 220, opacity: isApplyingVorlage ? 0.5 : 1 }}
          >
            <option value="">{isApplyingVorlage ? 'Wird eingefügt…' : '– Vorlage einfügen –'}</option>
            {vorlagen.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          {currentSzene?.vorlage_id && vorlagePreviewData && (
            <button
              onClick={() => setShowVorlagePreview(true)}
              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              Vorschau
            </button>
          )}
        </div>
      )}

      {/* ── Vorlage-Vorschau Modal ── */}
      {showVorlagePreview && vorlagePreviewData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '40px 24px 24px' }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Vorlage: {vorlagePreviewData.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>Vorschau (nur lesen)</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setShowVorlagePreview(false)}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              >
                Schließen
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <DokumentVorlagenEditor
                value={{
                  body_content: vorlagePreviewData.body_content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
                  kopfzeile_content: vorlagePreviewData.kopfzeile_content ?? { links: null, mitte: null, rechts: null },
                  fusszeile_content: vorlagePreviewData.fusszeile_content ?? { links: null, mitte: null, rechts: null },
                  kopfzeile_aktiv: vorlagePreviewData.kopfzeile_aktiv ?? false,
                  fusszeile_aktiv: vorlagePreviewData.fusszeile_aktiv ?? false,
                  erste_seite_kein_header: vorlagePreviewData.erste_seite_kein_header ?? true,
                  seiten_layout: vorlagePreviewData.seiten_layout ?? { format: 'a4', margin_top: 25, margin_bottom: 25, margin_left: 25, margin_right: 25 },
                }}
                onChange={() => {}}
                readOnly
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Format-Wechsel Bestätigung ── */}
      {formatConfirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '24px 28px', maxWidth: 380, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.35)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Format wechseln?</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Der aktuelle Szeneninhalt wird beim Wechsel des Formats gelöscht. Der Szenenkopf bleibt erhalten.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setFormatConfirmOpen(false); setPendingFmt(null) }}
                style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
                Abbrechen
              </button>
              <button onClick={async () => {
                const fmt = pendingFmt
                setFormatConfirmOpen(false)
                setPendingFmt(null)
                if (!fmt || !currentSzene?.id) return
                try {
                  await api.updateDokumentSzene(currentSzene.id, { format: fmt, clear_content: true })
                  setCurrentSzene((prev: any) => prev ? { ...prev, format: fmt, content: null } : prev)
                  setSceneContent(null)
                } catch { /* ignore */ }
              }} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'var(--sw-danger)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                Format wechseln & Inhalt löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Snapshot Drawer ── */}
      {snapshotOpen && canSnapshot && typeof selectedSzeneId === 'string' && (
        <SnapshotDrawer
          szeneId={selectedSzeneId}
          szeneNummer={currentSzene?.scene_nummer != null
            ? `${currentSzene.scene_nummer}${currentSzene.scene_nummer_suffix ?? ''}`
            : null}
          szeneInfo={currentSzene?.ort_name ?? null}
          sceneUpdatedAt={currentSzene?.updated_at ?? null}
          sceneUpdatedBy={currentSzene?.updated_by ?? null}
          onRestore={(content) => {
            // Set restored content into editor via sceneContent state
            const nodes = Array.isArray(content) ? content : (content?.content ?? [])
            setSceneContent(nodes.length > 0 ? { type: 'doc', content: nodes } : null)
            setCurrentSzene((prev: any) => prev ? { ...prev, content } : prev)
            // Persist immediately
            api.updateDokumentSzene(selectedSzeneId as string, { content: nodes }).catch(() => {})
            setSnapshotOpen(false)
          }}
          onClose={() => setSnapshotOpen(false)}
        />
      )}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
            Lädt…
          </div>
        ) : !selectedWerk ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {werkstufen.length === 0 ? 'Keine Werkstufen vorhanden' : 'Werkstufe auswählen'}
            </p>
            {werkstufen.length === 0 && folgeId && (
              <div style={{ display: 'flex', gap: 8 }}>
                {(['drehbuch', 'storyline'] as const).map(typ => (
                  <button key={typ} onClick={() => setNeueFassungModal(typ)}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
                    + {typ === 'drehbuch' ? 'Drehbuch' : 'Storyline'}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : !selectedSzeneId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
            Szene auswählen
          </div>
        ) : !sceneContent && !currentSzene ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
            Kein Inhalt
          </div>
        ) : (
          <Suspense fallback={null}>
            <UniversalEditor
              key={`${selectedSzeneId}-${contentResetCounter}`}
              initialContent={sceneContent}
              onSave={isReadOnly ? undefined : scheduleSave}
              readOnly={!!isReadOnly}
              seitenformat={prefs.seitenformat}
              showShadow={showPageShadow}
              formatElements={formatElements}
              absatzformate={absatzformate}
              kategorie={kategorie}
              ydoc={ydoc}
              provider={provider}
              produktionId={produktionId}
              onNavigateNext={onNavigateNext}
              onNavigatePrev={onNavigatePrev}
              showLineNumbers={tweaks.showLineNumbers}
              suppressLineNumbers={!!(currentSzene?.vorlage_id && vorlagen.find(v => v.id === currentSzene.vorlage_id)?.zeilennummerierung_unterbinden)}
              lineNumberMarginCm={tweaks.lineNumberMarginCm}
              showReplikNumbers={tweaks.showReplikNumbers}
              replikOffset={currentReplikOffset}
              replikBaseline={replikBaseline}
              isLocked={!!isReadOnly}
              changedBlocks={changedBlocks}
              revisionColor={revisionColor}
            />
          </Suspense>
        )}
      </div>

      {/* Neue Werkstufe Modal */}
      {neueFassungModal && folgeId && (
        <NeueWerkstufeModal
          requestedTyp={neueFassungModal}
          werkstufen={werkstufen}
          folgeNummer={folgeNummer}
          produktionId={produktionId}
          onConfirm={handleNeueFassungConfirm}
          onClose={() => setNeueFassungModal(null)}
        />
      )}

      {/* Platzhalter-Szenen Dialog (after neue werkstufe creation) */}
      {platzhalterWerkId && (
        <PlatzhalterSzenenDialog
          werkstufId={platzhalterWerkId}
          produktionId={produktionId}
          open={true}
          onClose={() => setPlatzhalterWerkId(null)}
          onCreated={() => setPlatzhalterWerkId(null)}
        />
      )}
    </div>
  )
}
