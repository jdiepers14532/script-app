import { Router } from 'express'
import multer from 'multer'
import * as fs from 'fs'
import * as path from 'path'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { detectFormat } from '../importers'
import { parseFilename } from '../importers/daily'
import { runCommitImport, buildParseOptsFromBody } from './import'

// ── Grenzen (siehe CLAUDE.md / Server: 1 vCPU, OCR-Timeouts) ──
const MAX_FILES_PER_BATCH = 20
const MAX_FILE_SIZE = 50 * 1024 * 1024        // 50 MB pro Datei
const MAX_BATCH_SIZE = 200 * 1024 * 1024      // 200 MB pro Batch gesamt
const MAX_PARALLEL = 3                          // gleichzeitige Verarbeitung

const TEMP_BASE = path.join(process.cwd(), 'uploads', 'import-batch')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_BATCH },
})

// ── Dateiname-Heuristik: Folge-Nummer + Stage-Type raten ──
export function guessFolgeAndStage(filename: string): { folge_nummer: number | null; stage_type: string } {
  // 1. Rote-Rosen-Format ("Treatment - Rote Rosen Produktion 24 - Episode 4402 - …")
  const rr = parseFilename(filename)
  if (rr.episode) {
    return {
      folge_nummer: rr.episode,
      stage_type: rr.document_type === 'treatment' ? 'treatment' : 'draft',
    }
  }

  const base = filename.replace(/\.[^.]+$/, '')

  // 2. Folge-/Episoden-Nummer
  let folge: number | null = null
  const labeled = base.match(/(?:folge|episode|ep|epi|f)[\s_.\-]*(\d{1,4})/i)
  if (labeled) {
    folge = parseInt(labeled[1], 10)
  } else {
    const bare = base.match(/\b(\d{1,4})\b/)
    if (bare) folge = parseInt(bare[1], 10)
  }

  // 3. Stage-Type aus Schlüsselwörtern (Priorität: final → expose → treatment → draft)
  let stage = 'draft'
  if (/\b(treatment|storyline|outline)\b|(^|\W)sl(\W|$)/i.test(base)) stage = 'treatment'
  if (/\bexpos[eé]?\b/i.test(base)) stage = 'expose'
  if (/\b(final|sendefassung)\b/i.test(base)) stage = 'final'

  return { folge_nummer: folge, stage_type: stage }
}

const router = Router()
router.use(authMiddleware)

