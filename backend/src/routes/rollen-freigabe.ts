/**
 * Rollen-Freigabe-Workflow
 *
 * Genehmigungsprozess für neue Rollen/Komparsen in der Script-App.
 *
 * Routen:
 *   GET    /api/rollen-freigabe/:productionId/config
 *   PUT    /api/rollen-freigabe/:productionId/config
 *   GET    /api/rollen-freigabe/:productionId/genehmiger
 *   POST   /api/rollen-freigabe/:productionId/genehmiger
 *   PUT    /api/rollen-freigabe/:productionId/genehmiger/:genId
 *   DELETE /api/rollen-freigabe/:productionId/genehmiger/:genId
 *   GET    /api/rollen-freigabe/:productionId/anfragen
 *   POST   /api/rollen-freigabe/:productionId/anfragen          — neue Anfrage
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/freigeben
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/ablehnen
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/zurueckziehen
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/erinnerung
 *
 * Public (kein Auth):
 *   GET  /api/public/freigabe/:token
 *   POST /api/public/freigabe/:token/entscheiden
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware, requireDkAccess } from '../auth'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

const APP_URL   = process.env.APP_URL   ?? 'https://script.serienwerft.studio'
const SMTP_HOST = process.env.SMTP_HOST ?? 'smtp.ionos.de'
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587')
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''

let transporter: nodemailer.Transporter | null = null
function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_USER || !SMTP_PASS) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: true },
    })
  }
  return transporter
}

// ── Email-Templates ──────────────────────────────────────────────────────────

async function sendFreigabeAnfrageEmail(opts: {
  toName: string
  toEmail: string
  rollenName: string
  produktionTitel: string
  beantragtVon: string
  freigebenUrl: string
  ablehnenUrl: string
}) {
  const t = getTransporter()
  if (!t) { console.log('[rollenFreigabe] Kein SMTP — Email übersprungen:', opts.toEmail); return }
  await t.sendMail({
    from: `"Script · Serienwerft" <${SMTP_USER}>`,
    to: opts.toEmail,
    subject: `Freigabe erbeten: Neue Rolle „${opts.rollenName}"`,
    html: `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:10px;max-width:520px;margin:0 auto;padding:32px}
.title{font-size:18px;font-weight:700;margin:0 0 8px}
.sub{font-size:14px;color:#757575;margin:0 0 24px}
.info{background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0;font-size:13px;line-height:1.8}
.info strong{color:#000}
.btns{display:flex;gap:12px;margin-top:24px}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none}
.btn-ok{background:#000;color:#fff}
.btn-no{background:#f5f5f5;color:#333;border:1px solid #e0e0e0}
.footer{font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body>
<div class="card">
  <div class="title">Freigabe erbeten</div>
  <div class="sub">Script-App · ${new Date().toLocaleDateString('de-DE', { dateStyle: 'long' })}</div>
  <p style="font-size:14px;line-height:1.7;color:#333;">
    Hallo ${opts.toName},<br><br>
    <strong>${opts.beantragtVon}</strong> möchte eine neue Rolle anlegen und bittet um deine Freigabe.
  </p>
  <div class="info">
    <strong>Neue Rolle:</strong> ${opts.rollenName}<br>
    <strong>Produktion:</strong> ${opts.produktionTitel}<br>
    <strong>Beantragt von:</strong> ${opts.beantragtVon}
  </div>
  <div class="btns">
    <a href="${opts.freigebenUrl}" class="btn btn-ok">Rolle freigeben</a>
    <a href="${opts.ablehnenUrl}" class="btn btn-no">Ablehnen</a>
  </div>
  <p style="font-size:12px;color:#999;margin-top:16px">
    Diese Links sind 7 Tage gültig und können nur einmal verwendet werden.<br>
    Freigeben: ${opts.freigebenUrl}<br>
    Ablehnen: ${opts.ablehnenUrl}
  </p>
  <div class="footer">Studio Hamburg Serienwerft · Script-App · Diese E-Mail wurde automatisch generiert.</div>
</div></body></html>`,
  })
}

async function sendErinnerungEmail(opts: {
  toName: string
  toEmail: string
  rollenName: string
  produktionTitel: string
  freigebenUrl: string
  ablehnenUrl: string
}) {
  const t = getTransporter()
  if (!t) { console.log('[rollenFreigabe] Kein SMTP — Erinnerung übersprungen:', opts.toEmail); return }
  await t.sendMail({
    from: `"Script · Serienwerft" <${SMTP_USER}>`,
    to: opts.toEmail,
    subject: `Erinnerung: Freigabe für Rolle „${opts.rollenName}" steht noch aus`,
    html: `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:10px;max-width:520px;margin:0 auto;padding:32px}
.title{font-size:18px;font-weight:700;margin:0 0 8px}
.sub{font-size:14px;color:#757575;margin:0 0 24px}
.info{background:#fff8e0;border-radius:8px;padding:16px;margin:20px 0;font-size:13px;line-height:1.8;border-left:3px solid #FFCC00}
.btns{display:flex;gap:12px;margin-top:24px}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none}
.btn-ok{background:#000;color:#fff}
.btn-no{background:#f5f5f5;color:#333;border:1px solid #e0e0e0}
.footer{font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body>
<div class="card">
  <div class="title">Erinnerung: Freigabe steht aus</div>
  <div class="sub">Script-App · ${new Date().toLocaleDateString('de-DE', { dateStyle: 'long' })}</div>
  <div class="info">
    <strong>Neue Rolle:</strong> ${opts.rollenName}<br>
    <strong>Produktion:</strong> ${opts.produktionTitel}
  </div>
  <div class="btns">
    <a href="${opts.freigebenUrl}" class="btn btn-ok">Rolle freigeben</a>
    <a href="${opts.ablehnenUrl}" class="btn btn-no">Ablehnen</a>
  </div>
  <div class="footer">Studio Hamburg Serienwerft · Script-App · Diese E-Mail wurde automatisch generiert.</div>
</div></body></html>`,
  })
}

// ── Hilfsfunktion: Status-Gesamtbewertung ────────────────────────────────────

async function recalcAnfrageStatus(anfrageId: number) {
  const gStatuses = await query(
    `SELECT gs.entschieden, g.ist_obligatorisch
     FROM rollen_freigabe_genehmiger_status gs
     JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
     WHERE gs.anfrage_id = $1`,
    [anfrageId]
  )

  let neuerStatus = 'ausstehend'

  const hatAbgelehnt = gStatuses.some((g: any) => g.entschieden === 'abgelehnt')
  if (hatAbgelehnt) {
    neuerStatus = 'abgelehnt'
  } else {
    const obligatorisch = gStatuses.filter((g: any) => g.ist_obligatorisch)
    const alleObligatorischFreigegeben = obligatorisch.length > 0 &&
      obligatorisch.every((g: any) => g.entschieden === 'freigegeben')
    if (alleObligatorischFreigegeben) {
      neuerStatus = 'freigegeben'
    }
  }

  await pool.query(
    `UPDATE rollen_freigabe_anfragen SET status = $1, entschieden_am = CASE WHEN $1 != 'ausstehend' THEN NOW() ELSE NULL END WHERE id = $2`,
    [neuerStatus, anfrageId]
  )

  // freigabe_status auf character_productions aktualisieren
  const anfrage = await queryOne(`SELECT character_id, production_id FROM rollen_freigabe_anfragen WHERE id = $1`, [anfrageId])
  if (anfrage) {
    await pool.query(
      `UPDATE character_productions SET freigabe_status = $1 WHERE character_id = $2 AND produktion_id = $3`,
      [neuerStatus, anfrage.character_id, anfrage.production_id]
    )
  }

  return neuerStatus
}

// ── Authenticated Router ──────────────────────────────────────────────────────

export const rollenFreigabeRouter = Router({ mergeParams: true })
rollenFreigabeRouter.use(authMiddleware)

// GET /api/rollen-freigabe/:productionId/config
rollenFreigabeRouter.get('/:productionId/config', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT freigabe_aktiv, erinnerung_nach_tagen FROM rollen_freigabe_konfiguration WHERE production_id = $1`,
      [req.params.productionId]
    )
    res.json(row ?? { freigabe_aktiv: false, erinnerung_nach_tagen: 3 })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// PUT /api/rollen-freigabe/:productionId/config
rollenFreigabeRouter.put('/:productionId/config',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { freigabe_aktiv, erinnerung_nach_tagen } = req.body
      const row = await queryOne(
        `INSERT INTO rollen_freigabe_konfiguration (production_id, freigabe_aktiv, erinnerung_nach_tagen, geaendert_am)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (production_id) DO UPDATE
           SET freigabe_aktiv = $2, erinnerung_nach_tagen = $3, geaendert_am = NOW()
         RETURNING freigabe_aktiv, erinnerung_nach_tagen`,
        [req.params.productionId, freigabe_aktiv ?? false, erinnerung_nach_tagen ?? 3]
      )
      res.json(row)
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// GET /api/rollen-freigabe/:productionId/genehmiger
rollenFreigabeRouter.get('/:productionId/genehmiger', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, name, email, ist_obligatorisch, sort_order
       FROM rollen_freigabe_genehmiger
       WHERE production_id = $1
       ORDER BY sort_order, id`,
      [req.params.productionId]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/genehmiger
rollenFreigabeRouter.post('/:productionId/genehmiger',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { name, email, ist_obligatorisch } = req.body
      if (!name || !email) return res.status(400).json({ error: 'name und email erforderlich' })
      const maxOrder = await queryOne(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM rollen_freigabe_genehmiger WHERE production_id = $1`,
        [req.params.productionId]
      )
      const row = await queryOne(
        `INSERT INTO rollen_freigabe_genehmiger (production_id, name, email, ist_obligatorisch, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.params.productionId, name.trim(), email.trim().toLowerCase(), ist_obligatorisch ?? true, (maxOrder?.max_order ?? 0) + 1]
      )
      res.status(201).json(row)
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// PUT /api/rollen-freigabe/:productionId/genehmiger/:genId
rollenFreigabeRouter.put('/:productionId/genehmiger/:genId',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { name, email, ist_obligatorisch, sort_order } = req.body
      const row = await queryOne(
        `UPDATE rollen_freigabe_genehmiger
         SET name = COALESCE($1, name), email = COALESCE($2, email),
             ist_obligatorisch = COALESCE($3, ist_obligatorisch),
             sort_order = COALESCE($4, sort_order)
         WHERE id = $5 AND production_id = $6 RETURNING *`,
        [name?.trim(), email?.trim().toLowerCase(), ist_obligatorisch, sort_order, req.params.genId, req.params.productionId]
      )
      if (!row) return res.status(404).json({ error: 'Not found' })
      res.json(row)
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// DELETE /api/rollen-freigabe/:productionId/genehmiger/:genId
rollenFreigabeRouter.delete('/:productionId/genehmiger/:genId',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      await pool.query(
        `DELETE FROM rollen_freigabe_genehmiger WHERE id = $1 AND production_id = $2`,
        [req.params.genId, req.params.productionId]
      )
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// GET /api/rollen-freigabe/:productionId/anfragen
// Accessible to DK + Produktion
rollenFreigabeRouter.get('/:productionId/anfragen', async (req: any, res) => {
  try {
    const rows = await query(
      `SELECT a.id, a.character_id, c.name AS rollen_name,
              a.beantragt_von_user_id, a.beantragt_am, a.status, a.entschieden_am, a.notiz,
              JSON_AGG(JSON_BUILD_OBJECT(
                'id', gs.id, 'genehmiger_id', gs.genehmiger_id,
                'name', g.name, 'email', g.email,
                'ist_obligatorisch', g.ist_obligatorisch,
                'entschieden', gs.entschieden, 'entschieden_am', gs.entschieden_am
              ) ORDER BY g.sort_order) AS genehmiger_status
       FROM rollen_freigabe_anfragen a
       JOIN characters c ON c.id = a.character_id
       LEFT JOIN rollen_freigabe_genehmiger_status gs ON gs.anfrage_id = a.id
       LEFT JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
       WHERE a.production_id = $1
       GROUP BY a.id, c.name
       ORDER BY a.beantragt_am DESC`,
      [req.params.productionId]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/anfragen — Neue Anfrage stellen
rollenFreigabeRouter.post('/:productionId/anfragen', async (req: any, res) => {
  try {
    const { character_id } = req.body
    if (!character_id) return res.status(400).json({ error: 'character_id erforderlich' })

    const config = await queryOne(
      `SELECT freigabe_aktiv FROM rollen_freigabe_konfiguration WHERE production_id = $1`,
      [req.params.productionId]
    )
    if (!config?.freigabe_aktiv) {
      // Kein Workflow aktiv — direkt freigeben
      await pool.query(
        `UPDATE character_productions SET freigabe_status = 'keine' WHERE character_id = $1 AND produktion_id = $2`,
        [character_id, req.params.productionId]
      )
      return res.json({ status: 'keine' })
    }

    const genehmiger = await query(
      `SELECT id, name, email, ist_obligatorisch FROM rollen_freigabe_genehmiger WHERE production_id = $1 ORDER BY sort_order`,
      [req.params.productionId]
    )
    if (genehmiger.length === 0) {
      // Keine Genehmiger konfiguriert — direkt freigeben
      await pool.query(
        `UPDATE character_productions SET freigabe_status = 'keine' WHERE character_id = $1 AND produktion_id = $2`,
        [character_id, req.params.productionId]
      )
      return res.json({ status: 'keine' })
    }

    // Anfrage anlegen (oder bestehende zurücksetzen)
    const anfrage = await queryOne(
      `INSERT INTO rollen_freigabe_anfragen (character_id, production_id, beantragt_von_user_id, status)
       VALUES ($1, $2, $3, 'ausstehend')
       ON CONFLICT (character_id, production_id) DO UPDATE
         SET status = 'ausstehend', beantragt_am = NOW(),
             beantragt_von_user_id = $3, entschieden_am = NULL, entschieden_von_user_id = NULL
       RETURNING id`,
      [character_id, req.params.productionId, req.user.user_id]
    )

    await pool.query(
      `UPDATE character_productions SET freigabe_status = 'ausstehend' WHERE character_id = $1 AND produktion_id = $2`,
      [character_id, req.params.productionId]
    )

    // Produktion-Titel für Email
    const prod = await queryOne(`SELECT titel FROM produktionen WHERE id = $1`, [req.params.productionId])
    const char = await queryOne(`SELECT name FROM characters WHERE id = $1`, [character_id])

    // Token + Email pro Genehmiger
    const now = new Date()
    const gueltigBis = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    for (const g of genehmiger) {
      // Doppeltes Token für freigeben + ablehnen
      const tokenFreigeben = crypto.randomBytes(32).toString('hex')
      const tokenAblehnen  = crypto.randomBytes(32).toString('hex')

      // Wir speichern beide Token kommasepariert (freigeben,ablehnen)
      const combinedToken = `${tokenFreigeben}:freigeben,${tokenAblehnen}:ablehnen`

      await pool.query(
        `INSERT INTO rollen_freigabe_genehmiger_status (anfrage_id, genehmiger_id, token, token_gueltig_bis)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (anfrage_id, genehmiger_id) DO UPDATE
           SET token = $3, token_gueltig_bis = $4, entschieden = NULL, entschieden_am = NULL`,
        [anfrage!.id, g.id, combinedToken, gueltigBis]
      )

      await sendFreigabeAnfrageEmail({
        toName: g.name,
        toEmail: g.email,
        rollenName: char?.name ?? '?',
        produktionTitel: prod?.titel ?? '?',
        beantragtVon: req.user.name ?? req.user.user_id,
        freigebenUrl: `${APP_URL}/freigabe/${tokenFreigeben}`,
        ablehnenUrl:  `${APP_URL}/freigabe/${tokenAblehnen}`,
      })
    }

    res.json({ status: 'ausstehend', anfrage_id: anfrage!.id })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/anfragen/:id/freigeben (DK-Override)
rollenFreigabeRouter.post('/:productionId/anfragen/:id/freigeben',
  requireDkAccess(req => req.params.productionId),
  async (req: any, res) => {
    try {
      await pool.query(
        `UPDATE rollen_freigabe_anfragen
         SET status = 'freigegeben', entschieden_am = NOW(), entschieden_von_user_id = $1
         WHERE id = $2 AND production_id = $3`,
        [req.user.user_id, req.params.id, req.params.productionId]
      )
      const anfrage = await queryOne(`SELECT character_id, production_id FROM rollen_freigabe_anfragen WHERE id = $1`, [req.params.id])
      if (anfrage) {
        await pool.query(
          `UPDATE character_productions SET freigabe_status = 'freigegeben' WHERE character_id = $1 AND produktion_id = $2`,
          [anfrage.character_id, anfrage.production_id]
        )
      }
      res.json({ ok: true, status: 'freigegeben' })
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// POST /api/rollen-freigabe/:productionId/anfragen/:id/ablehnen (DK-Override)
rollenFreigabeRouter.post('/:productionId/anfragen/:id/ablehnen',
  requireDkAccess(req => req.params.productionId),
  async (req: any, res) => {
    try {
      const { notiz } = req.body
      await pool.query(
        `UPDATE rollen_freigabe_anfragen
         SET status = 'abgelehnt', entschieden_am = NOW(), entschieden_von_user_id = $1, notiz = $2
         WHERE id = $3 AND production_id = $4`,
        [req.user.user_id, notiz ?? null, req.params.id, req.params.productionId]
      )
      const anfrage = await queryOne(`SELECT character_id, production_id FROM rollen_freigabe_anfragen WHERE id = $1`, [req.params.id])
      if (anfrage) {
        await pool.query(
          `UPDATE character_productions SET freigabe_status = 'abgelehnt' WHERE character_id = $1 AND produktion_id = $2`,
          [anfrage.character_id, anfrage.production_id]
        )
      }
      res.json({ ok: true, status: 'abgelehnt' })
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// POST /api/rollen-freigabe/:productionId/anfragen/:id/zurueckziehen
rollenFreigabeRouter.post('/:productionId/anfragen/:id/zurueckziehen', async (req: any, res) => {
  try {
    await pool.query(
      `UPDATE rollen_freigabe_anfragen
       SET status = 'zurueckgezogen', entschieden_am = NOW(), entschieden_von_user_id = $1
       WHERE id = $2 AND production_id = $3`,
      [req.user.user_id, req.params.id, req.params.productionId]
    )
    const anfrage = await queryOne(`SELECT character_id, production_id FROM rollen_freigabe_anfragen WHERE id = $1`, [req.params.id])
    if (anfrage) {
      await pool.query(
        `UPDATE character_productions SET freigabe_status = 'keine' WHERE character_id = $1 AND produktion_id = $2`,
        [anfrage.character_id, anfrage.production_id]
      )
    }
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/anfragen/:id/erinnerung
rollenFreigabeRouter.post('/:productionId/anfragen/:id/erinnerung',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const anfrage = await queryOne(
        `SELECT a.id, c.name AS rollen_name, p.titel AS prod_titel
         FROM rollen_freigabe_anfragen a
         JOIN characters c ON c.id = a.character_id
         JOIN produktionen p ON p.id = a.production_id
         WHERE a.id = $1 AND a.production_id = $2 AND a.status = 'ausstehend'`,
        [req.params.id, req.params.productionId]
      )
      if (!anfrage) return res.status(404).json({ error: 'Anfrage nicht gefunden oder nicht ausstehend' })

      const pendingStatuses = await query(
        `SELECT gs.*, g.name, g.email
         FROM rollen_freigabe_genehmiger_status gs
         JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
         WHERE gs.anfrage_id = $1 AND gs.entschieden IS NULL`,
        [req.params.id]
      )

      for (const gs of pendingStatuses) {
        // Token aus DB parsen
        const tokens = gs.token?.split(',') ?? []
        let freigebenToken = '', ablehnenToken = ''
        for (const t of tokens) {
          const [tok, typ] = t.split(':')
          if (typ === 'freigeben') freigebenToken = tok
          if (typ === 'ablehnen')  ablehnenToken = tok
        }
        await sendErinnerungEmail({
          toName: gs.name,
          toEmail: gs.email,
          rollenName: anfrage.rollen_name,
          produktionTitel: anfrage.prod_titel,
          freigebenUrl: `${APP_URL}/freigabe/${freigebenToken}`,
          ablehnenUrl:  `${APP_URL}/freigabe/${ablehnenToken}`,
        })
      }

      res.json({ ok: true, erinnerungen: pendingStatuses.length })
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// ── Public Router (kein Auth) ─────────────────────────────────────────────────

export const rollenFreigabePublicRouter = Router()

// GET /api/public/freigabe/:token — Token-Infos lesen
rollenFreigabePublicRouter.get('/:token', async (req, res) => {
  try {
    const { token } = req.params

    // Token suchen: format ist "TOKEN:entscheidung"
    // Wir suchen in allen token-Feldern nach dem Token
    const gsRow = await queryOne(
      `SELECT gs.*, gs.token AS raw_token, a.status AS anfrage_status,
              c.name AS rollen_name, p.titel AS prod_titel,
              g.name AS genehmiger_name
       FROM rollen_freigabe_genehmiger_status gs
       JOIN rollen_freigabe_anfragen a ON a.id = gs.anfrage_id
       JOIN characters c ON c.id = a.character_id
       JOIN produktionen p ON p.id = a.production_id
       JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
       WHERE gs.token LIKE $1`,
      [`%${token}%`]
    )

    if (!gsRow) return res.status(404).json({ error: 'Token nicht gefunden' })
    if (gsRow.token_gueltig_bis && new Date(gsRow.token_gueltig_bis) < new Date()) {
      return res.status(410).json({ error: 'Token abgelaufen' })
    }

    // Bestimme ob das der Freigeben- oder Ablehnen-Token ist
    let entscheidung = ''
    for (const part of (gsRow.raw_token ?? '').split(',')) {
      const [tok, typ] = part.split(':')
      if (tok === token) { entscheidung = typ; break }
    }

    res.json({
      rollen_name: gsRow.rollen_name,
      prod_titel: gsRow.prod_titel,
      genehmiger_name: gsRow.genehmiger_name,
      anfrage_status: gsRow.anfrage_status,
      bereits_entschieden: gsRow.entschieden !== null,
      eigene_entscheidung: gsRow.entschieden,
      entscheidung_typ: entscheidung, // 'freigeben' | 'ablehnen'
    })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/public/freigabe/:token/entscheiden
rollenFreigabePublicRouter.post('/:token/entscheiden', async (req, res) => {
  try {
    const { token } = req.params

    const gsRow = await queryOne(
      `SELECT gs.*, gs.token AS raw_token
       FROM rollen_freigabe_genehmiger_status gs
       JOIN rollen_freigabe_anfragen a ON a.id = gs.anfrage_id
       WHERE gs.token LIKE $1 AND a.status = 'ausstehend'`,
      [`%${token}%`]
    )

    if (!gsRow) return res.status(404).json({ error: 'Token nicht gefunden oder Anfrage bereits abgeschlossen' })
    if (gsRow.token_gueltig_bis && new Date(gsRow.token_gueltig_bis) < new Date()) {
      return res.status(410).json({ error: 'Token abgelaufen' })
    }
    if (gsRow.entschieden !== null) {
      return res.status(409).json({ error: 'Bereits entschieden', entschieden: gsRow.entschieden })
    }

    // Entscheidungstyp aus Token ermitteln
    let entscheidung = ''
    for (const part of (gsRow.raw_token ?? '').split(',')) {
      const [tok, typ] = part.split(':')
      if (tok === token) { entscheidung = typ; break }
    }
    if (!entscheidung) return res.status(400).json({ error: 'Ungültiger Token-Typ' })

    const entschiedenWert = entscheidung === 'freigeben' ? 'freigegeben' : 'abgelehnt'

    // Status setzen
    await pool.query(
      `UPDATE rollen_freigabe_genehmiger_status
       SET entschieden = $1, entschieden_am = NOW()
       WHERE id = $2`,
      [entschiedenWert, gsRow.id]
    )

    // Gesamtstatus neu berechnen
    const neuerStatus = await recalcAnfrageStatus(gsRow.anfrage_id)

    res.json({ ok: true, entschieden: entschiedenWert, anfrage_status: neuerStatus })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})
