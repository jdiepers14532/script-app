// useAnnotationLayer — verbindet die Tiptap-Instanz mit dem Anker-System (Handoff 2 §2/§4/§6).
// Kapselt: Decoration-Plugin (registerPlugin, analog FreigabeStatusPlugin), Resolve→pushDecorations,
// Selektion→"Anmerken"-Affordance + Erstell-Popover, activeId→Scroll. Wird in UniversalEditor
// aufgerufen; bei opts=null ist alles ein No-Op (Editor anderswo ohne Anmerkungen nutzbar).
import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { MessageSquarePlus } from 'lucide-react'
import {
  createAnnotationPlugin, pushDecorations, annotKey, SW_ANNOT_CSS,
} from '../tiptap/AnnotationDecorationsPlugin'
import {
  selektorFromSelection, resolveAll, type DecoAnker, type Selektor, type ResolvedAnchor,
} from '../utils/anchorResolve'

export interface AnnotationLayerOpts {
  decoAnker: DecoAnker[]
  activeAnmerkungId: string | null
  onOpen: (id: string) => void
  onCreateContent: (p: { node_id: string | null; selektor: Selektor; quelle: string; body: any }) => Promise<void> | void
  onResolved?: (resolved: ResolvedAnchor[]) => void
  canCreate: boolean
}

const QUELLEN: { value: string; label: string }[] = [
  { value: 'produktion', label: 'Produktion' },
  { value: 'redaktion', label: 'Redaktion' },
  { value: 'sender', label: 'Sender' },
  { value: 'kunde', label: 'Kunde' },
  { value: 'kostuem', label: 'Kostüm' },
  { value: 'ausstattung', label: 'Ausstattung' },
  { value: 'requisite', label: 'Requisite' },
]

let cssInjected = false
function injectCSS() {
  if (cssInjected) return
  cssInjected = true
  const style = document.createElement('style')
  style.id = 'sw-annot-css'
  style.textContent = SW_ANNOT_CSS
  document.head.appendChild(style)
}

