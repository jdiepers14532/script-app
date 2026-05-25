import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const AUTH_URL    = process.env.AUTH_INTERNAL_URL    ?? 'http://127.0.0.1:3002'
const AUTH_KEY    = process.env.AUTH_INTERNAL_KEY    ?? ''
const MAILER_KEY  = process.env.AUTH_MAILER_SECRET   ?? ''
const SCRIPT_URL  = process.env.SCRIPT_PUBLIC_URL    ?? 'https://script.serienwerft.studio'

export const privateDokumenteRouter = Router()
privateDokumenteRouter.use(authMiddleware)

// ─── Access Guard ─────────────────────────────────────────────────────────────
// Wer darf die Private-Dokumente-Seite sehen?
// - superadmin, admin immer
// - + konfigurierbare Rollen aus app_settings.private_docs_viewer_roles
async function hasAccess(role: string): Promise<boolean> {
  if (role === 'superadmin' || role === 'admin') return true
  try {
    const row = await queryOne(
      `SELECT value FROM app_settings WHERE key = 'private_docs_viewer_roles'`
    )
    if (!row) return false
    const allowed: string[] = JSON.parse(row.value || '[]')
    return allowed.includes(role)
  } catch { return false }
}

// ─── User-Cache aus auth.app ──────────────────────────────────────────────────
async function fetchAuthUsers(): Promise<Map<string, { name: string; email: string }>> {
  try {
    const r = await fetch(`${AUTH_URL}/api/internal/app-users/script`, {
      headers: { 'x-internal-key': AUTH_KEY },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return new Map()
    const users: any[] = await r.json()
    const map = new Map<string, { name: string; email: string }>()
    for (const u of users) {
      if (u.id) map.set(String(u.id), { name: u.name ?? u.username ?? '?', email: u.email ?? '' })
    }
    return map
  } catch { return new Map() }
}

// ─── Email-Versand via auth.app ───────────────────────────────────────────────
async function sendNotificationEmail(
  autorUserId: string,
  coordinatorName: string,
  dokTitel: string,
  dokId: number,
  alteSicht: string,
  neueSicht: string,
): Promise<boolean> {
  const sichtLabels: Record<string, string> = {
    privat: 'Privat', colab: 'Colab', produktion: 'Produktion', alle: 'Alle',
  }
  const dokUrl = `${SCRIPT_URL}/?freidok_id=${dokId}`
  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, 'Inter', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; }
  .card { background: #fff; border-radius: 10px; max-width: 520px; margin: 0 auto; padding: 32px; }
  .title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
  .sub { font-size: 14px; color: #757575; margin: 0 0 24px; }
  .info { background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; line-height: 1.8; }
  .info strong { color: #000; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; }
  .badge-privat { background: #f0f0f0; color: #757575; }
  .badge-produktion { background: #f0e8ff; color: #AF52DE; }
  .badge-colab { background: #e8f2ff; color: #007AFF; }
  .badge-alle { background: #e8fff0; color: #00C853; }
  .btn { display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 20px; }
  .footer { font-size: 11px; color: #aaa; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; }
</style></head>
<body>
  <div class="card">
    <div class="title">Sichtbarkeit geändert</div>
    <div class="sub">Script-App · ${new Date().toLocaleDateString('de-DE', { dateStyle: 'long' })}</div>

    <p style="font-size:14px;line-height:1.7;color:#333;">
      Die Sichtbarkeit deines freien Dokuments wurde von <strong>${coordinatorName}</strong> geändert.
    </p>

    <div class="info">
      <strong>Dokument:</strong> ${dokTitel}<br>
      <strong>Vorher:</strong> <span class="badge badge-${alteSicht}">${sichtLabels[alteSicht] ?? alteSicht}</span><br>
      <strong>Jetzt:</strong> <span class="badge badge-${neueSicht}">${sichtLabels[neueSicht] ?? neueSicht}</span><br>
      <strong>Geändert von:</strong> ${coordinatorName}
    </div>

    <p style="font-size:13px;color:#555;line-height:1.6;">
      Du kannst das Dokument unter folgendem Link aufrufen. Falls du Fragen hast, wende dich
      an ${coordinatorName} oder die Drehbuchkoordination.
    </p>

    <a href="${dokUrl}" class="btn">Dokument öffnen</a>

    <p style="font-size:12px;color:#999;margin-top:12px;">
      ${dokUrl}
    </p>

    <div class="footer">
      Studio Hamburg Serienwerft · Script-App · Diese E-Mail wurde automatisch generiert.
    </div>
  </div>
</body>
</html>`

  try {
    const r = await fetch(`${AUTH_URL}/api/internal/send-mail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-mailer-secret': MAILER_KEY,
      },
      body: JSON.stringify({
        user_id: autorUserId,
        subject: `Sichtbarkeit geändert: „${dokTitel}"`,
        html,
        app: 'script',
      }),
      signal: AbortSignal.timeout(10000),
    })
    return r.ok
  } catch { return false }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dk/private-dokumente?produktion_id=X&filter=1|2|3
// ══════════════════════════════════════════════════════════════════════════════
privateDokumenteRouter.get('/', async (req, res) => {
  const user = req.user!
  if (!(await hasAccess(user.role ?? ''))) {
    return res.status(403).json({ error: 'Kein Zugriff' })
  }

  const { produktion_id, filter = '1' } = req.query

  // Filter-Berechtigung prüfen
  if (filter === '2') {
    const row = await queryOne(`SELECT value FROM app_settings WHERE key = 'private_docs_filter_2_enabled'`)
    if (row?.value !== 'true') return res.status(403).json({ error: 'Filter 2 nicht aktiviert' })
  }
  if (filter === '3') {
    const row = await queryOne(`SELECT value FROM app_settings WHERE key = 'private_docs_filter_3_enabled'`)
    if (row?.value !== 'true') return res.status(403).json({ error: 'Filter 3 nicht aktiviert' })
  }

  try {
    let filterClause = ''
    if (filter === '1') filterClause = `AND f.dokument_label = 'folge_sendung'`
    else if (filter === '2') filterClause = `AND f.verknuepft_mit_folge_id IS NOT NULL`
    // filter === '3': keine Extra-Bedingung

    const prodClause = produktion_id ? `AND f.produktion_id = ${typeof produktion_id === 'string' ? `'${produktion_id.replace(/'/g, "''")}'` : produktion_id}` : ''

    const rows = await query(
      `SELECT f.id, f.folgen_titel, f.dokument_label, f.ersteller_user_id,
              f.sichtbarkeit_frei, f.sichtbarkeit_frei_geaendert_am,
              f.verknuepft_mit_folge_id, f.verknuepft_am,
              f.erstellt_am,
              (SELECT COUNT(*)::int FROM werkstufen w WHERE w.folge_id = f.id) AS werkstufen_count
       FROM folgen f
       WHERE f.ist_frei = true
         AND f.sichtbarkeit_frei = 'privat'
         ${filterClause}
         ${prodClause}
       ORDER BY f.sichtbarkeit_frei_geaendert_am DESC NULLS LAST, f.erstellt_am DESC`,
      []
    )

    // User-Namen aus auth.app laden
    const userMap = await fetchAuthUsers()

    const result = rows.map((r: any) => ({
      ...r,
      ersteller_name: userMap.get(String(r.ersteller_user_id))?.name ?? `User ${r.ersteller_user_id}`,
      ersteller_email: userMap.get(String(r.ersteller_user_id))?.email ?? null,
    }))

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/dk/private-dokumente/:id/sichtbarkeit
// Body: { neue_sichtbarkeit, colab_gruppe_id?, per_email_informiert, anderweitig_bestaetigt }
// ══════════════════════════════════════════════════════════════════════════════
privateDokumenteRouter.post('/:id/sichtbarkeit', async (req, res) => {
  const user = req.user!
  if (!(await hasAccess(user.role ?? ''))) {
    return res.status(403).json({ error: 'Kein Zugriff' })
  }

  const { neue_sichtbarkeit, colab_gruppe_id, per_email_informiert, anderweitig_bestaetigt } = req.body
  const validSicht = ['privat', 'colab', 'produktion', 'alle']
  if (!validSicht.includes(neue_sichtbarkeit)) {
    return res.status(400).json({ error: 'Ungültige Sichtbarkeit' })
  }

  try {
    const dok = await queryOne(
      `SELECT id, folgen_titel, sichtbarkeit_frei, ersteller_user_id FROM folgen WHERE id = $1 AND ist_frei = true`,
      [req.params.id]
    )
    if (!dok) return res.status(404).json({ error: 'Dokument nicht gefunden' })

    const alteSichtbarkeit = dok.sichtbarkeit_frei

    // Sichtbarkeit + Zeitstempel aktualisieren
    await query(
      `UPDATE folgen SET
         sichtbarkeit_frei = $1,
         sichtbarkeit_frei_geaendert_am = NOW(),
         sichtbarkeit_frei_colab_gruppe_id = CASE WHEN $1 = 'colab' THEN $2::int ELSE NULL END
       WHERE id = $3`,
      [neue_sichtbarkeit, colab_gruppe_id ?? null, req.params.id]
    )

    // Audit-Log
    await query(
      `INSERT INTO freie_dok_sichtbarkeit_log
         (folge_id, geaendert_von_user_id, autor_user_id, alte_sichtbarkeit, neue_sichtbarkeit,
          per_email_informiert, anderweitig_bestaetigt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.id, user.user_id, dok.ersteller_user_id,
       alteSichtbarkeit, neue_sichtbarkeit,
       per_email_informiert === true, anderweitig_bestaetigt === true]
    )

    // Email-Versand wenn gewünscht
    let emailSent = false
    if (per_email_informiert && dok.ersteller_user_id) {
      const userMap = await fetchAuthUsers()
      const coordinatorName = userMap.get(String(user.user_id))?.name ?? 'Drehbuchkoordination'
      emailSent = await sendNotificationEmail(
        String(dok.ersteller_user_id),
        coordinatorName,
        dok.folgen_titel ?? 'Unbenanntes Dokument',
        dok.id,
        alteSichtbarkeit,
        neue_sichtbarkeit,
      )
    }

    res.json({ success: true, emailSent })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dk/private-dokumente/settings — Filter-Settings + Viewer-Rollen
// ══════════════════════════════════════════════════════════════════════════════
privateDokumenteRouter.get('/settings', async (req, res) => {
  const user = req.user!
  if (!(await hasAccess(user.role ?? ''))) {
    return res.status(403).json({ error: 'Kein Zugriff' })
  }
  try {
    const rows = await query(
      `SELECT key, value FROM app_settings
       WHERE key IN ('private_docs_filter_2_enabled','private_docs_filter_3_enabled','private_docs_viewer_roles')`
    )
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    res.json({
      filter_2_enabled: map['private_docs_filter_2_enabled'] === 'true',
      filter_3_enabled: map['private_docs_filter_3_enabled'] === 'true',
      viewer_roles: JSON.parse(map['private_docs_viewer_roles'] ?? '[]'),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
