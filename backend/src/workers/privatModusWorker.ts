/**
 * Privat-Modus Auto-Ablauf Worker
 *
 * Läuft alle 15 Minuten:
 * 1. Findet Werkstufen mit sichtbarkeit='privat' und abgelaufener Heartbeat-Session
 * 2. Sendet Email mit One-Click-Tokens (Verlängern / Freigeben)
 * 3. Setzt sichtbarkeit zurück wenn kein Email-Empfänger bekannt
 *
 * DSGVO: Kein Aktivitätslog. Nur last_active_at wird geprüft.
 * Token-Links sind 48h gültig und können ohne Login benutzt werden.
 */

import nodemailer from 'nodemailer'
import { pool } from '../db'

const SMTP_HOST = process.env.SMTP_HOST ?? 'smtp.ionos.de'
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587')
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''
const APP_URL = process.env.APP_URL ?? 'https://script.serienwerft.studio'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_USER || !SMTP_PASS) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: true },
    })
  }
  return transporter
}

async function sendPrivatAblaufEmail(opts: {
  email: string
  userName: string
  werkstufeName: string
  verlaengernUrl: string
  freigebenUrl: string
}) {
  const t = getTransporter()
  if (!t) {
    console.log('[privatModus] Kein SMTP konfiguriert — Email übersprungen für:', opts.email)
    return
  }
  await t.sendMail({
    from: `"Script · Serienwerft" <${SMTP_USER}>`,
    to: opts.email,
    subject: `Privat-Modus läuft ab: ${opts.werkstufeName}`,
    html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 17px; margin-bottom: 8px;">Privat-Modus läuft ab</h2>
  <p style="font-size: 14px; color: #555; line-height: 1.5;">
    Hallo ${opts.userName},<br><br>
    der Privat-Modus für <strong>${opts.werkstufeName}</strong> ist seit über der konfigurierten Zeit inaktiv.
    Was soll passieren?
  </p>

  <div style="display: flex; gap: 12px; margin: 24px 0;">
    <a href="${opts.verlaengernUrl}" style="
      display: inline-block; padding: 10px 20px; border-radius: 8px;
      background: #007AFF; color: #fff; text-decoration: none;
      font-size: 14px; font-weight: 600;
    ">Privat-Modus verlängern</a>

    <a href="${opts.freigebenUrl}" style="
      display: inline-block; padding: 10px 20px; border-radius: 8px;
      background: #F0F0F0; color: #333; text-decoration: none;
      font-size: 14px; font-weight: 600; margin-left: 10px;
    ">Freigeben</a>
  </div>

  <p style="font-size: 12px; color: #999; line-height: 1.5;">
    Diese Links sind 48 Stunden gültig und können ohne Login benutzt werden.
    Du erhältst diese Email, weil du den Privat-Modus für diese Werkstufe aktiviert hast.
  </p>
</div>`,
  })
}

export async function runPrivatModusWorker() {
  try {
    // Konfiguriertes Ablauf-Intervall aus app_settings (default: 4h)
    const settingRow = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'privat_modus_ablauf_stunden'"
    )
    const ablaufStunden = parseFloat(settingRow.rows[0]?.value ?? '4')

    // Werkstufen mit sichtbarkeit='privat', nicht permanent, und Heartbeat zu alt
    const { rows: abgelaufene } = await pool.query(`
      SELECT
        w.id AS werkstufe_id,
        w.privat_gesetzt_von AS user_id,
        w.previous_sichtbarkeit,
        f.arbeitstitel AS folge_titel,
        p.id AS produktion_id,
        ws.last_active_at,
      FROM werkstufen w
      JOIN folgen f ON f.id = w.folge_id
      JOIN produktionen p ON p.id = f.produktion_id
      LEFT JOIN werkstufen_sessions ws ON ws.werkstufe_id = w.id AND ws.user_id = w.privat_gesetzt_von
      WHERE w.sichtbarkeit = 'privat'
        AND w.privat_permanent = false
        AND w.privat_gesetzt_von IS NOT NULL
        AND (
          ws.id IS NULL
          OR ws.last_active_at < now() - ($1 || ' hours')::INTERVAL
        )
    `, [ablaufStunden.toString()])

    for (const row of abgelaufene) {
      // Prüfen ob schon ein aktiver (unbenutzter) Token existiert
      const { rows: existingTokens } = await pool.query(
        `SELECT id FROM privat_mode_tokens
         WHERE werkstufe_id = $1 AND user_id = $2
           AND benutzt_am IS NULL AND ablauf_am > now()`,
        [row.werkstufe_id, row.user_id]
      )
      if (existingTokens.length >= 2) continue // Bereits Email gesendet

      // Tokens erzeugen
      const ablaufAm = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      const { rows: [tokenVerlaengern] } = await pool.query(
        `INSERT INTO privat_mode_tokens (werkstufe_id, user_id, aktion, ablauf_am)
         VALUES ($1, $2, 'verlaengern', $3) RETURNING token`,
        [row.werkstufe_id, row.user_id, ablaufAm]
      )
      const { rows: [tokenFreigeben] } = await pool.query(
        `INSERT INTO privat_mode_tokens (werkstufe_id, user_id, aktion, ablauf_am)
         VALUES ($1, $2, 'freigeben', $3) RETURNING token`,
        [row.werkstufe_id, row.user_id, ablaufAm]
      )

      // User-Email aus auth.app holen
      const AUTH_URL = 'http://127.0.0.1:3002'
      const INTERNAL_KEY = process.env.INTERNAL_SECRET ?? ''
      let userEmail: string | null = null
      let userName = row.user_id
      try {
        const authRes = await fetch(
          `${AUTH_URL}/api/internal/user-info?user_id=${encodeURIComponent(row.user_id)}`,
          { headers: { 'x-internal-key': INTERNAL_KEY } }
        )
        if (authRes.ok) {
          const data = await authRes.json() as any
          userEmail = data.email
          userName = data.name ?? row.user_id
        }
      } catch { /* non-critical */ }

      if (!userEmail) {
        // Kein Email-Empfänger — direkt freigeben
        const newSichtbarkeit = row.previous_sichtbarkeit || 'autoren'
        await pool.query(
          `UPDATE werkstufen SET
             sichtbarkeit = $1,
             privat_gesetzt_am = NULL,
             privat_gesetzt_von = NULL,
             previous_sichtbarkeit = NULL
           WHERE id = $2`,
          [newSichtbarkeit, row.werkstufe_id]
        )
        console.log(`[privatModus] Kein Email für user ${row.user_id} — direkt freigegeben: ${row.werkstufe_id}`)
        continue
      }

      // Email senden
      const werkName = row.folge_titel ? `Episode ${row.folge_titel}` : `Werkstufe ${row.werkstufe_id.slice(0, 8)}`
      await sendPrivatAblaufEmail({
        email: userEmail,
        userName,
        werkstufeName: werkName,
        verlaengernUrl: `${APP_URL}/privat-mode-token/${tokenVerlaengern.token}`,
        freigebenUrl: `${APP_URL}/privat-mode-token/${tokenFreigeben.token}`,
      }).catch(err => console.error(`[privatModus] Email-Fehler für ${userEmail}:`, err))

      console.log(`[privatModus] Email gesendet an ${userEmail} für Werkstufe ${row.werkstufe_id.slice(0, 8)}`)
    }
  } catch (err) {
    console.error('[privatModus] Worker-Fehler:', err)
  }
}
