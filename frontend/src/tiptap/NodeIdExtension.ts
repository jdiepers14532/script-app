import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * NodeIdExtension — stabile Block-Identität (Handoff 1, Phase 1)
 *
 * Aufgaben:
 * 1. GlobalAttributes: fügt `node_id` zu allen StarterKit/Tiptap-Block-Typen hinzu.
 *    Custom-Extensions (screenplay_element, absatz) deklarieren node_id in ihrem
 *    eigenen addAttributes() — hier NICHT auflisten, um Konflikte zu vermeiden.
 *
 * 2. appendTransaction-Plugin: weist jedem Block ohne node_id eine frische UUID zu
 *    und löst Duplikate auf (entsteht durch Copy-Paste innerhalb einer Szene).
 *    Eindeutigkeit gilt szenenintern; ÜBER Werkstufen hinweg sind gleiche node_ids
 *    gewollt (Diff-Matching, Invariante 1.3).
 *
 * Invariante 1.3: Beim Werkstufen-Copy (full) wird content 1:1 per SQL kopiert —
 * node_ids bleiben automatisch erhalten. Dieses Plugin generiert beim Copy-Paste
 * ÜBER Szenen hinweg neue UUIDs (korrekt: gleicher Block in neuer Szene = neue ID).
 * Innerhalb einer Szene werden Duplikate aufgelöst (korrekt).
 *
 * NOTE Phase B (Fassungsvergleich Annehmen/Ablehnen, noch nicht implementiert):
 * Wenn Phase B umgesetzt wird, darf das Merge-Ergebnis ausschließlich in die
 * editierbare Werkstufe geschrieben werden — niemals in eine eingefrorene Stufe
 * (kollidiert mit Freeze-Guard aus Phase 3). Eingefrorene Stufen sind reine
 * Lese-Quellen. Wegen Hocuspocus/Yjs ist Tiptap Pro Snapshot-Compare die
 * risikoärmere Option gegenüber Eigenbau auf prosemirror-suggestion-mode.
 */

// Block-Typen, die node_id über GlobalAttributes erhalten.
// screenplay_element und absatz haben node_id in ihrer eigenen addAttributes() —
// hier nicht auflisten, sonst doppelte Attribut-Deklaration.
const GLOBAL_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'image',
  'table',
]

const nodeIdPluginKey = new PluginKey('nodeId')

export const NodeIdExtension = Extension.create({
  name: 'nodeId',

  addGlobalAttributes() {
    return [
      {
        types: GLOBAL_BLOCK_TYPES,
        attributes: {
          node_id: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-node-id') || null,
            renderHTML: (attributes) =>
              attributes.node_id ? { 'data-node-id': attributes.node_id } : {},
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: nodeIdPluginKey,

        appendTransaction(transactions, _oldState, newState) {
          // Nur feuern wenn sich das Dokument geändert hat
          if (!transactions.some((tr) => tr.docChanged)) return null

          const tr = newState.tr
          let modified = false

          // Einzel-Durchlauf über Top-Level-Blöcke in Dokumentreihenfolge.
          // "acceptedIds": erste Vorkommen einer UUID wird akzeptiert,
          // alle weiteren (Duplikat durch Copy-Paste) erhalten eine neue UUID.
          const acceptedIds = new Set<string>()

          newState.doc.forEach((node, pos) => {
            if (!node.isBlock) return

            const currentId: string | null = node.attrs?.node_id ?? null

            if (!currentId || acceptedIds.has(currentId)) {
              // Kein UUID (neuer Block) oder Duplikat (Copy-Paste) → neue UUID vergeben
              const newId = crypto.randomUUID()
              acceptedIds.add(newId)
              // setNodeMarkup ändert nur Attribute, nicht Content → keine Positions-Shifts
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, node_id: newId })
              modified = true
            } else {
              // Erste Verwendung dieser UUID → akzeptieren
              acceptedIds.add(currentId)
            }
          })

          return modified ? tr : null
        },
      }),
    ]
  },
})
