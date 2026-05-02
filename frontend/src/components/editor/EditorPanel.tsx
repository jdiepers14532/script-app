import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import type { WerkstufeMeta, SaveStatus } from '../../hooks/useDokument'
import { useCollaboration } from '../../hooks/useCollaboration'
import EditorPanelHeader from './EditorPanelHeader'
import CollaborationPresence from './CollaborationPresence'
const ScreenplayEditor = lazy(() => import('./ScreenplayEditor'))
const RichTextEditor = lazy(() => import('./RichTextEditor'))
import { api } from '../../api/client'
import { useEditorPrefs } from '../../hooks/useEditorPrefs'
import { useUserPrefs } from '../../contexts'

// Editor modus per werkstufe type
const EDITOR_MODUS: Record<string, 'screenplay' | 'richtext'> = {
  drehbuch: 'screenplay',
  storyline: 'richtext',
  notiz: 'richtext',
  abstrakt: 'richtext',
}

interface Props {
  staffelId: string
  folgeNummer: number
  folgeId: number | null
  werkstufen: WerkstufeMeta[]
  formatElements?: any[]
  defaultTyp?: string
  onCreateWerkstufe: (typ: string) => void
  onReloadWerkstufen: () => void
}

export default function EditorPanel({
  staffelId, folgeNummer, folgeId, werkstufen, formatElements = [],
  defaultTyp, onCreateWerkstufe, onReloadWerkstufen,
}: Props) {
  const { prefs } = useEditorPrefs()
  const { showPageShadow } = useUserPrefs()

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

  // Load scenes for selected werkstufe
  const [szenen, setSzenen] = useState<any[]>([])
  const [composedContent, setComposedContent] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!selectedWerkId) { setSzenen([]); setComposedContent(null); return }
    setLoading(true)
    api.getWerkstufenSzenen(selectedWerkId)
      .then(scenes => {
        setSzenen(scenes)
        // Compose all scenes' content into one ProseMirror doc
        const nodes: any[] = []
        for (const sz of scenes) {
          if (!sz.content) continue
          // content can be an array (raw nodes) or a doc object
          const contentNodes = Array.isArray(sz.content)
            ? sz.content
            : (sz.content?.content ?? [])
          for (const node of contentNodes) {
            nodes.push(node)
          }
        }
        setComposedContent(nodes.length > 0 ? { type: 'doc', content: nodes } : null)
      })
      .catch(() => { setSzenen([]); setComposedContent(null) })
      .finally(() => setLoading(false))
  }, [selectedWerkId])

  // Cleanup save timer
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // Save: distribute editor content back to individual dokument_szenen
  const scheduleSave = useCallback((editorContent: any) => {
    if (!editorContent || szenen.length === 0) return
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      try {
        const allNodes: any[] = editorContent?.content ?? []
        // Split nodes by scene_heading boundaries (for screenplay) or distribute evenly
        const chunks: any[][] = []
        let current: any[] = []

        for (const node of allNodes) {
          // screenplay_element with scene_heading starts a new scene
          if (node.type === 'screenplay_element' && node.attrs?.element_type === 'scene_heading') {
            if (current.length > 0) chunks.push(current)
            current = [node]
          } else {
            current.push(node)
          }
        }
        if (current.length > 0) chunks.push(current)

        // If no scene headings found (e.g. storyline), treat whole content as one chunk
        if (chunks.length === 0 && allNodes.length > 0) {
          chunks.push(allNodes)
        }

        // Map chunks back to szenen by index
        for (let i = 0; i < Math.min(chunks.length, szenen.length); i++) {
          await api.updateDokumentSzene(szenen[i].id, {
            content: chunks[i],
          })
        }
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 1500)
  }, [szenen])

  // Determine editor mode
  const editorModus = selectedWerk
    ? (EDITOR_MODUS[selectedWerk.typ] ?? 'richtext')
    : 'richtext'

  const isReadOnly = selectedWerk?.bearbeitung_status === 'gesperrt' || selectedWerk?.abgegeben

  // Collaboration
  const collabEnabled = selectedWerk?.sichtbarkeit === 'colab' && !isReadOnly
  const { ydoc, provider, status: collabStatus, users: collabUsers } = useCollaboration({
    fassungId: collabEnabled ? selectedWerkId : null,
    enabled: collabEnabled,
  })

  // Find latest edit info from szenen
  const latestSzene = szenen.reduce<any>((best, s) => {
    if (!best) return s
    return (s.updated_at ?? '') > (best.updated_at ?? '') ? s : best
  }, null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <EditorPanelHeader
        selectedWerk={selectedWerk}
        werkstufen={werkstufen}
        staffelId={staffelId}
        folgeNummer={folgeNummer}
        folgeId={folgeId}
        onSelectWerkstufe={setSelectedWerkId}
        onCreateWerkstufe={onCreateWerkstufe}
        onReloadWerkstufen={onReloadWerkstufen}
      />

      {selectedWerk && latestSzene && (
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}>
              {latestSzene.updated_by && (
                <span>
                  {latestSzene.updated_by}
                  {latestSzene.updated_at && `, ${new Date(latestSzene.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}
                </span>
              )}
              <div style={{ flex: 1 }} />
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
        ) : !composedContent && szenen.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
            Keine Szenen
          </div>
        ) : editorModus === 'screenplay' ? (
          <Suspense fallback={null}>
            <ScreenplayEditor
              initialContent={composedContent}
              onSave={isReadOnly ? undefined : scheduleSave}
              readOnly={!!isReadOnly}
              seitenformat={prefs.seitenformat}
              showShadow={showPageShadow}
              formatElements={formatElements}
              ydoc={ydoc}
              provider={provider}
              staffelId={staffelId}
            />
          </Suspense>
        ) : (
          <Suspense fallback={null}>
            <RichTextEditor
              initialContent={composedContent}
              onSave={isReadOnly ? undefined : scheduleSave}
              readOnly={!!isReadOnly}
              seitenformat={prefs.seitenformat}
              showShadow={showPageShadow}
              ydoc={ydoc}
              provider={provider}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
