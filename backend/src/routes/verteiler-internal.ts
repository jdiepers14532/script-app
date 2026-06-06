/**
 * Verteiler-System — interne Endpoints (Schritt 2, SPEC §9).
 *
 * Service-zu-Service über Shared-Secret-Header (Muster X-KI-Trainer-Secret),
 * hier X-Mail-Service-Secret. Mounted at /api/internal (MUSS vor exportsRouter
 * stehen, sonst greift dessen authMiddleware).
 *
 *   POST /api/internal/mail-status → { correlation_id, status, bounce_grund? }
 *
 * correlation_id == distribution_empfaenger.id (VERP/Message-ID-Basis).
 * Von der auth.app aufgerufen, sobald eine Zustellung bestätigt/gebounced ist.
 */
import { Router, Request, Response, NextFunction } from 'express'
import { pool } from '../db'
import { MAIL_SERVICE_SECRET } from '../lib/verteiler'

export const verteilerInternalRouter = Router()

function checkSecret(req: Request, res: Response, next: NextFunction) {
  if (req.headers['x-mail-service-secret'] !== MAIL_SERVICE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
verteilerInternalRouter.use(checkSecret)

// Erlaubte Zustellungs-Status aus dem Mail-Service (Versand-FSM, ohne 'expired'/'queued').
const VALID_STATUS = new Set(['sent', 'delivered', 'bounced'])

// POST /api/internal/mail-status
verteilerInternalRouter.post('/mail-status', async (req, res) => {
  const { correlation_id, status, bounce_grund } = req.body || {}
  if (!correlation_id || !status) {
    return res.status(400).json({ error: 'correlation_id und status erforderlich' })
  }
  if (!VALID_STATUS.has(status)) {
    return res.status(400).json({ error: `Ungültiger status: ${status}` })
  }
  try {
    // Zustellung fortschreiben + passenden Zeitstempel setzen.
    const r = await pool.query(
      `UPDATE distribution_empfaenger
         SET zustellung   = $2,
             bounce_grund = CASE WHEN $2 = 'bounced' THEN $3 ELSE bounce_grund END,
             gesendet_am  = CASE WHEN $2 = 'sent'      AND gesendet_am  IS NULL THEN now() ELSE gesendet_am END,
             zugestellt_am= CASE WHEN $2 = 'delivered' AND zugestellt_am IS NULL THEN now() ELSE zugestellt_am END
       WHERE id = $1
       RETURNING id, zustellung`,
      [correlation_id, status, bounce_grund ?? null]
    )
    if (r.rowCount === 0) return res.status(404).json({ error: 'Empfänger (correlation_id) nicht gefunden' })
    res.json({ ok: true, id: r.rows[0].id, zustellung: r.rows[0].zustellung })
  } catch (err) {
    console.error('[verteiler] mail-status error:', err)
    res.status(500).json({ error: 'DB-Fehler' })
  }
})
