// AnnotationPanel — szenen-skopierte Anmerkungs-Spalte rechts neben dem Editor (Handoff 2 §6).
// Wiederverwendet im Lese-Modus (Handoff 3). Karte: Quelle-Badge, Status, Anker-Vorschau,
// "prüfen"-Hinweis, Thread, Aktionen (zur Stelle, Übernehmen/Ablehnen [nur canResolve],
// kommentieren, taggen). Brücke über activeAnmerkungId aus dem AnnotationContext.
import { useState, useEffect, useCallback } from 'react'
import { Check, X, MessageSquare, AtSign, MapPin, AlertTriangle, Eye, CheckCheck } from 'lucide-react'
import { useAnnotations, type AnmerkungItem } from '../../contexts/AnnotationContext'

const QUELLE_LABEL: Record<string, string> = {
  produktion: 'Produktion', redaktion: 'Redaktion', sender: 'Sender', kunde: 'Kunde',
  kostuem: 'Kostüm', ausstattung: 'Ausstattung', requisite: 'Requisite',
}
const QUELLE_COLOR: Record<string, string> = {
  produktion: '#007AFF', redaktion: '#AF52DE', sender: '#32ADE6', kunde: '#FF9500',
  kostuem: '#00C853', ausstattung: '#FF3B30', requisite: '#FFCC00',
}
const STATUS_COLOR: Record<string, string> = {
  offen: '#EF9F27', in_arbeit: '#FFCC00', uebernommen: '#00C853', abgelehnt: '#FF3B30',
}
const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen', in_arbeit: 'In Arbeit', uebernommen: 'Übernommen', abgelehnt: 'Abgelehnt',
}

