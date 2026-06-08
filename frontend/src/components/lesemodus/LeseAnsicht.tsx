// LeseAnsicht — Anmerkungs-Lesemodus: DokumentVorschau (druckgleiches A4-iframe) + Annotations-Layer.
// = DokumentVorschau + reuse von AnnotationProvider/AnnotationPanel (Schritt 2). Der Layer dockt über
// onIframeReady am contentDocument an: Highlights (domAnchor.highlightAnker), Klick→activeId,
// Selektion→Anmerken-Popup. Provider läuft pro WERKSTUFE (sceneIdentityId=null → alle Szenen).
// Resolve-Buttons (Übernehmen/Ablehnen) nur für Autoren — über das vorhandene canResolve im Panel.
import { useRef, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import DokumentVorschau from './DokumentVorschau'
import { AnnotationProvider, useAnnotations, type AnmerkungItem } from '../../contexts/AnnotationContext'
import { AnnotationPanel } from '../anmerkungen/AnnotationPanel'
import {
  selektorFromDomSelection, highlightAnker, clearHighlights, DOM_ANNOT_CSS, type DomAnker,
} from '../../utils/domAnchor'
import type { Selektor } from '../../utils/anchorCore'

const QUELLEN: { value: string; label: string }[] = [
  { value: 'produktion', label: 'Produktion' }, { value: 'redaktion', label: 'Redaktion' },
  { value: 'sender', label: 'Sender' }, { value: 'kunde', label: 'Kunde' },
  { value: 'kostuem', label: 'Kostüm' }, { value: 'ausstattung', label: 'Ausstattung' },
  { value: 'requisite', label: 'Requisite' },
]

// Anzeige-Status fürs Highlight: offen + von mir gelesen → dezent grau (wie im Editor).
function anzeigeStatus(it: AnmerkungItem): string {
  return (it.anmerkung.gelesen_von_mir && it.anmerkung.status === 'offen') ? 'gelesen' : it.anmerkung.status
}

interface CreateState {
  top: number; left: number
  scene_identity_id: string; node_id: string | null; selektor: Selektor
  exact: string
}

function LeseAnsichtInner({ werkstufId }: { werkstufId: string }) {
  const a = useAnnotations()
  const aRef = useRef(a)
  useEffect(() => { aRef.current = a }, [a])

  const docRef = useRef<Document | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [create, setCreate] = useState<CreateState | null>(null)
  const [quelle, setQuelle] = useState('produktion')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  // Alle aktiven content-Anker als Highlights ins iframe setzen.
  const renderHighlights = useCallback((doc: Document) => {
    clearHighlights(doc)
    aRef.current.items
      .filter(it => it.anker.store === 'content'
        && (it.anmerkung.status === 'offen' || it.anmerkung.status === 'in_arbeit'))
      .forEach(it => {
        const anker: DomAnker = {
          anmerkung_id: it.anmerkung.id,
          scene_identity_id: it.anker.scene_identity_id,
          node_id: it.anker.node_id,
          selektor: it.anker.selektor as Selektor | null,
          status: anzeigeStatus(it),
          quelle: it.anmerkung.quelle,
        }
        highlightAnker(doc, anker)
      })
  }, [])

  const onIframeReady = useCallback((doc: Document, _win: Window, iframe: HTMLIFrameElement) => {
    docRef.current = doc
    iframeRef.current = iframe
    if (!doc.getElementById('sw-annot-css')) {
      const style = doc.createElement('style')
      style.id = 'sw-annot-css'
      style.textContent = DOM_ANNOT_CSS
      doc.head.appendChild(style)
    }
    renderHighlights(doc)

    // Klick auf ein Highlight → Karte im Panel aktivieren.
    doc.addEventListener('click', (e) => {
      const t = e.target as Element
      const span = t?.closest?.('[data-anmerkung-id]')
      if (span) aRef.current.setActiveAnmerkungId(span.getAttribute('data-anmerkung-id'))
    })

    // Selektion → Anmerken-Popup (nur im Anmerken-Modus).
    doc.addEventListener('mouseup', () => {
      if (!aRef.current.anmerkenModus) { setCreate(null); return }
      const r = selektorFromDomSelection(doc)
      if (!r) { setCreate(null); return }
      const sel = doc.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const ifr = iframe.getBoundingClientRect()
      setCreate({
        top: ifr.top + rect.bottom + 6,
        left: Math.max(12, ifr.left + rect.left + rect.width / 2 - 150),
        scene_identity_id: r.scene_identity_id, node_id: r.node_id, selektor: r.selektor,
        exact: r.selektor.quote.exact,
      })
      setText(''); setSaving(false)
    })
  }, [renderHighlights])

  // Highlights neu setzen, wenn sich die Anmerkungen ändern (Create/Status/Gelesen).
  useEffect(() => {
    if (docRef.current) renderHighlights(docRef.current)
  }, [a.items, renderHighlights])

  // Aktive Karte → zugehöriges Highlight markieren + ins Bild scrollen.
  useEffect(() => {
    const doc = docRef.current
    if (!doc) return
    doc.querySelectorAll('[data-anmerkung-id].sw-annot--active').forEach(el => el.classList.remove('sw-annot--active'))
    if (!a.activeAnmerkungId) return
    const el = doc.querySelector(`[data-anmerkung-id="${a.activeAnmerkungId}"]`)
    if (el) { el.classList.add('sw-annot--active'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  }, [a.activeAnmerkungId])

  const speichern = async () => {
    if (!create || !text.trim()) return
    setSaving(true)
    try {
      await a.createContent({
        node_id: create.node_id, selektor: create.selektor, quelle,
        body: { text: text.trim() }, scene_identity_id: create.scene_identity_id,
      })
      setCreate(null); setText('')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <DokumentVorschau werkstufId={werkstufId} onIframeReady={onIframeReady} />
      </div>
      <div style={{ width: 320, flexShrink: 0 }}>
        <AnnotationPanel />
      </div>

      {create && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 100000 }} onClick={() => setCreate(null)} />
          <div style={{
            position: 'fixed', top: create.top, left: create.left, width: 300, zIndex: 100001,
            background: 'var(--bg-surface,#fff)', border: '1px solid var(--border,#E0E0E0)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Anmerkung</span>
              <button onClick={() => setCreate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>„{create.exact}"</div>
            <select value={quelle} onChange={e => setQuelle(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border,#E0E0E0)', background: 'var(--bg-primary,#fff)', color: 'var(--text-primary,#111)', fontFamily: 'inherit' }}>
              {QUELLEN.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
            <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); speichern() } if (e.key === 'Escape') setCreate(null) }}
              placeholder="Anmerkung zu dieser Stelle…" rows={2}
              style={{ resize: 'vertical', minHeight: 48, fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border,#E0E0E0)', background: 'var(--bg-primary,#fff)', color: 'var(--text-primary,#111)', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={speichern} disabled={!text.trim() || saving}
                style={{ minHeight: 32, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: text.trim() ? 'pointer' : 'not-allowed', opacity: text.trim() && !saving ? 1 : 0.5, fontFamily: 'inherit' }}>
                {saving ? 'Speichert…' : 'Anmerken'}
              </button>
            </div>
          </div>
        </>,
        document.body)}
    </div>
  )
}

export default function LeseAnsicht({ werkstufId, canEdit = false }: { werkstufId: string; canEdit?: boolean }) {
  return (
    <AnnotationProvider werkstufeId={werkstufId} sceneIdentityId={null} canEdit={canEdit}>
      <LeseAnsichtInner werkstufId={werkstufId} />
    </AnnotationProvider>
  )
}
