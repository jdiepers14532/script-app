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

export interface SearchState {
  query: string
  replacement: string
  scope: SearchScope
  scopeId: string | undefined
  werkstufenTyp: string
  contentTypes: string[]
  options: SearchOptions
  results: SearchResult[]
  total: number
  totalScenes: number
  lockedCount: number
  fallbackCount: number
  loading: boolean
  error: string | null
  editorActiveIndex: number
  editorTotal: number
}

const INITIAL_STATE: SearchState = {
  query: '',
  replacement: '',
  scope: 'szene',
  scopeId: undefined,
  werkstufenTyp: 'drehbuch',
  contentTypes: ['drehbuch', 'storyline', 'treatment'],
  options: { caseSensitive: false, wholeWords: false, regex: false },
  results: [],
  total: 0,
  totalScenes: 0,
  lockedCount: 0,
  fallbackCount: 0,
  loading: false,
  error: null,
  editorActiveIndex: -1,
  editorTotal: 0,
}

function getEditorState(editor: Editor | null) {
  if (!editor) return { activeIndex: -1, total: 0 }
  const storage = editor.storage?.searchHighlight
  return {
    activeIndex: storage?.activeIndex ?? -1,
    total: storage?.results?.length ?? 0,
  }
}

export function useSearchReplace() {
  const [state, setState] = useState<SearchState>(INITIAL_STATE)
  const editorRef = useRef<Editor | null>(null)

  const setEditor = useCallback((editor: Editor | null) => {
    editorRef.current = editor
  }, [])

  const updateState = useCallback((partial: Partial<SearchState>) => {
    setState(prev => ({ ...prev, ...partial }))
  }, [])

  // ── In-Editor Search ────────────────────────────────────────────────────

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

  // ── Backend Search ────────────────────────────────────────────────────────

  const searchBackend = useCallback(async (params: {
    query: string
    scope: SearchScope
    scopeId?: string
    werkstufenTyp?: string
    contentTypes?: string[]
    options: SearchOptions
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

  const clearSearch = useCallback(() => {
    const editor = editorRef.current
    if (editor) editorClearSearch(editor)
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    updateState,
    setEditor,
    searchInEditor,
    findNext,
    findPrev,
    replaceCurrent,
    replaceAllInEditor,
    searchBackend,
    replaceBackend,
    clearSearch,
  }
}
