import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, X, AlertTriangle, Lock, ChevronUp, ChevronDown,
  Plus, User, MapPin, Sun, Moon, Type, Check, SkipForward,
  RefreshCw, ChevronRight, Layers, Maximize2,
} from 'lucide-react'
import { useAppSettings } from '../contexts'
import type {
  SearchScope, SearchOptions, SearchResult, SceneCard, EntityChip,
  EntityType, EntityMode, SearchMode, ReviewStatus,
} from '../hooks/useSearchReplace'

// ══════════════════════════════════════════════════════════════════════════════
// Props
// ══════════════════════════════════════════════════════════════════════════════

interface Props {
  open: boolean
  onClose: () => void
  // Context
  currentSzeneId?: string
  currentWerkstufenId?: string
  currentFolgeId?: number
  currentProduktionId?: string
  currentBlockNummer?: number
  productions?: { id: string; title: string; staffelnummer?: number; projektnummer?: string; is_active: boolean }[]
  bloecke?: { block_nummer: number; folge_von: number; folge_bis: number }[]
  // Modus
  searchMode: SearchMode
  onSetSearchMode: (m: SearchMode) => void
  // Editor (scope: szene)
  editorActiveIndex: number
  editorTotal: number
  onEditorSearch: (query: string, opts: SearchOptions) => void
  onFindNext: () => void
  onFindPrev: () => void
  onReplaceCurrent: (replacement: string) => void
  onReplaceAllEditor: (replacement: string) => void
  // Backend Text-Suche
  onBackendSearch: (params: {
    query: string; scope: SearchScope; scopeId?: string
    werkstufenTyp?: string; contentTypes?: string[]; options: SearchOptions
    includeFrei?: boolean; includePrivate?: boolean
  }) => void
  onBackendReplace: (params: {
    query: string; replacement: string; scope: SearchScope; scopeId?: string
    werkstufenTyp?: string; contentTypes?: string[]; options: SearchOptions
    excludeIds?: string[]
  }) => Promise<{ replaced_count: number; skipped_locked: number } | null>
  // Backend Szenen-Suche
  onSearchSzenen: (params: {
    produktion_id: string; scope?: SearchScope; scopeId?: string
    werkstufenTyp?: string; chips: EntityChip[]
    includeFrei?: boolean; includePrivate?: boolean
  }) => void
  // Ergebnisse
  backendResults: SearchResult[]
  backendTotal: number
  backendTotalScenes: number
  backendLockedCount: number
  backendFallbackCount: boolean
  backendLoading: boolean
  backendError: string | null
  sceneResults: SceneCard[]
  sceneTotal: number
  // Entity
  entityType: EntityType
  entityMatches: any[]
  entityMode: EntityMode
  onCheckEntity: (q: string, produktionId: string) => void
  onSetEntityMode: (m: EntityMode) => void
  // Chips
  chips: EntityChip[]
  onAddChip: (chip: Omit<EntityChip, 'id'>) => void
  onRemoveChip: (id: string) => void
  onClearChips: () => void
  // Accept/Reject
  reviewStatus: ReviewStatus
  reviewAccepted: number
  reviewSkipped: number
  onStartReview: () => void
  onAcceptMatch: (match: SearchResult) => Promise<void>
  onSkipMatch: (match: SearchResult) => void
  onAcceptAll: () => Promise<void>
  onFinishReview: () => void
  onResetReview: () => void
  // Rollenname-Ersetzen
  rollennameMode: boolean
  onReplaceRollenname: (old_name: string, new_name: string) => Promise<any>
  // Navigation
  onNavigateToScene: (szeneId: string, folgeId: number) => void
}

// ══════════════════════════════════════════════════════════════════════════════
// Haupt-Komponente
// ══════════════════════════════════════════════════════════════════════════════

