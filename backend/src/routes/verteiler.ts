/**
 * Verteiler-System — eingeloggte Endpoints (Schritt 2, SPEC §9).
 *
 * Enthält vier Router (alle über die bestehende Auth-Chain `authMiddleware`):
 *   - verteilerRouter            → /api/verteiler          (CRUD + Mitglieder + Besetzung)
 *   - pdfExportProfilRouter      → /api/pdf-export-profil  (GET/PUT)
 *   - distributionenRouter       → /api/distributionen     (Liste/Detail/resend)
 *   - veroeffentlichenRouter     → /api/werkstufen         (POST /:id/veroeffentlichen)
 *
 * Mailversand ist NICHT verdrahtet (Schritt 3). veroeffentlichen/resend legen
 * distribution + distribution_empfaenger an und lassen sie auf zustellung='queued'.
 */
import { Router, Request, Response, NextFunction } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import {
  generateToken, portalLink, tokenAblauf,
  resolveKontaktEmail, resolveBesetzung, deriveAnzeigeStatus,
  sendVerteilerMail, VerteilerMailCtx,
} from '../lib/verteiler'

const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung', 'hauptbuchhaltung']

// ── Freigabe-/DK-Berechtigung ────────────────────────────────────────────────
// Tier-1 immer erlaubt, sonst dk_settings_access (scope='dk') für die Produktion.
// (Schritt 5 verfeinert die "Freigabe-Berechtigung" am Editor-Button.)
async function hatDkZugriff(req: Request, produktionId: string): Promise<boolean> {
  const userRoles = req.user?.roles || (req.user?.role ? [req.user.role] : [])
  if (userRoles.some(r => TIER1_ROLES.includes(r))) return true
  if (!produktionId) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM dk_settings_access
     WHERE production_id = $1 AND scope = 'dk'
       AND ((access_type = 'user' AND identifier = $2)
         OR (access_type = 'rolle' AND identifier = ANY($3::text[])))
     LIMIT 1`,
    [produktionId, req.user?.user_id, userRoles]
  )
  return rows.length > 0
}

// ══════════════════════════════════════════════════════════════════════════════
// verteilerRouter — /api/verteiler
// ══════════════════════════════════════════════════════════════════════════════
export const verteilerRouter = Router()
verteilerRouter.use(authMiddleware)

// GET /api/verteiler?produktion_id=
verteilerRouter.get('/', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const rows = await query(
      `SELECT v.*,
              (SELECT COUNT(*)::int FROM verteiler_mitglied m
               WHERE m.verteiler_id = v.id AND m.aktiv = true) AS mitglieder_count
       FROM verteiler v
       WHERE v.produktion_id = $1
       ORDER BY v.scope, v.werkstufe_typ NULLS LAST, v.name`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/verteiler
verteilerRouter.post('/', async (req, res) => {
  const {
    produktion_id, name, scope, werkstufe_typ,
    pdf_export_profil_id, pdf_anhang, email_betreff, email_text,
    druck_erlaubt, druck_standort, druck_printer_id, druck_default_optionen, abholort,
    aktiv,
  } = req.body
  if (!produktion_id || !name || !scope) {
    return res.status(400).json({ error: 'produktion_id, name, scope required' })
  }
  if (scope === 'werkstufe_typ' && !werkstufe_typ) {
    return res.status(400).json({ error: "werkstufe_typ required when scope='werkstufe_typ'" })
  }
  if (scope === 'revision' && werkstufe_typ) {
    return res.status(400).json({ error: "werkstufe_typ must be null when scope='revision'" })
  }
  try {
    if (!(await hatDkZugriff(req, produktion_id))) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Produktion' })
    }
    const row = await queryOne(
      `INSERT INTO verteiler
         (produktion_id, name, scope, werkstufe_typ, pdf_export_profil_id, pdf_anhang,
          email_betreff, email_text, druck_erlaubt, druck_standort, druck_printer_id,
          druck_default_optionen, abholort, aktiv)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               COALESCE($12, '{"sides":"one-sided","number_up":1,"copies":1}'::jsonb),$13,
               COALESCE($14, true))
       RETURNING *`,
      [
        produktion_id, name, scope, scope === 'revision' ? null : werkstufe_typ,
        pdf_export_profil_id ?? null, pdf_anhang ?? false,
        email_betreff ?? null, email_text ?? null,
        druck_erlaubt ?? false, druck_standort ?? null, druck_printer_id ?? null,
        druck_default_optionen ? JSON.stringify(druck_default_optionen) : null,
        abholort ?? null, aktiv,
      ]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/verteiler/:id
verteilerRouter.get('/:id', async (req, res) => {
  try {
    const v = await queryOne(`SELECT * FROM verteiler WHERE id = $1`, [req.params.id])
    if (!v) return res.status(404).json({ error: 'Verteiler nicht gefunden' })
    const mitglieder = await query(
      `SELECT * FROM verteiler_mitglied WHERE verteiler_id = $1 ORDER BY created_at`,
      [req.params.id]
    )
    res.json({ ...v, mitglieder })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/verteiler/:id
verteilerRouter.put('/:id', async (req, res) => {
  const b = req.body
  try {
    const cur = await queryOne(`SELECT * FROM verteiler WHERE id = $1`, [req.params.id])
    if (!cur) return res.status(404).json({ error: 'Verteiler nicht gefunden' })
    // scope/werkstufe_typ-Konsistenz wahren (CHECK-Constraint verteiler_scope_chk)
    const scope = b.scope ?? cur.scope
    let werkstufeTyp = 'werkstufe_typ' in b ? b.werkstufe_typ : cur.werkstufe_typ
    if (scope === 'revision') werkstufeTyp = null
    if (scope === 'werkstufe_typ' && !werkstufeTyp) {
      return res.status(400).json({ error: "werkstufe_typ required when scope='werkstufe_typ'" })
    }
    const row = await queryOne(
      `UPDATE verteiler SET
         name                   = COALESCE($2, name),
         scope                  = $3,
         werkstufe_typ          = $4,
         pdf_export_profil_id   = CASE WHEN $5 THEN $6 ELSE pdf_export_profil_id END,
         pdf_anhang             = COALESCE($7, pdf_anhang),
         email_betreff          = CASE WHEN $8 THEN $9 ELSE email_betreff END,
         email_text             = CASE WHEN $10 THEN $11 ELSE email_text END,
         druck_erlaubt          = COALESCE($12, druck_erlaubt),
         druck_standort         = CASE WHEN $13 THEN $14 ELSE druck_standort END,
         druck_printer_id       = CASE WHEN $15 THEN $16 ELSE druck_printer_id END,
         druck_default_optionen = COALESCE($17, druck_default_optionen),
         abholort               = CASE WHEN $18 THEN $19 ELSE abholort END,
         aktiv                  = COALESCE($20, aktiv),
         updated_at             = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, b.name ?? null, scope, werkstufeTyp,
        'pdf_export_profil_id' in b, b.pdf_export_profil_id ?? null,
        b.pdf_anhang ?? null,
        'email_betreff' in b, b.email_betreff ?? null,
        'email_text' in b, b.email_text ?? null,
        b.druck_erlaubt ?? null,
        'druck_standort' in b, b.druck_standort ?? null,
        'druck_printer_id' in b, b.druck_printer_id ?? null,
        b.druck_default_optionen ? JSON.stringify(b.druck_default_optionen) : null,
        'abholort' in b, b.abholort ?? null,
        b.aktiv ?? null,
      ]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/verteiler/:id
