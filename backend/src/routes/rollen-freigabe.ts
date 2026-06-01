/**
 * Rollen-Freigabe-Workflow
 *
 * Genehmigungsprozess für neue Rollen/Komparsen in der Script-App.
 * Seit Phase 1: Auth-User/Rolle-basiertes Fan-Out-Modell, First-Responder-Quorum.
 *
 * Routen:
 *   GET    /api/rollen-freigabe/:productionId/config
 *   PUT    /api/rollen-freigabe/:productionId/config
 *   GET    /api/rollen-freigabe/:productionId/genehmiger
 *   POST   /api/rollen-freigabe/:productionId/genehmiger
 *   PUT    /api/rollen-freigabe/:productionId/genehmiger/:genId
 *   DELETE /api/rollen-freigabe/:productionId/genehmiger/:genId
 *   GET    /api/rollen-freigabe/:productionId/anfragen
 *   POST   /api/rollen-freigabe/:productionId/anfragen
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/entscheiden   (in-app)
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/freigeben     (DK-Override)
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/ablehnen      (DK-Override)
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/zurueckziehen
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/erinnerung
 *   POST   /api/rollen-freigabe/:productionId/anfragen/:id/erneut-anfragen
 *
 * Public (kein Auth):
 *   GET  /api/public/freigabe/:token
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware, requireDkAccess } from '../auth'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { getCompanyName } from '../utils/companyInfo'

const APP_URL = process.env.APP_URL ?? 'https://script.serienwerft.studio'
const INTERNAL_KEY = process.env.INTERNAL_SECRET_KEY || 'SerienwerftInternalKey2026xQzP'

// ── Auth-Service Helfer ───────────────────────────────────────────────────────

async function getUserInfoFromAuth(userId: string): Promise<{name: string; email: string} | null> {
  try {
    const resp = await fetch(
      `http://127.0.0.1:3002/api/internal/user-info?user_id=${encodeURIComponent(userId)}`,
      { headers: { 'x-internal-key': INTERNAL_KEY } }
    )
    if (!resp.ok) return null
    const data = await resp.json() as any
    if (!data?.user_id) return null
    return { name: data.name ?? userId, email: data.email ?? '' }
  } catch {
    return null
  }
}

async function getUsersByRoleFromAuth(rolle: string): Promise<Array<{user_id: string; name: string; email: string}>> {
  try {
    const resp = await fetch(
      `http://127.0.0.1:3002/api/internal/users-by-role?role=${encodeURIComponent(rolle)}&app=script`,
      { headers: { 'x-internal-key': INTERNAL_KEY } }
    )
    if (!resp.ok) return []
    const data = await resp.json() as any
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ── SMTP ──────────────────────────────────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null
function getTransporter(): nodemailer.Transporter | null {
  const smtpUser = process.env.SMTP_USER ?? ''
  const smtpPass = process.env.SMTP_PASS ?? ''
  if (!smtpUser || !smtpPass) {
    console.log('[rollenFreigabe] SMTP_USER oder SMTP_PASS nicht gesetzt — Email nicht möglich')
    return null
  }
  if (!transporter) {
    const smtpHost = process.env.SMTP_HOST ?? 'smtp.ionos.de'
    const smtpPort = parseInt(process.env.SMTP_PORT ?? '587')
    transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: false,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: true },
    })
  }
  return transporter
}

// ── Email-Templates ──────────────────────────────────────────────────────────

interface SzeneKontext {
  folge_nummer?: number | null
  arbeitstitel?: string | null
  werkstufe_typ?: string | null
  werkstufe_version?: number | null
  scene_nummer?: string | null
  int_ext?: string | null
  ort_name?: string | null
  szene_id?: string
}

function werkstufeTyptLabel(typ: string | null | undefined): string {
  if (typ === 'drehbuch') return 'Drehbuch'
  if (typ === 'storyline') return 'Storyline'
  if (typ === 'notiz') return 'Dokument'
  return typ ?? ''
}

// Entscheidung erfolgt in der App — Email enthält nur "In App ansehen"-Button
async function sendFreigabeAnfrageEmail(opts: {
  toName: string
  toEmail: string
  rollenName: string
  produktionTitel: string
  beantragtVon: string
  inAppUrl: string
  szeneKontext?: SzeneKontext | null
  erneutNotiz?: string | null
}) {
  const t = getTransporter()
  if (!t) { console.log('[rollenFreigabe] Kein SMTP — Email übersprungen:', opts.toEmail); return }
  const companyName = await getCompanyName()
  const ctx = opts.szeneKontext

  const szeneBlock = ctx ? [
    ctx.folge_nummer != null ? `<strong>Folge:</strong> ${ctx.folge_nummer}${ctx.arbeitstitel ? ' · ' + ctx.arbeitstitel : ''}<br>` : '',
    ctx.werkstufe_typ ? `<strong>Werkstufe:</strong> ${werkstufeTyptLabel(ctx.werkstufe_typ)} v${ctx.werkstufe_version ?? 1}<br>` : '',
    ctx.scene_nummer != null ? `<strong>Szene:</strong> ${ctx.scene_nummer}${ctx.int_ext ? ' · ' + ctx.int_ext : ''}${ctx.ort_name ? ' · ' + ctx.ort_name : ''}<br>` : '',
  ].join('') : ''

  const erneutNotizBlock = opts.erneutNotiz
    ? `<div style="background:#fff8e0;border-left:3px solid #FFCC00;border-radius:0 6px 6px 0;padding:12px 16px;margin-top:12px;font-size:13px;line-height:1.7;"><strong>Hinweis des Antragstellers:</strong><br>${opts.erneutNotiz}</div>`
    : ''

  const dateStr = new Date().toLocaleDateString('de-DE', { dateStyle: 'long' })
  await t.sendMail({
    from: `"Script \u00b7 ${companyName}" <${process.env.SMTP_USER}>`,
    to: opts.toEmail,
    subject: `Freigabe erbeten: Neue Rolle \u201e${opts.rollenName}\u201c`,
    html: `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:10px;max-width:520px;margin:0 auto;padding:32px}
.title{font-size:18px;font-weight:700;margin:0 0 8px}
.sub{font-size:14px;color:#757575;margin:0 0 24px}
.info{background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0;font-size:13px;line-height:1.8}
.info strong{color:#000}
.btn{display:inline-block;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;background:#000;color:#fff;margin-top:24px}
.footer{font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body><div class="card">
<div class="title">Freigabe erbeten</div>
<div class="sub">Script-App \u00b7 ${dateStr}</div>
<p style="font-size:14px;line-height:1.7;color:#333;">Hallo ${opts.toName},<br><br><strong>${opts.beantragtVon}</strong> m\u00f6chte eine neue Rolle anlegen und bittet um deine Freigabe.</p>
<div class="info"><strong>Neue Rolle:</strong> ${opts.rollenName}<br><strong>Produktion:</strong> ${opts.produktionTitel}<br>${szeneBlock}<strong>Beantragt von:</strong> ${opts.beantragtVon}</div>
${erneutNotizBlock}
<a href="${opts.inAppUrl}" class="btn">In App ansehen</a>
<p style="font-size:12px;color:#999;margin-top:16px">Dieser Link ist 7 Tage g\u00fcltig.<br>${opts.inAppUrl}</p>
<div class="footer">${companyName} \u00b7 Script-App \u00b7 Diese E-Mail wurde automatisch generiert.</div>
</div></body></html>`,
  })
}

async function sendErinnerungEmail(opts: {
  toName: string
  toEmail: string
  rollenName: string
  produktionTitel: string
  inAppUrl: string
}) {
  const t = getTransporter()
  if (!t) { console.log('[rollenFreigabe] Kein SMTP — Erinnerung übersprungen:', opts.toEmail); return }
  const companyName = await getCompanyName()
  const dateStr = new Date().toLocaleDateString('de-DE', { dateStyle: 'long' })
  await t.sendMail({
    from: `"Script \u00b7 ${companyName}" <${process.env.SMTP_USER}>`,
    to: opts.toEmail,
    subject: `Erinnerung: Freigabe f\u00fcr Rolle \u201e${opts.rollenName}\u201c steht noch aus`,
    html: `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:10px;max-width:520px;margin:0 auto;padding:32px}
.title{font-size:18px;font-weight:700;margin:0 0 8px}
.sub{font-size:14px;color:#757575;margin:0 0 24px}
.info{background:#fff8e0;border-radius:8px;padding:16px;margin:20px 0;font-size:13px;line-height:1.8;border-left:3px solid #FFCC00}
.btn{display:inline-block;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;background:#000;color:#fff;margin-top:24px}
.footer{font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body><div class="card">
<div class="title">Erinnerung: Freigabe steht aus</div>
<div class="sub">Script-App \u00b7 ${dateStr}</div>
<div class="info"><strong>Neue Rolle:</strong> ${opts.rollenName}<br><strong>Produktion:</strong> ${opts.produktionTitel}</div>
<a href="${opts.inAppUrl}" class="btn">In App ansehen</a>
<div class="footer">${companyName} \u00b7 Script-App \u00b7 Diese E-Mail wurde automatisch generiert.</div>
</div></body></html>`,
  })
}

// ── Szene-Kontext laden ───────────────────────────────────────────────────────

async function loadSzeneKontext(szeneId: string): Promise<{kontext: SzeneKontext; folgeNummer: number | null} | null> {
  const szRow = await queryOne(
    `SELECT ds.scene_nummer, ds.ort_name, ds.int_ext,
            w.typ AS werkstufe_typ, w.version_nummer AS werkstufe_version,
            f.folge_nummer, f.folgen_titel AS arbeitstitel
     FROM dokument_szenen ds
     JOIN werkstufen w ON w.id = ds.werkstufe_id
     JOIN folgen f ON f.id = w.folge_id
     WHERE ds.id = $1`,
    [szeneId]
  )
  if (!szRow) return null
  return {
    kontext: {
      folge_nummer: szRow.folge_nummer,
      arbeitstitel: szRow.arbeitstitel,
      werkstufe_typ: szRow.werkstufe_typ,
      werkstufe_version: szRow.werkstufe_version,
      scene_nummer: szRow.scene_nummer != null ? String(szRow.scene_nummer) : null,
      int_ext: szRow.int_ext,
      ort_name: szRow.ort_name,
      szene_id: szeneId,
    },
    folgeNummer: szRow.folge_nummer ?? null,
  }
}

// ── Fan-Out: Genehmiger-Config → konkrete Auth-Users ─────────────────────────

interface GenehmigerUser {
  user_id: string; name: string; email: string; genehmiger_id: number; stufe: string
}

async function expandGenehmiger(
  config: Array<{id: number; user_id: string | null; rolle: string | null; stufe: string}>
): Promise<GenehmigerUser[]> {
  const userMap = new Map<string, GenehmigerUser>()
  for (const g of config) {
    if (g.user_id) {
      if (!userMap.has(g.user_id)) {
        const info = await getUserInfoFromAuth(g.user_id)
        if (info) userMap.set(g.user_id, { user_id: g.user_id, ...info, genehmiger_id: g.id, stufe: g.stufe })
      }
    } else if (g.rolle) {
      const users = await getUsersByRoleFromAuth(g.rolle)
      for (const u of users) {
        if (!userMap.has(u.user_id)) {
          userMap.set(u.user_id, { user_id: u.user_id, name: u.name, email: u.email, genehmiger_id: g.id, stufe: g.stufe })
        }
      }
    }
  }
  return Array.from(userMap.values())
}

// ── First-Responder: Status-Gesamtbewertung (Budget) ─────────────────────────

async function recalcAnfrageStatus(anfrageId: number): Promise<string> {
  const gStatuses = await query(
    `SELECT gs.id, gs.entschieden, g.stufe
     FROM rollen_freigabe_genehmiger_status gs
     JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
     WHERE gs.anfrage_id = $1`,
    [anfrageId]
  )

  const obligatorisch = gStatuses.filter((g: any) => g.stufe === 'obligatorisch')
  const firstDecision = obligatorisch.find(
    (g: any) => g.entschieden !== null && g.entschieden !== 'zurueckgezogen'
  )

  let neuerStatus = 'ausstehend'

  if (firstDecision) {
    neuerStatus = firstDecision.entschieden // 'freigegeben' | 'abgelehnt'

    // Auto-Rückzug aller noch offenen obligatorischen Statuse
    const toWithdraw = obligatorisch
      .filter((g: any) => g.entschieden === null)
      .map((g: any) => g.id)
    if (toWithdraw.length > 0) {
      await pool.query(
        `UPDATE rollen_freigabe_genehmiger_status
         SET entschieden = 'zurueckgezogen', entschieden_am = NOW()
         WHERE id = ANY($1::int[])`,
        [toWithdraw]
      )
    }
  }

  await pool.query(
    `UPDATE rollen_freigabe_anfragen
     SET status = $1, entschieden_am = CASE WHEN $1 != 'ausstehend' THEN NOW() ELSE NULL END
     WHERE id = $2`,
    [neuerStatus, anfrageId]
  )

  const anfrage = await queryOne(
    `SELECT character_id, production_id FROM rollen_freigabe_anfragen WHERE id = $1`,
    [anfrageId]
  )
  if (anfrage && neuerStatus !== 'ausstehend') {
    if (neuerStatus === 'freigegeben') {
      await pool.query(
        `UPDATE character_productions
         SET freigabe_status = 'freigegeben', is_active = TRUE
         WHERE character_id = $1 AND produktion_id = $2`,
        [anfrage.character_id, anfrage.production_id]
      )
    } else {
      await pool.query(
        `UPDATE character_productions
         SET freigabe_status = $1
         WHERE character_id = $2 AND produktion_id = $3`,
        [neuerStatus, anfrage.character_id, anfrage.production_id]
      )
    }
  }

  return neuerStatus
}

// ── First-Responder: Status-Gesamtbewertung (Dispo/Szene) ────────────────────

async function recalcSzenenAnfrageStatus(anfrageId: string): Promise<string> {
  const gStatuses = await query(
    `SELECT gs.id, gs.entschieden, g.stufe
     FROM szenen_freigabe_genehmiger_status gs
     JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
     WHERE gs.anfrage_id = $1`,
    [anfrageId]
  )

  const obligatorisch = gStatuses.filter((g: any) => g.stufe === 'obligatorisch')
  const firstDecision = obligatorisch.find(
    (g: any) => g.entschieden !== null && g.entschieden !== 'zurueckgezogen'
  )

  let neuerStatus = 'ausstehend'

  if (firstDecision) {
    neuerStatus = firstDecision.entschieden

    const toWithdraw = obligatorisch
      .filter((g: any) => g.entschieden === null)
      .map((g: any) => g.id)
    if (toWithdraw.length > 0) {
      await pool.query(
        `UPDATE szenen_freigabe_genehmiger_status
         SET entschieden = 'zurueckgezogen', entschieden_am = NOW()
         WHERE id = ANY($1::uuid[])`,
        [toWithdraw]
      )
    }
  }

  await pool.query(
    `UPDATE szenen_freigabe_anfragen
     SET status = $1, entschieden_am = CASE WHEN $1 != 'ausstehend' THEN NOW() ELSE NULL END
     WHERE id = $2`,
    [neuerStatus, anfrageId]
  )

  const anfrage = await queryOne(
    `SELECT character_id, scene_identity_id, production_id FROM szenen_freigabe_anfragen WHERE id = $1`,
    [anfrageId]
  )
  if (anfrage && neuerStatus !== 'ausstehend') {
    if (neuerStatus === 'freigegeben') {
      await pool.query(
        `UPDATE scene_characters SET status = 'bestaetigt'
         WHERE scene_identity_id = $1 AND character_id = $2 AND status = 'ausstehend'`,
        [anfrage.scene_identity_id, anfrage.character_id]
      )
    } else if (neuerStatus === 'abgelehnt') {
      await pool.query(
        `UPDATE scene_characters SET status = 'abgelehnt'
         WHERE scene_identity_id = $1 AND character_id = $2 AND status = 'ausstehend'`,
        [anfrage.scene_identity_id, anfrage.character_id]
      )
    }
  }

  return neuerStatus
}

// ── Dispo-Freigabe-Anfrage starten (exportiert, wiederverwendbar) ─────────────

export async function starteSzenenFreigabeAnfrage(params: {
  characterId: string
  sceneIdentityId: string
  produktionId: string
  szeneId: string | null
  userId: string
  userName: string | null
}): Promise<'ausstehend' | 'keine'> {
  const config = await queryOne(
    `SELECT freigabe_aktiv FROM rollen_freigabe_konfiguration WHERE production_id = $1`,
    [params.produktionId]
  )
  if (!config?.freigabe_aktiv) return 'keine'

  const genehmigerConfig = await query(
    `SELECT id, user_id, rolle, stufe
     FROM rollen_freigabe_genehmiger
     WHERE production_id = $1 AND freigabe_typ = 'dispo'
     ORDER BY sort_order`,
    [params.produktionId]
  )
  if (genehmigerConfig.length === 0) return 'keine'

  let szeneKontext: SzeneKontext | null = null
  if (params.szeneId) {
    const sc = await loadSzeneKontext(params.szeneId)
    if (sc) szeneKontext = sc.kontext
  }

  const anfrage = await queryOne(
    `INSERT INTO szenen_freigabe_anfragen
       (character_id, scene_identity_id, production_id, beantragt_von_user_id, beantragt_von_name, status)
     VALUES ($1, $2, $3, $4, $5, 'ausstehend')
     ON CONFLICT (character_id, scene_identity_id) DO UPDATE
       SET status = 'ausstehend', beantragt_am = NOW(),
           beantragt_von_user_id = $4, beantragt_von_name = $5,
           entschieden_am = NULL, entschieden_von_user_id = NULL,
           notiz = NULL, erneut_anfrage_notiz = NULL
     RETURNING id`,
    [params.characterId, params.sceneIdentityId, params.produktionId, params.userId, params.userName]
  )
  if (!anfrage?.id) return 'keine'

  await pool.query(
    `UPDATE scene_characters SET status = 'ausstehend'
     WHERE scene_identity_id = $1 AND character_id = $2`,
    [params.sceneIdentityId, params.characterId]
  )

  await pool.query(
    `DELETE FROM szenen_freigabe_genehmiger_status WHERE anfrage_id = $1`,
    [anfrage.id]
  )

  const users = await expandGenehmiger(genehmigerConfig)
  if (users.length === 0) return 'ausstehend'

  const prod = await queryOne(`SELECT titel FROM produktionen WHERE id = $1`, [params.produktionId])
  const char = await queryOne(`SELECT name FROM characters WHERE id = $1`, [params.characterId])
  const gueltigBis = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  for (const u of users) {
    const token = crypto.randomBytes(32).toString('hex')
    await pool.query(
      `INSERT INTO szenen_freigabe_genehmiger_status
         (anfrage_id, genehmiger_id, user_id, token, token_gueltig_bis)
       VALUES ($1, $2, $3, $4, $5)`,
      [anfrage.id, u.genehmiger_id, u.user_id, token, gueltigBis]
    )
    await sendFreigabeAnfrageEmail({
      toName: u.name,
      toEmail: u.email,
      rollenName: char?.name ?? '?',
      produktionTitel: prod?.titel ?? '?',
      beantragtVon: params.userName ?? params.userId ?? 'Automatik',
      inAppUrl: `${APP_URL}/dispo/${token}`,
      szeneKontext,
    })
  }

  return 'ausstehend'
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
      `SELECT id, user_id, rolle, freigabe_typ, stufe, sort_order
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
      const { user_id, rolle, freigabe_typ = 'budget', stufe = 'obligatorisch' } = req.body
      if (!user_id && !rolle) return res.status(400).json({ error: 'user_id oder rolle erforderlich' })
      if (user_id && rolle) return res.status(400).json({ error: 'Nur user_id ODER rolle angeben, nicht beide' })
      if (!['budget', 'dispo'].includes(freigabe_typ)) return res.status(400).json({ error: 'freigabe_typ muss budget oder dispo sein' })
      if (!['obligatorisch', 'review', 'notify'].includes(stufe)) return res.status(400).json({ error: 'stufe muss obligatorisch, review oder notify sein' })
      const maxOrder = await queryOne(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM rollen_freigabe_genehmiger WHERE production_id = $1`,
        [req.params.productionId]
      )
      const row = await queryOne(
        `INSERT INTO rollen_freigabe_genehmiger (production_id, user_id, rolle, freigabe_typ, stufe, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.productionId, user_id ?? null, rolle ?? null, freigabe_typ, stufe, (maxOrder?.max_order ?? 0) + 1]
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
      const { user_id, rolle, freigabe_typ, stufe, sort_order } = req.body
      if (user_id !== undefined && rolle !== undefined && user_id !== null && rolle !== null) {
        return res.status(400).json({ error: 'Nur user_id ODER rolle angeben, nicht beide' })
      }
      const row = await queryOne(
        `UPDATE rollen_freigabe_genehmiger
         SET user_id      = COALESCE($1, user_id),
             rolle        = COALESCE($2, rolle),
             freigabe_typ = COALESCE($3, freigabe_typ),
             stufe        = COALESCE($4, stufe),
             sort_order   = COALESCE($5, sort_order)
         WHERE id = $6 AND production_id = $7 RETURNING *`,
        [user_id ?? null, rolle ?? null, freigabe_typ ?? null, stufe ?? null, sort_order ?? null,
         req.params.genId, req.params.productionId]
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
rollenFreigabeRouter.get('/:productionId/anfragen', async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.id, a.character_id, c.name AS rollen_name,
              a.beantragt_von_user_id, a.beantragt_von_name, a.beantragt_am,
              a.status, a.entschieden_am, a.notiz, a.erneut_anfrage_notiz,
              a.szene_id, a.folge_nummer,
              ds.scene_nummer, ds.ort_name,
              JSON_AGG(JSON_BUILD_OBJECT(
                'id', gs.id, 'genehmiger_id', gs.genehmiger_id,
                'user_id', gs.user_id, 'stufe', g.stufe, 'freigabe_typ', g.freigabe_typ,
                'entschieden', gs.entschieden, 'entschieden_am', gs.entschieden_am
              ) ORDER BY g.sort_order) FILTER (WHERE gs.id IS NOT NULL) AS genehmiger_status
       FROM rollen_freigabe_anfragen a
       JOIN characters c ON c.id = a.character_id
       LEFT JOIN dokument_szenen ds ON ds.id = a.szene_id
       LEFT JOIN rollen_freigabe_genehmiger_status gs ON gs.anfrage_id = a.id
       LEFT JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
       WHERE a.production_id = $1
       GROUP BY a.id, c.name, ds.scene_nummer, ds.ort_name
       ORDER BY a.beantragt_am DESC`,
      [req.params.productionId]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Interne Funktion: Freigabe-Anfrage auslösen (wiederverwendbar ohne HTTP-Kontext) ──
export async function starteFreigabeAnfrage(params: {
  characterId: string
  produktionId: string
  szeneId: string | null
  userId: string | null
  userName: string | null
}): Promise<'ausstehend' | 'keine'> {
  const config = await queryOne(
    `SELECT freigabe_aktiv FROM rollen_freigabe_konfiguration WHERE production_id = $1`,
    [params.produktionId]
  )
  if (!config?.freigabe_aktiv) {
    await pool.query(
      `UPDATE character_productions SET freigabe_status = 'keine' WHERE character_id = $1 AND produktion_id = $2`,
      [params.characterId, params.produktionId]
    )
    return 'keine'
  }

  const genehmigerConfig = await query(
    `SELECT id, user_id, rolle, stufe
     FROM rollen_freigabe_genehmiger
     WHERE production_id = $1 AND freigabe_typ = 'budget'
     ORDER BY sort_order`,
    [params.produktionId]
  )
  if (genehmigerConfig.length === 0) {
    await pool.query(
      `UPDATE character_productions SET freigabe_status = 'keine' WHERE character_id = $1 AND produktion_id = $2`,
      [params.characterId, params.produktionId]
    )
    return 'keine'
  }

  // Szene-Kontext laden
  let szeneKontext: SzeneKontext | null = null
  let szeneFolgeNummer: number | null = null
  if (params.szeneId) {
    const sc = await loadSzeneKontext(params.szeneId)
    if (sc) { szeneKontext = sc.kontext; szeneFolgeNummer = sc.folgeNummer }
  }

  // Anfrage anlegen / zurücksetzen
  const anfrage = await queryOne(
    `INSERT INTO rollen_freigabe_anfragen
       (character_id, production_id, beantragt_von_user_id, beantragt_von_name, status, szene_id, folge_nummer)
     VALUES ($1, $2, $3, $4, 'ausstehend', $5, $6)
     ON CONFLICT (character_id, production_id) DO UPDATE
       SET status = 'ausstehend', beantragt_am = NOW(),
           beantragt_von_user_id = $3, beantragt_von_name = $4,
           entschieden_am = NULL, entschieden_von_user_id = NULL,
           szene_id = $5, folge_nummer = $6, notiz = NULL, erneut_anfrage_notiz = NULL
     RETURNING id`,
    [params.characterId, params.produktionId, params.userId, params.userName,
     params.szeneId, szeneFolgeNummer]
  )

  await pool.query(
    `UPDATE character_productions SET freigabe_status = 'ausstehend' WHERE character_id = $1 AND produktion_id = $2`,
    [params.characterId, params.produktionId]
  )

  // Alte Status-Zeilen löschen (Fan-Out-Konfiguration könnte sich geändert haben)
  await pool.query(
    `DELETE FROM rollen_freigabe_genehmiger_status WHERE anfrage_id = $1`,
    [anfrage!.id]
  )

  // Fan-Out auf konkrete Auth-Users
  const users = await expandGenehmiger(genehmigerConfig)
  if (users.length === 0) return 'ausstehend'

  const prod = await queryOne(`SELECT titel FROM produktionen WHERE id = $1`, [params.produktionId])
  const char = await queryOne(`SELECT name FROM characters WHERE id = $1`, [params.characterId])
  const gueltigBis = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  for (const u of users) {
    const token = crypto.randomBytes(32).toString('hex')
    await pool.query(
      `INSERT INTO rollen_freigabe_genehmiger_status
         (anfrage_id, genehmiger_id, user_id, token, token_gueltig_bis)
       VALUES ($1, $2, $3, $4, $5)`,
      [anfrage!.id, u.genehmiger_id, u.user_id, token, gueltigBis]
    )
    await sendFreigabeAnfrageEmail({
      toName: u.name,
      toEmail: u.email,
      rollenName: char?.name ?? '?',
      produktionTitel: prod?.titel ?? '?',
      beantragtVon: params.userName ?? params.userId ?? 'NT-Automatik',
      inAppUrl: `${APP_URL}/freigabe/${token}`,
      szeneKontext,
    })
  }

  return 'ausstehend'
}

// POST /api/rollen-freigabe/:productionId/anfragen — Neue Anfrage stellen
rollenFreigabeRouter.post('/:productionId/anfragen', async (req: any, res) => {
  try {
    const { character_id, szene_id } = req.body
    if (!character_id) return res.status(400).json({ error: 'character_id erforderlich' })
    const status = await starteFreigabeAnfrage({
      characterId: character_id,
      produktionId: req.params.productionId,
      szeneId: szene_id ?? null,
      userId: req.user.user_id,
      userName: req.user.name ?? null,
    })
    res.json({ status })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/anfragen/:id/entscheiden — In-App-Entscheidung des Genehmigers
rollenFreigabeRouter.post('/:productionId/anfragen/:id/entscheiden', async (req: any, res) => {
  try {
    const { entscheidung, notiz } = req.body
    if (!['freigegeben', 'abgelehnt'].includes(entscheidung)) {
      return res.status(400).json({ error: 'entscheidung muss freigegeben oder abgelehnt sein' })
    }

    // Keine Selbstgenehmigung
    const anfrage = await queryOne(
      `SELECT beantragt_von_user_id FROM rollen_freigabe_anfragen WHERE id = $1 AND production_id = $2`,
      [req.params.id, req.params.productionId]
    )
    if (!anfrage) return res.status(404).json({ error: 'Anfrage nicht gefunden' })
    if (anfrage.beantragt_von_user_id === req.user.user_id) {
      return res.status(403).json({ error: 'Keine Selbstgenehmigung erlaubt' })
    }

    const gsRow = await queryOne(
      `SELECT gs.id FROM rollen_freigabe_genehmiger_status gs
       JOIN rollen_freigabe_anfragen a ON a.id = gs.anfrage_id
       WHERE gs.anfrage_id = $1 AND gs.user_id = $2 AND gs.entschieden IS NULL
         AND a.production_id = $3 AND a.status = 'ausstehend'`,
      [req.params.id, req.user.user_id, req.params.productionId]
    )
    if (!gsRow) return res.status(404).json({ error: 'Keine offene Freigabe für diesen User' })

    await pool.query(
      `UPDATE rollen_freigabe_genehmiger_status
       SET entschieden = $1, entschieden_am = NOW(), notiz = $2
       WHERE id = $3`,
      [entscheidung, notiz ?? null, gsRow.id]
    )

    if (entscheidung === 'abgelehnt' && notiz?.trim()) {
      await pool.query(
        `UPDATE rollen_freigabe_anfragen SET notiz = $1 WHERE id = $2`,
        [notiz.trim(), req.params.id]
      )
    }

    const neuerStatus = await recalcAnfrageStatus(parseInt(req.params.id, 10))
    res.json({ ok: true, entschieden: entscheidung, anfrage_status: neuerStatus })
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
          `UPDATE character_productions SET freigabe_status = 'freigegeben', is_active = TRUE WHERE character_id = $1 AND produktion_id = $2`,
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
        `SELECT gs.id, gs.user_id, gs.token
         FROM rollen_freigabe_genehmiger_status gs
         WHERE gs.anfrage_id = $1 AND gs.entschieden IS NULL`,
        [req.params.id]
      )

      let count = 0
      for (const gs of pendingStatuses) {
        if (!gs.user_id || !gs.token) continue
        const info = await getUserInfoFromAuth(gs.user_id)
        if (!info?.email) continue
        await sendErinnerungEmail({
          toName: info.name,
          toEmail: info.email,
          rollenName: anfrage.rollen_name,
          produktionTitel: anfrage.prod_titel,
          inAppUrl: `${APP_URL}/freigabe/${gs.token}`,
        })
        count++
      }

      res.json({ ok: true, erinnerungen: count })
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// POST /api/rollen-freigabe/:productionId/anfragen/:id/erneut-anfragen
// Jeder darf eine erneute Anfrage stellen; notiz ist Pflicht
rollenFreigabeRouter.post('/:productionId/anfragen/:id/erneut-anfragen', async (req: any, res) => {
  try {
    const { notiz } = req.body
    if (!notiz?.trim()) return res.status(400).json({ error: 'notiz (Begründung) ist Pflichtfeld' })

    const anfrage = await queryOne(
      `SELECT a.id, a.character_id, a.production_id, a.szene_id,
              c.name AS rollen_name, p.titel AS prod_titel
       FROM rollen_freigabe_anfragen a
       JOIN characters c ON c.id = a.character_id
       JOIN produktionen p ON p.id = a.production_id
       WHERE a.id = $1 AND a.production_id = $2`,
      [req.params.id, req.params.productionId]
    )
    if (!anfrage) return res.status(404).json({ error: 'Anfrage nicht gefunden' })

    await pool.query(
      `UPDATE rollen_freigabe_anfragen
       SET status = 'ausstehend', beantragt_am = NOW(),
           beantragt_von_user_id = $1, beantragt_von_name = $2,
           entschieden_am = NULL, entschieden_von_user_id = NULL,
           notiz = NULL, erneut_anfrage_notiz = $3
       WHERE id = $4`,
      [req.user.user_id, req.user.name ?? null, notiz.trim(), req.params.id]
    )

    await pool.query(
      `UPDATE character_productions SET freigabe_status = 'ausstehend' WHERE character_id = $1 AND produktion_id = $2`,
      [anfrage.character_id, anfrage.production_id]
    )

    let szeneKontext: SzeneKontext | null = null
    if (anfrage.szene_id) {
      const sc = await loadSzeneKontext(anfrage.szene_id)
      if (sc) szeneKontext = sc.kontext
    }

    await pool.query(`DELETE FROM rollen_freigabe_genehmiger_status WHERE anfrage_id = $1`, [req.params.id])

    const genehmigerConfig = await query(
      `SELECT id, user_id, rolle, stufe
       FROM rollen_freigabe_genehmiger
       WHERE production_id = $1 AND freigabe_typ = 'budget'
       ORDER BY sort_order`,
      [req.params.productionId]
    )

    const users = await expandGenehmiger(genehmigerConfig)
    const prod = await queryOne(`SELECT titel FROM produktionen WHERE id = $1`, [req.params.productionId])
    const char = await queryOne(`SELECT name FROM characters WHERE id = $1`, [anfrage.character_id])
    const gueltigBis = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    for (const u of users) {
      const token = crypto.randomBytes(32).toString('hex')
      await pool.query(
        `INSERT INTO rollen_freigabe_genehmiger_status
           (anfrage_id, genehmiger_id, user_id, token, token_gueltig_bis)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, u.genehmiger_id, u.user_id, token, gueltigBis]
      )
      await sendFreigabeAnfrageEmail({
        toName: u.name,
        toEmail: u.email,
        rollenName: char?.name ?? anfrage.rollen_name,
        produktionTitel: prod?.titel ?? anfrage.prod_titel,
        beantragtVon: req.user.name ?? req.user.user_id,
        inAppUrl: `${APP_URL}/freigabe/${token}`,
        szeneKontext,
        erneutNotiz: notiz.trim(),
      })
    }

    res.json({ ok: true, status: 'ausstehend' })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Dispo-Endpoints (szenen_freigabe_anfragen) ────────────────────────────────

// GET /api/rollen-freigabe/:productionId/szenen-anfragen[?scene_identity_id=X]
rollenFreigabeRouter.get('/:productionId/szenen-anfragen', async (req, res) => {
  try {
    const { scene_identity_id } = req.query as Record<string, string>
    const sceneFilter = scene_identity_id ? 'AND a.scene_identity_id = $2' : ''
    const params: any[] = [req.params.productionId, ...(scene_identity_id ? [scene_identity_id] : [])]
    const rows = await query(
      `SELECT a.id, a.character_id, c.name AS rollen_name,
              a.scene_identity_id, a.beantragt_von_user_id, a.beantragt_von_name,
              a.beantragt_am, a.status, a.entschieden_am, a.notiz, a.erneut_anfrage_notiz,
              ds.scene_nummer, ds.ort_name,
              JSON_AGG(JSON_BUILD_OBJECT(
                'id', gs.id, 'genehmiger_id', gs.genehmiger_id,
                'user_id', gs.user_id, 'stufe', g.stufe, 'freigabe_typ', g.freigabe_typ,
                'entschieden', gs.entschieden, 'entschieden_am', gs.entschieden_am
              ) ORDER BY g.sort_order) FILTER (WHERE gs.id IS NOT NULL) AS genehmiger_status
       FROM szenen_freigabe_anfragen a
       JOIN characters c ON c.id = a.character_id
       LEFT JOIN dokument_szenen ds ON ds.scene_identity_id = a.scene_identity_id
       LEFT JOIN szenen_freigabe_genehmiger_status gs ON gs.anfrage_id = a.id
       LEFT JOIN rollen_freigabe_genehmiger g ON g.id = gs.genehmiger_id
       WHERE a.production_id = $1 ${sceneFilter}
       GROUP BY a.id, c.name, ds.scene_nummer, ds.ort_name
       ORDER BY a.beantragt_am DESC`,
      params
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/szenen-anfragen
rollenFreigabeRouter.post('/:productionId/szenen-anfragen', async (req: any, res) => {
  try {
    const { character_id, scene_identity_id } = req.body
    if (!character_id || !scene_identity_id) {
      return res.status(400).json({ error: 'character_id und scene_identity_id erforderlich' })
    }
    const status = await starteSzenenFreigabeAnfrage({
      characterId: character_id,
      sceneIdentityId: scene_identity_id,
      produktionId: req.params.productionId,
      szeneId: null,
      userId: req.user.user_id,
      userName: req.user.name ?? null,
    })
    res.json({ status })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/szenen-anfragen/:id/entscheiden
rollenFreigabeRouter.post('/:productionId/szenen-anfragen/:id/entscheiden', async (req: any, res) => {
  try {
    const { entscheidung, notiz } = req.body
    if (!['freigegeben', 'abgelehnt'].includes(entscheidung)) {
      return res.status(400).json({ error: 'entscheidung muss freigegeben oder abgelehnt sein' })
    }

    // Keine Selbstgenehmigung
    const anfrage = await queryOne(
      `SELECT beantragt_von_user_id FROM szenen_freigabe_anfragen WHERE id = $1 AND production_id = $2`,
      [req.params.id, req.params.productionId]
    )
    if (!anfrage) return res.status(404).json({ error: 'Anfrage nicht gefunden' })
    if (anfrage.beantragt_von_user_id === req.user.user_id) {
      return res.status(403).json({ error: 'Keine Selbstgenehmigung erlaubt' })
    }

    const gsRow = await queryOne(
      `SELECT gs.id FROM szenen_freigabe_genehmiger_status gs
       JOIN szenen_freigabe_anfragen a ON a.id = gs.anfrage_id
       WHERE gs.anfrage_id = $1 AND gs.user_id = $2 AND gs.entschieden IS NULL
         AND a.production_id = $3 AND a.status = 'ausstehend'`,
      [req.params.id, req.user.user_id, req.params.productionId]
    )
    if (!gsRow) return res.status(404).json({ error: 'Keine offene Freigabe für diesen User' })

    await pool.query(
      `UPDATE szenen_freigabe_genehmiger_status
       SET entschieden = $1, entschieden_am = NOW(), notiz = $2
       WHERE id = $3`,
      [entscheidung, notiz ?? null, gsRow.id]
    )

    if (entscheidung === 'abgelehnt' && notiz?.trim()) {
      await pool.query(
        `UPDATE szenen_freigabe_anfragen SET notiz = $1 WHERE id = $2`,
        [notiz.trim(), req.params.id]
      )
    }

    const neuerStatus = await recalcSzenenAnfrageStatus(req.params.id)
    res.json({ ok: true, entschieden: entscheidung, anfrage_status: neuerStatus })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/szenen-anfragen/:id/freigeben (DK-Override)
rollenFreigabeRouter.post('/:productionId/szenen-anfragen/:id/freigeben',
  requireDkAccess(req => req.params.productionId),
  async (req: any, res) => {
    try {
      await pool.query(
        `UPDATE szenen_freigabe_anfragen
         SET status = 'freigegeben', entschieden_am = NOW(), entschieden_von_user_id = $1
         WHERE id = $2 AND production_id = $3`,
        [req.user.user_id, req.params.id, req.params.productionId]
      )
      const anfrage = await queryOne(
        `SELECT character_id, scene_identity_id FROM szenen_freigabe_anfragen WHERE id = $1`,
        [req.params.id]
      )
      if (anfrage) {
        await pool.query(
          `UPDATE scene_characters SET status = 'bestaetigt'
           WHERE scene_identity_id = $1 AND character_id = $2 AND status = 'ausstehend'`,
          [anfrage.scene_identity_id, anfrage.character_id]
        )
      }
      res.json({ ok: true, status: 'freigegeben' })
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// POST /api/rollen-freigabe/:productionId/szenen-anfragen/:id/ablehnen (DK-Override)
rollenFreigabeRouter.post('/:productionId/szenen-anfragen/:id/ablehnen',
  requireDkAccess(req => req.params.productionId),
  async (req: any, res) => {
    try {
      const { notiz } = req.body
      await pool.query(
        `UPDATE szenen_freigabe_anfragen
         SET status = 'abgelehnt', entschieden_am = NOW(), entschieden_von_user_id = $1, notiz = $2
         WHERE id = $3 AND production_id = $4`,
        [req.user.user_id, notiz ?? null, req.params.id, req.params.productionId]
      )
      const anfrage = await queryOne(
        `SELECT character_id, scene_identity_id FROM szenen_freigabe_anfragen WHERE id = $1`,
        [req.params.id]
      )
      if (anfrage) {
        await pool.query(
          `UPDATE scene_characters SET status = 'abgelehnt'
           WHERE scene_identity_id = $1 AND character_id = $2 AND status = 'ausstehend'`,
          [anfrage.scene_identity_id, anfrage.character_id]
        )
      }
      res.json({ ok: true, status: 'abgelehnt' })
    } catch (err) { res.status(500).json({ error: String(err) }) }
  }
)

// POST /api/rollen-freigabe/:productionId/szenen-anfragen/:id/zurueckziehen
rollenFreigabeRouter.post('/:productionId/szenen-anfragen/:id/zurueckziehen', async (req: any, res) => {
  try {
    await pool.query(
      `UPDATE szenen_freigabe_anfragen
       SET status = 'zurueckgezogen', entschieden_am = NOW(), entschieden_von_user_id = $1
       WHERE id = $2 AND production_id = $3`,
      [req.user.user_id, req.params.id, req.params.productionId]
    )
    const anfrage = await queryOne(
      `SELECT character_id, scene_identity_id FROM szenen_freigabe_anfragen WHERE id = $1`,
      [req.params.id]
    )
    if (anfrage) {
      await pool.query(
        `UPDATE scene_characters SET status = 'bestaetigt'
         WHERE scene_identity_id = $1 AND character_id = $2 AND status = 'ausstehend'`,
        [anfrage.scene_identity_id, anfrage.character_id]
      )
    }
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/rollen-freigabe/:productionId/szenen-anfragen/:id/erneut-anfragen
// Jeder darf; notiz ist Pflicht
rollenFreigabeRouter.post('/:productionId/szenen-anfragen/:id/erneut-anfragen', async (req: any, res) => {
  try {
    const { notiz } = req.body
    if (!notiz?.trim()) return res.status(400).json({ error: 'notiz (Begründung) ist Pflichtfeld' })

    const anfrage = await queryOne(
      `SELECT a.id, a.character_id, a.scene_identity_id, a.production_id,
              c.name AS rollen_name, p.titel AS prod_titel
       FROM szenen_freigabe_anfragen a
       JOIN characters c ON c.id = a.character_id
       JOIN produktionen p ON p.id = a.production_id
       WHERE a.id = $1 AND a.production_id = $2`,
      [req.params.id, req.params.productionId]
    )
    if (!anfrage) return res.status(404).json({ error: 'Anfrage nicht gefunden' })

    await pool.query(
      `UPDATE szenen_freigabe_anfragen
       SET status = 'ausstehend', beantragt_am = NOW(),
           beantragt_von_user_id = $1, beantragt_von_name = $2,
           entschieden_am = NULL, entschieden_von_user_id = NULL,
           notiz = NULL, erneut_anfrage_notiz = $3
       WHERE id = $4`,
      [req.user.user_id, req.user.name ?? null, notiz.trim(), req.params.id]
    )

    await pool.query(
      `UPDATE scene_characters SET status = 'ausstehend'
       WHERE scene_identity_id = $1 AND character_id = $2`,
      [anfrage.scene_identity_id, anfrage.character_id]
    )

    await pool.query(`DELETE FROM szenen_freigabe_genehmiger_status WHERE anfrage_id = $1`, [req.params.id])

    const genehmigerConfig = await query(
      `SELECT id, user_id, rolle, stufe
       FROM rollen_freigabe_genehmiger
       WHERE production_id = $1 AND freigabe_typ = 'dispo'
       ORDER BY sort_order`,
      [req.params.productionId]
    )

    const users = await expandGenehmiger(genehmigerConfig)
    const prod = await queryOne(`SELECT titel FROM produktionen WHERE id = $1`, [req.params.productionId])
    const char = await queryOne(`SELECT name FROM characters WHERE id = $1`, [anfrage.character_id])
    const gueltigBis = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    for (const u of users) {
      const token = crypto.randomBytes(32).toString('hex')
      await pool.query(
        `INSERT INTO szenen_freigabe_genehmiger_status
           (anfrage_id, genehmiger_id, user_id, token, token_gueltig_bis)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, u.genehmiger_id, u.user_id, token, gueltigBis]
      )
      await sendFreigabeAnfrageEmail({
        toName: u.name,
        toEmail: u.email,
        rollenName: char?.name ?? anfrage.rollen_name,
        produktionTitel: prod?.titel ?? anfrage.prod_titel,
        beantragtVon: req.user.name ?? req.user.user_id,
        inAppUrl: `${APP_URL}/dispo/${token}`,
        erneutNotiz: notiz.trim(),
      })
    }

    res.json({ ok: true, status: 'ausstehend' })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// GET /api/rollen-freigabe/:productionId/szene-statuses?scene_identity_id=X&werkstufe_id=Y
// Liefert kombinierten Freigabe-Status pro Figurenname (für Editor-Farblogik)
rollenFreigabeRouter.get('/:productionId/szene-statuses', async (req, res) => {
  try {
    const { scene_identity_id, werkstufe_id } = req.query as Record<string, string>
    if (!scene_identity_id || !werkstufe_id) {
      return res.status(400).json({ error: 'scene_identity_id und werkstufe_id erforderlich' })
    }

    // Budget-Status: character_productions.freigabe_status
    const budgetRows = await query(
      `SELECT UPPER(c.name) AS name_upper, cp.freigabe_status, cp.is_active,
              rfa.notiz AS ablehnungsnotiz
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       JOIN character_productions cp ON cp.character_id = sc.character_id AND cp.produktion_id = $3
       LEFT JOIN rollen_freigabe_anfragen rfa
         ON rfa.character_id = sc.character_id AND rfa.production_id = $3 AND rfa.status = 'abgelehnt'
       WHERE sc.scene_identity_id = $1 AND sc.werkstufe_id = $2`,
      [scene_identity_id, werkstufe_id, req.params.productionId]
    )

    // Dispo-Status: scene_characters.status
    const dispoRows = await query(
      `SELECT UPPER(c.name) AS name_upper, sc.status AS dispo_status,
              sfa.notiz AS dispo_ablehnungsnotiz
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN szenen_freigabe_anfragen sfa
         ON sfa.character_id = sc.character_id AND sfa.scene_identity_id = $1 AND sfa.status = 'abgelehnt'
       WHERE sc.scene_identity_id = $1 AND sc.werkstufe_id = $2`,
      [scene_identity_id, werkstufe_id]
    )

    // Zusammenführen: Budget + Dispo, Priorität: abgelehnt > ausstehend > ok
    const statusMap = new Map<string, {
      budget: string; dispo: string; combined: string; notiz: string | null
    }>()

    for (const r of budgetRows) {
      statusMap.set(r.name_upper, {
        budget: r.freigabe_status ?? 'keine',
        dispo: 'bestaetigt',
        combined: 'ok',
        notiz: r.ablehnungsnotiz ?? null,
      })
    }
    for (const r of dispoRows) {
      const existing = statusMap.get(r.name_upper) ?? { budget: 'keine', dispo: 'bestaetigt', combined: 'ok', notiz: null }
      statusMap.set(r.name_upper, { ...existing, dispo: r.dispo_status ?? 'bestaetigt', notiz: existing.notiz ?? r.dispo_ablehnungsnotiz ?? null })
    }

    // combined berechnen
    const result = Array.from(statusMap.entries()).map(([name_upper, v]) => {
      const budgetAbgelehnt = v.budget === 'abgelehnt'
      const dispoAbgelehnt = v.dispo === 'abgelehnt'
      const budgetAusstehend = v.budget === 'ausstehend'
      const dispoAusstehend = v.dispo === 'ausstehend'
      const combined = (budgetAbgelehnt || dispoAbgelehnt) ? 'abgelehnt'
        : (budgetAusstehend || dispoAusstehend) ? 'ausstehend'
        : 'ok'
      return { name_upper, budget_status: v.budget, dispo_status: v.dispo, combined, notiz: v.notiz }
    }).filter(r => r.combined !== 'ok')

    res.json(result)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Public Router (kein Auth) ─────────────────────────────────────────────────

export const rollenFreigabePublicRouter = Router()

// GET /api/public/freigabe/:token — Token-Infos lesen (für Deep-Link-Routing in der App)
rollenFreigabePublicRouter.get('/:token', async (req, res) => {
  try {
    const { token } = req.params

    const gsRow = await queryOne(
      `SELECT gs.id, gs.entschieden, gs.token_gueltig_bis, gs.user_id,
              a.id AS anfrage_id, a.status AS anfrage_status, a.production_id,
              c.name AS rollen_name, p.titel AS prod_titel
       FROM rollen_freigabe_genehmiger_status gs
       JOIN rollen_freigabe_anfragen a ON a.id = gs.anfrage_id
       JOIN characters c ON c.id = a.character_id
       JOIN produktionen p ON p.id = a.production_id
       WHERE gs.token = $1`,
      [token]
    )

    if (!gsRow) return res.status(404).json({ error: 'Token nicht gefunden' })
    if (gsRow.token_gueltig_bis && new Date(gsRow.token_gueltig_bis) < new Date()) {
      return res.status(410).json({ error: 'Token abgelaufen' })
    }

    res.json({
      anfrage_id: gsRow.anfrage_id,
      production_id: gsRow.production_id,
      rollen_name: gsRow.rollen_name,
      prod_titel: gsRow.prod_titel,
      anfrage_status: gsRow.anfrage_status,
      bereits_entschieden: gsRow.entschieden !== null,
      eigene_entscheidung: gsRow.entschieden,
    })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})
