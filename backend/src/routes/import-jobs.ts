import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import * as fs from 'fs'
import * as path from 'path'
import multer from 'multer'
import { pdfToText, runTier1 } from '../lib/import/tier1-parser'

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'uploads', 'import-docs'),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}_${safe}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

const router = Router()
router.use(authMiddleware)

// POST /api/import-jobs/upload — PDF hochladen + Tier-1-Parse
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { produktion_id } = req.body
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })
    if (!req.file) return res.status(400).json({ error: 'Keine Datei übermittelt' })

    const userId = (req as any).user?.user_id || null
    const job = await queryOne(
      `INSERT INTO import_jobs (produktion_id, status, source_file_name, source_file_path, user_id)
       VALUES ($1, 'running', $2, $3, $4) RETURNING *`,
      [produktion_id, req.file.originalname, req.file.path, userId]
    )

    try {
      const buffer = fs.readFileSync(req.file.path)
      const { text, numPages } = await pdfToText(buffer)
      const result = runTier1(text, numPages)
      const newStatus = result.success ? 'done' : 'detecting'
      const tierEreicht = result.success ? 1 : 0
      await query(
        `UPDATE import_jobs SET status=$1, tier_erreicht=$2, ergebnis_json=$3, abgeschlossen_am=NOW() WHERE id=$4`,
        [newStatus, tierEreicht, JSON.stringify(result), job.id]
      )
      return res.json({ ...job, status: newStatus, tier_erreicht: tierEreicht, ergebnis_json: result })
    } catch (parseErr) {
      await query(
        `UPDATE import_jobs SET status='error', fehler=$1, abgeschlossen_am=NOW() WHERE id=$2`,
        [String(parseErr), job.id]
      )
      return res.json({ ...job, status: 'error', fehler: String(parseErr) })
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

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
