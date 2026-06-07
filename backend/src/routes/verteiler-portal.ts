/**
 * Verteiler-System — öffentliches Empfänger-Portal (Schritt 2, SPEC §8/§9).
 *
 * Token-basiert, KEIN Login. Mounted at /api/v (MUSS vor exportsRouter stehen,
 * sonst greift dessen authMiddleware).
 *
 *   GET  /api/v/:token        → Metadaten; setzt opened_at
 *   GET  /api/v/:token/pdf    → lazy PDF (Stub); setzt downloaded_at + pdf_path
 *   POST /api/v/:token/resend → neuer Link bei abgelaufenem Token
 *   POST /api/v/:token/druck  → (Bald) hinter Feature-Flag
 *
 * Die echte PDF-Pipeline (Wasserzeichen, Sides-Filter, Export-Modul) folgt
 * später — hier nur der lazy-Hook mit klar markiertem Generierungs-Stub.
 */
import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { pool, queryOne } from '../db'
import {
  hashToken, generateToken, portalLink, tokenAblauf,
  DRUCK_FEATURE_ENABLED, sendVerteilerMail,
} from '../lib/verteiler'

export const verteilerPortalRouter = Router()

const PDF_CACHE_DIR = path.join(process.cwd(), 'uploads', 'verteiler-pdfs')

// Lädt den Empfänger über den Token-Hash inkl. Kontext (Produktion/Folge/Werkstufe).
async function ladeEmpfaenger(token: string) {
  const hash = hashToken(token)
  return queryOne(
    `SELECT e.*, d.werkstufe_id, v.name AS verteiler_name, v.pdf_anhang,
            v.email_betreff, v.email_text,
            w.typ AS werkstufe_typ, w.version_nummer, w.published, w.published_am,
            f.folge_nummer, f.folgen_titel, f.produktion_id,
            p.titel AS produktion_titel
     FROM distribution_empfaenger e
     JOIN distribution d ON d.id = e.distribution_id
     JOIN verteiler v ON v.id = d.verteiler_id
     JOIN werkstufen w ON w.id = d.werkstufe_id
     JOIN folgen f ON f.id = w.folge_id
     LEFT JOIN produktionen p ON p.id = f.produktion_id
     WHERE e.secure_token_hash = $1`,
    [hash]
  )
}

function istAbgelaufen(e: any): boolean {
  return e.zustellung === 'expired' || (e.token_ablauf && new Date(e.token_ablauf).getTime() < Date.now())
}

