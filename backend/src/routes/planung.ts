import { Router } from 'express'
import { query } from '../db'
import { authMiddleware } from '../auth'

export const planungRouter = Router()
planungRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/planung/board?produktion_id=X
// Liefert alle Stränge + alle Future-Beats (inkl. beat_charaktere) in einem
// Query — vermeidet N+1 beim Board-Rendering.
// ══════════════════════════════════════════════════════════════════════════════
planungRouter.get('/board', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const straenge = await query(
      `SELECT id, name, farbe, sort_order, status, typ, label, kurzinhalt,
              future_notizen, redaktionelle_kommentare, produktionelle_kommentare
       FROM straenge
       WHERE produktion_id = $1
       ORDER BY
         CASE status WHEN 'aktiv' THEN 0 WHEN 'ruhend' THEN 1 ELSE 2 END,
         sort_order, name`,
      [produktion_id]
    )

    const beats = await query(
      `SELECT
         sb.id, sb.strang_id, sb.ebene, sb.block_nummer,
         sb.beat_text, sb.prosa_text, sb.ist_abgearbeitet,
         sb.sort_order, sb.erstellt_am,
         COALESCE(
           json_agg(
             json_build_object(
               'character_id', bc.character_id,
               'name',         c.name,
               'rolle',        bc.rolle
             ) ORDER BY bc.rolle, c.name
           ) FILTER (WHERE bc.beat_id IS NOT NULL),
           '[]'
         ) AS charaktere
       FROM strang_beats sb
       JOIN straenge s ON s.id = sb.strang_id
       LEFT JOIN beat_charaktere bc ON bc.beat_id = sb.id
       LEFT JOIN characters c ON c.id = bc.character_id
       WHERE s.produktion_id = $1
         AND sb.ebene = 'future'
       GROUP BY sb.id, s.sort_order
       ORDER BY s.sort_order, sb.sort_order`,
      [produktion_id]
    )

    res.json({ straenge, beats })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
