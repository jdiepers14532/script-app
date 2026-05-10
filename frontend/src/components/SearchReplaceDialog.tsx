import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ChevronUp, ChevronDown, X, AlertTriangle, Lock } from 'lucide-react'
import { useTerminologie } from '../sw-ui/TerminologieContext'
import type { SearchScope, SearchOptions } from '../hooks/useSearchReplace'

interface Props {
  open: boolean
  onClose: () => void
  // Current context
  currentSzeneId?: string
  currentWerkstufenId?: string
  currentFolgeId?: number
  currentProduktionId?: string
  currentBlockNummer?: number
  // All productions (Staffeln) for the dropdown
  productions?: { id: string; title: string; staffelnummer?: number; projektnummer?: string; is_active: boolean }[]
  // Editor search (scope: szene)
  editorActiveIndex: number
  editorTotal: number
  onEditorSearch: (query: string, opts: SearchOptions) => void
  onFindNext: () => void
  onFindPrev: () => void
  onReplaceCurrent: (replacement: string) => void
  onReplaceAllEditor: (replacement: string) => void
  // Backend search (scope >= episode)
  onBackendSearch: (params: {
    query: string
    scope: SearchScope
    scopeId?: string
    werkstufenTyp?: string
    contentTypes?: string[]
    options: SearchOptions
  }) => void
  onBackendReplace: (params: {
    query: string
    replacement: string
    scope: SearchScope
    scopeId?: string
    werkstufenTyp?: string
    contentTypes?: string[]
    options: SearchOptions
    excludeIds?: string[]
  }) => Promise<{ replaced_count: number; skipped_locked: number } | null>
  // Backend results
  backendResults: any[]
  backendTotal: number
  backendTotalScenes: number
  backendLockedCount: number
  backendFallbackCount: number
  backendLoading: boolean
  backendError: string | null
  // Navigation
  onNavigateToScene: (szeneId: string, folgeId: number) => void
  // Bloecke for block scope
  bloecke?: { block_nummer: number; folge_von: number; folge_bis: number }[]
}