export function useAnnotationLayer(editor: Editor | null, opts: AnnotationLayerOpts | null): { overlay: ReactNode } {
  const [sel, setSel] = useState<{ top: number; left: number; node_id: string | null; selektor: Selektor } | null>(null)
  const [composing, setComposing] = useState(false)
  const [quelle, setQuelle] = useState('produktion')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const resolvedRef = useRef<ResolvedAnchor[]>([])
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => { injectCSS() }, [])

  // Plugin registrieren (view-lokal, neben Yjs — analog FreigabeStatusPlugin)
  useEffect(() => {
    if (!editor || !opts) return
    const plugin = createAnnotationPlugin({ onOpen: (id) => optsRef.current?.onOpen(id) })
    try { editor.registerPlugin(plugin) } catch {}
    return () => { try { editor.unregisterPlugin(annotKey) } catch {} }
  }, [editor, !!opts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve + push (bei Anker-/active-Änderung)
  useEffect(() => {
    if (!editor || !opts) return
    const resolved = resolveAll(editor.state.doc, opts.decoAnker)
    resolvedRef.current = resolved
    opts.onResolved?.(resolved)
    pushDecorations(editor.view,
      resolved.map(r => ({ anmerkungId: r.anmerkungId, status: r.annStatus, quelle: r.quelle, from: r.from, to: r.to })),
      opts.activeAnmerkungId)
  }, [editor, opts?.decoAnker, opts?.activeAnmerkungId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-resolve nach Doc-Änderungen (Yjs-Hydration + Struktur-Edits), debounced
  useEffect(() => {
    if (!editor || !opts) return
    let t: ReturnType<typeof setTimeout> | null = null
    const onTx = ({ transaction }: any) => {
      if (!transaction.docChanged) return
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        const o = optsRef.current
        if (!o) return
        const resolved = resolveAll(editor.state.doc, o.decoAnker)
        resolvedRef.current = resolved
        o.onResolved?.(resolved)
        pushDecorations(editor.view,
          resolved.map(r => ({ anmerkungId: r.anmerkungId, status: r.annStatus, quelle: r.quelle, from: r.from, to: r.to })),
          o.activeAnmerkungId)
      }, 400)
    }
    editor.on('transaction', onTx)
    return () => { if (t) clearTimeout(t); editor.off('transaction', onTx) }
  }, [editor, !!opts]) // eslint-disable-line react-hooks/exhaustive-deps

  // activeId → zur Stelle scrollen
  useEffect(() => {
    if (!editor || !opts?.activeAnmerkungId) return
    const r = resolvedRef.current.find(x => x.anmerkungId === opts.activeAnmerkungId)
    if (r?.from == null) return
    try {
      const dom = editor.view.domAtPos(r.from)
      const el = (dom.node.nodeType === 3 ? dom.node.parentElement : dom.node) as HTMLElement | null
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    } catch {}
  }, [editor, opts?.activeAnmerkungId])

  // Selektion → "Anmerken"-Button-Position.
  // KEIN blur-Handler: die <textarea autoFocus> im Popover zieht den Editor-Fokus → ein blur→setSel(null)
  // würde das Popover sofort schließen (Klick wirkungslos). Stattdessen steuert nur selectionUpdate sel;
  // während composing bleibt sel stabil (return), der Wrapper hält per mousedown-preventDefault die Selektion.
  useEffect(() => {
    if (!editor || !opts || !opts.canCreate) { setSel(null); return }
    const update = () => {
      if (composing) return
      const payload = selektorFromSelection(editor.state)
      if (!payload) { setSel(null); return }
      const { to } = editor.state.selection
      try {
        const coords = editor.view.coordsAtPos(to)
        setSel({ top: coords.bottom, left: coords.left, node_id: payload.node_id, selektor: payload.selektor })
      } catch { setSel(null) }
    }
    editor.on('selectionUpdate', update)
    return () => { editor.off('selectionUpdate', update) }
  }, [editor, !!opts, opts?.canCreate, composing]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => { setComposing(false); setSel(null); setText('') }

  const submit = async () => {
    if (!sel || !text.trim() || !optsRef.current) return
    setSaving(true)
    try {
      await optsRef.current.onCreateContent({
        node_id: sel.node_id, selektor: sel.selektor, quelle, body: { text: text.trim() },
      })
      dismiss()
    } finally { setSaving(false) }
  }

  let overlay: ReactNode = null
  if (sel && opts?.canCreate) {
    overlay = createPortal(
      <div style={{ position: 'fixed', top: sel.top + 6, left: sel.left, zIndex: 100000 }}
        onMouseDown={e => e.preventDefault()}>
        {!composing ? (
          <button
            onClick={() => setComposing(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '6px 12px',
              borderRadius: 8, border: '1px solid var(--border, #E0E0E0)', background: 'var(--bg-surface, #fff)',
              color: 'var(--text-primary, #111)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)', fontFamily: 'inherit',
            }}>
            <MessageSquarePlus size={14} /> Anmerken
          </button>
        ) : (
          <div style={{
            width: 280, padding: 12, borderRadius: 10, border: '1px solid var(--border, #E0E0E0)',
            background: 'var(--bg-surface, #fff)', boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <select value={quelle} onChange={e => setQuelle(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border, #E0E0E0)', background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #111)' }}>
              {QUELLEN.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
            <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } if (e.key === 'Escape') dismiss() }}
              placeholder="Anmerkung…" rows={3}
              style={{ resize: 'vertical', minHeight: 60, fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border, #E0E0E0)', background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #111)', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={dismiss} style={{ minHeight: 32, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border, #E0E0E0)', background: 'transparent', color: 'var(--text-muted, #757575)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={submit} disabled={!text.trim() || saving}
                style={{ minHeight: 32, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: text.trim() ? 'pointer' : 'not-allowed', opacity: text.trim() && !saving ? 1 : 0.5, fontFamily: 'inherit' }}>
                {saving ? 'Speichert…' : 'Anmerken'}
              </button>
            </div>
          </div>
        )}
      </div>,
      document.body)
  }

  return { overlay }
}
