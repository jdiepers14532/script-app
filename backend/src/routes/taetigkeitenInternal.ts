import { Router } from 'express'
import { pool } from '../db'

export const taetigkeitenInternalRouter = Router()

const INTERNAL_SECRET = process.env.PROD_INTERNAL_SECRET || 'prod-internal-2026'

function checkSecret(req: any, res: any, next: any) {
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

taetigkeitenInternalRouter.use(checkSecret)

// GET /api/internal/taetigkeit-refs/:id
// Liefert Anzahl der Referenzen auf diese Tätigkeit im Autorenplan.
// Wird von Vertragsdb vor einem Merge aufgerufen um externe Abhängigkeiten anzuzeigen.
taetigkeitenInternalRouter.get('/taetigkeit-refs/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Ungültige ID' })

  try {
    const [r1, r2] = await Promise.all([
      pool.query(
        'SELECT COUNT(*)::int AS n FROM autorenplan_einsaetze WHERE vertragsdb_taetigkeit_id = $1',
        [id]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS n FROM autorenplan_job_kategorien WHERE vertragsdb_taetigkeit_id = $1',
        [id]
      ),
    ])
    const einsaetze: number = r1.rows[0]?.n ?? 0
    const job_kategorien: number = r2.rows[0]?.n ?? 0
    res.json({ count: einsaetze + job_kategorien, einsaetze, job_kategorien })
  } catch (err) {
    console.error('[taetigkeitenInternal] refs error:', err)
    res.status(500).json({ error: 'DB-Fehler' })
  }
})

// POST /api/internal/taetigkeit-remap
// Ersetzt vertragsdb_taetigkeit_id = alt_id durch neu_id in allen Autorenplan-Tabellen.
// Wird von Vertragsdb nach einem erfolgreichen Merge aufgerufen.
taetigkeitenInternalRouter.post('/taetigkeit-remap', async (req, res) => {
  const { alt_id, neu_id } = req.body ?? {}
  if (!alt_id || !neu_id) {
    return res.status(400).json({ error: 'alt_id und neu_id erforderlich' })
  }

  try {
    const [r1, r2] = await Promise.all([
      pool.query(
        'UPDATE autorenplan_einsaetze SET vertragsdb_taetigkeit_id = $1 WHERE vertragsdb_taetigkeit_id = $2',
        [neu_id, alt_id]
      ),
      pool.query(
        'UPDATE autorenplan_job_kategorien SET vertragsdb_taetigkeit_id = $1 WHERE vertragsdb_taetigkeit_id = $2',
        [neu_id, alt_id]
      ),
    ])
    res.json({
      ok: true,
      einsaetze_aktualisiert: r1.rowCount ?? 0,
      job_kategorien_aktualisiert: r2.rowCount ?? 0,
    })
  } catch (err) {
    console.error('[taetigkeitenInternal] remap error:', err)
    res.status(500).json({ error: 'DB-Fehler' })
  }
})
