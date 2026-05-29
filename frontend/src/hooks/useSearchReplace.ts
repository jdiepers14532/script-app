import { useState, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { api } from '../api/client'
import {
  setSearchQuery, findNext as editorFindNext, findPrev as editorFindPrev,
  replaceCurrent as editorReplaceCurrent, replaceAll as editorReplaceAll,
  clearSearch as editorClearSearch,
} from '../tiptap/SearchHighlightExtension'

export type SearchScope = 'szene' | 'episode' | 'block' | 'produktion' | 'alle'

export interface SearchOptions {
  caseSensitive: boolean
  wholeWords: boolean
  regex: boolean
}

export interface SearchResult {
  dokument_szene_id: string
  scene_identity_id: string
  scene_nummer: number
  ort_name: string
  folge_id: number
  folge_nummer: number
  werkstufe_id: string
  werkstufe_typ: string
  werkstufe_version: number
  is_fallback: boolean
  is_locked: boolean
  locked_by: string | null
  snippet: string
  match_position: number
  match_length: number
}

export interface SceneCard {
  scene_identity_id: string
  dokument_szene_id: string
  scene_nummer: number
  ort_name: string
  innen_aussen: string
  tag_nacht: string
  stoppzeit_sek: number | null
  spieltag: number | null
  folge_id: number
  folge_nummer: number
  werkstufe_id: string
  werkstufe_typ: string
  version_nummer: number
  is_fallback: boolean
  is_locked: boolean
  locked_by: string | null
  rollen: { name: string }[]
}

export type EntityType = 'rolle' | 'motiv' | 'none' | 'loading'
export type EntityMode = 'szenen' | 'text'
export type ChipType = 'rolle' | 'motiv' | 'ia' | 'dt' | 'text'
export type SearchMode = 'suchen' | 'ersetzen'
export type ReviewStatus = 'idle' | 'reviewing' | 'done'

export interface EntityChip {
  id: string
  type: ChipType
  label: string
  value: string       // der angezeigte Wert
  entityId?: string   // DB-ID für rolle/motiv
}

export interface SearchState {
  // Modi
  searchMode: SearchMode
  // Eingabe
  query: string
  replacement: string
  // Scope
  scope: SearchScope
  scopeId: string | undefined
  werkstufenTyp: string
  contentTypes: string[]
  // Optionen
  options: SearchOptions
  includeFrei: boolean
  includePrivate: boolean
  // Entity-Erkennung
  entityType: EntityType
  entityMatches: any[]
  entityMode: EntityMode
  // Chips
  chips: EntityChip[]
  // Text-Suche (Snippets)
  results: SearchResult[]
  total: number
  totalScenes: number
  lockedCount: number
  fallbackCount: number
  // Szenen-Suche (Entity-Modus)
  sceneResults: SceneCard[]
  sceneTotal: number
  // Ladezustand
  loading: boolean
  error: string | null
  // In-Editor (Scope: szene)
  editorActiveIndex: number
  editorTotal: number
  // Accept/Reject Review
  reviewStatus: ReviewStatus
  reviewIndex: number
  reviewSkipped: number
  reviewAccepted: number
  // Rollenname-Ersetzen
  rollennameMode: boolean  // true wenn Entity=rolle + Modus=ersetzen
  rollennameReplaceType: 'nur_rollennamen' | 'volltext'
}

const INITIAL_STATE: SearchState = {
  searchMode: 'suchen',
  query: '',
  replacement: '',
  scope: 'produktion',
  scopeId: undefined,
  werkstufenTyp: 'drehbuch',
  contentTypes: ['drehbuch', 'storyline', 'treatment'],
  options: { caseSensitive: false, wholeWords: false, regex: false },
  includeFrei: false,
  includePrivate: false,
  entityType: 'none',
  entityMatches: [],
  entityMode: 'szenen',
  chips: [],
  results: [],
  total: 0,
  totalScenes: 0,
  lockedCount: 0,
  fallbackCount: 0,
  sceneResults: [],
  sceneTotal: 0,
  loading: false,
  error: null,
  editorActiveIndex: -1,
  editorTotal: 0,
  reviewStatus: 'idle',
  reviewIndex: 0,
  reviewSkipped: 0,
  reviewAccepted: 0,
  rollennameMode: false,
  rollennameReplaceType: 'nur_rollennamen',
}

function getEditorState(editor: Editor | null) {
  if (!editor) return { activeIndex: -1, total: 0 }
  const storage = editor.storage?.searchHighlight
  return {
    activeIndex: storage?.activeIndex ?? -1,
    total: storage?.results?.length ?? 0,
  }
}

function chipId() {
  return Math.random().toString(36).slice(2, 10)
}

export function useSearchReplace() {
  const [state, setState] = useState<SearchState>(INITIAL_STATE)
  const editorRef = useRef<Editor | null>(null)
  const entityTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const setEditor = useCallback((editor: Editor | null) => {
    editorRef.current = editor
  }, [])

  const updateState = useCallback((partial: Partial<SearchState>) => {
    setState(prev => ({ ...prev, ...partial }))
  }, [])

  // ── Modus ──────────────────────────────────────────────────────────────────

  const setSearchMode = useCallback((mode: SearchMode) => {
    setState(prev => ({
      ...prev,
      searchMode: mode,
      reviewStatus: 'idle',
      reviewIndex: 0,
      reviewAccepted: 0,
      reviewSkipped: 0,
    }))
  }, [])

  // ── In-Editor Search ────────────────────────────────────────────────────────

  const searchInEditor = useCallback((query: string, opts: SearchOptions) => {
    const editor = editorRef.current
    if (!editor) return
    setSearchQuery(editor, query, opts)
    const { activeIndex, total } = getEditorState(editor)
    setState(prev => ({ ...prev, query, options: opts, editorActiveIndex: activeIndex, editorTotal: total }))
  }, [])

  const findNext = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editorFindNext(editor)
    const { activeIndex } = getEditorState(editor)
    setState(prev => ({ ...prev, editorActiveIndex: activeIndex }))
  }, [])

  const findPrev = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editorFindPrev(editor)
    const { activeIndex } = getEditorState(editor)
    setState(prev => ({ ...prev, editorActiveIndex: activeIndex }))
  }, [])

  const replaceCurrent = useCallback((replacement: string) => {
    const editor = editorRef.current
    if (!editor) return
    editorReplaceCurrent(editor, replacement)
    setTimeout(() => {
      const { activeIndex, total } = getEditorState(editor)
      setState(prev => ({ ...prev, editorActiveIndex: activeIndex, editorTotal: total }))
    }, 50)
  }, [])

  const replaceAllInEditor = useCallback((replacement: string) => {
    const editor = editorRef.current
    if (!editor) return
    editorReplaceAll(editor, replacement)
    setTimeout(() => {
      const { activeIndex, total } = getEditorState(editor)
      setState(prev => ({ ...prev, editorActiveIndex: activeIndex, editorTotal: total }))
    }, 50)
  }, [])

  // ── Entity-Erkennung ────────────────────────────────────────────────────────

  const checkEntity = useCallback((query: string, produktionId: string) => {
    clearTimeout(entityTimerRef.current)
    if (!query || query.trim().length < 2 || !produktionId) {
      setState(prev => ({ ...prev, entityType: 'none', entityMatches: [] }))
      return
    }
    setState(prev => ({ ...prev, entityType: 'loading' }))
    entityTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchEntityCheck({ q: query.trim(), produktion_id: produktionId })
        setState(prev => ({
          ...prev,
          entityType: res.type,
          entityMatches: res.matches,
          // Wenn Rolle erkannt und Ersetzen-Modus: rollennameMode aktivieren
          rollennameMode: res.type === 'rolle' && prev.searchMode === 'ersetzen',
        }))
      } catch {
        setState(prev => ({ ...prev, entityType: 'none', entityMatches: [] }))
      }
    }, 500)
  }, [])

  const setEntityMode = useCallback((mode: EntityMode) => {
    setState(prev => ({ ...prev, entityMode: mode }))
  }, [])

  // ── Chips ───────────────────────────────────────────────────────────────────

  const addChip = useCallback((chip: Omit<EntityChip, 'id'>) => {
    setState(prev => {
      // Keine Duplikate (gleicher type + value)
      const exists = prev.chips.some(c => c.type === chip.type && c.value === chip.value)
      if (exists) return prev
      return { ...prev, chips: [...prev.chips, { ...chip, id: chipId() }] }
    })
  }, [])

  const removeChip = useCallback((id: string) => {
    setState(prev => ({ ...prev, chips: prev.chips.filter(c => c.id !== id) }))
  }, [])

  const clearChips = useCallback(() => {
    setState(prev => ({ ...prev, chips: [] }))
  }, [])

  // ── Backend Text-Suche ────────────────────────────────────────────────────────

  const searchBackend = useCallback(async (params: {
    query: string
    scope: SearchScope
    scopeId?: string
    werkstufenTyp?: string
    contentTypes?: string[]
    options: SearchOptions
    includeFrei?: boolean
    includePrivate?: boolean
  }) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await api.search({
        query: params.query,
        scope: params.scope,
        scope_id: params.scopeId,
        werkstufe_typ: params.werkstufenTyp,
        content_types: params.contentTypes,
        case_sensitive: params.options.caseSensitive,
        whole_words: params.options.wholeWords,
        regex: params.options.regex,
        include_frei: params.includeFrei,
        include_private: params.includePrivate,
      })
      setState(prev => ({
        ...prev,
        results: res.results,
        total: res.total,
        totalScenes: res.total_scenes,
        lockedCount: res.locked_count,
        fallbackCount: res.fallback_count,
        loading: false,
      }))
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }))
    }
  }, [])

  // ── Backend Szenen-Suche (Entity/Kombi-Modus) ─────────────────────────────

  const searchSzenen = useCallback(async (params: {
    produktion_id: string
    scope?: SearchScope
    scopeId?: string
    werkstufenTyp?: string
    chips: EntityChip[]
    includeFrei?: boolean
    includePrivate?: boolean
  }) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const rolleIds = params.chips.filter(c => c.type === 'rolle' && c.entityId).map(c => c.entityId!)
      const motivIds = params.chips.filter(c => c.type === 'motiv' && c.entityId).map(c => c.entityId!)
      const rolleNames = params.chips.filter(c => c.type === 'rolle' && !c.entityId).map(c => c.value)
      const iaChip = params.chips.find(c => c.type === 'ia')
      const dtChip = params.chips.find(c => c.type === 'dt')
      const textChip = params.chips.find(c => c.type === 'text')

      const res = await api.searchSzenen({
        produktion_id: params.produktion_id,
        scope: params.scope,
        scope_id: params.scopeId,
        werkstufe_typ: params.werkstufenTyp,
        rolle_ids: rolleIds.length ? rolleIds : undefined,
        motiv_ids: motivIds.length ? motivIds : undefined,
        rolle_names: rolleNames.length ? rolleNames : undefined,
        ia: iaChip?.value,
        dt: dtChip?.value,
        freitext: textChip?.value,
        include_frei: params.includeFrei,
        include_private: params.includePrivate,
      })
      setState(prev => ({
        ...prev,
        sceneResults: res.szenen,
        sceneTotal: res.total,
        loading: false,
      }))
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }))
    }
  }, [])

  // ── Backend Replace ────────────────────────────────────────────────────────

  const replaceBackend = useCallback(async (params: {
    query: string
    replacement: string
    scope: SearchScope
    scopeId?: string
    werkstufenTyp?: string
    contentTypes?: string[]
    options: SearchOptions
    excludeIds?: string[]
  }) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await api.replace({
        query: params.query,
        replacement: params.replacement,
        scope: params.scope,
        scope_id: params.scopeId,
        werkstufe_typ: params.werkstufenTyp,
        content_types: params.contentTypes,
        case_sensitive: params.options.caseSensitive,
        whole_words: params.options.wholeWords,
        regex: params.options.regex,
        exclude_ids: params.excludeIds,
      })
      setState(prev => ({ ...prev, loading: false }))
      return res
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }))
      return null
    }
  }, [])

  // ── Accept/Reject Review ───────────────────────────────────────────────────

  const startReview = useCallback(() => {
    setState(prev => ({
      ...prev,
      reviewStatus: 'reviewing',
      reviewIndex: 0,
      reviewAccepted: 0,
      reviewSkipped: 0,
    }))
  }, [])

  // Ersetzt eine einzelne Szene und entfernt sie aus der Liste
  const acceptCurrent = useCallback(async (
    match: SearchResult,
    query: string,
    replacement: string,
    options: SearchOptions,
    onNavigate?: (szeneId: string, folgeId: number) => void
  ) => {
    try {
      await api.replace({
        query,
        replacement,
        scope: 'szene',
        scope_id: match.dokument_szene_id,
        case_sensitive: options.caseSensitive,
        whole_words: options.wholeWords,
        regex: options.regex,
      })
      if (onNavigate) onNavigate(match.dokument_szene_id, match.folge_id)
      setState(prev => ({
        ...prev,
        reviewAccepted: prev.reviewAccepted + 1,
        results: prev.results.filter(r => r.dokument_szene_id !== match.dokument_szene_id || r.match_position !== match.match_position),
        total: Math.max(0, prev.total - 1),
      }))
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }))
    }
  }, [])

  const skipCurrent = useCallback((match: SearchResult) => {
    setState(prev => ({
      ...prev,
      reviewSkipped: prev.reviewSkipped + 1,
      results: prev.results.filter(r => r.dokument_szene_id !== match.dokument_szene_id || r.match_position !== match.match_position),
      total: Math.max(0, prev.total - 1),
    }))
  }, [])

  const acceptAllRemaining = useCallback(async (
    query: string,
    replacement: string,
    scope: SearchScope,
    scopeId: string | undefined,
    options: SearchOptions,
    remainingIds: string[]
  ) => {
    setState(prev => ({ ...prev, loading: true }))
    try {
      const excludeAll = [] // keine Ausschlüsse
      const res = await api.replace({
        query,
        replacement,
        scope,
        scope_id: scopeId,
        case_sensitive: options.caseSensitive,
        whole_words: options.wholeWords,
        regex: options.regex,
      })
      setState(prev => ({
        ...prev,
        loading: false,
        reviewStatus: 'done',
        reviewAccepted: prev.reviewAccepted + (res?.replaced_count ?? 0),
        results: [],
        total: 0,
      }))
      return res
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }))
      return null
    }
  }, [])

  const finishReview = useCallback(() => {
    setState(prev => ({ ...prev, reviewStatus: 'done' }))
  }, [])

  const resetReview = useCallback(() => {
    setState(prev => ({
      ...prev,
      reviewStatus: 'idle',
      reviewIndex: 0,
      reviewAccepted: 0,
      reviewSkipped: 0,
    }))
  }, [])

  // ── Rollenname-Ersetzen ────────────────────────────────────────────────────

  const replaceRollenname = useCallback(async (params: {
    old_name: string
    new_name: string
    produktion_id: string
  }) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await api.replaceRollenname(params)
      setState(prev => ({ ...prev, loading: false }))
      return res
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }))
      return null
    }
  }, [])

  // ── Clear ──────────────────────────────────────────────────────────────────

  const clearSearch = useCallback(() => {
    const editor = editorRef.current
    if (editor) editorClearSearch(editor)
    clearTimeout(entityTimerRef.current)
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    updateState,
    setEditor,
    // Modi
    setSearchMode,
    // Editor
    searchInEditor,
    findNext,
    findPrev,
    replaceCurrent,
    replaceAllInEditor,
    // Entity
    checkEntity,
    setEntityMode,
    // Chips
    addChip,
    removeChip,
    clearChips,
    // Backend
    searchBackend,
    searchSzenen,
    replaceBackend,
    // Review
    startReview,
    acceptCurrent,
    skipCurrent,
    acceptAllRemaining,
    finishReview,
    resetReview,
    // Rollenname
    replaceRollenname,
    // Reset
    clearSearch,
  }
}
