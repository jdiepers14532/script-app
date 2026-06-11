import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'
import Tooltip from './Tooltip'
import { PdfLayoutConfig, type PdfLayoutValue } from '../sw-ui'

// DK-Settings „Verteiler" — Konfigurationsmaske gegen die Verteiler-Endpoints (Schritt 2).
// Zweispaltig (Liste + Detailformular), Tablet/Touch-tauglich. Veröffentlichen = Schritt 5.

const AUTH_EMAIL_SYSTEM_URL = 'https://auth.serienwerft.studio/admin/email-system'
const PLACEHOLDERS = ['{Name}', '{Produktion}', '{Folge}', '{Werkstufe}', '{Version}', '{Link}']
const REVISIONSMODI = [
  { value: 'voll', label: 'Vollfassung' },
  { value: 'nur_aenderungen', label: 'Nur Änderungen' },
  { value: 'markiert', label: 'Änderungen markiert' },
]
const isCoarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

// ── kleine Style-Helfer (Serienwerft-Tokens, 8px-Grid) ───────────────────────
const card: React.CSSProperties = { background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 12 }
const sectionStyle: React.CSSProperties = { padding: 20, borderBottom: '1px solid var(--border)' }
const h2Style: React.CSSProperties = { fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-secondary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 500, marginBottom: 6, fontSize: 13 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', minHeight: 44, border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', boxSizing: 'border-box' }
const hint: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }
const btn: React.CSSProperties = { font: 'inherit', fontWeight: 600, padding: '10px 18px', minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { ...btn, background: '#00C853', borderColor: '#00C853', color: '#fff' }
const linkish: React.CSSProperties = { color: '#007AFF', fontWeight: 500, cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }
const badge = (bg: string, col: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 99, background: bg, color: col })

type Verteiler = any
type Mitglied = any

