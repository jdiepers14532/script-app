import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'

const SEARCH_KEY = new PluginKey('searchHighlight')

function buildRegex(query: string, opts: { caseSensitive: boolean; wholeWords: boolean; regex: boolean }): RegExp | null {
  if (!query) return null
  try {
    let pattern = query
    if (!opts.regex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    if (opts.wholeWords) {
      pattern = `\\b${pattern}\\b`
    }
    return new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

function findInDoc(doc: PmNode, regex: RegExp): { from: number; to: number }[] {
  const results: { from: number; to: number }[] = []
  doc.descendants((node: PmNode, pos: number) => {
    if (!node.isText) return
    const text = node.text || ''
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const from = pos + match.index
      const to = from + match[0].length
      results.push({ from, to })
      if (match[0].length === 0) regex.lastIndex++
    }
  })
  return results
}

function rerunSearch(editor: Editor) {
  const storage = editor.storage.searchHighlight
  const regex = buildRegex(storage.query, storage)
  storage.results = regex ? findInDoc(editor.state.doc, regex) : []
  if (storage.activeIndex >= storage.results.length) {
    storage.activeIndex = storage.results.length > 0 ? 0 : -1
  }
  editor.view.dispatch(editor.state.tr.setMeta(SEARCH_KEY, { updated: true }))
}

export const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',

  addStorage() {
    return {
      query: '',
      caseSensitive: false,
      wholeWords: false,
      regex: false,
      results: [] as { from: number; to: number }[],
      activeIndex: -1,
    }
  },

  addProseMirrorPlugins() {
    const extensionEditor = this.editor

    return [
      new Plugin({
        key: SEARCH_KEY,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr: Transaction, oldDecorations: DecorationSet) {
            const meta = tr.getMeta(SEARCH_KEY)
            if (!meta && !tr.docChanged) return oldDecorations

            const storage = extensionEditor.storage.searchHighlight
            if (!storage.results || storage.results.length === 0) {
              return DecorationSet.empty
            }

            if (tr.docChanged && storage.query) {
              const regex = buildRegex(storage.query, storage)
              storage.results = regex ? findInDoc(tr.doc, regex) : []
              if (storage.activeIndex >= storage.results.length) {
                storage.activeIndex = storage.results.length > 0 ? 0 : -1
              }
            }

            const decorations: Decoration[] = []
            for (let i = 0; i < storage.results.length; i++) {
              const { from, to } = storage.results[i]
              if (from >= 0 && to <= tr.doc.content.size) {
                const isActive = i === storage.activeIndex
                decorations.push(
                  Decoration.inline(from, to, {
                    class: isActive ? 'search-highlight-active' : 'search-highlight',
                  })
                )
              }
            }
            return DecorationSet.create(tr.doc, decorations)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

// ── Imperative API (called from useSearchReplace hook) ─────────────────────

export function setSearchQuery(
  editor: Editor,
  query: string,
  opts?: { caseSensitive?: boolean; wholeWords?: boolean; regex?: boolean }
) {
  const storage = editor.storage.searchHighlight
  if (!storage) return
  storage.query = query
  if (opts?.caseSensitive !== undefined) storage.caseSensitive = opts.caseSensitive
  if (opts?.wholeWords !== undefined) storage.wholeWords = opts.wholeWords
  if (opts?.regex !== undefined) storage.regex = opts.regex

  const regex = buildRegex(query, storage)
  storage.results = regex ? findInDoc(editor.state.doc, regex) : []
  storage.activeIndex = storage.results.length > 0 ? 0 : -1
  editor.view.dispatch(editor.state.tr.setMeta(SEARCH_KEY, { updated: true }))
}

export function findNext(editor: Editor) {
  const storage = editor.storage.searchHighlight
  if (!storage || storage.results.length === 0) return
  storage.activeIndex = (storage.activeIndex + 1) % storage.results.length
  editor.view.dispatch(editor.state.tr.setMeta(SEARCH_KEY, { updated: true }))
  scrollToMatch(editor, storage.results[storage.activeIndex])
}

export function findPrev(editor: Editor) {
  const storage = editor.storage.searchHighlight
  if (!storage || storage.results.length === 0) return
  storage.activeIndex = (storage.activeIndex - 1 + storage.results.length) % storage.results.length
  editor.view.dispatch(editor.state.tr.setMeta(SEARCH_KEY, { updated: true }))
  scrollToMatch(editor, storage.results[storage.activeIndex])
}

export function replaceCurrent(editor: Editor, replacement: string) {
  const storage = editor.storage.searchHighlight
  if (!storage || storage.activeIndex < 0 || storage.results.length === 0) return
  const active = storage.results[storage.activeIndex]
  if (!active) return

  const tr = editor.state.tr.replaceWith(
    active.from, active.to,
    editor.state.schema.text(replacement)
  )
  editor.view.dispatch(tr)
  setTimeout(() => rerunSearch(editor), 0)
}

export function replaceAll(editor: Editor, replacement: string) {
  const storage = editor.storage.searchHighlight
  if (!storage || storage.results.length === 0) return

  const tr = editor.state.tr
  const sorted = [...storage.results].sort((a, b) => b.from - a.from)
  for (const match of sorted) {
    tr.replaceWith(match.from, match.to, editor.state.schema.text(replacement))
  }
  editor.view.dispatch(tr)
  setTimeout(() => rerunSearch(editor), 0)
}

export function clearSearch(editor: Editor) {
  const storage = editor.storage.searchHighlight
  if (!storage) return
  storage.query = ''
  storage.results = []
  storage.activeIndex = -1
  editor.view.dispatch(editor.state.tr.setMeta(SEARCH_KEY, { updated: true }))
}

function scrollToMatch(editor: Editor, match: { from: number; to: number } | undefined) {
  if (!match) return
  try {
    const coords = editor.view.coordsAtPos(match.from)
    const editorDom = editor.view.dom.closest('.ProseMirror')?.parentElement
    if (editorDom && coords) {
      const rect = editorDom.getBoundingClientRect()
      const relY = coords.top - rect.top
      if (relY < 0 || relY > rect.height) {
        editorDom.scrollTop += relY - rect.height / 2
      }
    }
  } catch {
    // ignore scroll errors
  }
}