// Minimaler, gültiger Platzhalter-PDF (Schritt 2). Ersetzt durch echte Pipeline.
function makeStubPdf(line: string): Buffer {
  const objs: Record<number, string> = {}
  objs[1] = '<</Type/Catalog/Pages 2 0 R>>'
  objs[2] = '<</Type/Pages/Kids[3 0 R]/Count 1>>'
  objs[3] = '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>'
  const stream = `BT /F1 16 Tf 64 760 Td (${line.replace(/[()\\]/g, ' ')}) Tj ET`
  objs[4] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`
  objs[5] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  let pdf = '%PDF-1.4\n'
  const offsets: Record<number, number> = {}
  for (let i = 1; i <= 5; i++) { offsets[i] = Buffer.byteLength(pdf, 'latin1'); pdf += `${i} 0 obj\n${objs[i]}\nendobj\n` }
  const xrefPos = Buffer.byteLength(pdf, 'latin1')
  pdf += 'xref\n0 6\n0000000000 65535 f \n'
  for (let i = 1; i <= 5; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
  pdf += `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

// ── GET /api/v/:token ─────────────────────────────────────────────────────────
verteilerPortalRouter.get('/:token', async (req, res) => {
  try {
    const e = await ladeEmpfaenger(req.params.token)
    if (!e) return res.status(404).json({ status: 'unbekannt', error: 'Link ungültig' })

    if (istAbgelaufen(e)) {
      // FSM: queued/sent/delivered → expired (bounced bleibt bounced)
      if (e.zustellung !== 'expired' && e.zustellung !== 'bounced') {
        await pool.query(`UPDATE distribution_empfaenger SET zustellung = 'expired' WHERE id = $1`, [e.id])
      }
      return res.status(410).json({
        status: 'abgelaufen',
        email: e.email_resolved,   // für "neuen Link anfordern"
        resend_verfuegbar: true,
      })
    }

    // Engagement: opened_at einmalig setzen (unabhängig von der Versand-FSM)
    if (!e.opened_at) {
      await pool.query(`UPDATE distribution_empfaenger SET opened_at = now() WHERE id = $1`, [e.id])
    }

    res.json({
      status: 'gueltig',
      produktion: e.produktion_titel,
      folge: e.folge_nummer,
      folgen_titel: e.folgen_titel,
      werkstufe: e.werkstufe_typ,
      version: e.version_nummer,
      freigegeben_am: e.published_am,
      empfaenger_name: e.name,
      sides: {
        nur_eigene: Array.isArray(e.sides_figuren) && e.sides_figuren.length > 0,
        figuren_count: Array.isArray(e.sides_figuren) ? e.sides_figuren.length : 0,
      },
      pdf_anhang: e.pdf_anhang,
      token_ablauf: e.token_ablauf,
      vertraulichkeit: 'Personalisiert und mit eindeutigem Wasserzeichen versehen. Bitte nicht weitergeben.',
      // Druck-Block nur sichtbar, wenn Feature-Flag aktiv (sonst "Bald" im Frontend)
      druck_verfuegbar: DRUCK_FEATURE_ENABLED,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/v/:token/pdf — lazy Erzeugung + Cache ────────────────────────────
verteilerPortalRouter.get('/:token/pdf', async (req, res) => {
  try {
    const e = await ladeEmpfaenger(req.params.token)
    if (!e) return res.status(404).json({ error: 'Link ungültig' })
    if (istAbgelaufen(e)) return res.status(410).json({ status: 'abgelaufen', error: 'Link abgelaufen' })

    let buffer: Buffer
    if (e.pdf_path && fs.existsSync(e.pdf_path)) {
      buffer = fs.readFileSync(e.pdf_path)   // Cache-Treffer
    } else {
      // TODO Schritt 7: echtes Export-Modul + ZWC/sichtbares Wasserzeichen + Sides-Filter.
      buffer = makeStubPdf(`Verteiler-PDF (Platzhalter) - ${e.name ?? ''} - ${e.werkstufe_typ} v${e.version_nummer}`)
      try {
        fs.mkdirSync(PDF_CACHE_DIR, { recursive: true })
        const p = path.join(PDF_CACHE_DIR, `${e.id}.pdf`)
        fs.writeFileSync(p, buffer)
        await pool.query(`UPDATE distribution_empfaenger SET pdf_path = $2 WHERE id = $1`, [e.id, p])
      } catch { /* Cache-Schreibfehler ist nicht fatal — PDF wird trotzdem ausgeliefert */ }
    }
    // Engagement: downloaded_at einmalig setzen
    if (!e.downloaded_at) {
      await pool.query(`UPDATE distribution_empfaenger SET downloaded_at = now() WHERE id = $1`, [e.id])
    }
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="drehbuch-${e.folge_nummer}-v${e.version_nummer}.pdf"`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/v/:token/resend — neuer Link bei abgelaufenem Token ─────────────
verteilerPortalRouter.post('/:token/resend', async (req, res) => {
  try {
    const e = await ladeEmpfaenger(req.params.token)
    if (!e) return res.status(404).json({ error: 'Link ungültig' })

    const { token, hash } = generateToken()
    await pool.query(
      `UPDATE distribution_empfaenger
         SET secure_token_hash = $2, token_ablauf = $3, zustellung = 'queued',
             bounce_grund = NULL, pdf_path = NULL
       WHERE id = $1`,
      [e.id, hash, tokenAblauf()]
    )
    const link = portalLink(token)
    // Neuen Link an die hinterlegte E-Mail senden (Link-first); queued -> sent.
    const r = await sendVerteilerMail({
      empfaengerId: e.id, correlationId: e.id, to: e.email_resolved, name: e.name, link,
      betreff: e.email_betreff, text: e.email_text,
      produktion: e.produktion_titel, folge: e.folge_nummer,
      werkstufe: e.werkstufe_typ, version: e.version_nummer,
    } as any)
    if (r.ok) {
      await pool.query(
        `UPDATE distribution_empfaenger SET zustellung = 'sent', gesendet_am = now()
         WHERE id = $1 AND zustellung = 'queued'`,
        [e.id]
      )
    } else {
      console.error(`[verteiler] Portal-resend-Versand fehlgeschlagen (empf ${e.id}): ${r.error}`)
    }
    res.json({
      ok: true,
      email: e.email_resolved,
      versand: r.ok ? 'gesendet' : 'fehlgeschlagen',
      // Klartext-Link nur zurückgeben (nie gespeichert) — zusätzlich per Mail zugestellt.
      link,
      hinweis: 'Die Drehbuchkoordination wird über die Anforderung informiert.',
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/v/:token/druck — (Bald) hinter Feature-Flag ─────────────────────
verteilerPortalRouter.post('/:token/druck', async (_req, res) => {
  if (!DRUCK_FEATURE_ENABLED) {
    return res.status(501).json({ error: 'Ausdrucken ist noch nicht aktiv', feature: 'druck', status: 'bald' })
  }
  // TODO Bald: druck_job anlegen + Druckpräferenz an mitglied_id speichern.
  res.status(501).json({ error: 'nicht implementiert' })
})
