import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { getCompanyName } from '../utils/companyInfo'

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
    const raw: any = await r.json()
    const users: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.users) ? raw.users : [])
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
  const companyName = await getCompanyName()
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
      ${companyName} · Script-App · Diese E-Mail wurde automatisch generiert.
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
// Zeigt alle Folgen (frei ODER regulär) mit mindestens einer privaten Werkstufe.
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

    // Einen Row pro privater Werkstufe (nicht pro Folge)
    const rows = await query(
      `SELECT
              f.id AS folge_id, f.folgen_titel, f.folge_nummer, f.ist_frei, f.dokument_label,
              f.verknuepft_mit_folge_id, f.verknuepft_am, f.erstellt_am AS folge_erstellt_am,
              w.id AS werk_id, w.typ AS werk_typ, w.version_nummer,
              w.label AS werk_label,
              COALESCE(w.privat_gesetzt_am, w.erstellt_am) AS privat_seit,
              w.erstellt_von AS autor_user_id
       FROM folgen f
       JOIN werkstufen w ON w.folge_id = f.id AND w.sichtbarkeit = 'privat'
       WHERE true
         ${filterClause}
         ${prodClause}
       ORDER BY COALESCE(w.privat_gesetzt_am, w.erstellt_am) DESC`,
      []
    )

    // User-Namen aus auth.app laden
    const userMap = await fetchAuthUsers()

    const result = rows.map((r: any) => ({
      ...r,
      ersteller_name: userMap.get(String(r.autor_user_id))?.name ?? null,
      ersteller_email: userMap.get(String(r.autor_user_id))?.email ?? null,
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
  const validSicht = ['privat', 'colab', 'team', 'produktion', 'alle']
  if (!validSicht.includes(neue_sichtbarkeit)) {
    return res.status(400).json({ error: 'Ungültige Sichtbarkeit' })
  }

  try {
    const dok = await queryOne(
      `SELECT id, folgen_titel, folge_nummer, ist_frei, sichtbarkeit_frei, ersteller_user_id FROM folgen WHERE id = $1`,
      [req.params.id]
    )
    if (!dok) return res.status(404).json({ error: 'Dokument nicht gefunden' })

    // Autor ermitteln: bei regulären Episoden = Ersteller der privaten Werkstufe
    let autorUserId = dok.ersteller_user_id
    const alteSichtbarkeit = 'privat'

    if (dok.ist_frei) {
      // Freies Dokument: folge.sichtbarkeit_frei aktualisieren + Werkstufen synchronisieren
      await query(
        `UPDATE folgen SET
           sichtbarkeit_frei = $1,
           sichtbarkeit_frei_geaendert_am = NOW(),
           sichtbarkeit_frei_colab_gruppe_id = CASE WHEN $1 IN ('colab', 'team') THEN $2::uuid ELSE NULL END
         WHERE id = $3`,
        [neue_sichtbarkeit, colab_gruppe_id ?? null, req.params.id]
      )
      // Private Werkstufen ebenfalls freigeben
      const werkSicht = mapFolgeSichtToWerk(neue_sichtbarkeit, colab_gruppe_id)
      await query(
        `UPDATE werkstufen SET sichtbarkeit = $1, privat_permanent = false
         WHERE folge_id = $2 AND sichtbarkeit = 'privat'`,
        [werkSicht, req.params.id]
      )
    } else {
      // Reguläre Episode: alle privaten Werkstufen freigeben
      const werkSicht = mapFolgeSichtToWerk(neue_sichtbarkeit, colab_gruppe_id)
      // Autor aus der jüngsten privaten Werkstufe
      const werkAutor = await queryOne(
        `SELECT erstellt_von FROM werkstufen WHERE folge_id = $1 AND sichtbarkeit = 'privat'
         ORDER BY privat_gesetzt_am DESC NULLS LAST LIMIT 1`,
        [req.params.id]
      )
      if (werkAutor?.erstellt_von) autorUserId = werkAutor.erstellt_von
      await query(
        `UPDATE werkstufen SET sichtbarkeit = $1, privat_permanent = false
         WHERE folge_id = $2 AND sichtbarkeit = 'privat'`,
        [werkSicht, req.params.id]
      )
    }

    // Audit-Log
    await query(
      `INSERT INTO freie_dok_sichtbarkeit_log
         (folge_id, geaendert_von_user_id, autor_user_id, alte_sichtbarkeit, neue_sichtbarkeit,
          per_email_informiert, anderweitig_bestaetigt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.id, user.user_id, autorUserId,
       alteSichtbarkeit, neue_sichtbarkeit,
       per_email_informiert === true, anderweitig_bestaetigt === true]
    )

    // Email-Versand wenn gewünscht
    let emailSent = false
    if (per_email_informiert && autorUserId) {
      const userMap = await fetchAuthUsers()
      const coordinatorName = userMap.get(String(user.user_id))?.name ?? 'Drehbuchkoordination'
      const titel = dok.folgen_titel ?? (dok.folge_nummer ? `Folge ${dok.folge_nummer}` : 'Unbenanntes Dokument')
      emailSent = await sendNotificationEmail(
        String(autorUserId),
        coordinatorName,
        titel,
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

function mapFolgeSichtToWerk(folgeSicht: string, colabGruppeId?: string | null): string {
  if (folgeSicht === 'privat') return 'privat'
  if (folgeSicht === 'colab' && colabGruppeId) return `colab:${colabGruppeId}`
  if (folgeSicht === 'team' && colabGruppeId) return `team:${colabGruppeId}`
  if (folgeSicht === 'alle') return 'autoren'
  return 'produktion'
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dk/private-dokumente/audit-log?produktion_id=X&limit=100&offset=0
// ══════════════════════════════════════════════════════════════════════════════
privateDokumenteRouter.get('/audit-log', async (req, res) => {
  const user = req.user!
  if (!(await hasAccess(user.role ?? ''))) {
    return res.status(403).json({ error: 'Kein Zugriff' })
  }
  const { produktion_id, limit = '100', offset = '0' } = req.query
  try {
    const prodClause = produktion_id
      ? `AND f.produktion_id = '${(produktion_id as string).replace(/'/g, "''")}'`
      : ''
    const rows = await query(
      `SELECT
         l.id, l.folge_id, l.geaendert_am,
         l.geaendert_von_user_id, l.autor_user_id,
         l.alte_sichtbarkeit, l.neue_sichtbarkeit,
         l.per_email_informiert, l.anderweitig_bestaetigt,
         f.folge_nummer, f.folgen_titel, f.ist_frei
       FROM freie_dok_sichtbarkeit_log l
       JOIN folgen f ON f.id = l.folge_id
       WHERE true ${prodClause}
       ORDER BY l.geaendert_am DESC
       LIMIT ${parseInt(String(limit), 10) || 100}
       OFFSET ${parseInt(String(offset), 10) || 0}`,
      []
    )
    const userMap = await fetchAuthUsers()
    const result = rows.map((r: any) => ({
      ...r,
      geaendert_von_name: userMap.get(String(r.geaendert_von_user_id))?.name ?? null,
      autor_name: userMap.get(String(r.autor_user_id))?.name ?? null,
    }))
    res.json(result)
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