function bodyText(body: any): string {
  if (body == null) return ''
  if (typeof body === 'string') return body
  if (typeof body.text === 'string') return body.text
  // Tiptap-JSON → Text extrahieren
  const parts: string[] = []
  const walk = (n: any) => { if (typeof n?.text === 'string') parts.push(n.text); (n?.content ?? []).forEach(walk) }
  walk(body)
  return parts.join(' ')
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

const istErledigt = (s: string) => s === 'uebernommen' || s === 'abgelehnt'

export function AnnotationPanel() {
  const a = useAnnotations()
  const { items, loading, activeAnmerkungId, setActiveAnmerkungId } = a
  const [erledigtEinblenden, setErledigtEinblenden] = useState(false)
  const [userMap, setUserMap] = useState<Record<string, string>>({})

  // Namen der Gelesen-Bestätiger (user_id → name) einmal laden.
  useEffect(() => {
    a.getTaggbareUser().then(list => {
      const m: Record<string, string> = {}
      for (const u of list) m[u.id] = u.name
      setUserMap(m)
    }).catch(() => {})
  }, [a])

  const erledigtCount = items.filter(it => istErledigt(it.anmerkung.status)).length
  // Standard: offen/in_arbeit (inkl. von-mir-gelesen, die bleiben status='offen').
  // Mit Schalter: zusätzlich uebernommen/abgelehnt als graue Karten.
  const sichtbar = items.filter(it => !istErledigt(it.anmerkung.status) || erledigtEinblenden)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <MessageSquare size={14} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Anmerkungen</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sichtbar.length}</span>
        <button
          onClick={() => a.setAnmerkenModus(!a.anmerkenModus)}
          title={a.anmerkenModus ? 'Anmerken-Modus aktiv — Klick zum Ausschalten (stört das Schreiben nicht)' : 'Anmerken-Modus einschalten — Text markieren → Anmerken'}
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 28,
            padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 600,
            border: `1px solid ${a.anmerkenModus ? '#00C853' : 'var(--border)'}`,
            background: a.anmerkenModus ? '#00C8531A' : 'transparent',
            color: a.anmerkenModus ? '#00C853' : 'var(--text-muted)',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, background: a.anmerkenModus ? '#00C853' : 'var(--text-muted)' }} />
          {a.anmerkenModus ? 'Anmerken an' : 'Anmerken aus'}
        </button>
      </div>
      {erledigtCount > 0 && (
        <button
          onClick={() => setErledigtEinblenden(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, minHeight: 30, padding: '5px 14px',
            borderBottom: '1px solid var(--border)', background: 'transparent', border: 'none',
            borderTop: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            color: 'var(--text-muted)', textAlign: 'left',
          }}
        >
          <Eye size={12} />
          {erledigtEinblenden ? `Erledigte ausblenden (${erledigtCount})` : `Erledigte einblenden (${erledigtCount})`}
        </button>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>Lädt…</div>}
        {!loading && sichtbar.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16, lineHeight: 1.6 }}>
            Keine offenen Anmerkungen in dieser Szene.<br />
            {a.anmerkenModus ? 'Text markieren → „Anmerken".' : 'Oben „Anmerken" einschalten, dann Text markieren.'}
          </div>
        )}
        {sichtbar.map(it => (
          <AnmerkungKarte
            key={it.anmerkung.id}
            item={it}
            userMap={userMap}
            active={activeAnmerkungId === it.anmerkung.id}
            onActivate={() => setActiveAnmerkungId(activeAnmerkungId === it.anmerkung.id ? null : it.anmerkung.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AnmerkungKarte({ item, userMap, active, onActivate }: { item: AnmerkungItem; userMap: Record<string, string>; active: boolean; onActivate: () => void }) {
  const a = useAnnotations()
  const { anmerkung: an, anker } = item
  const quelleColor = QUELLE_COLOR[an.quelle] ?? 'var(--text-muted)'
  const editierbar = an.status === 'offen' || an.status === 'in_arbeit'
  const erledigt = istErledigt(an.status)
  const vonMirGelesen = an.gelesen_von_mir
  const ankerWarnung = anker.anker_status === 'verschoben' || anker.anker_status === 'verwaist'
  const gelesenNamen = (an.gelesen_von ?? []).map(uid => userMap[uid] ?? uid)

  const vorschau = anker.store === 'kopffeld'
    ? `Kopffeld: ${anker.feldname}`
    : (anker.selektor?.quote?.exact ?? '—')

  // Thread
  const [threadOpen, setThreadOpen] = useState(false)
  const [kommentare, setKommentare] = useState<any[]>([])
  const [komText, setKomText] = useState('')
  const [tagOpen, setTagOpen] = useState(false)
  const [taggbar, setTaggbar] = useState<{ id: string; name: string }[]>([])

  const loadThread = useCallback(async () => {
    setKommentare(await a.getKommentare(an.id))
  }, [a, an.id])

  useEffect(() => { if (threadOpen) loadThread() }, [threadOpen, loadThread])

  const sendKommentar = async () => {
    if (!komText.trim()) return
    await a.addKommentar(an.id, { text: komText.trim() })
    setKomText('')
    loadThread()
  }

  const openTags = async () => {
    setTagOpen(o => !o)
    if (taggbar.length === 0) setTaggbar(await a.getTaggbareUser())
  }

  return (
    <div
      onClick={onActivate}
      style={{
        border: `1px solid ${active ? '#007AFF' : 'var(--border)'}`,
        borderRadius: 10, padding: 10, cursor: 'pointer',
        background: erledigt ? 'var(--bg-subtle)' : 'var(--bg-primary)',
        boxShadow: active ? '0 0 0 2px rgba(0,122,255,0.18)' : 'none',
        opacity: erledigt ? 0.7 : (vonMirGelesen ? 0.82 : 1),
      }}
    >
      {/* Kopf: Quelle + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: quelleColor, background: `${quelleColor}1A` }}>
          {QUELLE_LABEL[an.quelle] ?? an.quelle}
        </span>
        {an.kategorie && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {an.kategorie}</span>}
        {vonMirGelesen && !erledigt && (
          <span title="Von dir als gelesen markiert" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#9E9E9E' }}>
            <CheckCheck size={11} /> gelesen
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: STATUS_COLOR[an.status], display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_COLOR[an.status] }} />
          {STATUS_LABEL[an.status]}
        </span>
      </div>

      {/* Anker-Vorschau */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <MapPin size={11} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>„{vorschau}"</span>
      </div>
      {ankerWarnung && (
        <div style={{ fontSize: 10, color: '#FF9500', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <AlertTriangle size={11} />
          {anker.anker_status === 'verschoben' ? 'Stelle verschoben — prüfen' : 'Stelle nicht gefunden — neu verorten'}
        </div>
      )}

      {/* Body */}
      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
        {bodyText(an.body)}
      </div>

      {/* Gelesen-von-Liste (aktive Bestätigung) */}
      {gelesenNamen.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCheck size={11} style={{ flexShrink: 0 }} />
          <span>Gelesen von: {gelesenNamen.join(', ')}</span>
        </div>
      )}

      {/* Aktionen */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} onClick={e => e.stopPropagation()}>
        {!erledigt && (
          <ActionBtn icon={<CheckCheck size={13} />} label={vonMirGelesen ? 'Gelesen ✓' : 'Gelesen'}
            color={vonMirGelesen ? '#9E9E9E' : undefined}
            onClick={() => a.toggleGelesen(an.id)}
            title={vonMirGelesen ? 'Als ungelesen markieren' : 'Als gelesen markieren (bleibt sichtbar)'} />
        )}
        {a.canResolve && editierbar && (
          <>
            <ActionBtn icon={<Check size={13} />} label="Übernehmen" color="#00C853"
              onClick={() => a.patchStatus(an.id, 'uebernommen')} />
            <ActionBtn icon={<X size={13} />} label="Ablehnen" color="#FF3B30"
              onClick={() => a.patchStatus(an.id, 'abgelehnt')} />
          </>
        )}
        <ActionBtn icon={<MessageSquare size={13} />} label="" onClick={() => setThreadOpen(o => !o)} title="Thread" />
        <ActionBtn icon={<AtSign size={13} />} label="" onClick={openTags} title="Person taggen" />
      </div>

      {/* Tag-Auswahl */}
      {tagOpen && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {taggbar.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>Keine Nutzer</div>}
          {taggbar.map(u => (
            <button key={u.id} onClick={async () => { await a.addTags(an.id, [u.id]); setTagOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', minHeight: 36, fontSize: 12, border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {u.name}
            </button>
          ))}
        </div>
      )}

      {/* Thread */}
      {threadOpen && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {kommentare.map(k => (
            <div key={k.id} style={{ fontSize: 12, marginBottom: 6 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{fmt(k.erstellt_am)}</div>
              <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{bodyText(k.body)}</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={komText} onChange={e => setKomText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendKommentar() }}
              placeholder="Kommentar…" style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: 32 }} />
            <button onClick={sendKommentar} disabled={!komText.trim()}
              style={{ minHeight: 32, padding: '0 12px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', fontSize: 12, cursor: komText.trim() ? 'pointer' : 'not-allowed', opacity: komText.trim() ? 1 : 0.5 }}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ icon, label, onClick, color, title }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string; title?: string }) {
  return (
    <button onClick={onClick} title={title || label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, padding: label ? '6px 10px' : '6px 8px',
        borderRadius: 6, border: `1px solid ${color ?? 'var(--border)'}`, background: 'transparent',
        color: color ?? 'var(--text-muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
      }}>
      {icon}{label && <span>{label}</span>}
    </button>
  )
}

export default AnnotationPanel