// distribution.verteiler_id ist FK OHNE ON DELETE CASCADE (Historie-Schutz im DDL),
// daher Distributionen explizit vorab löschen (empfaenger/druck_job cascaden), dann
// den Verteiler (mitglieder cascaden). Hard-Delete inkl. Versand-Historie dieses
// Verteilers. (Soft-Delete via aktiv=false bleibt als Alternative bestehen.)
verteilerRouter.delete('/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ex = await client.query(`SELECT id FROM verteiler WHERE id = $1`, [req.params.id])
    if (ex.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Verteiler nicht gefunden' }) }
    await client.query(`DELETE FROM distribution WHERE verteiler_id = $1`, [req.params.id])
    await client.query(`DELETE FROM verteiler WHERE id = $1`, [req.params.id])
    await client.query('COMMIT')
    res.status(204).send()
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ── Mitglieder ────────────────────────────────────────────────────────────────
// POST /api/verteiler/:id/mitglieder
verteilerRouter.post('/:id/mitglieder', async (req, res) => {
  const { kontakt_id, freie_email, name, revisions_modus, sides_nur_eigene, drehplan_reihenfolge } = req.body
  if (!kontakt_id && !freie_email) {
    return res.status(400).json({ error: 'kontakt_id oder freie_email erforderlich' })
  }
  try {
    const v = await queryOne(`SELECT id FROM verteiler WHERE id = $1`, [req.params.id])
    if (!v) return res.status(404).json({ error: 'Verteiler nicht gefunden' })
    const row = await queryOne(
      `INSERT INTO verteiler_mitglied
         (verteiler_id, kontakt_id, freie_email, name, revisions_modus, sides_nur_eigene, drehplan_reihenfolge)
       VALUES ($1,$2,$3,$4,COALESCE($5,'voll'),COALESCE($6,false),COALESCE($7,false))
       RETURNING *`,
      [req.params.id, kontakt_id ?? null, freie_email ?? null, name ?? null,
       revisions_modus ?? null, sides_nur_eigene ?? null, drehplan_reihenfolge ?? null]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/verteiler/:id/mitglieder/:mid
verteilerRouter.put('/:id/mitglieder/:mid', async (req, res) => {
  const b = req.body
  try {
    const row = await queryOne(
      `UPDATE verteiler_mitglied SET
         kontakt_id           = CASE WHEN $3 THEN $4 ELSE kontakt_id END,
         freie_email          = CASE WHEN $5 THEN $6 ELSE freie_email END,
         name                 = CASE WHEN $7 THEN $8 ELSE name END,
         revisions_modus      = COALESCE($9, revisions_modus),
         sides_nur_eigene     = COALESCE($10, sides_nur_eigene),
         drehplan_reihenfolge = COALESCE($11, drehplan_reihenfolge),
         aktiv                = COALESCE($12, aktiv),
         updated_at           = now()
       WHERE id = $2 AND verteiler_id = $1 RETURNING *`,
      [
        req.params.id, req.params.mid,
        'kontakt_id' in b, b.kontakt_id ?? null,
        'freie_email' in b, b.freie_email ?? null,
        'name' in b, b.name ?? null,
        b.revisions_modus ?? null, b.sides_nur_eigene ?? null,
        b.drehplan_reihenfolge ?? null, b.aktiv ?? null,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Mitglied nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/verteiler/:id/mitglieder/:mid
verteilerRouter.delete('/:id/mitglieder/:mid', async (req, res) => {
  try {
    const r = await pool.query(
      `DELETE FROM verteiler_mitglied WHERE id = $1 AND verteiler_id = $2`,
      [req.params.mid, req.params.id]
    )
    if (r.rowCount === 0) return res.status(404).json({ error: 'Mitglied nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/verteiler/:id/mitglieder/:mid/besetzung
// Löst Schauspieler:in + Figur(en) live über vertraege/Besetzungsmatrix auf.
verteilerRouter.get('/:id/mitglieder/:mid/besetzung', async (req, res) => {
  try {
    const m = await queryOne(
      `SELECT m.*, v.produktion_id FROM verteiler_mitglied m
       JOIN verteiler v ON v.id = m.verteiler_id
       WHERE m.id = $1 AND m.verteiler_id = $2`,
      [req.params.mid, req.params.id]
    )
    if (!m) return res.status(404).json({ error: 'Mitglied nicht gefunden' })
    const besetzung = await resolveBesetzung(m.kontakt_id, m.produktion_id)
    res.json({
      mitglied_id: m.id,
      kontakt_id: m.kontakt_id,
      ...besetzung,
      // Sides nur sinnvoll bei erkannter Schauspieler:in
      sides_verfuegbar: besetzung.ist_schauspieler,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// pdfExportProfilRouter — /api/pdf-export-profil
// ══════════════════════════════════════════════════════════════════════════════
export const pdfExportProfilRouter = Router()
pdfExportProfilRouter.use(authMiddleware)

// GET /api/pdf-export-profil?produktion_id= — Profile einer Produktion
pdfExportProfilRouter.get('/', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const rows = await query(
      `SELECT * FROM pdf_export_profil WHERE produktion_id = $1 ORDER BY ist_standard DESC, name`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/pdf-export-profil — neues Profil (Defaults aus dem DDL)
pdfExportProfilRouter.post('/', async (req, res) => {
  const { produktion_id, name, ist_standard } = req.body
  if (!produktion_id || !name) return res.status(400).json({ error: 'produktion_id und name erforderlich' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (ist_standard === true) {
      await client.query(`UPDATE pdf_export_profil SET ist_standard = false WHERE produktion_id = $1`, [produktion_id])
    }
    const row = await client.query(
      `INSERT INTO pdf_export_profil (produktion_id, name, ist_standard) VALUES ($1,$2,COALESCE($3,false)) RETURNING *`,
      [produktion_id, name, ist_standard ?? false]
    )
    await client.query('COMMIT')
    res.status(201).json(row.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// GET /api/pdf-export-profil/:id
pdfExportProfilRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(`SELECT * FROM pdf_export_profil WHERE id = $1`, [req.params.id])
    if (!row) return res.status(404).json({ error: 'PDF-Profil nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/pdf-export-profil/:id — nur das Aussehen (Sides/Revision schneiden zur Generierzeit)
const PROFIL_FELDER = [
  'name', 'ist_standard',
  'wz_zwc_aktiv', 'wz_sichtbar_aktiv', 'wz_sichtbar_position', 'wz_sichtbar_inhalt',
  'wz_sichtbar_opacity', 'wz_sichtbar_groesse',
  'struktur_quelle', 'kopf_fuss_vorlage_id', 'titelblatt',
  'szenen_nummerierung', 'seiten_nummerierung',
  'lesezeichen_aktiv', 'lesezeichen_ebene', 'lesezeichen_label',
  'revisions_stil',
] as const
pdfExportProfilRouter.put('/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cur = await client.query(`SELECT * FROM pdf_export_profil WHERE id = $1 FOR UPDATE`, [req.params.id])
    if (cur.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'PDF-Profil nicht gefunden' }) }

    const sets: string[] = []
    const vals: any[] = [req.params.id]
    for (const f of PROFIL_FELDER) {
      if (f in req.body) { vals.push(req.body[f]); sets.push(`${f} = $${vals.length}`) }
    }
    if (sets.length === 0) { await client.query('ROLLBACK'); return res.json(cur.rows[0]) }
    sets.push('updated_at = now()')

    // Nur ein Standard-Profil je Produktion (ux_pdf_profil_standard): andere zurücksetzen.
    if (req.body.ist_standard === true) {
      await client.query(
        `UPDATE pdf_export_profil SET ist_standard = false WHERE produktion_id = $1 AND id <> $2`,
        [cur.rows[0].produktion_id, req.params.id]
      )
    }
    const upd = await client.query(
      `UPDATE pdf_export_profil SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals
    )
    await client.query('COMMIT')
    res.json(upd.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// DELETE /api/pdf-export-profil/:id
// verteiler.pdf_export_profil_id ist FK ON DELETE SET NULL → Löschen ist sicher.
pdfExportProfilRouter.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM pdf_export_profil WHERE id = $1`, [req.params.id])
    if (r.rowCount === 0) return res.status(404).json({ error: 'PDF-Profil nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// distributionenRouter — /api/distributionen
// ══════════════════════════════════════════════════════════════════════════════
export const distributionenRouter = Router()
distributionenRouter.use(authMiddleware)

// GET /api/distributionen?werkstufe_id=|verteiler_id=
distributionenRouter.get('/', async (req, res) => {
  const { werkstufe_id, verteiler_id } = req.query
  if (!werkstufe_id && !verteiler_id) {
    return res.status(400).json({ error: 'werkstufe_id oder verteiler_id erforderlich' })
  }
  try {
    const rows = await query(
      `SELECT d.*, v.name AS verteiler_name, v.scope, v.werkstufe_typ,
              (SELECT COUNT(*)::int FROM distribution_empfaenger e WHERE e.distribution_id = d.id) AS empfaenger_count,
              (SELECT COUNT(*)::int FROM distribution_empfaenger e
               WHERE e.distribution_id = d.id AND e.zustellung IN ('bounced','expired')) AS luecken_count
       FROM distribution d
       JOIN verteiler v ON v.id = d.verteiler_id
       WHERE ($1::uuid IS NULL OR d.werkstufe_id = $1)
         AND ($2::uuid IS NULL OR d.verteiler_id = $2)
       ORDER BY d.ausgeloest_am DESC`,
      [werkstufe_id ?? null, verteiler_id ?? null]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/distributionen/:id — Detail inkl. Empfänger + abgeleitetem Anzeige-Status
distributionenRouter.get('/:id', async (req, res) => {
  try {
    const d = await queryOne(
      `SELECT d.*, v.name AS verteiler_name, v.scope, v.werkstufe_typ
       FROM distribution d JOIN verteiler v ON v.id = d.verteiler_id WHERE d.id = $1`,
      [req.params.id]
    )
    if (!d) return res.status(404).json({ error: 'Distribution nicht gefunden' })
    // secure_token_hash bewusst NICHT ausliefern
    const empf = await query(
      `SELECT id, mitglied_id, email_resolved, name, sides_figuren, revisions_modus,
              pdf_path IS NOT NULL AS pdf_erzeugt, token_ablauf, zustellung, bounce_grund,
              gesendet_am, zugestellt_am, opened_at, downloaded_at, printed_at, picked_up_at, created_at
       FROM distribution_empfaenger WHERE distribution_id = $1 ORDER BY created_at`,
      [req.params.id]
    )
    res.json({ ...d, empfaenger: empf.map(e => ({ ...e, anzeige_status: deriveAnzeigeStatus(e) })) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/distributionen/:id/resend — nur Lücken (bounced/expired), idempotent
distributionenRouter.post('/:id/resend', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Kontext für die Mail (Betreff/Text aus Verteiler, Meta aus Werkstufe/Folge/Produktion)
    const ctx = await client.query(
      `SELECT v.email_betreff, v.email_text, w.typ AS werkstufe_typ, w.version_nummer,
              f.folge_nummer, p.titel AS produktion_titel
       FROM distribution d
       JOIN verteiler v ON v.id = d.verteiler_id
       JOIN werkstufen w ON w.id = d.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       LEFT JOIN produktionen p ON p.id = f.produktion_id
       WHERE d.id = $1`,
      [req.params.id]
    )
    if (ctx.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Distribution nicht gefunden' }) }
    const c = ctx.rows[0]

    const luecken = await client.query(
      `SELECT id, email_resolved, name FROM distribution_empfaenger
       WHERE distribution_id = $1 AND zustellung IN ('bounced','expired') FOR UPDATE`,
      [req.params.id]
    )
    const links: Array<{ empfaenger_id: string; email: string; link: string }> = []
    const mailJobs: Array<VerteilerMailCtx & { empfaengerId: string }> = []
    for (const e of luecken.rows) {
      const { token, hash } = generateToken()
      await client.query(
        `UPDATE distribution_empfaenger
           SET secure_token_hash = $2, token_ablauf = $3, zustellung = 'queued',
               bounce_grund = NULL, pdf_path = NULL
         WHERE id = $1`,
        [e.id, hash, tokenAblauf()]
      )
      const link = portalLink(token)
      links.push({ empfaenger_id: e.id, email: e.email_resolved, link })
      mailJobs.push({
        empfaengerId: e.id, correlationId: e.id, to: e.email_resolved, name: e.name, link,
        betreff: c.email_betreff, text: c.email_text,
        produktion: c.produktion_titel, folge: c.folge_nummer,
        werkstufe: c.werkstufe_typ, version: c.version_nummer,
      })
    }
    await client.query('COMMIT')

    // Mailversand der erneut eingereihten Empfänger; queued -> sent (Fehler gesammelt).
    let gesendet = 0
    const versandfehler: Array<{ empfaenger_id: string; error: string }> = []
    for (const job of mailJobs) {
      const r = await sendVerteilerMail(job)
      if (r.ok) {
        await pool.query(
          `UPDATE distribution_empfaenger SET zustellung = 'sent', gesendet_am = now()
           WHERE id = $1 AND zustellung = 'queued'`,
          [job.empfaengerId]
        )
        gesendet++
      } else {
        console.error(`[verteiler] resend-Versand fehlgeschlagen (empf ${job.empfaengerId}): ${r.error}`)
        versandfehler.push({ empfaenger_id: job.empfaengerId, error: r.error || 'unbekannt' })
      }
    }

    res.json({
      distribution_id: req.params.id,
      erneut_eingereiht: links.length,
      gesendet, versandfehler,
      links,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// veroeffentlichenRouter — /api/werkstufen  (POST /:id/veroeffentlichen)
// ══════════════════════════════════════════════════════════════════════════════
export const veroeffentlichenRouter = Router()
veroeffentlichenRouter.use(authMiddleware)

// POST /api/werkstufen/:id/veroeffentlichen
// Body (optional): { include_revision?: boolean, verteiler_ids?: string[] }
veroeffentlichenRouter.post('/:id/veroeffentlichen', async (req, res) => {
  const { include_revision, verteiler_ids } = req.body || {}
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const wsRes = await client.query(
      `SELECT w.id, w.typ, w.version_nummer, f.produktion_id, f.folge_nummer, f.folgen_titel,
              p.titel AS produktion_titel
       FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
       LEFT JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.id = $1`,
      [req.params.id]
    )
    if (wsRes.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Werkstufe nicht gefunden' }) }
    const ws = wsRes.rows[0]

    // Freigabe-Berechtigung (Tier-1 oder DK-Zugriff auf die Produktion)
    if (!(await hatDkZugriff(req, ws.produktion_id))) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Keine Freigabe-Berechtigung für diese Produktion' })
    }

    // published-Flag setzen (manuelle Veröffentlichung, SPEC §4)
    await client.query(
      `UPDATE werkstufen SET published = true, published_am = now(), published_von = $2 WHERE id = $1`,
      [ws.id, req.user!.user_id]
    )

    // Passende Verteiler ermitteln: scope='werkstufe_typ' AND werkstufe_typ=typ,
    // optional zusätzlich scope='revision' (include_revision). Optional explizite IDs.
    const matchRes = await client.query(
      `SELECT * FROM verteiler
       WHERE produktion_id = $1 AND aktiv = true
         AND (
           (scope = 'werkstufe_typ' AND werkstufe_typ = $2)
           OR ($3::boolean AND scope = 'revision')
         )
         AND ($4::uuid[] IS NULL OR id = ANY($4))`,
      [ws.produktion_id, ws.typ, !!include_revision,
       Array.isArray(verteiler_ids) && verteiler_ids.length ? verteiler_ids : null]
    )

    const ablauf = tokenAblauf()
    const ergebnis: any[] = []
    const uebersprungen: Array<{ verteiler_id: string; mitglied_id: string; grund: string }> = []
    // Mailversand erst NACH Commit (Zeilen müssen existieren); Klartext-Token nur hier in-memory.
    const mailJobs: Array<VerteilerMailCtx & { empfaengerId: string }> = []

    for (const v of matchRes.rows) {
      // Idempotenz: jede Veröffentlichung legt eine NEUE distribution an.
      const dist = await client.query(
        `INSERT INTO distribution (werkstufe_id, verteiler_id, ausgeloest_von)
         VALUES ($1,$2,$3) RETURNING id`,
        [ws.id, v.id, req.user!.user_id]
      )
      const distId = dist.rows[0].id

      const mitglieder = await client.query(
        `SELECT * FROM verteiler_mitglied WHERE verteiler_id = $1 AND aktiv = true`, [v.id]
      )
      const links: Array<{ empfaenger_id: string; email: string; link: string }> = []
      for (const m of mitglieder.rows) {
        // E-Mail auflösen: freie_email direkt, sonst über vertraege (Source of Truth).
        let email: string | null = m.freie_email ?? null
        let name: string | null = m.name ?? null
        if (!email && m.kontakt_id) {
          const k = await resolveKontaktEmail(m.kontakt_id)
          if (k) { email = k.email; name = name ?? k.name }
        }
        if (!email) {
          uebersprungen.push({ verteiler_id: v.id, mitglied_id: m.id, grund: 'email_nicht_aufloesbar' })
          continue
        }

        // Sides-Snapshot: nur bei sides_nur_eigene + erkannter Schauspieler:in.
        let sidesFiguren: string[] | null = null
        if (m.sides_nur_eigene) {
          const bes = await resolveBesetzung(m.kontakt_id, ws.produktion_id)
          if (bes.ist_schauspieler) sidesFiguren = bes.figuren.map(f => f.character_id)
        }

        const { token, hash } = generateToken()
        const emp = await client.query(
          `INSERT INTO distribution_empfaenger
             (distribution_id, mitglied_id, email_resolved, name, sides_figuren,
              revisions_modus, secure_token_hash, token_ablauf, zustellung)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued') RETURNING id`,
          [distId, m.id, email, name, sidesFiguren, m.revisions_modus, hash, ablauf]
        )
        const empfId = emp.rows[0].id
        const link = portalLink(token)
        links.push({ empfaenger_id: empfId, email, link })
        mailJobs.push({
          empfaengerId: empfId, correlationId: empfId, to: email, name, link,
          betreff: v.email_betreff, text: v.email_text,
          produktion: ws.produktion_titel, folge: ws.folge_nummer,
          werkstufe: ws.typ, version: ws.version_nummer,
        })
      }

      ergebnis.push({
        verteiler_id: v.id, verteiler_name: v.name, distribution_id: distId,
        empfaenger: links.length, links,
      })
    }

    await client.query('COMMIT')

    // Mailversand (Link-first) über zentrale auth send-mail; queued -> sent.
    // Fehler werden gesammelt zurückgegeben (kein stilles Verschlucken), Zeile bleibt 'queued'.
    let gesendet = 0
    const versandfehler: Array<{ empfaenger_id: string; error: string }> = []
    for (const job of mailJobs) {
      const r = await sendVerteilerMail(job)
      if (r.ok) {
        await pool.query(
          `UPDATE distribution_empfaenger SET zustellung = 'sent', gesendet_am = now()
           WHERE id = $1 AND zustellung = 'queued'`,
          [job.empfaengerId]
        )
        gesendet++
      } else {
        console.error(`[verteiler] Versand fehlgeschlagen (empf ${job.empfaengerId}): ${r.error}`)
        versandfehler.push({ empfaenger_id: job.empfaengerId, error: r.error || 'unbekannt' })
      }
    }

    res.status(201).json({
      werkstufe_id: ws.id, published: true,
      folge: ws.folge_nummer, version: ws.version_nummer, typ: ws.typ,
      distributionen: ergebnis,
      gesendet, versandfehler,
      uebersprungen,
      hinweis: matchRes.rows.length === 0 ? 'Kein passender aktiver Verteiler für diesen Werkstufe-Typ.' : undefined,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})
