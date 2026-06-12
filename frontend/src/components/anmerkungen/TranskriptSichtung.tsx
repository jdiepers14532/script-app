// TranskriptSichtung — Eingangskanal A2 (Handoff 5): Besprechungs-Transkript einfügen →
// KI erzeugt kategorisierte Anmerkungs-ENTWÜRFE → hier menschlich sichten (editieren,
// Szene zuordnen, Übernehmen/Verwerfen). Übernehmen erzeugt die echte Anmerkung; Auto-
// Promotion ist serverseitig ausgeschlossen. Werkstufen-skopiert (Modal über dem Editor).
import { useState, useEffect, useCallback } from 'react'
import { X, Sparkles, Check, Trash2, AlertTriangle, MapPin, Quote } from 'lucide-react'

const QUELLE_OPTIONEN = [
  ['redaktion', 'Redaktion'], ['produktion', 'Produktion'], ['sender', 'Sender'], ['kunde', 'Kunde'],
  ['kostuem', 'Kostüm'], ['ausstattung', 'Ausstattung'], ['requisite', 'Requisite'],
] as const

interface EntwurfDto {
  id: string
  quelle_session: string | null
  vorschlag_quelle: string | null
  vorschlag_kategorie: string | null
  body: any
  scene_identity_id: string | null
  store: string | null
  selektor: any
  szene_hinweis: string | null
  zitat: string | null
  konfidenz: number | null
  status: string
}
interface SzeneOption {
  scene_identity_id: string
  scene_nummer: number | null
  scene_nummer_suffix: string | null
  ort_name: string | null
}

function szeneLabel(s: SzeneOption): string {
  return `${s.scene_nummer ?? '?'}${s.scene_nummer_suffix ?? ''} — ${s.ort_name ?? 'ohne Motiv'}`
}

function bodyText(body: any): string {
  if (body == null) return ''
  if (typeof body === 'string') return body
  if (typeof body.text === 'string') return body.text
  return ''
}

async function jfetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  })
  const txt = await res.text()
  const data = txt ? JSON.parse(txt) : null
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data
}

