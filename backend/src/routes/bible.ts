import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const bibleRouter = Router()
bibleRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bible/uebersicht?produktion_id=X
// Alle aktiven Charaktere der Produktion + Beziehungs-Zähler + Chronologie-Zähler
// ══════════════════════════════════════════════════════════════════════════════
bibleRouter.get('/uebersicht', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const characters = await query(
      `SELECT c.id, c.name, c.farbe,
              COUNT(DISTINCT cb.id)::int        AS beziehungen_count,
              COUNT(DISTINCT bc_blk.id)::int    AS chronologie_count
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id
         AND cp.produktion_id = $1 AND cp.ist_aktiv = TRUE
       LEFT JOIN charakter_beziehungen cb ON cb.character_id = c.id
       LEFT JOIN bible_chronologie bc_blk ON bc_blk.character_id = c.id
         AND bc_blk.produktion_id = $1
       GROUP BY c.id, c.name, c.farbe
       ORDER BY c.name`,
      [produktion_id]
    )
    res.json(characters)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/bible/character/:id?produktion_id=X
// Beziehungen + Chronologie eines Charakters
// ══════════════════════════════════════════════════════════════════════════════
bibleRouter.get('/character/:id', async (req, res) => {
  const { produktion_id } = req.query
  const { id } = req.params

  try {
    const beziehungen = await query(
      `SELECT cb.id, cb.beziehungstyp, cb.label,
              cb.status, cb.seit_block, cb.bis_block, cb.notiz,
              c.id AS related_id, c.name AS related_name, c.farbe AS related_farbe
       FROM charakter_beziehungen cb
       JOIN characters c ON c.id = cb.related_character_id
       WHERE cb.character_id = $1
       ORDER BY cb.status, cb.beziehungstyp, c.name`,
      [id]
    )

    const chronologie = await query(
      `SELECT bc.id, bc.block_nummer, bc.beat_id, bc.ereignis,
              bc.manuell, bc.erstellt_am,
              sb.beat_text, sb.prosa_text
       FROM bible_chronologie bc
       LEFT JOIN strang_beats sb ON sb.id = bc.beat_id
       WHERE bc.character_id = $1
         ${produktion_id ? 'AND bc.produktion_id = $2' : ''}
       ORDER BY bc.block_nummer NULLS LAST, bc.erstellt_am`,
      produktion_id ? [id, produktion_id] : [id]
    )

    res.json({ beziehungen, chronologie })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bible/chronologie-sync?produktion_id=X
// Leitet Chronologie-Einträge aus beat_charaktere ab.
// Löscht bestehende nicht-manuelle Einträge, ersetzt sie durch aktuelle Beats.
// ══════════════════════════════════════════════════════════════════════════════
bibleRouter.post('/chronologie-sync', async (req, res) => {
  const { produktion_id } = req.query as { produktion_id?: string }
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    // Lösche nicht-manuelle Einträge dieser Produktion
    await query(
      `DELETE FROM bible_chronologie WHERE produktion_id = $1 AND manuell = FALSE`,
      [produktion_id]
    )

    // Lade alle Future-Beats mit character-Tags
    const beatChars = await query(
      `SELECT bc.character_id, sb.id AS beat_id,
              sb.block_nummer, sb.beat_text, sb.prosa_text
       FROM beat_charaktere bc
       JOIN strang_beats sb ON sb.id = bc.beat_id
       JOIN straenge s ON s.id = sb.strang_id
       WHERE s.produktion_id = $1
         AND sb.ebene = 'future'
         AND sb.block_nummer IS NOT NULL
       ORDER BY bc.character_id, sb.block_nummer`,
      [produktion_id]
    )

    // Pro Character+Block einen Eintrag anlegen (zusammengefasst)
    // Mehrere Beats im selben Block → ein Eintrag mit zusammengefasstem Text
    const grouped = new Map<string, { character_id: string; block_nummer: number; beat_ids: string[]; texte: string[] }>()
    for (const bc of beatChars) {
      const key = `${bc.character_id}__${bc.block_nummer}`
      if (!grouped.has(key)) grouped.set(key, { character_id: bc.character_id, block_nummer: bc.block_nummer, beat_ids: [], texte: [] })
      const g = grouped.get(key)!
      g.beat_ids.push(bc.beat_id)
      const text = bc.beat_text || bc.prosa_text
      if (text) g.texte.push(text.slice(0, 120))
    }

    let count = 0
    for (const g of grouped.values()) {
      const ereignis = g.texte.length > 0 ? g.texte.join(' · ') : `Block ${g.block_nummer}`
      await queryOne(
        `INSERT INTO bible_chronologie
           (character_id, produktion_id, block_nummer, beat_id, ereignis, manuell)
         VALUES ($1,$2,$3,$4,$5,FALSE)`,
        [g.character_id, produktion_id, g.block_nummer, g.beat_ids[0], ereignis.slice(0, 300)]
      )
      count++
    }

    res.json({ synced: count })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/bible/chronologie
// Manueller Chronologie-Eintrag
// Body: { character_id, produktion_id, block_nummer?, ereignis }
// ══════════════════════════════════════════════════════════════════════════════
bibleRouter.post('/chronologie', async (req, res) => {
  const { character_id, produktion_id, block_nummer, ereignis } = req.body
  if (!character_id || !produktion_id || !ereignis) {
    return res.status(400).json({ error: 'character_id, produktion_id, ereignis required' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO bible_chronologie (character_id, produktion_id, block_nummer, ereignis, manuell)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [character_id, produktion_id, block_nummer ?? null, ereignis.trim()]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/bible/chronologie/:id
bibleRouter.delete('/chronologie/:id', async (req, res) => {
  try {
    await query('DELETE FROM bible_chronologie WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