export default function SearchReplaceDialog({
  open, onClose,
  currentSzeneId, currentWerkstufenId, currentFolgeId, currentProduktionId,
  currentBlockNummer, productions,
  editorActiveIndex, editorTotal,
  onEditorSearch, onFindNext, onFindPrev, onReplaceCurrent, onReplaceAllEditor,
  onBackendSearch, onBackendReplace,
  backendResults, backendTotal, backendTotalScenes, backendLockedCount,
  backendFallbackCount, backendLoading, backendError,
  onNavigateToScene, bloecke,
}: Props) {
  const { t } = useTerminologie()
  const inputRef = useRef<HTMLInputElement>(null)

  const prodLabel = (p: { title: string; staffelnummer?: number; projektnummer?: string }) => {
    const base = p.staffelnummer ? `${p.title} ${t('staffel')} ${p.staffelnummer}` : p.title
    return p.projektnummer ? `${p.projektnummer} · ${base}` : base
  }

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [scope, setScope] = useState<SearchScope>('block')
  const [werkstufenTyp, setWerkstufenTyp] = useState('drehbuch')
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWords: false,
    regex: false,
  })
  const [selectedBlock, setSelectedBlock] = useState<string | undefined>(undefined)
  const [selectedStaffel, setSelectedStaffel] = useState<string>(currentProduktionId || '')
  const [showPreview, setShowPreview] = useState(false)
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set())
  const [replaceResult, setReplaceResult] = useState<{ replaced_count: number; skipped_locked: number } | null>(null)

  // Auto-select current block when switching to block scope
  useEffect(() => {
    if (scope === 'block' && currentBlockNummer != null && !selectedBlock) {
      setSelectedBlock(String(currentBlockNummer))
    }
  }, [scope, currentBlockNummer, selectedBlock])

  // Sync selectedStaffel when production changes
  useEffect(() => {
    if (currentProduktionId && selectedStaffel !== 'alle') {
      setSelectedStaffel(currentProduktionId)
    }
  }, [currentProduktionId])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setReplaceResult(null)
    }
  }, [open])

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!open || !query) return
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      if (scope === 'szene') {
        onEditorSearch(query, options)
      } else {
        const eScope = scope === 'produktion' && selectedStaffel === 'alle' ? 'alle' as SearchScope : scope
        const scopeId = getScopeId()
        onBackendSearch({ query, scope: eScope, scopeId, werkstufenTyp, options })
      }
    }, 300)
    return () => clearTimeout(searchTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, options, werkstufenTyp, selectedBlock, selectedStaffel])

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
      case 'produktion': {
        if (selectedStaffel === 'alle') return undefined
        return selectedStaffel || currentProduktionId
      }
      case 'alle': return undefined
    }
  }, [scope, currentSzeneId, currentWerkstufenId, currentProduktionId, selectedBlock, bloecke, selectedStaffel])

  const getEffectiveScope = (): SearchScope =>
    scope === 'produktion' && selectedStaffel === 'alle' ? 'alle' : scope

  const handleReplace = async () => {
    if (scope === 'szene') {
      onReplaceCurrent(replacement)
    } else {
      if (!showPreview) {
        setShowPreview(true)
        return
      }
      const eScope = getEffectiveScope()
      const result = await onBackendReplace({
        query, replacement, scope: eScope,
        scopeId: getScopeId(),
        werkstufenTyp, options,
        excludeIds: Array.from(excludeIds),
      })
      if (result) {
        setReplaceResult(result)
        onBackendSearch({
          query, scope: eScope,
          scopeId: getScopeId(),
          werkstufenTyp, options,
        })
      }
    }
  }

  const handleReplaceAll = async () => {
    if (scope === 'szene') {
      onReplaceAllEditor(replacement)
    } else {
      const eScope = getEffectiveScope()
      const result = await onBackendReplace({
        query, replacement, scope: eScope,
        scopeId: getScopeId(),
        werkstufenTyp, options,
        excludeIds: Array.from(excludeIds),
      })
      if (result) {
        setReplaceResult(result)
        onBackendSearch({
          query, scope: eScope,
          scopeId: getScopeId(),
          werkstufenTyp, options,
        })
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (scope === 'szene') onFindNext()
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      if (scope === 'szene') onFindPrev()
    }
  }

  // Group results by folge_nummer
  const groupedResults: Record<number, any[]> = {}
  for (const r of backendResults) {
    const key = r.folge_nummer
    if (!groupedResults[key]) groupedResults[key] = []
    groupedResults[key].push(r)
  }

  if (!open) return null

  const isSzeneScope = scope === 'szene'
  const showWerkstufenSelector = scope === 'block' || scope === 'produktion'

  // Scope buttons: szene, episode, block, staffel (with dropdown)
  const scopeButtons: { key: SearchScope; label: string }[] = [
    { key: 'szene', label: `Aktuelle ${t('szene')}` },
    { key: 'episode', label: t('episode') },
    { key: 'block', label: 'Block' },
    { key: 'produktion', label: t('staffel') },
  ]

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 420, maxWidth: '100vw',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      zIndex: 50,
      display: 'flex', flexDirection: 'column',
      fontSize: 13,
    }} onKeyDown={handleKeyDown}>

      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
          <Search size={16} />
          Suchen und Ersetzen
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: 'var(--text-secondary)',
        }}>
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

        {/* Search input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
            Suchen
          </label>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`In ${t('szene', 'p')} suchen...`}
              style={{
                width: '100%', padding: '8px 12px', paddingRight: 80,
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
                {isSzeneScope
                  ? (editorTotal > 0 ? `${editorActiveIndex + 1} von ${editorTotal}` : 'Keine Treffer')
                  : (backendLoading ? '...' : `${backendTotal} Treffer`)
                }
              </span>
            )}
          </div>
        </div>

        {/* Replace input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
            Ersetzen durch
          </label>
          <input
            type="text"
            value={replacement}
            onChange={e => setReplacement(e.target.value)}
            placeholder="Neuer Text..."
            style={{
              width: '100%', padding: '8px 12px',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Scope selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            Ersetzen in
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {scopeButtons.map(({ key, label }) => (
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

        {/* Staffel dropdown (when produktion scope is selected) */}
        {scope === 'produktion' && productions && productions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
              {t('staffel')}
            </label>
            <select
              value={selectedStaffel}
              onChange={e => setSelectedStaffel(e.target.value)}
              style={selectStyle}
            >
              {productions.filter(p => p.is_active).map(p => (
                <option key={p.id} value={p.id}>
                  {prodLabel(p)}{p.id === currentProduktionId ? ' (aktuell)' : ''}
                </option>
              ))}
              <option value="alle">Alle {t('staffel', 'p')}</option>
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

        {/* Block selector */}
        {scope === 'block' && bloecke && bloecke.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
              Block
            </label>
            <select
              value={selectedBlock || ''}
              onChange={e => setSelectedBlock(e.target.value || undefined)}
              style={selectStyle}
            >
              <option value="">Block waehlen...</option>
              {bloecke.map(b => (
                <option key={b.block_nummer} value={String(b.block_nummer)}>
                  Block {b.block_nummer} ({t('episode')} {b.folge_von}–{b.folge_bis})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Werkstufen-Typ selector */}
        {showWerkstufenSelector && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
              Werkstufe
            </label>
            <select
              value={werkstufenTyp}
              onChange={e => setWerkstufenTyp(e.target.value)}
              style={selectStyle}
            >
              <option value="drehbuch">Drehbuch</option>
              <option value="treatment">Treatment</option>
              <option value="storyline">Beschreibung</option>
              <option value="notiz">Notiz</option>
            </select>
          </div>
        )}

        {/* Options */}
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { key: 'caseSensitive' as const, label: 'Gross-/Kleinschreibung beachten' },
            { key: 'wholeWords' as const, label: 'Nur ganze Woerter' },
            { key: 'regex' as const, label: 'Regulaere Ausdruecke' },
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

        {/* Error */}
        {backendError && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: '#FF3B3022', border: '1px solid #FF3B3055',
            color: '#FF3B30', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertTriangle size={14} />
            {backendError}
          </div>
        )}

        {/* Replace result */}
        {replaceResult && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: '#00C85322', border: '1px solid #00C85355',
            color: '#00C853', fontSize: 12,
          }}>
            {replaceResult.replaced_count} Ersetzungen durchgefuehrt.
            {replaceResult.skipped_locked > 0 && (
              <span style={{ color: '#FF9500' }}>
                {' '}{replaceResult.skipped_locked} {t('szene', replaceResult.skipped_locked === 1 ? 's' : 'p')} waren gesperrt.
              </span>
            )}
          </div>
        )}

        {/* Backend results (grouped by episode) */}
        {!isSzeneScope && backendResults.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{backendTotal} Treffer in {backendTotalScenes} {t('szene', 'p')}</span>
              {backendLockedCount > 0 && (
                <span style={{ color: '#FF9500' }}>
                  <Lock size={11} style={{ verticalAlign: -1 }} /> {backendLockedCount} gesperrt
                </span>
              )}
            </div>

            {Object.entries(groupedResults)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([folgeNr, scenes]) => (
                <ResultGroup
                  key={folgeNr}
                  folgeNummer={parseInt(folgeNr)}
                  scenes={scenes}
                  query={query}
                  episodeLabel={t('episode')}
                  szeneLabel={t('szene')}
                  onNavigate={onNavigateToScene}
                  showPreview={showPreview}
                  excludeIds={excludeIds}
                  onToggleExclude={(id) => {
                    setExcludeIds(prev => {
                      const next = new Set(prev)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                  }}
                />
              ))
            }
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
      }}>
        {isSzeneScope && (
          <>
            <button onClick={onFindPrev} disabled={editorTotal === 0} style={navBtnStyle}>
              <ChevronUp size={14} />
            </button>
            <button onClick={onFindNext} disabled={editorTotal === 0} style={navBtnStyle}>
              <ChevronDown size={14} />
            </button>
            <button onClick={() => handleReplace()} disabled={editorTotal === 0}
              style={{ ...actionBtnStyle, background: 'var(--bg-surface)' }}>
              Ersetzen
            </button>
            <button onClick={() => handleReplaceAll()} disabled={editorTotal === 0}
              style={primaryBtnStyle}>
              Alle ersetzen
            </button>
          </>
        )}
        {!isSzeneScope && (
          <>
            <span style={{ flex: 1 }} />
            {showPreview && backendResults.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {backendResults.length - excludeIds.size} ausgewaehlt
              </span>
            )}
            <button onClick={() => handleReplaceAll()} disabled={backendTotal === 0 || backendLoading}
              style={primaryBtnStyle}>
              {backendLoading ? 'Wird ersetzt...' : 'Alle ersetzen'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Result group (per episode) ─────────────────────────────────────────────

function ResultGroup({ folgeNummer, scenes, query, episodeLabel, szeneLabel, onNavigate, showPreview, excludeIds, onToggleExclude }: {
  folgeNummer: number
  scenes: any[]
  query: string
  episodeLabel: string
  szeneLabel: string
  onNavigate: (szeneId: string, folgeId: number) => void
  showPreview: boolean
  excludeIds: Set<string>
  onToggleExclude: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', borderRadius: 6, border: 'none',
          background: 'var(--bg-subtle)', cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
        }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
        {episodeLabel} {folgeNummer}
        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {scenes.length} Treffer
        </span>
      </button>
      {expanded && (
        <div style={{ paddingLeft: 12, marginTop: 4 }}>
          {scenes.map((scene, i) => (
            <div
              key={`${scene.dokument_szene_id}-${i}`}
              style={{
                padding: '6px 8px', borderRadius: 6, marginBottom: 2,
                cursor: scene.is_locked ? 'default' : 'pointer',
                opacity: scene.is_locked ? 0.5 : 1,
                fontSize: 12,
                display: 'flex', alignItems: 'flex-start', gap: 6,
              }}
              onClick={() => !scene.is_locked && onNavigate(scene.dokument_szene_id, scene.folge_id)}
            >
              {showPreview && (
                <input
                  type="checkbox"
                  checked={!excludeIds.has(scene.dokument_szene_id) && !scene.is_locked}
                  disabled={scene.is_locked}
                  onChange={() => onToggleExclude(scene.dokument_szene_id)}
                  onClick={e => e.stopPropagation()}
                  style={{ marginTop: 2, accentColor: '#007AFF' }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  {scene.is_locked && <Lock size={11} style={{ color: '#FF9500' }} />}
                  <span style={{ fontWeight: 500 }}>
                    {szeneLabel} {scene.scene_nummer}
                  </span>
                  {scene.ort_name && (
                    <span style={{ color: 'var(--text-secondary)' }}>({scene.ort_name})</span>
                  )}
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, padding: '1px 6px',
                    borderRadius: 4, fontWeight: 500,
                    background: scene.is_fallback ? '#FF950022' : 'var(--bg-subtle)',
                    color: scene.is_fallback ? '#FF9500' : 'var(--text-secondary)',
                  }}>
                    [{scene.werkstufe_typ}{scene.is_fallback ? ' ↑' : ''}]
                  </span>
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {highlightSnippet(scene.snippet, query)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Snippet highlighting ───────────────────────────────────────────────────

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

// ── Styles ─────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--input-bg)',
  color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
  colorScheme: 'light dark',
}

const navBtnStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center',
}

const actionBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
  cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: 'none',
  background: '#007AFF', color: '#fff',
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
}
