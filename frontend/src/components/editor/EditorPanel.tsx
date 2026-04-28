import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useFassung, useFassungContent } from '../../hooks/useDokument'
import type { DokumentMeta, FassungMeta } from '../../hooks/useDokument'
import { useCollaboration } from '../../hooks/useCollaboration'
import EditorPanelHeader from './EditorPanelHeader'
import LastEditedRow from './LastEditedRow'
import CollaborationPresence from './CollaborationPresence'
const ScreenplayEditor = lazy(() => import('./ScreenplayEditor'))
const RichTextEditor = lazy(() => import('./RichTextEditor'))
import { api } from '../../api/client'
import { useEditorPrefs } from '../../hooks/useEditorPrefs'
import { useUserPrefs } from '../../App'

// Editor modus per document type
const EDITOR_MODUS: Record<string, 'screenplay' | 'richtext'> = {
  drehbuch: 'screenplay',
  storyline: 'richtext',
  notiz: 'richtext',
  abstrakt: 'richtext',
}

interface Props {
  staffelId: string
  folgeNummer: number
  allDokumente: DokumentMeta[]
  customTypen?: { name: string; editor_modus: string }[]
  formatElements?: any[]
  defaultTyp?: string
  onCreateDokument: (typ: string) => void
  onReloadDokumente: () => void
}

export default function EditorPanel({
  staffelId, folgeNummer, allDokumente, customTypen = [], formatElements = [],
  defaultTyp, onCreateDokument, onReloadDokumente,
}: Props) {
  const { prefs } = useEditorPrefs()
  const { showPageShadow } = useUserPrefs()

  // Panel state: which document and fassung are selected
  const [selectedDokumentId, setSelectedDokumentId] = useState<string | null>(null)
  const initialTypApplied = useRef(false)

  // Auto-select preferred document type once on first load
  useEffect(() => {
    if (initialTypApplied.current || allDokumente.length === 0) return
    initialTypApplied.current = true
    const preferred = defaultTyp ? allDokumente.find(d => d.typ === defaultTyp) : null
    setSelectedDokumentId(preferred?.id ?? allDokumente[0]?.id ?? null)
  }, [allDokumente]) // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedFassungId, setSelectedFassungId] = useState<string | null>(null)

  const selectedDokument = allDokumente.find(d => d.id === selectedDokumentId) ?? null
  const { fassungen, reload: reloadFassungen } = useFassung(selectedDokumentId)
  const { fassung, loading: contentLoading, saveStatus, scheduleSave } = useFassungContent(selectedDokumentId, selectedFassungId)

  // Auto-select latest fassung when document changes
  useEffect(() => {
    if (fassungen.length > 0 && !selectedFassungId) {
      const latest = fassungen[fassungen.length - 1]
      setSelectedFassungId(latest.id)
    }
  }, [fassungen, selectedFassungId])

  // Reset fassung selection when document changes
  const handleSelectDokument = (dokumentId: string) => {
    setSelectedDokumentId(dokumentId)
    setSelectedFassungId(null)
  }

  const handleCreateFassung = async () => {
    if (!selectedDokumentId) return
    try {
      await api.createFassung(selectedDokumentId, {})
      await reloadFassungen()
    } catch (e: any) {
      alert('Fehler beim Erstellen der Fassung: ' + e.message)
    }
  }

  const handleFassungUpdated = (updated: Partial<FassungMeta>) => {
    reloadFassungen()
  }

  // Determine editor mode
  const editorModus = (() => {
    if (!selectedDokument) return 'richtext' as const
    const custom = customTypen.find(t => t.name === selectedDokument.typ)
    if (custom) return custom.editor_modus as 'screenplay' | 'richtext'
    return EDITOR_MODUS[selectedDokument.typ] ?? 'richtext'
  })()

  const isReadOnly = fassung?._access === 'r' || fassung?._access === 'review' || fassung?.abgegeben

  // Collaboration: only for colab sichtbarkeit and rw access
  const collabEnabled = fassung?.sichtbarkeit === 'colab' && fassung?._access === 'rw'
  const { ydoc, provider, status: collabStatus, users: collabUsers } = useCollaboration({
    fassungId: collabEnabled ? selectedFassungId : null,
    enabled: collabEnabled,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <EditorPanelHeader
        dokument={selectedDokument}
        allDokumente={allDokumente}
        fassungen={fassungen}
        selectedFassungId={selectedFassungId}
        staffelId={staffelId}
        folgeNummer={folgeNummer}
        customTypen={customTypen}
        onSelectDokument={handleSelectDokument}
        onSelectFassung={setSelectedFassungId}
        onCreateDokument={onCreateDokument}
        onCreateFassung={handleCreateFassung}
        onFassungUpdated={handleFassungUpdated}
      />

      {fassung && (
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <LastEditedRow
              dokumentId={selectedDokumentId!}
              fassungId={selectedFassungId!}
              zuletzt_geaendert_von={fassung.zuletzt_geaendert_von}
              zuletzt_geaendert_am={fassung.zuletzt_geaendert_am}
              saveStatus={saveStatus}
            />
          </div>
          {collabEnabled && (
            <div style={{ padding: '0 10px' }}>
              <CollaborationPresence status={collabStatus} users={collabUsers} />
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {contentLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
            Lädt…
          </div>
        ) : !selectedDokument || !fassung ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {!selectedDokument ? 'Dokument-Typ auswählen' : 'Keine Fassung geladen'}
            </p>
            {!selectedDokument && allDokumente.length === 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                {['drehbuch', 'storyline', 'notiz'].map(typ => (
                  <button key={typ} onClick={() => onCreateDokument(typ)}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
                    {typ}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : editorModus === 'screenplay' ? (
          <Suspense fallback={null}>
            <ScreenplayEditor
              initialContent={fassung.inhalt}
              onSave={isReadOnly ? undefined : scheduleSave}
              readOnly={!!isReadOnly}
              seitenformat={(fassung.seitenformat as 'a4' | 'letter') ?? prefs.seitenformat}
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
              initialContent={fassung.inhalt}
              onSave={isReadOnly ? undefined : scheduleSave}
              readOnly={!!isReadOnly}
              seitenformat={(fassung.seitenformat as 'a4' | 'letter') ?? prefs.seitenformat}
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
