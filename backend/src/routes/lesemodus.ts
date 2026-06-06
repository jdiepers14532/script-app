import { Router } from 'express'
import { query } from '../db'
import { authMiddleware } from '../auth'

// Lese-/Anmerkungs-Modus (Handoff 3 §3): welche Werkstufen darf der Anfragende lesen?
// Auflösung über fn_werkstufe_sichtbar (NICHT die permissive Alt-Listing-Query in werkstufen.ts).
export const lesemodusRouter = Router()
lesemodusRouter.use(authMiddleware)

// GET /api/lesemodus/werkstufen?folge_id= — sichtbare Werkstufen + Default nach Auswahlregel
// (Drehbuch > Storyline > andere; je höchste version_nummer).
lesemodusRouter.get('/werkstufen', async (req, res) => {
  const folgeId = req.query.folge_id ? parseInt(req.query.folge_id as string) : null
  if (!folgeId) return res.status(400).json({ error: 'folge_id erforderlich' })
  const user = req.user!
  const istAutor = (user.roles ?? []).filter(Boolean).length > 0
  try {
    const rows = await query(
      `SELECT w.id, w.typ, w.label, w.version_nummer, w.sichtbarkeit,
              w.eingefroren, w.ist_revisionsstufe, w.revisionsstufen_nr, w.abgegeben
       FROM werkstufen w
       WHERE w.folge_id = $1 AND fn_werkstufe_sichtbar(w.id, $2, $3)
       ORDER BY w.typ, w.version_nummer DESC`,
      [folgeId, user.user_id, istAutor]
    )
    // Default-Auswahl: Drehbuch > Storyline > andere; innerhalb höchste version_nummer.
    let pool: any[] = []
    for (const typ of ['drehbuch', 'storyline']) {
      pool = rows.filter((w: any) => w.typ === typ)
      if (pool.length) break
    }
    if (!pool.length) pool = rows
    const def = [...pool].sort((a, b) => b.version_nummer - a.version_nummer)[0] ?? null
    res.json({ werkstufen: rows, default_werkstuf_id: def?.id ?? null })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