export function TranskriptSichtung({ werkstufeId, onClose }: { werkstufeId: string; onClose: () => void }) {
  const [transcript, setTranscript] = useState('')
  const [sessionLabel, setSessionLabel] = useState('')
  const [auswerten, setAuswerten] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [entwuerfe, setEntwuerfe] = useState<EntwurfDto[]>([])
  const [szenen, setSzenen] = useState<SzeneOption[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const d = await jfetch(`/api/transkriptionen/entwuerfe?werkstufe_id=${encodeURIComponent(werkstufeId)}`)
      setEntwuerfe(d?.entwuerfe ?? [])
      setSzenen(d?.szenen ?? [])
    } catch (e: any) {
      setFehler(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [werkstufeId])

  useEffect(() => { reload() }, [reload])

  const starteAuswertung = async () => {
    if (!transcript.trim() || auswerten) return
    setAuswerten(true)
    setFehler(null)
    setHinweis(null)
    try {
      const d = await jfetch('/api/transkriptionen/auswerten', {
        method: 'POST',
        body: JSON.stringify({
          transcript: transcript.trim(),
          werkstufe_id: werkstufeId,
          session_label: sessionLabel.trim() || null,
        }),
      })
      if (d?.hinweis) setHinweis(d.hinweis)
      if ((d?.entwuerfe ?? []).length > 0) setTranscript('')
      await reload()
    } catch (e: any) {
      setFehler(String(e?.message ?? e))
    } finally {
      setAuswerten(false)
    }
  }

  const notifyAnmerkungen = () =>
    window.dispatchEvent(new CustomEvent('sw-anmerkungen-changed', { detail: { werkstufeId } }))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(860px, 100%)', maxHeight: 'min(86vh, 900px)', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-primary)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <Sparkles size={15} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Besprechungs-Transkript auswerten</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            KI erzeugt Entwürfe — nichts wird ohne deine Sichtung übernommen
          </span>
          <button onClick={onClose} title="Schließen"
            style={{ marginLeft: 'auto', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Eingabe */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder={'Transkript der Storyline- oder Drehbuchbesprechung hier einfügen…'}
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 96,
                fontSize: 12, lineHeight: 1.5, padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-surface)',
                color: 'var(--text-primary)', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={sessionLabel}
                onChange={e => setSessionLabel(e.target.value)}
                placeholder="Sitzungs-Bezeichnung (optional), z. B. „Abnahme F2412“"
                style={{ flex: 1, minWidth: 220, minHeight: 36, fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              />
              <button
                onClick={starteAuswertung}
                disabled={!transcript.trim() || auswerten}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 16px',
                  borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', cursor: transcript.trim() && !auswerten ? 'pointer' : 'not-allowed',
                  opacity: transcript.trim() && !auswerten ? 1 : 0.5,
                }}
              >
                <Sparkles size={13} />
                {auswerten ? 'KI wertet aus…' : 'Auswerten'}
              </button>
            </div>
            {fehler && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#FF3B30' }}>
                <AlertTriangle size={13} /> {fehler}
              </div>
            )}
            {hinweis && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hinweis}</div>}
          </div>

          {/* Entwürfe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Entwürfe zur Sichtung</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entwuerfe.length}</span>
          </div>
          {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lädt…</div>}
          {!loading && entwuerfe.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Keine offenen Entwürfe. Transkript oben einfügen und auswerten — die KI schlägt
              Anmerkungen vor, die du hier prüfst und einzeln übernimmst oder verwirfst.
            </div>
          )}
          {entwuerfe.map(e => (
            <EntwurfKarte
              key={e.id}
              entwurf={e}
              szenen={szenen}
              onChanged={updated => setEntwuerfe(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onErledigt={() => { setEntwuerfe(prev => prev.filter(x => x.id !== e.id)); notifyAnmerkungen() }}
              onFehler={setFehler}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function EntwurfKarte({ entwurf, szenen, onChanged, onErledigt, onFehler }: {
  entwurf: EntwurfDto
  szenen: SzeneOption[]
  onChanged: (e: EntwurfDto) => void
  onErledigt: () => void
  onFehler: (msg: string | null) => void
}) {
  const [text, setText] = useState(bodyText(entwurf.body))
  const [busy, setBusy] = useState(false)

  const patch = async (payload: any) => {
    try {
      onFehler(null)
      const updated = await jfetch(`/api/transkriptionen/entwuerfe/${entwurf.id}`, {
        method: 'PATCH', body: JSON.stringify(payload),
      })
      onChanged(updated)
    } catch (err: any) {
      onFehler(String(err?.message ?? err))
    }
  }

  const uebernehmen = async () => {
    if (busy) return
    setBusy(true)
    try {
      onFehler(null)
      // Editierten Text vor der Übernahme persistieren (ein Schritt für den Nutzer).
      if (text.trim() !== bodyText(entwurf.body)) {
        await jfetch(`/api/transkriptionen/entwuerfe/${entwurf.id}`, {
          method: 'PATCH', body: JSON.stringify({ body: { text: text.trim() } }),
        })
      }
      await jfetch(`/api/transkriptionen/entwuerfe/${entwurf.id}/uebernehmen`, { method: 'POST' })
      onErledigt()
    } catch (err: any) {
      onFehler(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  const verwerfen = async () => {
    if (busy) return
    setBusy(true)
    try {
      onFehler(null)
      await jfetch(`/api/transkriptionen/entwuerfe/${entwurf.id}/verwerfen`, { method: 'POST' })
      onErledigt()
    } catch (err: any) {
      onFehler(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  const konfidenzNiedrig = entwurf.konfidenz != null && entwurf.konfidenz < 0.7

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-surface)' }}>
      {/* Zeile 1: Quelle + Kategorie + Szene */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={entwurf.vorschlag_quelle ?? 'redaktion'}
          onChange={e => patch({ vorschlag_quelle: e.target.value })}
          style={{ minHeight: 32, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
        >
          {QUELLE_OPTIONEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          value={entwurf.vorschlag_kategorie ?? ''}
          onChange={e => onChanged({ ...entwurf, vorschlag_kategorie: e.target.value })}
          onBlur={e => patch({ vorschlag_kategorie: e.target.value.trim() || null })}
          placeholder="Kategorie"
          style={{ width: 130, minHeight: 32, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
        />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
          <MapPin size={12} />
          <select
            value={entwurf.scene_identity_id ?? ''}
            onChange={e => patch({ scene_identity_id: e.target.value || null })}
            style={{ minHeight: 32, maxWidth: 240, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${entwurf.scene_identity_id ? 'var(--border)' : '#FF9500'}`, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
          >
            <option value="">Szene wählen…</option>
            {szenen.map(s => <option key={s.scene_identity_id} value={s.scene_identity_id}>{szeneLabel(s)}</option>)}
          </select>
        </span>
        {entwurf.szene_hinweis && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>KI-Hinweis: „{entwurf.szene_hinweis}“</span>
        )}
        {konfidenzNiedrig && (
          <span title="Unsichere Zuordnung — bitte prüfen" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#FF9500' }}>
            <AlertTriangle size={11} /> unsicher
          </span>
        )}
      </div>

      {/* Zitat-Anker-Vorschau */}
      {entwurf.zitat && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          <Quote size={11} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            „{entwurf.zitat}“
            {entwurf.store === 'content'
              ? ' — Stelle im Text gefunden'
              : ' — Stelle nicht gefunden, Anmerkung wird szenen-weit verankert'}
          </span>
        </div>
      )}

      {/* Body editierbar */}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text.trim() && text.trim() !== bodyText(entwurf.body)) patch({ body: { text: text.trim() } }) }}
        rows={2}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 13, lineHeight: 1.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
      />

      {/* Aktionen */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={uebernehmen}
          disabled={busy || !entwurf.scene_identity_id || !text.trim()}
          title={entwurf.scene_identity_id ? 'Als echte Anmerkung übernehmen' : 'Zuerst eine Szene zuordnen'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 32, padding: '0 12px', borderRadius: 6, border: '1px solid #00C853', background: 'transparent', color: '#00C853', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: busy || !entwurf.scene_identity_id ? 'not-allowed' : 'pointer', opacity: busy || !entwurf.scene_identity_id || !text.trim() ? 0.5 : 1 }}
        >
          <Check size={13} /> Übernehmen
        </button>
        <button
          onClick={verwerfen}
          disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 32, padding: '0 12px', borderRadius: 6, border: '1px solid #FF3B30', background: 'transparent', color: '#FF3B30', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
        >
          <Trash2 size={13} /> Verwerfen
        </button>
      </div>
    </div>
  )
}

export default TranskriptSichtung
