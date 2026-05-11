import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import type { WerkstufeMeta, SaveStatus } from '../../hooks/useDokument'
import { useCollaboration } from '../../hooks/useCollaboration'
import EditorPanelHeader from './EditorPanelHeader'
import CollaborationPresence from './CollaborationPresence'
const UniversalEditor = lazy(() => import('./UniversalEditor'))
import { api } from '../../api/client'
import { useEditorPrefs } from '../../hooks/useEditorPrefs'
import { useUserPrefs } from '../../contexts'
import { useTweaks } from '../../contexts'
import type { AbsatzFormat } from '../../tiptap/AbsatzExtension'

interface Props {
  produktionId: string
  folgeNummer: number
  folgeId: number | null
  werkstufen: WerkstufeMeta[]
  formatElements?: any[]
  defaultTyp?: string
  selectedSzeneId?: number | string | null
  useDokumentSzenen?: boolean
  onCreateWerkstufe: (typ: string) => void
  onReloadWerkstufen: () => void
  onNavigateNext?: () => void
  onNavigatePrev?: () => void
  onWerkstufSelected?: (werkId: string | null) => void
}

export default function EditorPanel({
  produktionId, folgeNummer, folgeId, werkstufen, formatElements = [],
  defaultTyp, selectedSzeneId, useDokumentSzenen, onCreateWerkstufe, onReloadWerkstufen,
  onNavigateNext, onNavigatePrev, onWerkstufSelected,
}: Props) {
  const { prefs } = useEditorPrefs()
  const { showPageShadow } = useUserPrefs()
  const { tweaks } = useTweaks()

  // Load absatzformate for this production
  const [absatzformate, setAbsatzformate] = useState<AbsatzFormat[]>([])
  useEffect(() => {
    if (!produktionId) return
    api.getAbsatzformate(produktionId)
      .then(setAbsatzformate)
      .catch(() => setAbsatzformate([]))
  }, [produktionId])

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

  const selectedWerk = werkstufen.find(w => w.id === selectedWerkId) ?? null

  // Report werkstufId changes to parent
  useEffect(() => { onWerkstufSelected?.(selectedWerkId) }, [selectedWerkId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load content for the SELECTED scene only (per-scene editing)
  const [currentSzene, setCurrentSzene] = useState<any>(null)
  const [sceneContent, setSceneContent] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }, [selectedSzeneId, selectedWerkId, useDokumentSzenen])

  // Cleanup save timer
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // Save: write content directly to the single selected scene
  const scheduleSave = useCallback((editorContent: any) => {
    if (!editorContent || !selectedSzeneId) return
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      try {
        const content = editorContent?.content ?? []
        if (useDokumentSzenen && typeof selectedSzeneId === 'string') {
          await api.updateDokumentSzene(selectedSzeneId, { content })
        } else if (typeof selectedSzeneId === 'number') {
          await api.updateSzene(selectedSzeneId, { content })
        }
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 1500)
  }, [selectedSzeneId, useDokumentSzenen])

  // Determine kategorie for format filtering
  const sceneFormat = currentSzene?.format
  const kategorie = sceneFormat ?? selectedWerk?.typ ?? 'drehbuch'

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
  const collabEnabled = selectedWerk?.sichtbarkeit === 'colab' && !isReadOnly
  const { ydoc, provider, status: collabStatus, users: collabUsers } = useCollaboration({
    fassungId: collabEnabled ? selectedWerkId : null,
    enabled: collabEnabled,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <EditorPanelHeader
        selectedWerk={selectedWerk}
        werkstufen={werkstufen}
        produktionId={produktionId}
        folgeNummer={folgeNummer}
        folgeId={folgeId}
        sceneFormat={currentSzene?.format ?? null}
        onSelectWerkstufe={setSelectedWerkId}
        onCreateWerkstufe={onCreateWerkstufe}
        onReloadWerkstufen={onReloadWerkstufen}
        onChangeSceneFormat={async (fmt) => {
          if (!currentSzene?.id || typeof currentSzene.id !== 'string') return
          try {
            await api.updateDokumentSzene(currentSzene.id, { format: fmt })
            setCurrentSzene((prev: any) => prev ? { ...prev, format: fmt } : prev)
          } catch { /* ignore */ }
        }}
      />

      {selectedWerk && currentSzene && !tweaks.sceneHeaderCompact && (
        <div className="editor-last-edited" style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}>
              {currentSzene.updated_by && (
                <span>
                  {currentSzene.updated_by}
                  {currentSzene.updated_at && `, ${new Date(currentSzene.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {textStats.chars > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {textStats.chars.toLocaleString('de-DE')}&thinsp;Z · {textStats.words.toLocaleString('de-DE')}&thinsp;W
                  {textStats.isScreenplay && <>{' · '}{textStats.sentences}&thinsp;S · {textStats.repliken}&thinsp;R</>}
                </span>
              )}
              {saveStatus !== 'idle' && (
                <span style={{
                  color: saveStatus === 'saved' ? 'var(--sw-green)' : saveStatus === 'error' ? 'var(--sw-danger)' : 'var(--text-muted)',
                  fontWeight: saveStatus === 'saved' ? 500 : 400,
                }}>
                  {saveStatus === 'saving' ? 'Speichert…' : saveStatus === 'saved' ? '● Gespeichert' : '● Fehler'}
                </span>
              )}
            </div>
          </div>
          {collabEnabled && (
            <div style={{ padding: '0 10px' }}>
              <CollaborationPresence status={collabStatus} users={collabUsers} />
            </div>
          )}
        </div>
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
                {['drehbuch', 'storyline'].map(typ => (
                  <button key={typ} onClick={() => onCreateWerkstufe(typ)}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
                    {typ}
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
              key={String(selectedSzeneId)}
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
              lineNumberMarginCm={tweaks.lineNumberMarginCm}
              showReplikNumbers={tweaks.showReplikNumbers}
              replikOffset={currentReplikOffset}
              replikBaseline={replikBaseline}
              isLocked={!!isReadOnly}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