export default function VerteilerTab({ produktionId }: { produktionId: string }) {
  const [list, setList] = useState<Verteiler[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [profile, setProfile] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Verteiler | null>(null)
  const [besetzung, setBesetzung] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [coarse, setCoarse] = useState(isCoarse())
  const [profilEdit, setProfilEdit] = useState<any | null>(null)
  const [freieEmailOpen, setFreieEmailOpen] = useState(false)
  // Kontakt-Such-Modal: mode 'add' (neues Mitglied) | 'link' (freie Adresse verknüpfen)
  const [kontaktSuche, setKontaktSuche] = useState<{ mode: 'add' | 'link'; mid?: string } | null>(null)
  const [characters, setCharacters] = useState<any[]>([])
  // Sides-Rollen-Picker: für welches Mitglied + vorausgewählte character_ids
  const [rollenPicker, setRollenPicker] = useState<{ mid: string; preset: string[] } | null>(null)

  // editierbare Detailfelder (Verteiler-Ebene; Mitglieder speichern sofort)
  const [form, setForm] = useState<any>({})

  const loadList = useCallback(() => {
    return Promise.all([api.getVerteiler(produktionId), api.getStageLabels(produktionId), api.getPdfProfile(produktionId)])
      .then(([v, l, p]) => { setList(v || []); setLabels(l || []); setProfile(p || []) })
      .catch(e => setErr(String(e?.message || e)))
  }, [produktionId])

  useEffect(() => { setLoading(true); loadList().finally(() => setLoading(false)) }, [loadList])
  // Rollen (Script-characters) für den Sides-Rollenfilter
  useEffect(() => { api.getCharacters(produktionId).then(setCharacters).catch(() => setCharacters([])) }, [produktionId])
  useEffect(() => { const f = () => setCoarse(isCoarse()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])

  const loadDetail = useCallback((id: string) => {
    setSelectedId(id); setBesetzung({})
    api.getVerteilerDetail(id).then(d => {
      setDetail(d)
      setForm({
        name: d.name ?? '', scope: d.scope, werkstufe_typ: d.werkstufe_typ ?? null,
        pdf_export_profil_id: d.pdf_export_profil_id ?? null, pdf_anhang: !!d.pdf_anhang,
        email_betreff: d.email_betreff ?? '', email_text: d.email_text ?? '',
      })
      // Besetzung je Mitglied lazy auflösen
      for (const m of (d.mitglieder || [])) {
        api.getVerteilerBesetzung(id, m.id).then(b => setBesetzung(prev => ({ ...prev, [m.id]: b }))).catch(() => {})
      }
    }).catch(e => setErr(String(e?.message || e)))
  }, [])

  // Auslöser-Optionen: real konfigurierte Werkstufen-Typen + „Revision"
  // stage_labels liefert die Bezeichnung in `name` (nicht `label`).
  const auslOptions = [
    ...Array.from(new Set((labels || []).map(l => l.name).filter(Boolean))),
    'Revision',
  ]
  const currentAusl = form.scope === 'revision' ? 'Revision' : (form.werkstufe_typ ?? '')

  function pickAusloeser(opt: string) {
    if (opt === 'Revision') setForm((f: any) => ({ ...f, scope: 'revision', werkstufe_typ: null }))
    else setForm((f: any) => ({ ...f, scope: 'werkstufe_typ', werkstufe_typ: opt }))
  }

  async function createVerteiler() {
    const firstLabel = (labels || []).map(l => l.name).filter(Boolean)[0]
    try {
      const v = await api.createVerteiler({
        produktion_id: produktionId, name: 'Neuer Verteiler',
        scope: firstLabel ? 'werkstufe_typ' : 'revision', werkstufe_typ: firstLabel ?? null,
      })
      await loadList(); loadDetail(v.id)
    } catch (e: any) { setErr(String(e?.message || e)) }
  }

  async function saveVerteiler() {
    if (!selectedId) return
    setSaving(true); setErr(null)
    try {
      await api.updateVerteiler(selectedId, {
        name: form.name, scope: form.scope, werkstufe_typ: form.werkstufe_typ,
        pdf_export_profil_id: form.pdf_export_profil_id, pdf_anhang: form.pdf_anhang,
        email_betreff: form.email_betreff, email_text: form.email_text,
      })
      await loadList()
    } catch (e: any) { setErr(String(e?.message || e)) }
    finally { setSaving(false) }
  }

  async function removeVerteiler(id: string) {
    if (!confirm('Diesen Verteiler inkl. Versand-Historie löschen?')) return
    try { await api.deleteVerteiler(id); if (selectedId === id) { setSelectedId(null); setDetail(null) }; await loadList() }
    catch (e: any) { setErr(String(e?.message || e)) }
  }

  // ── Mitglieder (speichern sofort) ──────────────────────────────────────────
  async function confirmFreieEmail(email: string, name: string | null) {
    if (!selectedId) return
    setFreieEmailOpen(false)
    try { await api.addVerteilerMitglied(selectedId, { freie_email: email, name }); loadDetail(selectedId) }
    catch (e: any) { setErr(String(e?.message || e)) }
  }
  // Kontakt aus der Suche: neues Mitglied (add) ODER freie Adresse verknüpfen (link)
  async function onKontaktPick(p: { kontakt_id: string; name: string }) {
    if (!selectedId || !kontaktSuche) return
    const k = kontaktSuche
    setKontaktSuche(null)
    try {
      if (k.mode === 'link' && k.mid) await api.updateVerteilerMitglied(selectedId, k.mid, { kontakt_id: p.kontakt_id })
      else await api.addVerteilerMitglied(selectedId, { kontakt_id: p.kontakt_id, name: p.name })
      loadDetail(selectedId)
    } catch (e: any) { setErr(String(e?.message || e)) }
  }
  async function updateMitglied(mid: string, patch: any) {
    if (!selectedId) return
    try {
      await api.updateVerteilerMitglied(selectedId, mid, patch)
      setDetail((d: any) => d ? { ...d, mitglieder: d.mitglieder.map((m: any) => m.id === mid ? { ...m, ...patch } : m) } : d)
    } catch (e: any) { setErr(String(e?.message || e)) }
  }
  async function removeMitglied(mid: string) {
    if (!selectedId) return
    try { await api.deleteVerteilerMitglied(selectedId, mid); loadDetail(selectedId) }
    catch (e: any) { setErr(String(e?.message || e)) }
  }

  function insertPlaceholder(ph: string) {
    setForm((f: any) => ({ ...f, email_text: (f.email_text || '') + ph }))
  }

  // Legt ein neues Profil an; das erste einer Produktion wird automatisch Standard.
  // Danach: auswählen + direkt den Editor öffnen.
  async function createProfil() {
    const istErste = profile.length === 0
    const vorschlag = istErste ? 'Standard-Profil' : 'Neues Profil'
    const name = window.prompt('Name des PDF-Export-Profils:', vorschlag)?.trim()
    if (!name) return
    try {
      const p = await api.createPdfProfil({ produktion_id: produktionId, name, ist_standard: istErste })
      const profs = await api.getPdfProfile(produktionId); setProfile(profs || [])
      setForm((f: any) => ({ ...f, pdf_export_profil_id: p.id }))
      setProfilEdit({ ...p })
    } catch (e: any) { setErr(String(e?.message || e)) }
  }

  const assignedProfil = profile.find(p => p.id === form.pdf_export_profil_id) || null

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Lade Verteiler…</div>

  const showList = !coarse || !selectedId
  const showDetail = !coarse || !!selectedId

  const ListPanel = (
    <div style={{ ...card, width: coarse ? '100%' : 240, flex: 'none', alignSelf: 'flex-start' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Verteiler</div>
      {list.length === 0 && <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>Noch keine Verteiler.</div>}
      {list.map(v => (
        <div key={v.id} onClick={() => loadDetail(v.id)}
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', minHeight: 44,
            background: selectedId === v.id ? 'var(--bg-active, #E8F8EE)' : 'transparent',
            boxShadow: selectedId === v.id ? 'inset 3px 0 0 #00C853' : 'none' }}>
          <div style={{ fontWeight: 500 }}>{v.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {v.scope === 'revision' ? 'Revision (allgemein)' : v.werkstufe_typ} · {v.mitglieder_count ?? 0} Mitglieder
            {!v.aktiv && ' · inaktiv'}
          </div>
        </div>
      ))}
      <button onClick={createVerteiler} style={{ ...linkish, display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', minHeight: 44 }}>
        + Verteiler anlegen
      </button>
    </div>
  )

  const DetailPanel = detail && (
    <div style={{ ...card, flex: 1, minWidth: 0 }}>
      <div style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {coarse && <button onClick={() => { setSelectedId(null); setDetail(null) }} style={{ ...btn, padding: '8px 12px' }}>←</button>}
          <h1 style={{ fontSize: 18, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.name || 'Verteiler'}</h1>
        </div>
        <span style={badge('#E8F8EE', '#0a7d3c')}>{form.scope === 'revision' ? 'Scope: Revision' : `Werkstufe: ${form.werkstufe_typ || '—'}`}</span>
      </div>

      {/* Grunddaten */}
      <div style={sectionStyle}>
        <div style={h2Style}>Grunddaten</div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Auslöser</label>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {auslOptions.map((opt, i) => (
              <button key={opt} onClick={() => pickAusloeser(opt)}
                style={{ font: 'inherit', padding: '10px 14px', minHeight: 44, border: 'none', borderLeft: i ? '1px solid var(--border)' : 'none', cursor: 'pointer',
                  background: currentAusl === opt ? '#000' : 'var(--bg-card, #fff)', color: currentAusl === opt ? '#fff' : 'var(--text-secondary)' }}>
                {opt}
              </button>
            ))}
          </div>
          <div style={hint}>Liste entspricht den real konfigurierten Werkstufen dieser Produktion plus „Revision". „Revision" triggert bei einer neuen Version derselben freigegebenen Fassung.</div>
        </div>
      </div>

      {/* Mitglieder */}
      <div style={sectionStyle}>
        <div style={h2Style}>Mitglieder</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              <th style={th}>Empfänger</th><th style={th}>Quelle</th><th style={th}>Rolle / Funktion</th>
              <th style={{ ...th, textAlign: 'center' }}>Nur bestimmte Rollen</th><th style={th}>Revisionsmodus</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {(detail.mitglieder || []).map((m: Mitglied) => {
                const b = besetzung[m.id]
                const istSchauspieler = b?.ist_schauspieler
                return (
                  <tr key={m.id}>
                    <td style={td}>
                      <div>{m.name || m.freie_email || m.kontakt_id}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.freie_email || (m.kontakt_id ? 'Kontakt verknüpft' : '')}</div>
                    </td>
                    <td style={td}>
                      {m.kontakt_id ? <span style={badge('#E9F2FF', '#0a4ea3')}>Kontakt</span> : <span style={badge('#FFF7E0', '#8a6d00')}>Frei</span>}
                    </td>
                    <td style={td}>
                      {b === undefined ? <span style={{ color: 'var(--text-secondary)' }}>…</span>
                        : istSchauspieler
                          ? <><span style={badge('#F0EAFB', '#5b3fa6')}>Schauspieler:in</span><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rolle: {b.rollenname || '—'}</div></>
                          : (m.kontakt_id && b?.funktion)
                            ? <span style={{ color: 'var(--text-secondary)' }}>{b.funktion}</span>
                            : <span style={{ color: 'var(--text-secondary)' }}>nicht zugeordnet{!m.kontakt_id && <> · <button style={linkish} onClick={() => setKontaktSuche({ mode: 'link', mid: m.id })}>verknüpfen</button></>}</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <Tooltip text={'Nur Szenen ausgewählter Rollen. Für erkannte Schauspieler:innen wird die eigene Rolle automatisch vorgeschlagen — für alle anderen frei wählbar.'}>
                        <input type="checkbox" checked={!!m.sides_nur_eigene}
                          onChange={e => {
                            if (e.target.checked) {
                              const auto = (b?.figuren || []).map((f: any) => f.character_id)
                              const preset = (m.sides_character_ids?.length ? m.sides_character_ids : auto) as string[]
                              updateMitglied(m.id, { sides_nur_eigene: true })
                              setRollenPicker({ mid: m.id, preset })
                            } else updateMitglied(m.id, { sides_nur_eigene: false })
                          }}
                          style={{ width: 20, height: 20, cursor: 'pointer' }} />
                      </Tooltip>
                      {m.sides_nur_eigene && (
                        <div><button style={{ ...linkish, fontSize: 12, marginTop: 4 }}
                          onClick={() => setRollenPicker({ mid: m.id, preset: (m.sides_character_ids?.length ? m.sides_character_ids : (b?.figuren || []).map((f: any) => f.character_id)) as string[] })}>
                          Rollen ({m.sides_character_ids?.length || 0})
                        </button></div>
                      )}
                    </td>
                    <td style={td}>
                      <select value={m.revisions_modus || 'voll'} onChange={e => updateMitglied(m.id, { revisions_modus: e.target.value })}
                        style={{ ...inputStyle, minHeight: 40, padding: '6px 8px', width: 'auto' }}>
                        {REVISIONSMODI.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => removeMitglied(m.id)} title="Entfernen" style={{ ...linkish, color: '#FF3B30', fontSize: 16, minHeight: 44, minWidth: 44 }}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <button style={linkish} onClick={() => setKontaktSuche({ mode: 'add' })}>+ Aus Adressbuch</button>
          <button style={linkish} onClick={() => setFreieEmailOpen(true)}>+ Freie E-Mail</button>
        </div>
        <div style={{ ...noteBox }}>
          Schauspieler:in, Rolle &amp; Funktion werden über die Vertragsdatenbank erkannt (kein Vertrags-Ansichtsrecht nötig; E-Mail wird erst beim Versand aufgelöst). „Nur bestimmte Rollen" liefert dem Mitglied nur die Szenen der gewählten Rollen — für erkannte Schauspieler:innen ist die eigene Rolle vorausgewählt, für alle anderen (z. B. Gäste) frei wählbar. Freie Adressen ohne Zuordnung lassen sich über „verknüpfen" einer Person zuordnen.
        </div>
      </div>

      {/* E-Mail */}
      <div style={sectionStyle}>
        <div style={h2Style}>E-Mail</div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Betreff</label>
          <input style={inputStyle} value={form.email_betreff} placeholder="Neue Drehbuchfassung: {Produktion} – {Folge}"
            onChange={e => setForm((f: any) => ({ ...f, email_betreff: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Text</label>
          <textarea style={{ ...inputStyle, minHeight: 120, lineHeight: 1.6, resize: 'vertical' }} value={form.email_text}
            placeholder={'Hallo {Name},\n\nes liegt eine neue Fassung ({Werkstufe} v{Version}) vor:\n\n{Link}\n\nViele Grüße'}
            onChange={e => setForm((f: any) => ({ ...f, email_text: e.target.value }))} />
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PLACEHOLDERS.map(p => (
              <button key={p} onClick={() => insertPlaceholder(p)} style={{ fontSize: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 99, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-primary)' }}>{p}</button>
            ))}
          </div>
          <div style={hint}>Text wird je Verteiler bearbeitet. Rahmen/Layout, Absenderadresse und Versand kommen aus der auth.app. <a style={linkish} href={AUTH_EMAIL_SYSTEM_URL} target="_blank" rel="noreferrer">Layout in auth ansehen ↗</a></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14 }}>
          <div><div style={{ fontWeight: 500 }}>PDF zusätzlich anhängen</div><div style={hint}>Empfohlen ist Link-first (Tracking, Widerruf, Zustellbarkeit).</div></div>
          <input type="checkbox" checked={!!form.pdf_anhang} onChange={e => setForm((f: any) => ({ ...f, pdf_anhang: e.target.checked }))} style={{ width: 24, height: 24, cursor: 'pointer' }} />
        </div>
      </div>

      {/* PDF-Export-Profil */}
      <div style={sectionStyle}>
        <div style={h2Style}>PDF-Export-Profil</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={form.pdf_export_profil_id || ''} onChange={e => setForm((f: any) => ({ ...f, pdf_export_profil_id: e.target.value || null }))}
            style={{ ...inputStyle, width: 'auto', minWidth: 220 }}>
            <option value="">— kein Profil —</option>
            {profile.map(p => <option key={p.id} value={p.id}>{p.name}{p.ist_standard ? ' (Standard)' : ''}</option>)}
          </select>
          {assignedProfil && <button style={linkish} onClick={() => setProfilEdit({ ...assignedProfil })}>Profil bearbeiten ↗</button>}
          <button style={linkish} onClick={createProfil}>+ Neues Profil</button>
        </div>
        {assignedProfil && (
          <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
            {[
              [assignedProfil.wz_zwc_aktiv, 'ZWC-Wasserzeichen (forensisch, je Empfänger)'],
              [assignedProfil.wz_sichtbar_aktiv, `Sichtbares Wasserzeichen (${assignedProfil.wz_sichtbar_position})`],
              [assignedProfil.struktur_quelle === 'aktueller_export', 'Dokumentenstruktur aus aktuellem PDF-Export'],
              [assignedProfil.lesezeichen_aktiv, `PDF-Lesezeichen (${assignedProfil.lesezeichen_ebene})`],
            ].map(([on, text], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: on ? '#00C853' : 'var(--border)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : '–'}</span>
                {text as string}
              </div>
            ))}
          </div>
        )}
        <div style={hint}>Profil definiert das Aussehen (Wasserzeichen/Struktur/Lesezeichen). Die PDF-Erzeugung, die es konsumiert, folgt in Schritt 7.</div>
      </div>

      {/* Ausdrucken — komplett „Bald" */}
      <div style={{ ...sectionStyle, opacity: 0.55, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'not-allowed' }} />
        <div style={h2Style}>Ausdrucken durch Empfänger <span style={{ ...badge('#FFF7E0', '#8a6d00'), border: '1px dashed #FFCC00' }}>Bald</span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div><div style={{ fontWeight: 500 }}>Ausdrucken erlaubt</div><div style={hint}>Empfänger löst über die Mail einen Druck am Produktionsdrucker aus.</div></div>
          <input type="checkbox" disabled style={{ width: 24, height: 24 }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>Druckvarianten</label>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {['Normal', 'Beidseitig', '2 auf 1', '4 auf 1'].map((v, i) => (
              <span key={v} style={{ padding: '10px 14px', borderLeft: i ? '1px solid var(--border)' : 'none', color: 'var(--text-secondary)' }}>{v}</span>
            ))}
          </div>
        </div>
        <div style={noteBox}>Ein physischer Ausdruck verlässt das System und kann geleakt werden. Jede Seite trägt das Empfänger-Wasserzeichen.</div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', borderRadius: '0 0 12px 12px' }}>
        <button onClick={() => removeVerteiler(detail.id)} style={{ ...linkish, color: '#FF3B30' }}>Verteiler löschen</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btn} onClick={() => loadDetail(detail.id)}>Zurücksetzen</button>
          <button style={btnPrimary} onClick={saveVerteiler} disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ padding: coarse ? 0 : 4 }}>
      {err && <div style={{ margin: '0 0 12px', padding: '10px 12px', background: '#FFF0F0', border: '1px solid #FFB3B3', borderRadius: 8, color: '#FF3B30', fontSize: 13 }}>{err} <button style={{ ...linkish, color: '#FF3B30' }} onClick={() => setErr(null)}>✕</button></div>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {showList && ListPanel}
        {showDetail && (detail ? DetailPanel : <div style={{ ...card, flex: 1, padding: 40, color: 'var(--text-secondary)', textAlign: 'center' }}>Wähle links einen Verteiler oder lege einen neuen an.</div>)}
      </div>
      {profilEdit && <ProfilEditModal profil={profilEdit} produktionId={produktionId} werkstufeTyp={form.werkstufe_typ}
        onClose={() => setProfilEdit(null)}
        onSaved={async () => { const p = await api.getPdfProfile(produktionId); setProfile(p || []); setProfilEdit(null) }} />}
      {freieEmailOpen && <FreieEmailModal onConfirm={confirmFreieEmail} onClose={() => setFreieEmailOpen(false)} />}
      {kontaktSuche && <KontaktSucheModal produktionId={produktionId} mode={kontaktSuche.mode} onPick={onKontaktPick} onClose={() => setKontaktSuche(null)} />}
      {rollenPicker && (
        <RollenPickerModal characters={characters} preset={rollenPicker.preset}
          onClose={() => setRollenPicker(null)}
          onSave={async (ids) => { const mid = rollenPicker.mid; setRollenPicker(null); await updateMitglied(mid, { sides_nur_eigene: true, sides_character_ids: ids }) }} />
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600 }
const td: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
const noteBox: React.CSSProperties = { display: 'flex', gap: 8, padding: '10px 12px', background: '#FFF7E0', border: '1px solid #F2D98A', borderRadius: 8, fontSize: 12, color: '#7a5d00', marginTop: 10 }

// ── Mapping pdf_export_profil-Row ↔ PdfLayoutValue (geteilte Komponente) ───────
const STRUKTUR_TYPE_LABEL: Record<string, string> = {
  titelseite: 'Titelseite', statistik: 'Statistik', onliner: 'Onliner',
  synopse: 'Synopsen', fsk: 'FSK & Inhaltskennzeichnung',
}
function profilToLayout(p: any): PdfLayoutValue {
  const sj = (p.struktur_json && typeof p.struktur_json === 'object') ? p.struktur_json : {}
  const mk = (arr: any[], zone: 'pre' | 'post') => (arr || []).map((it: any, i: number) => ({
    key: `${zone}-${it.type}-${i}`, type: it.type, label: STRUKTUR_TYPE_LABEL[it.type] || it.type,
    enabled: it.enabled !== false, zone, configurable: false,
  }))
  return {
    items: [...mk(sj.preItems, 'pre'), ...mk(sj.postItems, 'post')],
    szenenAktiv: sj.szenenAktiv !== false,
    bookmarks: p.lesezeichen_aktiv !== false,
    orientation: p.pdf_orientation === 'landscape' ? 'landscape' : 'portrait',
    kzFzModus: (p.kz_fz_modus || 'standard'),
    fzText: p.fz_text || '',
    lesezeichenEbene: p.lesezeichen_ebene || 'szene',
    lesezeichenLabel: p.lesezeichen_label || '',
    titelblatt: !!p.titelblatt,
    szenenNummerierung: !!p.szenen_nummerierung,
    seitenNummerierung: !!p.seiten_nummerierung,
  }
}
function applyLayout(p: any, v: PdfLayoutValue): any {
  const slot = (it: any) => ({ type: it.type, enabled: it.enabled })
  return {
    ...p,
    struktur_json: {
      preItems: v.items.filter(i => i.zone === 'pre').map(slot),
      postItems: v.items.filter(i => i.zone === 'post').map(slot),
      szenenAktiv: v.szenenAktiv,
    },
    struktur_quelle: 'eigenes',   // Profil trägt jetzt seine eigene Struktur
    lesezeichen_aktiv: v.bookmarks,
    pdf_orientation: v.orientation,
    kz_fz_modus: v.kzFzModus,
    fz_text: v.fzText,
    lesezeichen_ebene: v.lesezeichenEbene,
    lesezeichen_label: v.lesezeichenLabel,
    titelblatt: v.items.some(i => i.type === 'titelseite' && i.enabled),
    szenen_nummerierung: v.szenenNummerierung,
    seiten_nummerierung: v.seitenNummerierung,
  }
}

// ── PDF-Profil-Editor (Aussehen; schreibt pdf_export_profil) ──────────────────
function ProfilEditModal({ profil, produktionId, werkstufeTyp, onClose, onSaved }: {
  profil: any; produktionId: string; werkstufeTyp?: string | null; onClose: () => void; onSaved: () => void
}) {
  const [p, setP] = useState<any>({ ...profil })
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const set = (k: string, v: any) => setP((x: any) => ({ ...x, [k]: v }))

  function persist() {
    return api.updatePdfProfil(p.id, {
      name: p.name, ist_standard: p.ist_standard,
      wz_zwc_aktiv: p.wz_zwc_aktiv, wz_sichtbar_aktiv: p.wz_sichtbar_aktiv,
      wz_sichtbar_position: p.wz_sichtbar_position, wz_sichtbar_inhalt: p.wz_sichtbar_inhalt,
      wz_sichtbar_opacity: p.wz_sichtbar_opacity, wz_sichtbar_groesse: p.wz_sichtbar_groesse,
      struktur_quelle: p.struktur_quelle, titelblatt: p.titelblatt,
      szenen_nummerierung: p.szenen_nummerierung, seiten_nummerierung: p.seiten_nummerierung,
      lesezeichen_aktiv: p.lesezeichen_aktiv, lesezeichen_ebene: p.lesezeichen_ebene, lesezeichen_label: p.lesezeichen_label,
      revisions_stil: p.revisions_stil,
      struktur_json: p.struktur_json, pdf_orientation: p.pdf_orientation, kz_fz_modus: p.kz_fz_modus, fz_text: p.fz_text,
    })
  }

  async function save() {
    setSaving(true); setErr(null)
    try { await persist(); onSaved() }
    catch (e: any) { setErr(String(e?.message || e)); setSaving(false) }
  }

  // Live-Vorschau über den echten Renderer (gegen die Trigger-Werkstufe).
  // Fenster SYNCHRON öffnen (User-Gesture) — sonst Popup-Blocker nach await.
  async function preview() {
    setErr(null); setInfo(null)
    const win = window.open('', '_blank')
    if (win) win.document.write('<html><body style="margin:0;background:#555;height:100vh;display:flex;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;font-size:14px">PDF-Vorschau wird generiert…</body></html>')
    setPreviewing(true)
    try {
      await persist()  // Vorschau spiegelt den gespeicherten Stand
      const res = await fetch(`/api/pdf-export-profil/${p.id}/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ produktion_id: produktionId, werkstufe_typ: werkstufeTyp || null }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Vorschau fehlgeschlagen' })); throw new Error(e.error || 'Vorschau fehlgeschlagen') }
      const skipped = res.headers.get('X-Preview-Skipped')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (win) win.location.href = url; else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 120000)
      if (skipped) setInfo('In der Vorschau noch nicht enthalten: ' + decodeURIComponent(skipped))
    } catch (e: any) {
      if (win) win.close()
      setErr(String(e?.message || e))
    } finally { setPreviewing(false) }
  }

  const row = (lbl: string, node: React.ReactNode) => (
    <div style={{ marginBottom: 12 }}><label style={labelStyle}>{lbl}</label>{node}</div>
  )
  const toggle = (k: string, lbl: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!p[k]} onChange={e => set(k, e.target.checked)} style={{ width: 20, height: 20 }} /> {lbl}
    </label>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: 560, maxWidth: '100%' }}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>PDF-Export-Profil bearbeiten</h2>
          <button style={{ ...linkish, fontSize: 18 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}>
          {err && <div style={{ marginBottom: 12, color: '#FF3B30', fontSize: 13 }}>{err}</div>}
          {info && <div style={{ marginBottom: 12, padding: '8px 10px', background: '#FFF7E0', border: '1px solid #F2D98A', borderRadius: 8, color: '#7a5d00', fontSize: 12 }}>{info}</div>}
          {row('Name', <input style={inputStyle} value={p.name || ''} onChange={e => set('name', e.target.value)} />)}
          {toggle('ist_standard', 'Standard-Profil dieser Produktion')}

          <div style={{ ...h2Style, marginTop: 14 }}>Struktur & Layout</div>
          <PdfLayoutConfig
            value={profilToLayout(p)}
            onChange={v => setP(applyLayout(p, v))}
            show={{ structure: true, bookmarks: true, bookmarksDetail: true, pageLayout: true, headerFooter: true, numbering: true }}
          />

          <div style={{ ...h2Style, marginTop: 18 }}>Wasserzeichen</div>
          {toggle('wz_zwc_aktiv', 'ZWC-Wasserzeichen (forensisch, je Empfänger)')}
          {toggle('wz_sichtbar_aktiv', 'Sichtbares Wasserzeichen (auf jeder Seite)')}
          {row('Position', <select style={inputStyle} value={p.wz_sichtbar_position} onChange={e => set('wz_sichtbar_position', e.target.value)}>
            {['kopf', 'fuss', 'kopf_fuss', 'diagonal', 'kopf_fuss_diagonal'].map(o => <option key={o} value={o}>{o}</option>)}
          </select>)}
          {row('Wasserzeichen-Text (Vorlage)', <>
            <input style={inputStyle} value={p.wz_sichtbar_inhalt || ''} onChange={e => set('wz_sichtbar_inhalt', e.target.value)} placeholder="{empfaenger_name} · {datum}" />
            <div style={hint}>Wird pro Empfänger auf jede Seite gestempelt. Platzhalter: {'{empfaenger_name}'} · {'{datum}'} · {'{werkstufe}'} · {'{version}'}</div>
          </>)}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>{row('Opazität (%)', <input type="number" min={0} max={100} style={inputStyle} value={p.wz_sichtbar_opacity ?? 20} onChange={e => set('wz_sichtbar_opacity', Number(e.target.value))} />)}</div>
            <div style={{ flex: 1 }}>{row('Größe', <select style={inputStyle} value={p.wz_sichtbar_groesse} onChange={e => set('wz_sichtbar_groesse', e.target.value)}>{['klein', 'mittel', 'gross'].map(o => <option key={o} value={o}>{o}</option>)}</select>)}</div>
          </div>

          <div style={{ ...h2Style, marginTop: 14 }}>Revision</div>
          {row('Revisions-Darstellung', <select style={inputStyle} value={p.revisions_stil} onChange={e => set('revisions_stil', e.target.value)}>{['asterisk', 'farbseite', 'beides'].map(o => <option key={o} value={o}>{o}</option>)}</select>)}
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', borderRadius: '0 0 12px 12px' }}>
          <button style={btn} onClick={preview} disabled={previewing || saving}>{previewing ? 'Vorschau…' : '👁 Vorschau'}</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btn} onClick={onClose}>Abbrechen</button>
            <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal-Helfer (Overlay/Card) ───────────────────────────────────────────────
const mOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 24 }
const mCard: React.CSSProperties = { ...card, width: 520, maxWidth: '100%' }
const mHead: React.CSSProperties = { padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const mFoot: React.CSSProperties = { padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--bg-surface)', borderRadius: '0 0 12px 12px' }

// ── Freie-E-Mail-Modal (SW-Design, Enter bestätigt) ───────────────────────────
function FreieEmailModal({ onConfirm, onClose }: { onConfirm: (email: string, name: string | null) => void; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const valid = /\S+@\S+\.\S+/.test(email.trim())
  const submit = () => { if (valid) onConfirm(email.trim(), name.trim() || null) }
  return (
    <div style={mOverlay} onClick={onClose}>
      <div style={mCard} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter' && valid) { e.preventDefault(); submit() } }}>
        <div style={mHead}><h2 style={{ fontSize: 16, fontWeight: 600 }}>Freie E-Mail-Adresse</h2><button style={{ ...linkish, fontSize: 18 }} onClick={onClose}>✕</button></div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>E-Mail</label>
            <input style={inputStyle} type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div>
            <label style={labelStyle}>Name (optional)</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={hint}>Empfänger ohne vertraege-Kontakt. Funktion/Sides nicht verfügbar — später über „verknüpfen" nachholbar.</div>
        </div>
        <div style={mFoot}>
          <button style={btn} onClick={onClose}>Abbrechen</button>
          <button style={btnPrimary} onClick={submit} disabled={!valid}>OK</button>
        </div>
      </div>
    </div>
  )
}

// ── Kontakt-Such-Modal (vertraege, Name → Funktion; Anlegen bei kein Treffer) ──
function KontaktSucheModal({ produktionId, mode, onPick, onClose }: {
  produktionId: string; mode: 'add' | 'link'
  onPick: (p: { kontakt_id: string; name: string }) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'produktion' | 'global'>('produktion')
  const [results, setResults] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [anlegen, setAnlegen] = useState(false)
  const [neu, setNeu] = useState({ name: '', rufname: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults(null); return }
    setLoading(true)
    const t = setTimeout(() => {
      api.kontaktSuche(produktionId, term, scope)
        .then(r => setResults(r.personen || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q, scope, produktionId])

  async function doAnlegen() {
    if (!neu.name.trim()) return
    setBusy(true); setErr(null)
    try {
      const r = await api.kontaktAnlegen({ produktion_id: produktionId, name: neu.name.trim(), rufname: neu.rufname.trim() || null, email: neu.email.trim() || null })
      onPick({ kontakt_id: r.kontakt_id, name: r.name })
    } catch (e: any) { setErr(String(e?.message || e)); setBusy(false) }
  }

  return (
    <div style={mOverlay} onClick={onClose}>
      <div style={mCard} onClick={e => e.stopPropagation()}>
        <div style={mHead}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{mode === 'link' ? 'Mit Kontakt verknüpfen' : 'Aus Adressbuch hinzufügen'}</h2>
          <button style={{ ...linkish, fontSize: 18 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, maxHeight: '65vh', overflowY: 'auto' }}>
          {!anlegen ? (
            <>
              <input style={inputStyle} autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Name suchen (min. 2 Zeichen)…" />
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '10px 0', fontSize: 13 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={scope === 'produktion'} onChange={() => setScope('produktion')} /> nur diese Produktion
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={scope === 'global'} onChange={() => setScope('global')} /> alle (global)
                </label>
              </div>
              {loading && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Suche…</div>}
              {results && results.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {results.map(p => (
                    <div key={p.kontakt_id} onClick={() => onPick({ kontakt_id: p.kontakt_id, name: p.name })}
                      style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', minHeight: 44 }}>
                      <div style={{ fontWeight: 500 }}>{p.name}{p.rufname ? ` (${p.rufname})` : ''}</div>
                      <div style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-secondary)' }}>
                        {p.ist_schauspieler && <span style={badge('#F0EAFB', '#5b3fa6')}>Schauspieler:in</span>}
                        <span>{p.funktion || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {results && results.length === 0 && !loading && (
                <div style={{ ...noteBox }}>
                  Kein Treffer. <button style={linkish} onClick={() => { setNeu(n => ({ ...n, name: q.trim() })); setAnlegen(true) }}>Person neu anlegen →</button>
                </div>
              )}
            </>
          ) : (
            <div onKeyDown={e => { if (e.key === 'Enter' && neu.name.trim()) { e.preventDefault(); doAnlegen() } }}>
              {err && <div style={{ color: '#FF3B30', fontSize: 13, marginBottom: 10 }}>{err}</div>}
              <div style={{ marginBottom: 12 }}><label style={labelStyle}>Name</label><input style={inputStyle} autoFocus value={neu.name} onChange={e => setNeu({ ...neu, name: e.target.value })} /></div>
              <div style={{ marginBottom: 12 }}><label style={labelStyle}>Rufname (optional)</label><input style={inputStyle} value={neu.rufname} onChange={e => setNeu({ ...neu, rufname: e.target.value })} /></div>
              <div><label style={labelStyle}>E-Mail (optional)</label><input style={inputStyle} type="email" value={neu.email} onChange={e => setNeu({ ...neu, email: e.target.value })} /></div>
              <div style={hint}>Legt eine Person in der Vertragsdatenbank an (ohne Vertrag). Dubletten werden nach E-Mail/Name vermieden.</div>
            </div>
          )}
        </div>
        <div style={mFoot}>
          {anlegen
            ? <><button style={btn} onClick={() => setAnlegen(false)} disabled={busy}>Zurück</button><button style={btnPrimary} onClick={doAnlegen} disabled={busy || !neu.name.trim()}>{busy ? 'Anlegen…' : 'Anlegen & wählen'}</button></>
            : <button style={btn} onClick={onClose}>Schließen</button>}
        </div>
      </div>
    </div>
  )
}

// ── Sides-Rollen-Picker (welche Rollen-Szenen das Mitglied erhält) ────────────
function RollenPickerModal({ characters, preset, onSave, onClose }: {
  characters: any[]; preset: string[]; onSave: (ids: string[]) => void; onClose: () => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(preset || []))
  const [q, setQ] = useState('')
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const filtered = characters.filter(c => !q || String(c.name || '').toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={mOverlay} onClick={onClose}>
      <div style={mCard} onClick={e => e.stopPropagation()}>
        <div style={mHead}><h2 style={{ fontSize: 16, fontWeight: 600 }}>Rollen wählen ({sel.size})</h2><button style={{ ...linkish, fontSize: 18 }} onClick={onClose}>✕</button></div>
        <div style={{ padding: 20, maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={hint}>Das Mitglied erhält nur Szenen der gewählten Rollen. Für Schauspieler:innen ist die eigene Rolle vorausgewählt.</div>
          <input style={{ ...inputStyle, margin: '10px 0' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Rolle filtern…" />
          {characters.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Keine Rollen in dieser Produktion gefunden.</div>}
          <div style={{ border: characters.length ? '1px solid var(--border)' : 'none', borderRadius: 8, overflow: 'hidden' }}>
            {filtered.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', minHeight: 40 }}>
                <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 18, height: 18 }} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={mFoot}>
          <button style={btn} onClick={onClose}>Abbrechen</button>
          <button style={btnPrimary} onClick={() => onSave([...sel])} disabled={sel.size === 0}>Übernehmen</button>
        </div>
      </div>
    </div>
  )
}
