import { Router } from 'express'
import multer from 'multer'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { detectFormat, parseScript } from '../importers'

export const importRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

// POST /api/import/detect — Auto-Detect only, no save
importRouter.post('/detect', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })
    const result = detectFormat(req.file.originalname, req.file.buffer)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/import/preview — Parse + Preview, no save
importRouter.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })
    const result = await parseScript(req.file.originalname, req.file.buffer)
    res.json({
      format: result.meta.format,
      version: result.meta.version,
      total_scenes: result.meta.total_scenes,
      total_textelemente: result.meta.total_textelemente,
      charaktere: result.meta.charaktere,
      warnings: result.meta.warnings,
      szenen: result.szenen,
    })
  } catch (err) {
    res.status(422).json({ error: String(err) })
  }
})

// POST /api/import/commit — Full import into DB
importRouter.post('/commit', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

    const staffel_id = req.body.staffel_id
    const folge_nummer = parseInt(req.body.folge_nummer)
    const proddb_block_id = req.body.proddb_block_id || null

    if (!staffel_id || isNaN(folge_nummer)) {
      return res.status(400).json({ error: 'staffel_id und folge_nummer erforderlich' })
    }

    const stage_type = req.body.stage_type || 'draft'
    const validStageTypes = ['expose', 'treatment', 'draft', 'final']
    if (!validStageTypes.includes(stage_type)) {
      return res.status(400).json({ error: `Ungültiger stage_type: ${stage_type}` })
    }

    const result = await parseScript(req.file.originalname, req.file.buffer)

    const stage = await queryOne(
      `INSERT INTO stages (staffel_id, folge_nummer, proddb_block_id, stage_type, version_label, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [staffel_id, folge_nummer, proddb_block_id, stage_type, `Import: ${req.file.originalname}`, req.user!.name || req.user!.user_id]
    )

    if (!stage) return res.status(500).json({ error: 'Stage konnte nicht angelegt werden' })

    let scenesImported = 0
    for (const [idx, szene] of result.szenen.entries()) {
      await queryOne(
        `INSERT INTO szenen (stage_id, scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung, content, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [stage.id, szene.nummer, szene.int_ext, szene.tageszeit, szene.ort_name || null, szene.zusammenfassung || null, JSON.stringify(szene.textelemente), idx]
      )
      scenesImported++
    }

    let entitiesCreated = 0
    for (const char of result.meta.charaktere) {
      if (!char.trim()) continue
      try {
        const existing = await queryOne(
          `SELECT id FROM entities WHERE entity_type = 'charakter' AND name = $1 AND staffel_id = $2`,
          [char, staffel_id]
        )
        if (!existing) {
          await queryOne(
            `INSERT INTO entities (entity_type, name, staffel_id) VALUES ('charakter', $1, $2)`,
            [char, staffel_id]
          )
          entitiesCreated++
        }
      } catch { /* ignore entity constraint violations */ }
    }

    res.json({
      stage_id: stage.id,
      scenes_imported: scenesImported,
      entities_created: entitiesCreated,
      warnings: result.meta.warnings,
    })
  } catch (err) {
    console.error('Import commit error:', err)
    res.status(500).json({ error: String(err) })
  }
})
