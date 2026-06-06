// Anmerkungen-Decorations — view-lokale ProseMirror-Decorations (Handoff 2 §4).
// KEIN Mark im content (das ist das Alt-System AnnotationMark/sp-annotation). Die Decorations
// werden aus den DB-Ankern berechnet, wandern via set.map live mit Edits mit und kollidieren
// nicht mit dem Yjs-Collab-Plugin (jeder Client berechnet sie lokal). Registriert wird das
// Plugin via editor.registerPlugin() im useEffect — analog FreigabeStatusPlugin, NICHT im
// Extensions-Array.
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const annotKey = new PluginKey('swAnnotations')

export interface ResolvedDeco {
  anmerkungId: string
  status: string  // anmerkung.status (offen|in_arbeit|uebernommen|abgelehnt)
  quelle: string
  from?: number
  to?: number
}

export function createAnnotationPlugin(opts: { onOpen?: (id: string) => void }) {
  return new Plugin({
    key: annotKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const meta = tr.getMeta(annotKey)
        if (meta?.decos) return DecorationSet.create(tr.doc, meta.decos)
        return set.map(tr.mapping, tr.doc) // live: wandert mit Edits mit
      },
    },
    props: {
      decorations(state) { return annotKey.getState(state) },
      handleClick(view, pos) {
        const found = annotKey.getState(view.state)?.find(pos, pos) ?? []
        if (found.length) { opts.onOpen?.(found[0].spec.anmerkungId); return true }
        return false
      },
    },
  })
}

// Decorations aus aufgelösten Ankern setzen. activeId hebt die offene Karte hervor.
export function pushDecorations(view: any, resolved: ResolvedDeco[], activeId?: string | null) {
  const decos = resolved
    .filter(r => r.from != null && r.to != null && r.to > r.from)
    .map(r => Decoration.inline(r.from!, r.to!, {
      class: `sw-annot sw-annot--${r.status} sw-annot--q-${r.quelle}`
        + (r.anmerkungId === activeId ? ' sw-annot--active' : ''),
    }, { anmerkungId: r.anmerkungId }))
  view.dispatch(view.state.tr.setMeta(annotKey, { decos }))
}

// TR-Styling (Handoff 2 §8) + active-Hervorhebung. Quelle-Akzent links als dünne Border.
export const SW_ANNOT_CSS = `
.sw-annot              { border-radius: 2px; cursor: pointer; transition: background 0.15s; }
.sw-annot--offen       { background:#FAEEDA; border-bottom:2px solid #EF9F27; }
.sw-annot--in_arbeit   { background:#FAEEDA; border-bottom:2px solid #FFCC00; }
.sw-annot--uebernommen { background:#EAF3DE; border-bottom:2px solid #00C853; }
.sw-annot--abgelehnt   { opacity:.5; text-decoration:line-through; }
.sw-annot--active      { box-shadow: 0 0 0 2px rgba(0,122,255,0.5); border-radius: 3px; }
@keyframes sw-annot-flash {
  0%   { background:#CFE3FB; }
  100% { background:inherit; }
}
.sw-annot--flash       { animation: sw-annot-flash 0.9s ease-out; }
`
