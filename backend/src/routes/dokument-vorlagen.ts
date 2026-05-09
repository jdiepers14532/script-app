import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const dokumentVorlagenRouter = Router({ mergeParams: true })
dokumentVorlagenRouter.use(authMiddleware)

// GET /api/produktionen/:produktionId/dokument-vorlagen
dokumentVorlagenRouter.get('/', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, created_by, created_at FROM dokument_vorlagen WHERE produktion_id = $1 ORDER BY created_at DESC',
      [(req.params as any).produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/produktionen/:produktionId/dokument-vorlagen/:id
dokumentVorlagenRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      'SELECT * FROM dokument_vorlagen WHERE id = $1 AND produktion_id = $2',
      [req.params.id, (req.params as any).produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Vorlage nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:produktionId/dokument-vorlagen
// Save current werkstufe's non-scene elements as a template
dokumentVorlagenRouter.post('/', async (req, res) => {
  try {
    const { name, werkstufe_id } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    if (!werkstufe_id) return res.status(400).json({ error: 'werkstufe_id required' })

    // Read non-scene elements from the werkstufe
    const nonScenes = await query(
      `SELECT element_type, zusammenfassung, content, sort_order
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND format = 'notiz' AND geloescht = false
       ORDER BY sort_order`,
      [werkstufe_id]
    )

    if (nonScenes.length === 0) {
      return res.status(400).json({ error: 'Keine Non-Scene-Elemente in dieser Werkstufe' })
    }

    const sektionen = nonScenes.map((s: any) => ({
      element_type: s.element_type,
      label: s.zusammenfassung,
      content: s.content,
    }))

    const row = await queryOne(
      `INSERT INTO dokument_vorlagen (produktion_id, name, sektionen, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [(req.params as any).produktionId, name, JSON.stringify(sektionen), req.user!.name || req.user!.user_id]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/produktionen/:produktionId/dokument-vorlagen/:id
dokumentVorlagenRouter.delete('/:id', async (req, res) => {
  try {
    await queryOne(
      'DELETE FROM dokument_vorlagen WHERE id = $1 AND produktion_id = $2 RETURNING id',
      [req.params.id, (req.params as any).produktionId]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/werkstufen/:werkId/apply-vorlage — apply template to werkstufe
// (mounted separately on werkstufenRouter)
export async function applyVorlage(werkId: string, vorlagenId: string, userName: string) {
  const vorlage = await queryOne('SELECT * FROM dokument_vorlagen WHERE id = $1', [vorlagenId])
  if (!vorlage) throw new Error('Vorlage nicht gefunden')

  const sektionen = vorlage.sektionen as Array<{ element_type: string; label: string; content: any }>

  for (let i = 0; i < sektionen.length; i++) {
    const s = sektionen[i]
    await queryOne(
      `INSERT INTO dokument_szenen
         (werkstufe_id, scene_identity_id, sort_order, scene_nummer,
          content, format, element_type, geloescht, updated_by, zusammenfassung)
       VALUES ($1, NULL, $2, NULL, $3, 'notiz', $4, false, $5, $6)`,
      [werkId, -(sektionen.length - i), JSON.stringify(s.content), s.element_type, userName, s.label]
    )
  }

  return sektionen.length
}
