import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

// GET /api/autocomplete/characters?produktion_id=&q=
// Returns characters from own staffel first, then cross-staffel results
router.get('/characters', async (req, res) => {
  const { produktion_id, q } = req.query as Record<string, string>
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const searchTerm = `%${(q ?? '').toLowerCase()}%`

    // Own staffel characters
    const ownRows = await query(
      `SELECT c.id, c.name, c.meta_json,
              cp.rollen_nummer, cp.komparsen_nummer, cp.produktion_id,
              ck.typ AS kategorie_typ
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id AND cp.produktion_id = $1
       LEFT JOIN character_kategorien ck ON ck.id = cp.kategorie_id
       WHERE LOWER(c.name) LIKE $2
       ORDER BY c.name
       LIMIT 20`,
      [produktion_id, searchTerm]
    )

    // Cross-staffel: find same production's other produktionen
    const staffel = await queryOne(`SELECT produktion_db_id FROM produktionen WHERE id = $1`, [produktion_id])
    let crossRows: any[] = []

    if (staffel?.produktion_db_id && ownRows.length < 20) {
      const ownIds = ownRows.map((r: any) => r.id)
      crossRows = await query(
        `SELECT c.id, c.name, c.meta_json,
                cp.rollen_nummer, cp.komparsen_nummer, cp.produktion_id,
                s.titel AS staffel_titel,
                ck.typ AS kategorie_typ
         FROM characters c
         JOIN character_productions cp ON cp.character_id = c.id
         JOIN produktionen s ON s.id = cp.produktion_id
         LEFT JOIN character_kategorien ck ON ck.id = cp.kategorie_id
         WHERE s.produktion_db_id = $1
           AND cp.produktion_id != $2
           AND LOWER(c.name) LIKE $3
           ${ownIds.length > 0 ? `AND c.id NOT IN (${ownIds.map((_: any, i: number) => `$${i + 4}`).join(',')})` : ''}
         ORDER BY c.name
         LIMIT ${20 - ownRows.length}`,
        [staffel.produktion_db_id, produktion_id, searchTerm, ...ownIds]
      )
    }

    res.json({
      own: ownRows,
      cross: crossRows,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/autocomplete/locations?produktion_id=&q=
// Returns entities of type 'location' from own staffel, then cross-staffel
router.get('/locations', async (req, res) => {
  const { produktion_id, q } = req.query as Record<string, string>
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const searchTerm = `%${(q ?? '').toLowerCase()}%`

    // Own staffel locations (entities table, entity_type='location')
    const ownRows = await query(
      `SELECT id, name, meta_json, produktion_id
       FROM entities
       WHERE produktion_id = $1 AND entity_type = 'location' AND LOWER(name) LIKE $2
       ORDER BY name LIMIT 20`,
      [produktion_id, searchTerm]
    )

    // Cross-staffel
    const staffel = await queryOne(`SELECT produktion_db_id FROM produktionen WHERE id = $1`, [produktion_id])
    let crossRows: any[] = []

    if (staffel?.produktion_db_id && ownRows.length < 20) {
      crossRows = await query(
        `SELECT e.id, e.name, e.meta_json, e.produktion_id, s.titel AS staffel_titel
         FROM entities e
         JOIN produktionen s ON s.id = e.produktion_id
         WHERE s.produktion_db_id = $1
           AND e.produktion_id != $2
           AND e.entity_type = 'location'
           AND LOWER(e.name) LIKE $3
         ORDER BY e.name
         LIMIT ${20 - ownRows.length}`,
        [staffel.produktion_db_id, produktion_id, searchTerm]
      )
    }

    res.json({
      own: ownRows,
      cross: crossRows,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
