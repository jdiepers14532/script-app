// KopffeldAnmerkung — Badge + Quick-Create/Liste für Anmerkungen an einem Szenenkopf-Feld
// (store='kopffeld'). Eigenständig (selbst-ladend), weil SceneEditor außerhalb des
// AnnotationProvider lebt; Sync mit dem Panel über das window-Event 'sw-anmerkungen-changed'.
// Das Abarbeiten (Übernehmen/Ablehnen) passiert im Haupt-Panel rechts, das kopffeld-Anmerkungen
// ebenfalls listet — hier nur anlegen + ansehen.
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnmerkungBadge, worstStatus, type AnmerkungStatus } from './AnmerkungBadge'

const QUELLEN: { value: string; label: string }[] = [
  { value: 'produktion', label: 'Produktion' },
  { value: 'redaktion', label: 'Redaktion' },
  { value: 'sender', label: 'Sender' },
  { value: 'kunde', label: 'Kunde' },
  { value: 'kostuem', label: 'Kostüm' },
  { value: 'ausstattung', label: 'Ausstattung' },
  { value: 'requisite', label: 'Requisite' },
]
const STATUS_COLOR: Record<string, string> = {
  offen: '#EF9F27', in_arbeit: '#FFCC00', uebernommen: '#00C853', abgelehnt: '#FF3B30',
}

function bodyText(body: any): string {
  if (body == null) return ''
  if (typeof body === 'string') return body
  if (typeof body.text === 'string') return body.text
  const parts: string[] = []
  const walk = (n: any) => { if (typeof n?.text === 'string') parts.push(n.text); (n?.content ?? []).forEach(walk) }
  walk(body)
  return parts.join(' ')
}

export function KopffeldAnmerkung({
  werkstufeId, sceneIdentityId, feldname, label,
}: {
  werkstufeId: string | null
  sceneIdentityId: string | null
  feldname: string
  label?: string
}) {
  const [items, setItems] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [quelle, setQuelle] = useState('produktion')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const btnRef = useRef<HTMLSpanElement>(null)

  const load = useCallback(() => {
    if (!werkstufeId || !sceneIdentityId) { setItems([]); return }
    fetch(`/api/anmerkungen?werkstufe_id=${encodeURIComponent(werkstufeId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setItems((d.items ?? []).filter((it: any) =>
        it.anker.scene_identity_id === sceneIdentityId && it.anker.store === 'kopffeld' && it.anker.feldname === feldname
        && (it.anmerkung.status === 'offen' || it.anmerkung.status === 'in_arbeit'))))
      .catch(() => setItems([]))
  }, [werkstufeId, sceneIdentityId, feldname])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: Event) => {
      const wid = (e as CustomEvent).detail?.werkstufeId
      if (!wid || wid === werkstufeId) load()
    }
    window.addEventListener('sw-anmerkungen-changed', h)
    return () => window.removeEventListener('sw-anmerkungen-changed', h)
  }, [werkstufeId, load])

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 280) })
    }
    setOpen(o => !o)
  }

  const create = async () => {
    if (!text.trim() || !werkstufeId || !sceneIdentityId) return
    setSaving(true)
    try {
      await fetch('/api/anmerkungen', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ werkstufe_id: werkstufeId, scene_identity_id: sceneIdentityId, store: 'kopffeld', feldname, quelle, body: { text: text.trim() } }),
      })
      setText('')
      window.dispatchEvent(new CustomEvent('sw-anmerkungen-changed', { detail: { werkstufeId } }))
      load()
    } finally { setSaving(false) }
  }

  if (!werkstufeId || !sceneIdentityId) return null
  const status = worstStatus(items.map(it => it.anmerkung.status as AnmerkungStatus))

  return (
    <span ref={btnRef} style={{ display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
      <AnmerkungBadge count={items.length} status={status} onClick={toggle} title={`Anmerkungen zu ${label ?? feldname}`} />
      {open && pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 100000 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: pos.top, left: pos.left, width: 280, zIndex: 100001,
            background: 'var(--bg-surface, #fff)', border: '1px solid var(--border, #E0E0E0)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.22)', padding: 12,
            display: 'flex', flexDirection: 'column', gap: 8,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #111)' }}>{label ?? feldname}</div>
            {items.length > 0 && (
              <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(it => (
                  <div key={it.anmerkung.id} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-subtle, #F5F5F5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_COLOR[it.anmerkung.status] }} />
                      <span style={{ fontSize: 10, color: 'var(--text-muted, #757575)' }}>{it.anmerkung.quelle}</span>
                    </div>
                    <div style={{ color: 'var(--text-primary, #111)', whiteSpace: 'pre-wrap' }}>{bodyText(it.anmerkung.body)}</div>
                  </div>
                ))}
              </div>
            )}
            <select value={quelle} onChange={e => setQuelle(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border, #E0E0E0)', background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #111)' }}>
              {QUELLEN.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
            <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); create() } if (e.key === 'Escape') setOpen(false) }}
              placeholder="Anmerkung zu diesem Feld…" rows={2}
              style={{ resize: 'vertical', minHeight: 48, fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border, #E0E0E0)', background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #111)', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={create} disabled={!text.trim() || saving}
                style={{ minHeight: 32, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: text.trim() ? 'pointer' : 'not-allowed', opacity: text.trim() && !saving ? 1 : 0.5, fontFamily: 'inherit' }}>
                {saving ? 'Speichert…' : 'Anmerken'}
              </button>
            </div>
          </div>
        </>,
        document.body)}
    </span>
  )
}

export default KopffeldAnmerkung
