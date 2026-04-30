import { Router } from 'express'
import multer from 'multer'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { detectFormat, parseScript } from '../importers'
import { stripWatermark, decodeWatermarkFromText } from '../utils/watermark'

/** Extract human-readable metadata from Fountain title page or FDX header */
function extractFileMetadata(filename: string, buffer: Buffer): Record<string, string> {
  const meta: Record<string, string> = {}
  const text = buffer.toString('utf8').slice(0, 4000) // only scan header area

  if (filename.toLowerCase().endsWith('.fountain') || filename.toLowerCase().endsWith('.txt')) {
    // Fountain title page: lines of "Key: Value" before first blank-blank or scene heading
    const lines = text.split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Za-z][A-Za-z ]{1,30}):\s*(.+)$/)
      if (m) meta[m[1].trim().toLowerCase().replace(/ /g, '_')] = m[2].trim()
      if (line.trim() === '' && Object.keys(meta).length > 0) break
    }
  } else if (filename.toLowerCase().endsWith('.fdx')) {
    // FDX: extract from root attributes and SmartType elements
    const versionMatch   = text.match(/Version="([^"]+)"/)
    const templateMatch  = text.match(/Template="([^"]+)"/)
    if (versionMatch)  meta['fdx_version']  = versionMatch[1]
    if (templateMatch) meta['fdx_template'] = templateMatch[1]
  }
  return meta
}

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

// POST /api/import/preview — Parse + Preview + metadata, no save
importRouter.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

    // Strip watermark before parsing
    const rawText  = req.file.buffer.toString('utf8')
    const wmPayload = decodeWatermarkFromText(rawText)
    const cleanText = stripWatermark(rawText)
    const cleanBuf  = Buffer.from(cleanText, 'utf8')

    const result   = await parseScript(req.file.originalname, cleanBuf)
    const fileMeta = extractFileMetadata(req.file.originalname, req.file.buffer)

    res.json({
      format: result.meta.format,
      version: result.meta.version,
      total_scenes: result.meta.total_scenes,
      total_textelemente: result.meta.total_textelemente,
      charaktere: result.meta.charaktere,
      warnings: result.meta.warnings,
      szenen: result.szenen,
      file_metadata: fileMeta,
      watermark_found: wmPayload !== null,
      rote_rosen_meta: result.meta.roteRosenMeta || null,
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

    let stage_type = req.body.stage_type || 'draft'
    const validStageTypes = ['expose', 'treatment', 'draft', 'final']
    if (!validStageTypes.includes(stage_type)) {
      return res.status(400).json({ error: `Ungültiger stage_type: ${stage_type}` })
    }

    // Strip watermark before parsing
    const rawText   = req.file.buffer.toString('utf8')
    const cleanText = stripWatermark(rawText)
    const cleanBuf  = Buffer.from(cleanText, 'utf8')

    const result    = await parseScript(req.file.originalname, cleanBuf)

    // Auto-detect stage_type from Rote-Rosen metadata if not explicitly set
    if (result.meta.roteRosenMeta && !req.body.stage_type) {
      const rrDocType = result.meta.roteRosenMeta.document_type
      if (rrDocType === 'treatment') stage_type = 'treatment'
      else if (rrDocType === 'drehbuch') stage_type = 'draft'
    }
    const fileMeta  = extractFileMetadata(req.file.originalname, req.file.buffer)
    const saveMetadata = req.body.save_metadata === 'true'

    // Build meta_json for the stage
    const metaJson: Record<string, any> = {}
    if (saveMetadata && Object.keys(fileMeta).length > 0) {
      metaJson.import_metadata = {
        ...fileMeta,
        source_filename: req.file.originalname,
        imported_at: new Date().toISOString(),
        imported_by: req.user!.name || req.user!.user_id,
      }
    }

    const stage = await queryOne(
      `INSERT INTO stages (staffel_id, folge_nummer, proddb_block_id, stage_type, version_label, erstellt_von, meta_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [staffel_id, folge_nummer, proddb_block_id, stage_type, `Import: ${req.file.originalname}`, req.user!.name || req.user!.user_id, JSON.stringify(metaJson)]
    )

    if (!stage) return res.status(500).json({ error: 'Stage konnte nicht angelegt werden' })

    // Merge Rote-Rosen metadata into stage meta_json
    if (result.meta.roteRosenMeta) {
      metaJson.rote_rosen = result.meta.roteRosenMeta
      // Update stage meta_json with enriched metadata
      await queryOne(`UPDATE stages SET meta_json = $1 WHERE id = $2`, [JSON.stringify(metaJson), stage.id])
    }

    let scenesImported = 0
    for (const [idx, szene] of result.szenen.entries()) {
      const dauerMin = szene.dauer_sekunden ? Math.round(szene.dauer_sekunden / 60) : null
      await queryOne(
        `INSERT INTO szenen (stage_id, scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung, content, sort_order, spieltag, dauer_min)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [stage.id, szene.nummer, szene.int_ext, szene.tageszeit, szene.ort_name || null, szene.zusammenfassung || null, JSON.stringify(szene.textelemente), idx, szene.spieltag || null, dauerMin]
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
      metadata_saved: saveMetadata && Object.keys(fileMeta).length > 0,
    })
  } catch (err) {
    console.error('Import commit error:', err)
    res.status(500).json({ error: String(err) })
  }
})
