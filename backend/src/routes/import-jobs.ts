import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import * as fs from 'fs'

const router = Router()
router.use(authMiddleware)

// GET /api/import-jobs?produktion_id=X
router.get('/', async (req, res) => {
  try {
    const { produktion_id } = req.query
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })
    const rows = await query(
      `SELECT id, produktion_id, status, tier_erreicht, provider, model, source_file_name,
              total_chunks, done_chunks, fehler, user_id, erstellt_am, abgeschlossen_am
       FROM import_jobs
       WHERE produktion_id = $1
       ORDER BY erstellt_am DESC
       LIMIT 50`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/import-jobs/:id (für Polling)
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Job nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/import-jobs/:id — Job abbrechen + Datei löschen
router.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (row.source_file_path) {
      try { fs.unlinkSync(row.source_file_path) } catch { /* bereits gelöscht */ }
    }
    await query('DELETE FROM import_jobs WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/import-jobs/:id/file — gespeichertes PDF herunterladen
router.get('/:id/file', async (req, res) => {
  try {
    const row = await queryOne(
      'SELECT source_file_name, source_file_path FROM import_jobs WHERE id = $1',
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (!row.source_file_path || !fs.existsSync(row.source_file_path)) {
      return res.status(404).json({ error: 'Datei nicht gefunden' })
    }
    const fileName = row.source_file_name || 'import.pdf'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    fs.createReadStream(row.source_file_path).pipe(res)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export { router as importJobsRouter }
