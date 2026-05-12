import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

const VALID_TYPEN = ['drehbuch', 'storyline', 'notiz', 'alle'] as const

// GET /api/produktionen/:produktionId/kopf-fusszeilen
// Returns all configured KZ/FZ-defaults for a production (one per typ)
router.get('/:produktionId/kopf-fusszeilen', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM kopf_fusszeilen_defaults WHERE produktion_id = $1 ORDER BY werkstufe_typ',
      [req.params.produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/produktionen/:produktionId/kopf-fusszeilen/:typ
router.get('/:produktionId/kopf-fusszeilen/:typ', async (req, res) => {
  const { produktionId, typ } = req.params
  if (!VALID_TYPEN.includes(typ as any)) return res.status(400).json({ error: 'Ungültiger Typ' })
  try {
    const row = await queryOne(
      'SELECT * FROM kopf_fusszeilen_defaults WHERE produktion_id = $1 AND werkstufe_typ = $2',
      [produktionId, typ]
    )
    res.json(row || null)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/kopf-fusszeilen/:typ
// Upsert (create or update)
router.put('/:produktionId/kopf-fusszeilen/:typ', async (req, res) => {
  const { produktionId, typ } = req.params
  if (!VALID_TYPEN.includes(typ as any)) return res.status(400).json({ error: 'Ungültiger Typ' })
  const {
    kopfzeile_content, fusszeile_content,
    kopfzeile_aktiv, fusszeile_aktiv,
    erste_seite_kein_header, erste_seite_kein_footer,
    seiten_layout,
  } = req.body
  try {
    const row = await queryOne(
      `INSERT INTO kopf_fusszeilen_defaults
         (produktion_id, werkstufe_typ, kopfzeile_content, fusszeile_content,
          kopfzeile_aktiv, fusszeile_aktiv, erste_seite_kein_header,
          erste_seite_kein_footer, seiten_layout)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (produktion_id, werkstufe_typ) DO UPDATE SET
         kopfzeile_content       = EXCLUDED.kopfzeile_content,
         fusszeile_content       = EXCLUDED.fusszeile_content,
         kopfzeile_aktiv         = EXCLUDED.kopfzeile_aktiv,
         fusszeile_aktiv         = EXCLUDED.fusszeile_aktiv,
         erste_seite_kein_header = EXCLUDED.erste_seite_kein_header,
         erste_seite_kein_footer = EXCLUDED.erste_seite_kein_footer,
         seiten_layout           = EXCLUDED.seiten_layout
       RETURNING *`,
      [
        produktionId, typ,
        kopfzeile_content ? JSON.stringify(kopfzeile_content) : null,
        fusszeile_content ? JSON.stringify(fusszeile_content) : null,
        kopfzeile_aktiv ?? false,
        fusszeile_aktiv ?? false,
        erste_seite_kein_header ?? true,
        erste_seite_kein_footer ?? false,
        seiten_layout ? JSON.stringify(seiten_layout) : null,
      ]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/produktionen/:produktionId/kopf-fusszeilen/:typ
router.delete('/:produktionId/kopf-fusszeilen/:typ', async (req, res) => {
  const { produktionId, typ } = req.params
  if (!VALID_TYPEN.includes(typ as any)) return res.status(400).json({ error: 'Ungültiger Typ' })
  try {
    await query(
      'DELETE FROM kopf_fusszeilen_defaults WHERE produktion_id = $1 AND werkstufe_typ = $2',
      [produktionId, typ]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