// ── POST /api/import/batch — mehrere Dateien hochladen, Jobs anlegen ──
router.post('/batch', upload.array('files', MAX_FILES_PER_BATCH), async (req, res) => {
  try {
    const produktion_id = req.body.produktion_id
    const files = (req.files as Express.Multer.File[]) || []
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })
    if (files.length === 0) return res.status(400).json({ error: 'Keine Dateien hochgeladen' })
    if (files.length > MAX_FILES_PER_BATCH) {
      return res.status(400).json({ error: `Maximal ${MAX_FILES_PER_BATCH} Dateien pro Batch` })
    }
    const totalSize = files.reduce((s, f) => s + f.size, 0)
    if (totalSize > MAX_BATCH_SIZE) {
      return res.status(400).json({ error: `Batch zu groß (max. ${Math.round(MAX_BATCH_SIZE / 1024 / 1024)} MB gesamt)` })
    }

    // Gemeinsame Optionen (für alle Dateien): save_metadata, sichtbarkeit, pdf_method.
    // Sichtbarkeit + Label sind nur der globale Default — sie werden pro Job gespeichert
    // (import_batch_jobs.import_sichtbarkeit / import_label) und auf Seite 2 überschreibbar.
    const globalSichtbarkeit = ['autoren', 'produktion'].includes(req.body.import_sichtbarkeit) ? req.body.import_sichtbarkeit : 'autoren'
    const globalLabel: string | null = req.body.import_label || null
    const globalRenumber = req.body.renumber === 'true'
    const optionen = {
      save_metadata: req.body.save_metadata === 'true',
      sichtbarkeit: globalSichtbarkeit,
      pdf_method: req.body.pdf_method === 'mistral' ? 'mistral' : undefined,
    }

    // Ist das globale Label eine Produktionsfassung? Dann werden alle Folgen als „gelockt"
    // vorbelegt (stage_type='final') — analog zum Einzelimport. Pro Folge korrigierbar.
    let globalLabelIsLock = false
    if (globalLabel) {
      const lockRow = await queryOne(
        `SELECT 1 FROM stage_labels WHERE produktion_id = $1 AND name = $2 AND is_produktionsfassung = TRUE LIMIT 1`,
        [produktion_id, globalLabel]
      )
      globalLabelIsLock = !!lockRow
    }

    const batch = await queryOne(
      `INSERT INTO import_batches (produktion_id, status, datei_anzahl, optionen_json, erstellt_von)
       VALUES ($1, 'offen', $2, $3, $4) RETURNING *`,
      [produktion_id, files.length, JSON.stringify(optionen), req.user!.name || req.user!.user_id]
    )

    const tempDir = path.join(TEMP_BASE, batch.id)
    fs.mkdirSync(tempDir, { recursive: true })

    const jobs: any[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      let format: string | null = null
      try { format = detectFormat(file.originalname, file.buffer).format } catch { format = null }
      const { folge_nummer, stage_type: guessedStage } = guessFolgeAndStage(file.originalname)
      // Produktionsfassungs-Label global gewählt → „gelockt" vorbelegen, sonst geratene Stufe.
      const stage_type = globalLabelIsLock ? 'final' : guessedStage

      const job = await queryOne(
        `INSERT INTO import_batch_jobs
           (batch_id, sort_order, dateiname, datei_groesse, format, folge_nummer, stage_type, import_label, import_sichtbarkeit, renumber, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'wartet') RETURNING *`,
        [batch.id, i, file.originalname, file.size, format, folge_nummer, stage_type, globalLabel, globalSichtbarkeit, globalRenumber]
      )

      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = path.join(tempDir, `${job.id}_${safe}`)
      fs.writeFileSync(filePath, file.buffer)
      await query(`UPDATE import_batch_jobs SET datei_pfad = $1 WHERE id = $2`, [filePath, job.id])
      job.datei_pfad = filePath

      jobs.push(job)
    }

    res.json({ ...batch, jobs })
  } catch (err) {
    console.error('[ImportBatch] upload error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// ── PUT /api/import/batch/:id/zuordnung — Folge/Stage pro Datei korrigieren ──
router.put('/batch/:id/zuordnung', async (req, res) => {
  try {
    const batch = await queryOne(`SELECT * FROM import_batches WHERE id = $1`, [req.params.id])
    if (!batch) return res.status(404).json({ error: 'Batch nicht gefunden' })
    if (batch.status !== 'offen') {
      return res.status(400).json({ error: 'Zuordnung nur vor dem Start änderbar' })
    }
    const jobs = Array.isArray(req.body.jobs) ? req.body.jobs : []
    const validStages = ['expose', 'treatment', 'draft', 'final']
    for (const j of jobs) {
      const folge = j.folge_nummer != null && j.folge_nummer !== '' ? parseInt(j.folge_nummer, 10) : null
      const stage = validStages.includes(j.stage_type) ? j.stage_type : 'draft'
      const label = j.import_label || null
      const sichtbarkeit = ['autoren', 'produktion'].includes(j.import_sichtbarkeit) ? j.import_sichtbarkeit : 'autoren'
      const renumber = j.renumber === true
      await query(
        `UPDATE import_batch_jobs SET folge_nummer = $1, stage_type = $2, import_label = $3, import_sichtbarkeit = $4, renumber = $5
         WHERE id = $6 AND batch_id = $7`,
        [folge != null && !isNaN(folge) ? folge : null, stage, label, sichtbarkeit, renumber, j.id, batch.id]
      )
    }
    const updated = await queryOne(`SELECT * FROM import_batches WHERE id = $1`, [req.params.id])
    const updatedJobs = await query(
      `SELECT * FROM import_batch_jobs WHERE batch_id = $1 ORDER BY sort_order`, [req.params.id]
    )
    res.json({ ...updated, jobs: updatedJobs })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Ein einzelnen Job verarbeiten (Parse + Commit). Temp-Datei nur bei Erfolg löschen. ──
async function processBatchJob(
  job: any,
  produktion_id: string,
  optionen: any,
  parseOpts: any,
  user: { user_id: string; name?: string | null }
): Promise<void> {
  await query(`UPDATE import_batch_jobs SET status = 'parst', fehler_text = NULL WHERE id = $1`, [job.id])
  try {
    if (!job.datei_pfad || !fs.existsSync(job.datei_pfad)) {
      throw new Error('Quelldatei nicht mehr vorhanden — Batch erneut hochladen')
    }
    const buffer = fs.readFileSync(job.datei_pfad)
    const result = await runCommitImport({
      buffer,
      originalname: job.dateiname,
      produktion_id,
      folge_nummer: job.folge_nummer,
      stage_type: job.stage_type,
      user,
      parseOpts,
      importLabel: job.import_label || null,
      importSichtbarkeit: job.import_sichtbarkeit || optionen.sichtbarkeit || 'autoren',
      saveMetadata: optionen.save_metadata === true,
      renumberFrom1: job.renumber === true,
    })
    await query(
      `UPDATE import_batch_jobs
       SET status = 'fertig', werkstufe_id = $1, ergebnis_json = $2, abgeschlossen_am = NOW(), fehler_text = NULL
       WHERE id = $3`,
      [
        result.werkstufe_id,
        JSON.stringify({
          scenes_imported: result.scenes_imported,
          non_scene_elements_imported: result.non_scene_elements_imported,
          characters_created: result.characters_created,
          komparsen_created: result.komparsen_created,
          motive_created: result.motive_created,
          produktionsfassung_locked: result.produktionsfassung_locked,
        }),
        job.id,
      ]
    )
    // Erfolg → Temp-Datei aufräumen (Commit hat eine eigene Kopie archiviert)
    try { if (job.datei_pfad) fs.unlinkSync(job.datei_pfad) } catch { /* schon weg */ }
  } catch (err) {
    // Fehler → Temp-Datei BEHALTEN, damit ein Retry möglich ist
    await query(
      `UPDATE import_batch_jobs SET status = 'fehler', fehler_text = $1, abgeschlossen_am = NOW() WHERE id = $2`,
      [String(err), job.id]
    )
  }
}

// ── Batch-Jobs im Hintergrund abarbeiten (Semaphore: max MAX_PARALLEL gleichzeitig) ──
function runBatchInBackground(batch: any, jobs: any[], user: { user_id: string; name?: string | null }) {
  const optionen = batch.optionen_json || {}
  const parseOpts = buildParseOptsFromBody(optionen.pdf_method ? { pdf_method: optionen.pdf_method } : {})

  ;(async () => {
    let idx = 0
    const tick = async () => {
      // Zähler live aus der DB aktualisieren (robust bei Retry)
      const counts = await queryOne(
        `SELECT COUNT(*) FILTER (WHERE status='fertig') AS fertig,
                COUNT(*) FILTER (WHERE status='fehler') AS fehler
         FROM import_batch_jobs WHERE batch_id = $1`,
        [batch.id]
      )
      await query(
        `UPDATE import_batches SET fertig_anzahl = $1, fehler_anzahl = $2 WHERE id = $3`,
        [parseInt(counts.fertig, 10), parseInt(counts.fehler, 10), batch.id]
      )
    }

    const runners = Array.from({ length: Math.min(MAX_PARALLEL, jobs.length) }, async () => {
      while (idx < jobs.length) {
        const job = jobs[idx++]
        await processBatchJob(job, batch.produktion_id, optionen, parseOpts, user)
        await tick()
      }
    })
    await Promise.all(runners)

    const counts = await queryOne(
      `SELECT COUNT(*) FILTER (WHERE status='fertig') AS fertig,
              COUNT(*) FILTER (WHERE status='fehler') AS fehler
       FROM import_batch_jobs WHERE batch_id = $1`,
      [batch.id]
    )
    const fehler = parseInt(counts.fehler, 10)
    const fertig = parseInt(counts.fertig, 10)
    await query(
      `UPDATE import_batches SET status = $1, fertig_anzahl = $2, fehler_anzahl = $3, abgeschlossen_am = NOW() WHERE id = $4`,
      [fehler === 0 ? 'fertig' : 'teilweise_fehler', fertig, fehler, batch.id]
    )
    // Temp-Verzeichnis entfernen, wenn keine Datei mehr darin liegt (alle erfolgreich)
    try { fs.rmdirSync(path.join(TEMP_BASE, batch.id)) } catch { /* noch Dateien (Fehler) / schon weg */ }
  })().catch(async (fatalErr) => {
    console.error('[ImportBatch] fatal worker error:', fatalErr)
    await query(`UPDATE import_batches SET status = 'teilweise_fehler', abgeschlossen_am = NOW() WHERE id = $1`, [batch.id]).catch(() => {})
  })
}

// ── POST /api/import/batch/:id/start — Verarbeitung im Hintergrund starten ──
router.post('/batch/:id/start', async (req, res) => {
  try {
    const batch = await queryOne(`SELECT * FROM import_batches WHERE id = $1`, [req.params.id])
    if (!batch) return res.status(404).json({ error: 'Batch nicht gefunden' })
    if (batch.status !== 'offen') {
      return res.status(400).json({ error: `Batch wurde bereits gestartet (Status: ${batch.status})` })
    }

    const jobs = await query(
      `SELECT * FROM import_batch_jobs WHERE batch_id = $1 ORDER BY sort_order`, [req.params.id]
    )
    const ohneFolge = jobs.filter((j: any) => j.folge_nummer == null)
    if (ohneFolge.length > 0) {
      return res.status(400).json({
        error: `${ohneFolge.length} Datei(en) ohne Folge-Nummer — bitte zuordnen`,
        jobs_ohne_folge: ohneFolge.map((j: any) => ({ id: j.id, dateiname: j.dateiname })),
      })
    }

    await query(`UPDATE import_batches SET status = 'laeuft' WHERE id = $1`, [batch.id])
    // Sofort antworten — Verarbeitung läuft im Hintergrund
    res.json({ id: batch.id, status: 'laeuft', datei_anzahl: jobs.length })

    runBatchInBackground(batch, jobs, { user_id: req.user!.user_id, name: req.user!.name })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/import/batch/:id/retry — fehlgeschlagene Jobs erneut verarbeiten ──
router.post('/batch/:id/retry', async (req, res) => {
  try {
    const batch = await queryOne(`SELECT * FROM import_batches WHERE id = $1`, [req.params.id])
    if (!batch) return res.status(404).json({ error: 'Batch nicht gefunden' })
    if (batch.status === 'laeuft') {
      return res.status(400).json({ error: 'Batch läuft noch' })
    }

    const failedJobs = await query(
      `SELECT * FROM import_batch_jobs WHERE batch_id = $1 AND status = 'fehler' ORDER BY sort_order`,
      [req.params.id]
    )
    if (failedJobs.length === 0) {
      return res.status(400).json({ error: 'Keine fehlgeschlagenen Dateien zum Wiederholen' })
    }
    const missing = failedJobs.filter((j: any) => !j.datei_pfad || !fs.existsSync(j.datei_pfad))
    if (missing.length === failedJobs.length) {
      return res.status(400).json({ error: 'Quelldateien nicht mehr vorhanden — bitte neuen Batch hochladen' })
    }

    await query(`UPDATE import_batches SET status = 'laeuft' WHERE id = $1`, [batch.id])
    res.json({ id: batch.id, status: 'laeuft', retry_anzahl: failedJobs.length })

    runBatchInBackground(batch, failedJobs, { user_id: req.user!.user_id, name: req.user!.name })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/import/batch/:id — Status-Polling (Batch + Jobs) ──
router.get('/batch/:id', async (req, res) => {
  try {
    const batch = await queryOne(`SELECT * FROM import_batches WHERE id = $1`, [req.params.id])
    if (!batch) return res.status(404).json({ error: 'Batch nicht gefunden' })
    const jobs = await query(
      `SELECT id, sort_order, dateiname, datei_groesse, format, folge_nummer, stage_type,
              import_label, import_sichtbarkeit, renumber, status, fehler_text, werkstufe_id, ergebnis_json, abgeschlossen_am
       FROM import_batch_jobs WHERE batch_id = $1 ORDER BY sort_order`,
      [req.params.id]
    )
    res.json({ ...batch, jobs })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── DELETE /api/import/batch/:id — Batch + Temp-Dateien entfernen ──
router.delete('/batch/:id', async (req, res) => {
  try {
    const jobs = await query(`SELECT datei_pfad FROM import_batch_jobs WHERE batch_id = $1`, [req.params.id])
    for (const j of jobs) {
      if (j.datei_pfad) { try { fs.unlinkSync(j.datei_pfad) } catch {} }
    }
    try { fs.rmdirSync(path.join(TEMP_BASE, req.params.id)) } catch {}
    await query(`DELETE FROM import_batches WHERE id = $1`, [req.params.id])
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export { router as importBatchRouter }