export default function SearchReplaceDialog({
  open, onClose,
  currentSzeneId, currentWerkstufenId, currentFolgeId,
  currentProduktionId, currentBlockNummer, productions, bloecke,
  searchMode, onSetSearchMode,
  editorActiveIndex, editorTotal,
  onEditorSearch, onFindNext, onFindPrev, onReplaceCurrent, onReplaceAllEditor,
  onBackendSearch, onBackendReplace, onSearchSzenen,
  backendResults, backendTotal, backendTotalScenes, backendLockedCount,
  backendFallbackCount, backendLoading, backendError,
  sceneResults, sceneTotal,
  entityType, entityMatches, entityMode, onCheckEntity, onSetEntityMode,
  chips, onAddChip, onRemoveChip, onClearChips,
  reviewStatus, reviewAccepted, reviewSkipped,
  onStartReview, onAcceptMatch, onSkipMatch, onAcceptAll, onFinishReview, onResetReview,
  rollennameMode, onReplaceRollenname,
  onNavigateToScene,
}: Props) {
  const { treatmentLabel } = useAppSettings()
  const inputRef = useRef<HTMLInputElement>(null)
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent)

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [scope, setScope] = useState<SearchScope>('produktion')
  const [werkstufenTyp, setWerkstufenTyp] = useState('drehbuch')
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false, wholeWords: false, regex: false,
  })
  const [selectedBlock, setSelectedBlock] = useState<string | undefined>(undefined)
  const [selectedStaffel, setSelectedStaffel] = useState<string>(currentProduktionId || '')
  const [includeFrei, setIncludeFrei] = useState(false)
  const [includePrivate, setIncludePrivate] = useState(false)
  const [replaceResult, setReplaceResult] = useState<{ replaced_count: number; skipped_locked: number } | null>(null)
  const [rollennameResult, setRollennameResult] = useState<any>(null)
  const [rollennameReplaceType, setRollennameReplaceType] = useState<'nur_rollennamen' | 'volltext'>('nur_rollennamen')
  const [showChipAdder, setShowChipAdder] = useState<ChipType | null>(null)
  const [chipInput, setChipInput] = useState('')

  // Sync selectedStaffel when production changes
  useEffect(() => {
    if (currentProduktionId && selectedStaffel !== 'alle') {
      setSelectedStaffel(currentProduktionId)
    }
  }, [currentProduktionId])

  // Sync selectedBlock
  useEffect(() => {
    if (scope === 'block' && currentBlockNummer != null && !selectedBlock) {
      setSelectedBlock(String(currentBlockNummer))
    }
  }, [scope, currentBlockNummer, selectedBlock])

  // Focus on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setReplaceResult(null)
      setRollennameResult(null)
    }
  }, [open])

  // Entity-Check on query change
  useEffect(() => {
    if (currentProduktionId && query.trim()) {
      onCheckEntity(query.trim(), currentProduktionId)
    }
  }, [query, currentProduktionId])

  // Suche auslösen (Debounce via useEffect)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const triggerSearch = useCallback(() => {
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      const hasChips = chips.length > 0
      const isEntitySzenen = entityType === 'rolle' || entityType === 'motiv'
      const useSceneMode = (hasChips || (isEntitySzenen && entityMode === 'szenen')) && currentProduktionId

      if (useSceneMode) {
        const allChips = [...chips]
        // Entity-Match als Chip hinzufügen (wenn noch kein Chip für diese Entity existiert)
        if (isEntitySzenen && entityMode === 'szenen' && entityMatches.length > 0 && chips.length === 0) {
          const match = entityMatches[0]
          allChips.push({
            id: 'auto',
            type: entityType,
            label: match.name,
            value: match.name,
            entityId: match.id,
          })
        }
        onSearchSzenen({
          produktion_id: currentProduktionId!,
          scope: getEffectiveScope(),
          scopeId: getScopeId(),
          werkstufenTyp,
          chips: allChips,
          includeFrei,
          includePrivate,
        })
      } else if (query.trim()) {
        if (scope === 'szene') {
          onEditorSearch(query, options)
        } else {
          onBackendSearch({
            query,
            scope: getEffectiveScope(),
            scopeId: getScopeId(),
            werkstufenTyp,
            options,
            includeFrei,
            includePrivate,
          })
        }
      }
    }, 350)
    return () => clearTimeout(searchTimerRef.current)
  }, [query, scope, options, werkstufenTyp, selectedBlock, selectedStaffel, chips, entityType, entityMode, entityMatches, includeFrei, includePrivate])

  useEffect(() => {
    if (!open) return
    if (!query.trim() && chips.length === 0) return
    triggerSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, options, werkstufenTyp, selectedBlock, selectedStaffel, chips, entityMode, includeFrei, includePrivate, open])

  const getScopeId = useCallback((): string | undefined => {
    switch (scope) {
      case 'szene': return currentSzeneId
      case 'episode': return currentWerkstufenId
      case 'block': {
        if (!selectedBlock || !currentProduktionId) return undefined
        const block = bloecke?.find(b => String(b.block_nummer) === selectedBlock)
        if (!block) return undefined
        return `${currentProduktionId}:${block.folge_von}:${block.folge_bis}`
      }
      case 'produktion': return selectedStaffel === 'alle' ? undefined : (selectedStaffel || currentProduktionId)
      case 'alle': return undefined
    }
  }, [scope, currentSzeneId, currentWerkstufenId, currentProduktionId, selectedBlock, bloecke, selectedStaffel])

  const getEffectiveScope = (): SearchScope =>
    scope === 'produktion' && selectedStaffel === 'alle' ? 'alle' : scope

  const prodLabel = (p: { title: string; staffelnummer?: number; projektnummer?: string }) => {
    const base = p.staffelnummer ? `${p.title} ${'Staffel'} ${p.staffelnummer}` : p.title
    return p.projektnummer ? `${p.projektnummer} · ${base}` : base
  }

  // Aktuell dargestellte Szenen-/Snippet-Resultate
  const isSceneMode = chips.length > 0 || (entityType !== 'none' && entityType !== 'loading' && entityMode === 'szenen')
  const isSzeneScope = scope === 'szene'
  const showWerkstufenSelector = scope === 'block' || scope === 'produktion'
  const showFreiOptionen = (scope === 'produktion' || scope === 'alle') && !isSzeneScope

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && !e.shiftKey && isSzeneScope) { e.preventDefault(); onFindNext() }
    if (e.key === 'Enter' && e.shiftKey && isSzeneScope) { e.preventDefault(); onFindPrev() }
  }

  // Zeige Entity-Badge?
  const showEntityBadge = query.trim().length >= 2 && entityType !== 'none' && entityType !== 'loading' && chips.length === 0

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 440, maxWidth: '100vw',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        zIndex: 50,
        display: 'flex', flexDirection: 'column',
        fontSize: 13,
      }}
      onKeyDown={handleKeyDown}
    >
      {/* ── Header ── */}
      <div style={{
        padding: '14px 20px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
            <Search size={15} />
            Suchen & Ersetzen
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {isMac ? '⌘H' : 'Ctrl+H'}
            </span>
            <button onClick={onClose} style={iconBtnStyle}>
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Tab-Switch */}
        <div style={{ display: 'flex', gap: 0, marginBottom: -1 }}>
          {(['suchen', 'ersetzen'] as SearchMode[]).map(m => (
            <button
              key={m}
              onClick={() => onSetSearchMode(m)}
              style={{
                padding: '7px 18px',
                border: 'none',
                borderBottom: searchMode === m ? '2px solid var(--text-primary)' : '2px solid transparent',
                background: 'none',
                fontWeight: searchMode === m ? 600 : 400,
                fontSize: 13,
                cursor: 'pointer',
                color: searchMode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'color 0.15s',
              }}
            >
              {m === 'suchen' ? 'Suchen' : 'Ersetzen'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollbarer Inhalt ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

        {/* Sucheingabe */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={chips.length > 0 ? 'Zusätzlicher Text...' : `In ${'Szenen'} suchen...`}
              style={{
                width: '100%', padding: '8px 12px', paddingRight: 100,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
            {query && (
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
              }}>
                {entityType === 'loading' ? '...' : isSzeneScope
                  ? (editorTotal > 0 ? `${editorActiveIndex + 1} von ${editorTotal}` : 'Keine Treffer')
                  : (backendLoading ? '...' : isSceneMode
                    ? (sceneTotal > 0 ? `${sceneTotal} Szenen` : '')
                    : (backendTotal > 0 ? `${backendTotal} Treffer` : ''))
                }
              </span>
            )}
          </div>
        </div>

        {/* Entity-Badge */}
        {showEntityBadge && (
          <EntityBadge
            type={entityType}
            matches={entityMatches}
            mode={entityMode}
            searchMode={searchMode}
            onSetMode={onSetEntityMode}
            onAddChip={onAddChip}
            query={query}
          />
        )}

        {/* Ersetzen-Feld */}
        {searchMode === 'ersetzen' && (
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={replacement}
              onChange={e => setReplacement(e.target.value)}
              placeholder="Ersetzen durch..."
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Rollenname-Ersetzen-Auswahl */}
        {searchMode === 'ersetzen' && rollennameMode && (
          <RollennameReplaceChoice
            entityMatches={entityMatches}
            replaceType={rollennameReplaceType}
            onSetType={setRollennameReplaceType}
          />
        )}

        {/* Chips */}
        {chips.length > 0 && (
          <ChipList chips={chips} onRemove={onRemoveChip} onClearAll={onClearChips} />
        )}

        {/* Chip-Adder */}
        <ChipAdderBar
          showAdder={showChipAdder}
          onSetAdder={setShowChipAdder}
          chipInput={chipInput}
          onSetChipInput={setChipInput}
          onAddChip={onAddChip}
          currentProduktionId={currentProduktionId}
          chips={chips}
        />

        {/* Scope */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {searchMode === 'ersetzen' ? 'Ersetzen in' : 'Suchen in'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              { key: 'szene', label: `Akt. ${'Szene'}` },
              { key: 'episode', label: 'Folge' },
              { key: 'block', label: 'Block' },
              { key: 'produktion', label: 'Staffel' },
            ] as { key: SearchScope; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setScope(key)}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  border: scope === key ? '1px solid var(--text-primary)' : '1px solid var(--border)',
                  background: scope === key ? 'var(--text-primary)' : 'var(--bg-surface)',
                  color: scope === key ? 'var(--bg-surface)' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Staffel-Dropdown */}
        {scope === 'produktion' && productions && productions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <select value={selectedStaffel} onChange={e => setSelectedStaffel(e.target.value)} style={selectStyle}>
              {productions.filter(p => p.is_active).map(p => (
                <option key={p.id} value={p.id}>{prodLabel(p)}{p.id === currentProduktionId ? ' (aktuell)' : ''}</option>
              ))}
              <option value="alle">Alle {'Staffeln'}</option>
              {productions.some(p => !p.is_active) && (
                <optgroup label="Archiviert">
                  {productions.filter(p => !p.is_active).map(p => (
                    <option key={p.id} value={p.id}>{prodLabel(p)}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* Block-Dropdown */}
        {scope === 'block' && bloecke && bloecke.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <select value={selectedBlock || ''} onChange={e => setSelectedBlock(e.target.value || undefined)} style={selectStyle}>
              <option value="">Block wählen...</option>
              {bloecke.map(b => (
                <option key={b.block_nummer} value={String(b.block_nummer)}>
                  Block {b.block_nummer} ({'Folge'} {b.folge_von}–{b.folge_bis})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Werkstufe */}
        {showWerkstufenSelector && (
          <div style={{ marginBottom: 12 }}>
            <select value={werkstufenTyp} onChange={e => setWerkstufenTyp(e.target.value)} style={selectStyle}>
              <option value="drehbuch">Drehbuch (empfohlen)</option>
              <option value="treatment">{treatmentLabel}</option>
              <option value="storyline">Beschreibung</option>
              <option value="notiz">Notiz</option>
            </select>
          </div>
        )}

        {/* Freie Dokumente */}
        {showFreiOptionen && (
          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={includeFrei} onChange={e => { setIncludeFrei(e.target.checked); if (!e.target.checked) setIncludePrivate(false) }} style={{ accentColor: '#007AFF' }} />
              Freie Dokumente einschließen
            </label>
            {includeFrei && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, paddingLeft: 24 }}>
                <input type="checkbox" checked={includePrivate} onChange={e => setIncludePrivate(e.target.checked)} style={{ accentColor: '#007AFF' }} />
                Auch private einschließen
              </label>
            )}
          </div>
        )}

        {/* Optionen */}
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { key: 'caseSensitive' as const, label: 'Groß-/Kleinschreibung beachten' },
            { key: 'wholeWords' as const, label: 'Nur ganze Wörter' },
            { key: 'regex' as const, label: 'Reguläre Ausdrücke' },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={options[key]}
                onChange={() => setOptions(prev => ({ ...prev, [key]: !prev[key] }))}
                style={{ accentColor: '#007AFF' }}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Fehler */}
        {backendError && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: '#FF3B3018', border: '1px solid #FF3B3040',
            color: '#FF3B30', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertTriangle size={13} /> {backendError}
          </div>
        )}

        {/* Rollenname-Ergebnis */}
        {rollennameResult && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: '#00C85318', border: '1px solid #00C85340',
            fontSize: 12, color: '#00C853',
          }}>
            Rollenname ersetzt: {rollennameResult.total} Stellen
            ({rollennameResult.characters_updated} Charakter, {rollennameResult.scene_characters_updated} Szenen-Besetzung,
            {rollennameResult.content_nodes_updated} Dialog-Köpfe)
          </div>
        )}

        {/* Ergebnis-Meldung */}
        {replaceResult && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: '#00C85318', border: '1px solid #00C85340',
            color: '#00C853', fontSize: 12,
          }}>
            {replaceResult.replaced_count} Ersetzungen durchgeführt.
            {replaceResult.skipped_locked > 0 && (
              <span style={{ color: '#FF9500' }}> {replaceResult.skipped_locked} Szenen waren gesperrt.</span>
            )}
          </div>
        )}

        {/* Review-Status */}
        {reviewStatus !== 'idle' && (
          <ReviewStatusBar
            status={reviewStatus}
            accepted={reviewAccepted}
            skipped={reviewSkipped}
            remaining={backendTotal}
            onAcceptAll={onAcceptAll}
            onFinish={onFinishReview}
            onReset={onResetReview}
          />
        )}

        {/* ── ERGEBNISSE ── */}
        {!isSzeneScope && (
          <>
            {isSceneMode ? (
              <SceneCardResults
                scenes={sceneResults}
                total={sceneTotal}
                onNavigate={onNavigateToScene}
                episodeLabel={'Folge'}
                szeneLabel={'Szene'}
              />
            ) : (
              <SnippetResults
                results={backendResults}
                total={backendTotal}
                totalScenes={backendTotalScenes}
                lockedCount={backendLockedCount}
                loading={backendLoading}
                query={query}
                searchMode={searchMode}
                reviewStatus={reviewStatus}
                episodeLabel={'Folge'}
                szeneLabel={'Szene'}
                onNavigate={onNavigateToScene}
                onAcceptMatch={onAcceptMatch}
                onSkipMatch={onSkipMatch}
              />
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center',
        flexShrink: 0,
      }}>
        {isSzeneScope && searchMode === 'suchen' && (
          <>
            <button onClick={onFindPrev} disabled={editorTotal === 0} style={navBtnStyle}><ChevronUp size={14} /></button>
            <button onClick={onFindNext} disabled={editorTotal === 0} style={navBtnStyle}><ChevronDown size={14} /></button>
          </>
        )}

        {isSzeneScope && searchMode === 'ersetzen' && (
          <>
            <button onClick={onFindPrev} disabled={editorTotal === 0} style={navBtnStyle}><ChevronUp size={14} /></button>
            <button onClick={onFindNext} disabled={editorTotal === 0} style={navBtnStyle}><ChevronDown size={14} /></button>
            <button onClick={() => onReplaceCurrent(replacement)} disabled={editorTotal === 0} style={secBtnStyle}>
              Ersetzen
            </button>
            <button onClick={() => onReplaceAllEditor(replacement)} disabled={editorTotal === 0} style={primBtnStyle}>
              Alle ersetzen
            </button>
          </>
        )}

        {!isSzeneScope && searchMode === 'suchen' && (
          <>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {isSceneMode
                ? (sceneTotal > 0 ? `${sceneTotal} ${'Szenen'}` : '')
                : (backendTotal > 0 ? `${backendTotal} Treffer in ${backendTotalScenes} ${'Szenen'}` : '')
              }
            </span>
          </>
        )}

        {!isSzeneScope && searchMode === 'ersetzen' && rollennameMode && (
          <RollennameReplaceFooter
            query={query}
            replacement={replacement}
            replaceType={rollennameReplaceType}
            loading={backendLoading}
            onReplace={async () => {
              if (rollennameReplaceType === 'nur_rollennamen' && currentProduktionId) {
                const res = await onReplaceRollenname(query, replacement)
                setRollennameResult(res)
              } else {
                const res = await onBackendReplace({
                  query, replacement,
                  scope: getEffectiveScope(),
                  scopeId: getScopeId(),
                  werkstufenTyp, options,
                })
                if (res) setReplaceResult(res)
              }
            }}
          />
        )}

        {!isSzeneScope && searchMode === 'ersetzen' && !rollennameMode && reviewStatus === 'idle' && (
          <>
            <span style={{ flex: 1 }} />
            {backendTotal > 0 && (
              <button onClick={onStartReview} disabled={backendLoading} style={secBtnStyle}>
                Einzeln prüfen
              </button>
            )}
            <button
              onClick={async () => {
                const res = await onBackendReplace({
                  query, replacement,
                  scope: getEffectiveScope(), scopeId: getScopeId(),
                  werkstufenTyp, options,
                })
                if (res) setReplaceResult(res)
              }}
              disabled={backendTotal === 0 || backendLoading}
              style={primBtnStyle}
            >
              {backendLoading ? 'Lädt...' : 'Alle ersetzen'}
            </button>
          </>
        )}

        {!isSzeneScope && searchMode === 'ersetzen' && !rollennameMode && reviewStatus === 'reviewing' && (
          <>
            <span style={{ flex: 1 }} />
            <button onClick={onResetReview} style={secBtnStyle}>Abbrechen</button>
            <button onClick={onAcceptAll} disabled={backendLoading} style={primBtnStyle}>
              Alle restlichen annehmen
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Entity-Badge
// ══════════════════════════════════════════════════════════════════════════════

function EntityBadge({ type, matches, mode, searchMode, onSetMode, onAddChip, query }: {
  type: EntityType; matches: any[]; mode: EntityMode; searchMode: SearchMode
  onSetMode: (m: EntityMode) => void
  onAddChip: (chip: Omit<EntityChip, 'id'>) => void
  query: string
}) {
  const isRolle = type === 'rolle'
  const color = isRolle ? '#007AFF' : '#00C853'
  const icon = isRolle ? <User size={12} /> : <MapPin size={12} />
  const label = isRolle ? 'Rollenname erkannt' : 'Motiv erkannt'
  const match = matches[0]

  return (
    <div style={{
      marginBottom: 10, padding: '8px 12px', borderRadius: 8,
      background: color + '10', border: `1px solid ${color}30`,
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color }}>
        {icon}
        <strong>{label}: {match?.name || query}</strong>
        {match?.rollen_nummer && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>Nr. {match.rollen_nummer}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => onSetMode('szenen')}
          style={{
            ...modeBtnStyle,
            border: mode === 'szenen' ? `1px solid ${color}` : '1px solid var(--border)',
            color: mode === 'szenen' ? color : 'var(--text-secondary)',
            background: mode === 'szenen' ? color + '15' : 'var(--bg-surface)',
          }}
        >
          Szenen anzeigen
        </button>
        <button
          onClick={() => onSetMode('text')}
          style={{
            ...modeBtnStyle,
            border: mode === 'text' ? `1px solid ${color}` : '1px solid var(--border)',
            color: mode === 'text' ? color : 'var(--text-secondary)',
            background: mode === 'text' ? color + '15' : 'var(--bg-surface)',
          }}
        >
          Text suchen
        </button>
        {match && (
          <button
            onClick={() => onAddChip({ type: type as 'rolle' | 'motiv', label: match.name, value: match.name, entityId: match.id })}
            style={{ ...modeBtnStyle, marginLeft: 'auto', color: color }}
          >
            <Plus size={11} /> Als Filter
          </button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Chip-Liste
// ══════════════════════════════════════════════════════════════════════════════

const CHIP_COLORS: Record<string, string> = {
  rolle: '#007AFF', motiv: '#00C853', ia: '#FF9500', dt: '#AF52DE', text: '#757575',
}
const CHIP_ICONS: Record<string, React.ReactNode> = {
  rolle: <User size={10} />, motiv: <MapPin size={10} />,
  ia: <Layers size={10} />, dt: <Sun size={10} />, text: <Type size={10} />,
}

function ChipList({ chips, onRemove, onClearAll }: {
  chips: EntityChip[]; onRemove: (id: string) => void; onClearAll: () => void
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {chips.map(chip => {
          const color = CHIP_COLORS[chip.type] || '#757575'
          return (
            <span key={chip.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px 3px 6px', borderRadius: 99,
              background: color + '18', border: `1px solid ${color}50`,
              color, fontSize: 11, fontWeight: 500,
            }}>
              {CHIP_ICONS[chip.type]}
              {chip.label}
              <button onClick={() => onRemove(chip.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color, padding: 0, lineHeight: 1, marginLeft: 2,
              }}><X size={10} /></button>
            </span>
          )
        })}
        {chips.length > 1 && (
          <button onClick={onClearAll} style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
            Alle löschen
          </button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Chip-Adder
// ══════════════════════════════════════════════════════════════════════════════

type ChipType = 'rolle' | 'motiv' | 'ia' | 'dt' | 'text'

const IA_OPTIONS = [
  { label: 'Innen', value: 'innen' },
  { label: 'Außen', value: 'aussen' },
]
const DT_OPTIONS = [
  { label: 'Tag', value: 'tag' },
  { label: 'Nacht', value: 'nacht' },
]

function ChipAdderBar({ showAdder, onSetAdder, chipInput, onSetChipInput, onAddChip, currentProduktionId, chips }: {
  showAdder: ChipType | null
  onSetAdder: (t: ChipType | null) => void
  chipInput: string
  onSetChipInput: (s: string) => void
  onAddChip: (chip: Omit<EntityChip, 'id'>) => void
  currentProduktionId?: string
  chips: EntityChip[]
}) {
  const hasIA = chips.some(c => c.type === 'ia')
  const hasDT = chips.some(c => c.type === 'dt')

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {([
          { type: 'rolle' as ChipType, icon: <User size={10} />, label: '+ Rolle' },
          { type: 'motiv' as ChipType, icon: <MapPin size={10} />, label: '+ Motiv' },
          { type: 'ia' as ChipType, icon: <Layers size={10} />, label: '+ I/A', disabled: hasIA },
          { type: 'dt' as ChipType, icon: <Sun size={10} />, label: '+ T/N', disabled: hasDT },
        ]).map(({ type, icon, label, disabled }) => (
          <button
            key={type}
            onClick={() => onSetAdder(showAdder === type ? null : type)}
            disabled={disabled}
            style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11,
              border: `1px solid ${showAdder === type ? CHIP_COLORS[type] : 'var(--border)'}`,
              background: showAdder === type ? CHIP_COLORS[type] + '15' : 'var(--bg-surface)',
              color: showAdder === type ? CHIP_COLORS[type] : 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {showAdder === 'ia' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          {IA_OPTIONS.map(o => (
            <button key={o.value} onClick={() => { onAddChip({ type: 'ia', label: o.label, value: o.value }); onSetAdder(null) }}
              style={{ ...secBtnStyle, fontSize: 11 }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {showAdder === 'dt' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          {DT_OPTIONS.map(o => (
            <button key={o.value} onClick={() => { onAddChip({ type: 'dt', label: o.label, value: o.value }); onSetAdder(null) }}
              style={{ ...secBtnStyle, fontSize: 11 }}>
              {o.label === 'Tag' ? <><Sun size={11} /> Tag</> : <><Moon size={11} /> Nacht</>}
            </button>
          ))}
        </div>
      )}
      {(showAdder === 'rolle' || showAdder === 'motiv') && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input
            autoFocus
            type="text"
            value={chipInput}
            onChange={e => onSetChipInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && chipInput.trim()) {
                onAddChip({ type: showAdder, label: chipInput.trim(), value: chipInput.trim() })
                onSetChipInput('')
                onSetAdder(null)
              }
              if (e.key === 'Escape') onSetAdder(null)
            }}
            placeholder={showAdder === 'rolle' ? 'Rollenname...' : 'Motiv-Name...'}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button
            onClick={() => {
              if (chipInput.trim()) {
                onAddChip({ type: showAdder, label: chipInput.trim(), value: chipInput.trim() })
                onSetChipInput('')
                onSetAdder(null)
              }
            }}
            style={{ ...primBtnStyle, fontSize: 12 }}
          >
            <Plus size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Rollenname-Ersetzen-Auswahl
// ══════════════════════════════════════════════════════════════════════════════

function RollennameReplaceChoice({ entityMatches, replaceType, onSetType }: {
  entityMatches: any[]
  replaceType: 'nur_rollennamen' | 'volltext'
  onSetType: (t: 'nur_rollennamen' | 'volltext') => void
}) {
  const match = entityMatches[0]
  return (
    <div style={{
      marginBottom: 12, padding: '10px 12px', borderRadius: 8,
      background: '#007AFF10', border: '1px solid #007AFF30',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#007AFF', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <User size={13} />
        Rollenname erkannt{match ? `: ${match.name}` : ''}
      </div>
      {[
        {
          value: 'nur_rollennamen' as const,
          label: 'Nur Rollennamen-Elemente',
          desc: 'Ersetzt den Dialogkopf, Szenen-Besetzungsliste und die Charakterdatenbank. Fließtext im Dialog bleibt unberührt.',
        },
        {
          value: 'volltext' as const,
          label: 'Gesamten Text durchsuchen',
          desc: `Ersetzt alle Text-Vorkommen (inkl. Dialog). Kann tausende Treffer ergeben.`,
        },
      ].map(opt => (
        <label key={opt.value} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
          marginBottom: 6, fontSize: 12,
        }}>
          <input
            type="radio"
            checked={replaceType === opt.value}
            onChange={() => onSetType(opt.value)}
            style={{ marginTop: 2, accentColor: '#007AFF' }}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{opt.label}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{opt.desc}</div>
          </div>
        </label>
      ))}
    </div>
  )
}

function RollennameReplaceFooter({ query, replacement, replaceType, loading, onReplace }: {
  query: string; replacement: string; replaceType: 'nur_rollennamen' | 'volltext'
  loading: boolean; onReplace: () => Promise<void>
}) {
  return (
    <>
      <span style={{ flex: 1 }} />
      <button
        onClick={onReplace}
        disabled={loading || !replacement.trim()}
        style={primBtnStyle}
      >
        {loading ? 'Wird ersetzt...' : replaceType === 'nur_rollennamen' ? 'Rollenname ersetzen' : 'Alle ersetzen'}
      </button>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Review-Status-Bar
// ══════════════════════════════════════════════════════════════════════════════

function ReviewStatusBar({ status, accepted, skipped, remaining, onAcceptAll, onFinish, onReset }: {
  status: ReviewStatus; accepted: number; skipped: number; remaining: number
  onAcceptAll: () => Promise<void>; onFinish: () => void; onReset: () => void
}) {
  const total = accepted + skipped + remaining
  return (
    <div style={{
      marginBottom: 12, padding: '10px 12px', borderRadius: 8,
      background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 12,
    }}>
      {status === 'reviewing' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <RefreshCw size={12} style={{ color: '#007AFF' }} />
            <strong>Einzel-Prüfung aktiv</strong>
            <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: 11 }}>
              {accepted + skipped} von {total} bearbeitet
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ color: '#00C853' }}>✓ {accepted} angenommen</span>
            {' · '}
            <span style={{ color: '#FF9500' }}>{skipped} übersprungen</span>
            {' · '}
            <span>{remaining} verbleibend</span>
          </div>
        </>
      )}
      {status === 'done' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={12} style={{ color: '#00C853' }} />
          <strong style={{ color: '#00C853' }}>Abgeschlossen:</strong>
          <span>{accepted} ersetzt · {skipped} übersprungen</span>
          <button onClick={onReset} style={{ marginLeft: 'auto', ...secBtnStyle, fontSize: 11 }}>Neu starten</button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Snippet-Ergebnisse (Text-Suche)
// ══════════════════════════════════════════════════════════════════════════════

// ── Snippet List Modal (Vollbild-Ansicht der gesamten Ergebnisliste) ──────────
function SnippetListModal({ results, total, totalScenes, lockedCount, query,
  searchMode, reviewStatus, episodeLabel, szeneLabel, onNavigate, onAcceptMatch, onSkipMatch, onClose }: {
  results: SearchResult[]; total: number; totalScenes: number; lockedCount: number
  query: string; searchMode: SearchMode; reviewStatus: ReviewStatus
  episodeLabel: string; szeneLabel: string
  onNavigate: (szeneId: string, folgeId: number) => void
  onAcceptMatch: (m: SearchResult) => Promise<void>
  onSkipMatch: (m: SearchResult) => void
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const grouped: Record<number, SearchResult[]> = {}
  for (const r of results) {
    if (!grouped[r.folge_nummer]) grouped[r.folge_nummer] = []
    grouped[r.folge_nummer].push(r)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Search size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>„{query}"</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>— {total} Treffer in {totalScenes} {szeneLabel}n</span>
        {lockedCount > 0 && <span style={{ fontSize: 11, color: '#FF9500' }}><Lock size={10} style={{ verticalAlign: -1 }} /> {lockedCount} gesperrt</span>}
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {Object.entries(grouped).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([folgeNr, scenes]) => (
            <SnippetGroup
              key={folgeNr}
              folgeNummer={parseInt(folgeNr)}
              scenes={scenes}
              query={query}
              episodeLabel={episodeLabel}
              szeneLabel={szeneLabel}
              searchMode={searchMode}
              reviewStatus={reviewStatus}
              onNavigate={onNavigate}
              onAccept={onAcceptMatch}
              onSkip={onSkipMatch}
              expanded
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SnippetResults({ results, total, totalScenes, lockedCount, loading, query,
  searchMode, reviewStatus, episodeLabel, szeneLabel, onNavigate, onAcceptMatch, onSkipMatch }: {
  results: SearchResult[]; total: number; totalScenes: number; lockedCount: number
  loading: boolean; query: string; searchMode: SearchMode; reviewStatus: ReviewStatus
  episodeLabel: string; szeneLabel: string
  onNavigate: (szeneId: string, folgeId: number) => void
  onAcceptMatch: (m: SearchResult) => Promise<void>
  onSkipMatch: (m: SearchResult) => void
}) {
  const [listExpanded, setListExpanded] = useState(false)

  if (loading && results.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '16px 0', textAlign: 'center' }}>Suche läuft...</div>
  }
  if (!loading && results.length === 0 && query) {
    return <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '16px 0', textAlign: 'center' }}>Keine Treffer</div>
  }
  if (results.length === 0) return null

  // Gruppieren nach Folge
  const grouped: Record<number, SearchResult[]> = {}
  for (const r of results) {
    if (!grouped[r.folge_nummer]) grouped[r.folge_nummer] = []
    grouped[r.folge_nummer].push(r)
  }

  return (
    <div>
      {listExpanded && (
        <SnippetListModal
          results={results}
          total={total}
          totalScenes={totalScenes}
          lockedCount={lockedCount}
          query={query}
          episodeLabel={episodeLabel}
          szeneLabel={szeneLabel}
          searchMode={searchMode}
          reviewStatus={reviewStatus}
          onNavigate={onNavigate}
          onAcceptMatch={onAcceptMatch}
          onSkipMatch={onSkipMatch}
          onClose={() => setListExpanded(false)}
        />
      )}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{total} Treffer in {totalScenes} {szeneLabel}n</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lockedCount > 0 && <span style={{ color: '#FF9500' }}><Lock size={10} style={{ verticalAlign: -1 }} /> {lockedCount} gesperrt</span>}
          <button
            onClick={() => setListExpanded(true)}
            title="Ergebnisliste vergrößern"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-secondary)', lineHeight: 1 }}
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>
      {Object.entries(grouped).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([folgeNr, scenes]) => (
        <SnippetGroup
          key={folgeNr}
          folgeNummer={parseInt(folgeNr)}
          scenes={scenes}
          query={query}
          episodeLabel={episodeLabel}
          szeneLabel={szeneLabel}
          searchMode={searchMode}
          reviewStatus={reviewStatus}
          onNavigate={onNavigate}
          onAccept={onAcceptMatch}
          onSkip={onSkipMatch}
        />
      ))}
    </div>
  )
}

function SnippetGroup({ folgeNummer, scenes, query, episodeLabel, szeneLabel,
  searchMode, reviewStatus, onNavigate, onAccept, onSkip, expanded }: {
  folgeNummer: number; scenes: SearchResult[]; query: string
  episodeLabel: string; szeneLabel: string; searchMode: SearchMode; reviewStatus: ReviewStatus
  onNavigate: (szeneId: string, folgeId: number) => void
  onAccept: (m: SearchResult) => Promise<void>; onSkip: (m: SearchResult) => void
  expanded?: boolean
}) {
  const [groupExpanded, setGroupExpanded] = useState(true)
  const [accepting, setAccepting] = useState<string | null>(null)
  const showReviewButtons = searchMode === 'ersetzen' && reviewStatus === 'reviewing'
  const first = scenes[0]
  const werkLabel = first ? `${first.werkstufe_typ} v${first.werkstufe_version}${first.is_fallback ? ' ↑' : ''}` : ''

  return (
    <div style={{ marginBottom: 6 }}>
      <button onClick={() => setGroupExpanded(!groupExpanded)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', borderRadius: 6, border: 'none',
        background: 'var(--bg-subtle)', cursor: 'pointer',
        fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
      }}>
        <span style={{ fontSize: 10 }}>{groupExpanded ? '▼' : '▶'}</span>
        {episodeLabel} {folgeNummer}
        {werkLabel && (
          <span style={{
            fontSize: 10, fontWeight: 400, padding: '1px 6px', borderRadius: 4,
            background: first?.is_fallback ? '#FF950018' : '#007AFF12',
            color: first?.is_fallback ? '#FF9500' : '#007AFF',
          }}>{werkLabel}</span>
        )}
        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 'auto', fontSize: 11 }}>
          {scenes.length} Treffer
        </span>
      </button>
      {groupExpanded && (
        <div style={{ paddingLeft: 8, marginTop: 3 }}>
          {scenes.map((scene, i) => {
            const key = `${scene.dokument_szene_id}-${i}`
            const isAccepting = accepting === key
            return (
              <div key={key} style={{
                padding: '6px 8px', borderRadius: 6, marginBottom: 2,
                cursor: scene.is_locked || showReviewButtons ? 'default' : 'pointer',
                opacity: scene.is_locked ? 0.5 : 1,
                fontSize: 12, border: '1px solid transparent', transition: 'background 0.1s',
              }}
                onClick={() => !scene.is_locked && !showReviewButtons && onNavigate(scene.dokument_szene_id, scene.folge_id)}
                onMouseEnter={e => { if (!showReviewButtons) (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  {scene.is_locked && <Lock size={10} style={{ color: '#FF9500' }} />}
                  <span style={{ fontWeight: 500 }}>{szeneLabel} {scene.scene_nummer}</span>
                  {scene.ort_name && <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>({scene.ort_name})</span>}
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, padding: '1px 5px', borderRadius: 4,
                    background: scene.is_fallback ? '#FF950018' : 'var(--bg-subtle)',
                    color: scene.is_fallback ? '#FF9500' : 'var(--text-secondary)',
                  }}>
                    [{scene.werkstufe_typ}{scene.is_fallback ? ' ↑' : ''}]
                  </span>
                </div>
                <div style={expanded ? {
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap',
                  padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 6, marginTop: 6,
                  color: 'var(--text-primary)',
                } : {
                  fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {highlightSnippet(scene.snippet, query)}
                </div>
                {showReviewButtons && !scene.is_locked && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button
                      onClick={async e => { e.stopPropagation(); setAccepting(key); onNavigate(scene.dokument_szene_id, scene.folge_id); await onAccept(scene); setAccepting(null) }}
                      disabled={isAccepting}
                      style={{ ...primBtnStyle, fontSize: 11, padding: '3px 10px' }}
                    >
                      <Check size={11} /> {isAccepting ? '...' : 'Annehmen'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onSkip(scene) }}
                      style={{ ...secBtnStyle, fontSize: 11, padding: '3px 10px' }}
                    >
                      <SkipForward size={11} /> Überspringen
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Szenen-Karten-Ergebnisse (Entity/Kombi-Modus)
// ══════════════════════════════════════════════════════════════════════════════

function SceneCardResults({ scenes, total, onNavigate, episodeLabel, szeneLabel }: {
  scenes: SceneCard[]; total: number
  onNavigate: (szeneId: string, folgeId: number) => void
  episodeLabel: string; szeneLabel: string
}) {
  if (scenes.length === 0) return null

  // Gruppieren nach Folge
  const grouped: Record<number, SceneCard[]> = {}
  for (const s of scenes) {
    if (!grouped[s.folge_nummer]) grouped[s.folge_nummer] = []
    grouped[s.folge_nummer].push(s)
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {total} {szeneLabel}n in {Object.keys(grouped).length} {episodeLabel}n
      </div>
      {Object.entries(grouped).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([folgeNr, scs]) => (
        <SceneGroup key={folgeNr} folgeNummer={parseInt(folgeNr)} scenes={scs} onNavigate={onNavigate} episodeLabel={episodeLabel} szeneLabel={szeneLabel} />
      ))}
    </div>
  )
}

function SceneGroup({ folgeNummer, scenes, onNavigate, episodeLabel, szeneLabel }: {
  folgeNummer: number; scenes: SceneCard[]
  onNavigate: (szeneId: string, folgeId: number) => void
  episodeLabel: string; szeneLabel: string
}) {
  const [expanded, setExpanded] = useState(true)
  const first = scenes[0]
  const werkLabel = first ? `${first.werkstufe_typ.charAt(0).toUpperCase() + first.werkstufe_typ.slice(1)} v${first.version_nummer}${first.is_fallback ? ' ↑' : ''}` : ''

  return (
    <div style={{ marginBottom: 8 }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', borderRadius: 6, border: 'none',
        background: 'var(--bg-subtle)', cursor: 'pointer',
        fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
      }}>
        <span style={{ fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
        {episodeLabel} {folgeNummer}
        {werkLabel && (
          <span style={{
            fontSize: 10, fontWeight: 400, padding: '1px 6px', borderRadius: 4,
            background: first?.is_fallback ? '#FF950018' : '#007AFF12',
            color: first?.is_fallback ? '#FF9500' : '#007AFF',
            marginLeft: 4,
          }}>{werkLabel}</span>
        )}
        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 'auto', fontSize: 11 }}>
          {scenes.length} {szeneLabel}n
        </span>
      </button>
      {expanded && (
        <div style={{ paddingLeft: 4, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {scenes.map(scene => (
            <SceneCardItem
              key={scene.dokument_szene_id}
              scene={scene}
              szeneLabel={szeneLabel}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SceneCardItem({ scene, szeneLabel, onNavigate }: {
  scene: SceneCard; szeneLabel: string
  onNavigate: (szeneId: string, folgeId: number) => void
}) {
  // Metadaten-Tags kompakt
  const ia = scene.innen_aussen ? scene.innen_aussen.toUpperCase().replace('INTERIOR', 'INT').replace('EXTERIOR', 'EXT').replace('INNEN', 'INT').replace('AUSSEN', 'EXT').slice(0, 3) : null
  const dt = scene.tag_nacht ? scene.tag_nacht.charAt(0).toUpperCase() + scene.tag_nacht.slice(1, 4).toLowerCase() : null
  const stoppStr = scene.stoppzeit_sek ? `${Math.floor(scene.stoppzeit_sek / 60)}:${String(scene.stoppzeit_sek % 60).padStart(2, '0')}` : null

  return (
    <div
      onClick={() => !scene.is_locked && onNavigate(scene.dokument_szene_id, scene.folge_id)}
      style={{
        padding: '7px 10px', borderRadius: 8, fontSize: 12,
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        cursor: scene.is_locked ? 'default' : 'pointer',
        opacity: scene.is_locked ? 0.5 : 1,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (!scene.is_locked) (e.currentTarget as HTMLElement).style.borderColor = '#007AFF55' }}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
    >
      {/* Zeile 1: Sz.-Nr. · Motiv · I/A · DT · Spieltag */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {scene.is_locked && <Lock size={11} style={{ color: '#FF9500' }} />}
        <strong style={{ fontSize: 12, minWidth: 0 }}>
          {szeneLabel} {scene.scene_nummer}
        </strong>
        {scene.ort_name && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 40 }}>
            {scene.ort_name}
          </span>
        )}
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
          {ia && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#FF950018', color: '#FF9500', fontWeight: 700 }}>{ia}</span>}
          {dt && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#AF52DE18', color: '#AF52DE', fontWeight: 700 }}>{dt}</span>}
          {scene.spieltag != null && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-subtle)', color: 'var(--text-secondary)', fontWeight: 600 }}>Tag {scene.spieltag}</span>}
          {stoppStr && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>⏱{stoppStr}</span>}
        </div>
      </div>
      {/* Zeile 2: Oneliner */}
      {scene.zusammenfassung && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4, fontStyle: 'italic' }}>
          {scene.zusammenfassung}
        </div>
      )}
      {/* Zeile 3: Rollen-Chips */}
      {scene.rollen && scene.rollen.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
          {scene.rollen.slice(0, 8).map((r, i) => (
            <span key={i} style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 99,
              background: '#007AFF15', color: '#007AFF', fontWeight: 500,
            }}>
              {r.name}
            </span>
          ))}
          {scene.rollen.length > 8 && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '1px 4px' }}>
              +{scene.rollen.length - 8}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Snippet Highlighting
// ══════════════════════════════════════════════════════════════════════════════

function highlightSnippet(snippet: string, query: string) {
  if (!query || !snippet) return snippet
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escaped})`, 'gi')
    const parts = snippet.split(regex)
    return parts.map((part, i) =>
      regex.test(part)
        ? <strong key={i} style={{ color: '#FF9500', fontWeight: 700 }}>{part}</strong>
        : part
    )
  } catch {
    return snippet
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════════════════════

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--input-bg)',
  color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
  colorScheme: 'light dark',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: 4, borderRadius: 4, color: 'var(--text-secondary)',
  display: 'flex', alignItems: 'center',
}

const navBtnStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center',
}

const secBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-surface)', cursor: 'pointer',
  fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', gap: 4,
}

const primBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: 'none',
  background: '#007AFF', color: '#fff',
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: 4,
}

const modeBtnStyle: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
  fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
  background: 'none',
}
