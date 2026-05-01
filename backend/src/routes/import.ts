import { Router } from 'express'
import multer from 'multer'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { detectFormat, parseScript } from '../importers'
import { stripWatermark, decodeWatermarkFromText } from '../utils/watermark'
import { parseFilename } from '../importers/roteRosen'

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

    // Strip watermark before parsing (text formats only — PDFs are binary)
    const isPdf = req.file.originalname.toLowerCase().endsWith('.pdf')
    let parseBuffer = req.file.buffer
    let wmPayload: any = null
    if (!isPdf) {
      const rawText  = req.file.buffer.toString('utf8')
      wmPayload = decodeWatermarkFromText(rawText)
      const cleanText = stripWatermark(rawText)
      parseBuffer  = Buffer.from(cleanText, 'utf8')
    }

    const result   = await parseScript(req.file.originalname, parseBuffer)
    const fileMeta = extractFileMetadata(req.file.originalname, req.file.buffer)
    const filenameMeta = parseFilename(req.file.originalname)

    // Collect all unique komparsen across scenes
    const allKomparsen: string[] = []
    for (const sz of result.szenen) {
      if (sz.komparsen) {
        for (const k of sz.komparsen) {
          if (!allKomparsen.includes(k)) allKomparsen.push(k)
        }
      }
    }

    // Collect all unique motive (ort_name)
    const allMotive: string[] = []
    for (const sz of result.szenen) {
      if (sz.ort_name && !allMotive.includes(sz.ort_name)) allMotive.push(sz.ort_name)
    }

    res.json({
      format: result.meta.format,
      version: result.meta.version,
      total_scenes: result.meta.total_scenes,
      total_textelemente: result.meta.total_textelemente,
      charaktere: result.meta.charaktere,
      komparsen: allKomparsen,
      motive: allMotive,
      warnings: result.meta.warnings,
      szenen: result.szenen,
      file_metadata: fileMeta,
      filename_metadata: filenameMeta,
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

    // Strip watermark before parsing (text formats only — PDFs are binary)
    const isPdf = req.file.originalname.toLowerCase().endsWith('.pdf')
    let parseBuffer = req.file.buffer
    if (!isPdf) {
      const rawText   = req.file.buffer.toString('utf8')
      const cleanText = stripWatermark(rawText)
      parseBuffer  = Buffer.from(cleanText, 'utf8')
    }

    const result    = await parseScript(req.file.originalname, parseBuffer)

    // Auto-detect stage_type from Rote-Rosen metadata if not explicitly set
    if (result.meta.roteRosenMeta && !req.body.stage_type) {
      const rrDocType = result.meta.roteRosenMeta.document_type
      if (rrDocType === 'treatment') stage_type = 'treatment'
      else if (rrDocType === 'drehbuch') stage_type = 'draft'
    }
    const fileMeta  = extractFileMetadata(req.file.originalname, req.file.buffer)
    const filenameMeta = parseFilename(req.file.originalname)
    const saveMetadata = req.body.save_metadata === 'true'

    // Build meta_json for the stage
    const metaJson: Record<string, any> = {
      source_filename: req.file.originalname,
      imported_at: new Date().toISOString(),
      imported_by: req.user!.name || req.user!.user_id,
    }
    if (saveMetadata && Object.keys(fileMeta).length > 0) {
      metaJson.import_metadata = fileMeta
    }
    if (Object.keys(filenameMeta).length > 0) {
      metaJson.filename_metadata = filenameMeta
    }
    if (result.meta.roteRosenMeta) {
      metaJson.rote_rosen = result.meta.roteRosenMeta
    }

    // Build version_label from filename date or generic label
    let versionLabel = `Import: ${req.file.originalname}`
    if (filenameMeta.fassungsdatum) {
      versionLabel = `Import ${filenameMeta.fassungsdatum}`
    }

    const stage = await queryOne(
      `INSERT INTO stages (staffel_id, folge_nummer, proddb_block_id, stage_type, version_label, erstellt_von, meta_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [staffel_id, folge_nummer, proddb_block_id, stage_type, versionLabel, req.user!.name || req.user!.user_id, JSON.stringify(metaJson)]
    )

    if (!stage) return res.status(500).json({ error: 'Stage konnte nicht angelegt werden' })

    // ── Insert scenes + collect IDs for scene_characters linking ──
    let scenesImported = 0
    const szeneIds: { szeneDbId: number; szeneIdx: number }[] = []
    for (const [idx, szene] of result.szenen.entries()) {
      const dauerMin = szene.dauer_sekunden ? Math.round(szene.dauer_sekunden / 60) : null
      const dauerSek = szene.dauer_sekunden || null
      const isWechselschnitt = szene.isWechselschnitt || false
      const inserted = await queryOne(
        `INSERT INTO szenen (stage_id, scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung, content, sort_order, spieltag, dauer_min, dauer_sek, is_wechselschnitt, szeneninfo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [stage.id, szene.nummer, szene.int_ext, szene.tageszeit, szene.ort_name || null, szene.zusammenfassung || null, JSON.stringify(szene.textelemente), idx, szene.spieltag || null, dauerMin, dauerSek, isWechselschnitt, szene.szeneninfo || null]
      )
      if (inserted) szeneIds.push({ szeneDbId: inserted.id, szeneIdx: idx })
      scenesImported++
    }

    // ── Dual-write: new dokument_szenen system (parallel to stages+szenen) ──
    // Map stage_type → dokument-typ
    const stageToDocTyp: Record<string, string> = {
      treatment: 'storyline', draft: 'drehbuch', expose: 'notiz', final: 'drehbuch',
    }
    const docTyp = stageToDocTyp[stage_type] || 'drehbuch'

    // Ensure folgen_meta exists
    await queryOne(
      `INSERT INTO folgen_meta (staffel_id, folge_nummer) VALUES ($1, $2)
       ON CONFLICT (staffel_id, folge_nummer) DO NOTHING`,
      [staffel_id, folge_nummer]
    )

    // Create or find folgen_dokument
    let dokument = await queryOne(
      `SELECT id FROM folgen_dokumente WHERE staffel_id = $1 AND folge_nummer = $2 AND typ = $3`,
      [staffel_id, folge_nummer, docTyp]
    )
    if (!dokument) {
      dokument = await queryOne(
        `INSERT INTO folgen_dokumente (staffel_id, folge_nummer, typ, erstellt_von)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [staffel_id, folge_nummer, docTyp, req.user!.name || req.user!.user_id]
      )
    }

    // Create new fassung
    const setting = await queryOne(`SELECT value FROM app_settings WHERE key = 'fassungs_nummerierung_modus'`)
    const modus = setting?.value ?? 'global'
    let nextFassungNr = 1
    if (modus === 'global') {
      const cnt = await queryOne(
        `SELECT COALESCE(MAX(f.fassung_nummer), 0) AS m
         FROM folgen_dokument_fassungen f
         JOIN folgen_dokumente d ON d.id = f.dokument_id
         WHERE d.staffel_id = $1 AND d.folge_nummer = $2`,
        [staffel_id, folge_nummer]
      )
      nextFassungNr = (cnt?.m ?? 0) + 1
    } else {
      const cnt = await queryOne(
        `SELECT COALESCE(MAX(fassung_nummer), 0) AS m FROM folgen_dokument_fassungen WHERE dokument_id = $1`,
        [dokument.id]
      )
      nextFassungNr = (cnt?.m ?? 0) + 1
    }

    const fassung = await queryOne(
      `INSERT INTO folgen_dokument_fassungen
         (dokument_id, fassung_nummer, fassung_label, sichtbarkeit, erstellt_von)
       VALUES ($1, $2, $3, 'alle', $4) RETURNING id`,
      [dokument.id, nextFassungNr, versionLabel, req.user!.name || req.user!.user_id]
    )

    // Create scene_identities + dokument_szenen for each scene
    const sceneIdentityIds: { identityId: string; szeneIdx: number }[] = []
    for (const [idx, szene] of result.szenen.entries()) {
      const dauerMin = szene.dauer_sekunden ? Math.round(szene.dauer_sekunden / 60) : null
      const dauerSek = szene.dauer_sekunden || null
      const isWechselschnitt = szene.isWechselschnitt || false

      const identity = await queryOne(
        `INSERT INTO scene_identities (staffel_id, created_by) VALUES ($1, $2) RETURNING id`,
        [staffel_id, req.user!.name || req.user!.user_id]
      )

      await queryOne(
        `INSERT INTO dokument_szenen
           (fassung_id, scene_identity_id, sort_order, scene_nummer,
            int_ext, tageszeit, ort_name, zusammenfassung, content,
            spieltag, dauer_min, dauer_sek, is_wechselschnitt, szeneninfo,
            updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          fassung.id, identity.id, idx, szene.nummer,
          szene.int_ext, szene.tageszeit, szene.ort_name || null,
          szene.zusammenfassung || null, JSON.stringify(szene.textelemente),
          szene.spieltag || null, dauerMin, dauerSek, isWechselschnitt,
          szene.szeneninfo || null, req.user!.name || req.user!.user_id,
        ]
      )
      sceneIdentityIds.push({ identityId: identity.id, szeneIdx: idx })
    }

    // ── Characters: use new characters + character_productions system ──
    // Load existing kategorien for this staffel
    const kategorien = await query(
      `SELECT id, name, typ FROM character_kategorien WHERE staffel_id = $1`,
      [staffel_id]
    )
    const rolleKatId = kategorien.find((k: any) => k.name === 'Episoden-Rolle')?.id
      || kategorien.find((k: any) => k.typ === 'rolle')?.id || null
    const komparseKatId = kategorien.find((k: any) => k.name === 'Komparse o.T.')?.id
      || kategorien.find((k: any) => k.typ === 'komparse')?.id || null

    // Map character name → character UUID (for scene_characters linking)
    const charNameToId = new Map<string, string>()
    let charactersCreated = 0

    // Process Rollen (named characters)
    for (const charName of result.meta.charaktere) {
      if (!charName.trim()) continue
      try {
        // Check if character already exists (case-insensitive)
        let existing = await queryOne(
          `SELECT c.id FROM characters c
           JOIN character_productions cp ON cp.character_id = c.id AND cp.staffel_id = $2
           WHERE UPPER(c.name) = UPPER($1)`,
          [charName, staffel_id]
        )
        if (existing) {
          charNameToId.set(charName.toUpperCase(), existing.id)
          continue
        }

        // Also check globally (might exist in another staffel)
        existing = await queryOne(
          `SELECT id FROM characters WHERE UPPER(name) = UPPER($1)`,
          [charName]
        )

        let charId: string
        if (existing) {
          charId = existing.id
        } else {
          // Create new character, flagged as import_auto_created
          const newChar = await queryOne(
            `INSERT INTO characters (name, meta_json) VALUES ($1, $2) RETURNING id`,
            [charName, JSON.stringify({ import_auto_created: true, import_source: req.file!.originalname })]
          )
          charId = newChar.id
          charactersCreated++
        }

        // Link to staffel (upsert)
        await queryOne(
          `INSERT INTO character_productions (character_id, staffel_id, kategorie_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (character_id, staffel_id) DO NOTHING`,
          [charId, staffel_id, rolleKatId]
        )
        charNameToId.set(charName.toUpperCase(), charId)
      } catch { /* ignore constraint violations */ }
    }

    // Process Komparsen
    const allKomparsen = new Set<string>()
    for (const szene of result.szenen) {
      if (szene.komparsen) {
        for (const k of szene.komparsen) allKomparsen.add(k)
      }
    }

    let komparsenCreated = 0
    for (const kompName of allKomparsen) {
      if (!kompName.trim()) continue
      try {
        let existing = await queryOne(
          `SELECT c.id FROM characters c
           JOIN character_productions cp ON cp.character_id = c.id AND cp.staffel_id = $2
           WHERE UPPER(c.name) = UPPER($1)`,
          [kompName, staffel_id]
        )
        if (existing) {
          charNameToId.set(kompName.toUpperCase(), existing.id)
          continue
        }

        existing = await queryOne(
          `SELECT id FROM characters WHERE UPPER(name) = UPPER($1)`,
          [kompName]
        )

        let charId: string
        if (existing) {
          charId = existing.id
        } else {
          const newChar = await queryOne(
            `INSERT INTO characters (name, meta_json) VALUES ($1, $2) RETURNING id`,
            [kompName, JSON.stringify({ import_auto_created: true, is_komparse: true, import_source: req.file!.originalname })]
          )
          charId = newChar.id
          komparsenCreated++
        }

        await queryOne(
          `INSERT INTO character_productions (character_id, staffel_id, kategorie_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (character_id, staffel_id) DO NOTHING`,
          [charId, staffel_id, komparseKatId]
        )
        charNameToId.set(kompName.toUpperCase(), charId)
      } catch { /* ignore constraint violations */ }
    }

    // ── Scene-Characters linking ──
    // Build szeneIdx → identityId map
    const idxToIdentity = new Map<number, string>()
    for (const { identityId, szeneIdx } of sceneIdentityIds) {
      idxToIdentity.set(szeneIdx, identityId)
    }

    for (const { szeneDbId, szeneIdx } of szeneIds) {
      const szene = result.szenen[szeneIdx]
      const identityId = idxToIdentity.get(szeneIdx) || null
      // Link Rollen
      for (const charName of szene.charaktere) {
        const charId = charNameToId.get(charName.toUpperCase())
        if (!charId) continue
        try {
          await queryOne(
            `INSERT INTO scene_characters (szene_id, character_id, kategorie_id, scene_identity_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (szene_id, character_id) DO NOTHING`,
            [szeneDbId, charId, rolleKatId, identityId]
          )
        } catch { /* ignore */ }
      }
      // Link Komparsen
      if (szene.komparsen) {
        for (const kompName of szene.komparsen) {
          const charId = charNameToId.get(kompName.toUpperCase())
          if (!charId) continue
          try {
            await queryOne(
              `INSERT INTO scene_characters (szene_id, character_id, kategorie_id, scene_identity_id)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (szene_id, character_id) DO NOTHING`,
              [szeneDbId, charId, komparseKatId, identityId]
            )
          } catch { /* ignore */ }
        }
      }
    }

    // ── Motive: auto-create from ort_name ──
    let motiveCreated = 0
    for (const szene of result.szenen) {
      if (!szene.ort_name) continue
      try {
        const existing = await queryOne(
          `SELECT id FROM motive WHERE staffel_id = $1 AND UPPER(name) = UPPER($2)`,
          [staffel_id, szene.ort_name]
        )
        if (!existing) {
          const motivTyp = szene.int_ext === 'EXT' ? 'exterior' : 'interior'
          await queryOne(
            `INSERT INTO motive (staffel_id, name, typ, meta_json) VALUES ($1, $2, $3, $4)`,
            [staffel_id, szene.ort_name, motivTyp, JSON.stringify({ import_auto_created: true, import_source: req.file!.originalname })]
          )
          motiveCreated++
        }
      } catch { /* ignore constraint violations */ }
    }

    res.json({
      stage_id: stage.id,
      dokument_id: dokument.id,
      fassung_id: fassung.id,
      scenes_imported: scenesImported,
      characters_created: charactersCreated,
      komparsen_created: komparsenCreated,
      motive_created: motiveCreated,
      warnings: result.meta.warnings,
      metadata_saved: saveMetadata && Object.keys(fileMeta).length > 0,
    })
  } catch (err) {
    console.error('Import commit error:', err)
    res.status(500).json({ error: String(err) })
  }
})
