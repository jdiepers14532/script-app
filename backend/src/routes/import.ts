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

    const produktion_id = req.body.produktion_id
    const folge_nummer = parseInt(req.body.folge_nummer)
    const proddb_block_id = req.body.proddb_block_id || null

    if (!produktion_id || isNaN(folge_nummer)) {
      return res.status(400).json({ error: 'produktion_id und folge_nummer erforderlich' })
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

    // Stand-Datum: prefer filename date, fallback to rote-rosen cover date
    const standDatum = filenameMeta.fassungsdatum || null

    // Map stage_type → werkstufen-typ
    const stageToDocTyp: Record<string, string> = {
      treatment: 'storyline', draft: 'drehbuch', expose: 'notiz', final: 'drehbuch',
    }
    const docTyp = stageToDocTyp[stage_type] || 'drehbuch'

    // ── Werkstufen-Modell: folgen → werkstufen → dokument_szenen ──

    // Ensure folgen row exists
    let folge = await queryOne(
      `SELECT id FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2`,
      [produktion_id, folge_nummer]
    )
    if (!folge) {
      folge = await queryOne(
        `INSERT INTO folgen (produktion_id, folge_nummer, erstellt_von)
         VALUES ($1, $2, $3) RETURNING id`,
        [produktion_id, folge_nummer, req.user!.name || req.user!.user_id]
      )
    }

    // Create werkstufe
    const nextWerkVer = await queryOne(
      `SELECT COALESCE(MAX(version_nummer), 0) AS m FROM werkstufen WHERE folge_id = $1 AND typ = $2`,
      [folge.id, docTyp]
    )
    const werkVersionNummer = (nextWerkVer?.m ?? 0) + 1
    const werkstufe = await queryOne(
      `INSERT INTO werkstufen (folge_id, typ, version_nummer, label, sichtbarkeit, erstellt_von, stand_datum)
       VALUES ($1, $2, $3, $4, 'team', $5, $6) RETURNING id`,
      [folge.id, docTyp, werkVersionNummer, versionLabel, req.user!.name || req.user!.user_id, standDatum]
    )

    // Create legacy stage for navigation compatibility
    const nextStageVer = await queryOne(
      `SELECT COALESCE(MAX(version_nummer), 0) AS m FROM stages
       WHERE produktion_id = $1 AND folge_nummer = $2 AND stage_type = $3`,
      [produktion_id, folge_nummer, stage_type]
    )
    const stage = await queryOne(
      `INSERT INTO stages (produktion_id, folge_nummer, proddb_block_id, stage_type,
        version_nummer, version_label, status, erstellt_von, meta_json)
       VALUES ($1, $2, $3, $4, $5, $6, 'in_arbeit', $7, $8) RETURNING id`,
      [produktion_id, folge_nummer, proddb_block_id, stage_type,
       (nextStageVer?.m ?? 0) + 1, versionLabel,
       req.user!.name || req.user!.user_id, JSON.stringify(metaJson)]
    )

    // Create scene_identities + dokument_szenen for each scene
    const sceneIdentityIds: { identityId: string; szeneIdx: number }[] = []
    for (const [idx, szene] of result.szenen.entries()) {
      const stoppzeitSek = szene.dauer_sekunden || null
      const isWechselschnitt = szene.isWechselschnitt || false

      const identity = await queryOne(
        `INSERT INTO scene_identities (folge_id, created_by) VALUES ($1, $2) RETURNING id`,
        [folge.id, req.user!.name || req.user!.user_id]
      )

      // Convert textelemente to ProseMirror format (screenplay_element nodes)
      const pmNodes: any[] = []

      // Scene heading node
      const headingParts = [szene.int_ext, szene.ort_name].filter(Boolean)
      if (szene.tageszeit) headingParts.push(`- ${szene.tageszeit}`)
      const headingText = headingParts.join('. ').replace(/\.\s*-/, ' -') || `SZ ${szene.nummer}`
      pmNodes.push({
        type: 'screenplay_element',
        attrs: { element_type: 'scene_heading' },
        content: [{ type: 'text', text: headingText }],
      })

      // Content nodes
      for (const te of szene.textelemente) {
        const pmType = (['action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot'].includes(te.type))
          ? te.type : 'action'
        pmNodes.push({
          type: 'screenplay_element',
          attrs: { element_type: pmType },
          content: te.text ? [{ type: 'text', text: te.text }] : undefined,
        })
      }

      await queryOne(
        `INSERT INTO dokument_szenen
           (werkstufe_id, scene_identity_id, sort_order, scene_nummer,
            int_ext, tageszeit, ort_name, zusammenfassung, content,
            spieltag, stoppzeit_sek, is_wechselschnitt, szeneninfo,
            format, geloescht, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, $15)`,
        [
          werkstufe.id, identity.id, idx, szene.nummer,
          szene.int_ext, szene.tageszeit, szene.ort_name || null,
          szene.zusammenfassung || null, JSON.stringify(pmNodes),
          szene.spieltag || null, stoppzeitSek, isWechselschnitt,
          szene.szeneninfo || null, docTyp, req.user!.name || req.user!.user_id,
        ]
      )
      sceneIdentityIds.push({ identityId: identity.id, szeneIdx: idx })
    }

    const scenesImported = sceneIdentityIds.length

    // ── Characters: use new characters + character_productions system ──
    // Load existing kategorien for this staffel
    const kategorien = await query(
      `SELECT id, name, typ FROM character_kategorien WHERE produktion_id = $1`,
      [produktion_id]
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
           JOIN character_productions cp ON cp.character_id = c.id AND cp.produktion_id = $2
           WHERE UPPER(c.name) = UPPER($1)`,
          [charName, produktion_id]
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
          `INSERT INTO character_productions (character_id, produktion_id, kategorie_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (character_id, produktion_id) DO NOTHING`,
          [charId, produktion_id, rolleKatId]
        )
        charNameToId.set(charName.toUpperCase(), charId)
      } catch { /* ignore constraint violations */ }
    }

    // Process Komparsen
    // Parse "4x PatientInnen o.T." → { name: "PatientInnen", anzahl: 4, headerOT: true }
    function parseKomparseEntry(raw: string): { name: string; anzahl: number; headerOT: boolean } {
      let rest = raw.trim()
      // Extract "Nx" prefix
      let anzahl = 1
      const countM = rest.match(/^(\d+)x\s+(.+)$/)
      if (countM) { anzahl = parseInt(countM[1], 10); rest = countM[2].trim() }
      // Strip "o.T." suffix
      const headerOT = /\bo\.T\.?\s*$/i.test(rest)
      if (headerOT) rest = rest.replace(/\s*\bo\.T\.?\s*$/i, '').trim()
      return { name: rest, anzahl, headerOT }
    }

    // Analyze scene content to detect spiel_typ for a komparse
    function analyzeKomparseInContent(
      textelemente: any[], kompName: string
    ): { spiel_typ: 'o.t.' | 'spiel' | 'text'; repliken: number } {
      const nameUpper = kompName.toUpperCase()
      // Build stem for fuzzy matching (first 4+ chars, strip plural suffixes)
      const stem = nameUpper
        .replace(/(INNEN|INNEN|EN|ER|E)$/, '')
        .slice(0, Math.max(4, nameUpper.length - 3))

      let repliken = 0
      let mentionedInAction = false

      for (const te of textelemente) {
        if (!te.text) continue
        const textUpper = te.text.toUpperCase()

        if (te.type === 'character') {
          // Exact match on character field or text
          const charField = (te.character || te.text || '').toUpperCase()
          if (charField === nameUpper || charField.includes(nameUpper) ||
              (stem.length >= 4 && charField.includes(stem))) {
            repliken++
          }
        } else if (te.type === 'action') {
          if (textUpper.includes(nameUpper) ||
              (stem.length >= 4 && textUpper.includes(stem))) {
            mentionedInAction = true
          }
        }
      }

      if (repliken > 0) return { spiel_typ: 'text', repliken }
      if (mentionedInAction) return { spiel_typ: 'spiel', repliken: 0 }
      return { spiel_typ: 'o.t.', repliken: 0 }
    }

    const allKomparsenNames = new Set<string>()
    for (const szene of result.szenen) {
      if (szene.komparsen) {
        for (const k of szene.komparsen) {
          const { name } = parseKomparseEntry(k)
          if (name) allKomparsenNames.add(name)
        }
      }
    }

    let komparsenCreated = 0
    for (const kompCleanName of allKomparsenNames) {
      if (!kompCleanName) continue
      try {
        let existing = await queryOne(
          `SELECT c.id FROM characters c
           JOIN character_productions cp ON cp.character_id = c.id AND cp.produktion_id = $2
           WHERE UPPER(c.name) = UPPER($1)`,
          [kompCleanName, produktion_id]
        )
        if (existing) {
          charNameToId.set(kompCleanName.toUpperCase(), existing.id)
          continue
        }

        existing = await queryOne(
          `SELECT id FROM characters WHERE UPPER(name) = UPPER($1)`,
          [kompCleanName]
        )

        let charId: string
        if (existing) {
          charId = existing.id
        } else {
          const newChar = await queryOne(
            `INSERT INTO characters (name, meta_json) VALUES ($1, $2) RETURNING id`,
            [kompCleanName, JSON.stringify({ import_auto_created: true, is_komparse: true, import_source: req.file!.originalname })]
          )
          charId = newChar.id
          komparsenCreated++
        }

        await queryOne(
          `INSERT INTO character_productions (character_id, produktion_id, kategorie_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (character_id, produktion_id) DO NOTHING`,
          [charId, produktion_id, komparseKatId]
        )
        charNameToId.set(kompCleanName.toUpperCase(), charId)
      } catch { /* ignore constraint violations */ }
    }

    // ── Scene-Characters linking (via scene_identity_id) ──
    for (const { identityId, szeneIdx } of sceneIdentityIds) {
      const szene = result.szenen[szeneIdx]
      // Link Rollen (with content analysis for spiel_typ + repliken)
      for (const charName of szene.charaktere) {
        const charId = charNameToId.get(charName.toUpperCase())
        if (!charId) continue
        const analysis = analyzeKomparseInContent(szene.textelemente, charName)
        // Named roles are at minimum 'spiel'
        const spiel_typ = analysis.spiel_typ === 'text' ? 'text' : 'spiel'
        try {
          await queryOne(
            `INSERT INTO scene_characters
              (scene_identity_id, character_id, kategorie_id, spiel_typ, repliken_anzahl, werkstufe_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (werkstufe_id, scene_identity_id, character_id)
               WHERE werkstufe_id IS NOT NULL AND scene_identity_id IS NOT NULL DO NOTHING`,
            [identityId, charId, rolleKatId, spiel_typ, analysis.repliken, werkstufe.id]
          )
        } catch { /* ignore */ }
      }
      // Link Komparsen (anzahl, spiel_typ from content analysis, header_o_t flag)
      if (szene.komparsen) {
        for (const kompRaw of szene.komparsen) {
          const { name: kompCleanName, anzahl, headerOT } = parseKomparseEntry(kompRaw)
          const charId = charNameToId.get(kompCleanName.toUpperCase())
          if (!charId) continue

          // Content analysis: can upgrade o.t. → spiel → text
          const analysis = analyzeKomparseInContent(szene.textelemente, kompCleanName)
          // Header o.T. → start at o.t.; content can always upgrade to 'text' (Dialog found)
          // but action-mention alone doesn't override an explicit o.T. header
          // Header without o.T. → start at spiel; content can upgrade to 'text'
          let spiel_typ: string = headerOT ? 'o.t.' : 'spiel'
          if (analysis.spiel_typ === 'text') spiel_typ = 'text'
          else if (analysis.spiel_typ === 'spiel' && !headerOT) spiel_typ = 'spiel'

          try {
            await queryOne(
              `INSERT INTO scene_characters
                (scene_identity_id, character_id, kategorie_id, anzahl,
                 spiel_typ, repliken_anzahl, header_o_t, werkstufe_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (werkstufe_id, scene_identity_id, character_id)
                 WHERE werkstufe_id IS NOT NULL AND scene_identity_id IS NOT NULL DO NOTHING`,
              [identityId, charId, komparseKatId, anzahl,
               spiel_typ, analysis.repliken, headerOT, werkstufe.id]
            )
          } catch { /* ignore */ }
        }
      }
    }

    // ── Motive: parse ort_name → drehort / motiv / untermotiv ──
    // Normalize "A.D." and "A. D." prefixes to "Außendreh"
    function normalizeOrtName(raw: string): string {
      return raw.replace(/^A\.\s*D\.\s*/i, 'Außendreh / ').replace(/\s*\/\s*/g, ' / ')
    }

    function parseOrtName(raw: string): { drehortLabel: string | null; motivName: string; untermotivName: string | null } {
      const normalized = normalizeOrtName(raw)
      const parts = normalized.split(' / ').map(p => p.trim()).filter(Boolean)
      if (parts.length >= 3) {
        return { drehortLabel: parts[0], motivName: parts[1], untermotivName: parts.slice(2).join(' / ') }
      }
      if (parts.length === 2) {
        // Check if first part looks like a Drehort label (Stu., Außendreh, etc.)
        const isDrehort = /^(Stu\.|Studio|Außendreh|Innendreh)/i.test(parts[0])
        if (isDrehort) return { drehortLabel: parts[0], motivName: parts[1], untermotivName: null }
        // Otherwise treat as motiv / untermotiv
        return { drehortLabel: null, motivName: parts[0], untermotivName: parts[1] }
      }
      return { drehortLabel: null, motivName: parts[0] || raw, untermotivName: null }
    }

    // Cache drehort IDs
    const drehortCache = new Map<string, string>()
    async function getOrCreateDrehort(label: string): Promise<string> {
      const key = label.toUpperCase()
      if (drehortCache.has(key)) return drehortCache.get(key)!
      let row = await queryOne(
        `SELECT id FROM drehorte WHERE produktion_id = $1 AND UPPER(label) = UPPER($2)`,
        [produktion_id, label]
      )
      if (!row) {
        row = await queryOne(
          `INSERT INTO drehorte (produktion_id, label) VALUES ($1, $2)
           ON CONFLICT (produktion_id, label) DO UPDATE SET label = EXCLUDED.label RETURNING id`,
          [produktion_id, label]
        )
      }
      drehortCache.set(key, row.id)
      return row.id
    }

    // Cache motiv IDs (key = parentId|name)
    const motivCache = new Map<string, string>()
    let motiveCreated = 0

    for (const szene of result.szenen) {
      if (!szene.ort_name) continue
      try {
        const { drehortLabel, motivName, untermotivName } = parseOrtName(szene.ort_name)
        const drehortId = drehortLabel ? await getOrCreateDrehort(drehortLabel) : null
        const motivTyp = szene.int_ext === 'EXT' ? 'exterior' : 'interior'

        // Get or create main motiv
        const motivKey = `|${motivName.toUpperCase()}`
        let motivId: string
        if (motivCache.has(motivKey)) {
          motivId = motivCache.get(motivKey)!
        } else {
          let existing = await queryOne(
            `SELECT id FROM motive WHERE produktion_id = $1 AND UPPER(name) = UPPER($2) AND parent_id IS NULL`,
            [produktion_id, motivName]
          )
          if (!existing) {
            existing = await queryOne(
              `INSERT INTO motive (produktion_id, name, typ, drehort_id, meta_json)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [produktion_id, motivName, motivTyp, untermotivName ? null : drehortId,
               JSON.stringify({ import_auto_created: true, import_source: req.file!.originalname })]
            )
            motiveCreated++
          } else if (drehortId && !untermotivName) {
            // Update drehort if not yet set
            await query(`UPDATE motive SET drehort_id = COALESCE(drehort_id, $1) WHERE id = $2`, [drehortId, existing.id])
          }
          motivId = existing.id
          motivCache.set(motivKey, motivId)
        }

        // Get or create untermotiv if present
        if (untermotivName) {
          const unterKey = `${motivId}|${untermotivName.toUpperCase()}`
          if (!motivCache.has(unterKey)) {
            let existing = await queryOne(
              `SELECT id FROM motive WHERE produktion_id = $1 AND UPPER(name) = UPPER($2) AND parent_id = $3`,
              [produktion_id, untermotivName, motivId]
            )
            if (!existing) {
              existing = await queryOne(
                `INSERT INTO motive (produktion_id, name, typ, parent_id, drehort_id, meta_json)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [produktion_id, untermotivName, motivTyp, motivId, drehortId,
                 JSON.stringify({ import_auto_created: true, import_source: req.file!.originalname })]
              )
              motiveCreated++
            } else if (drehortId) {
              await query(`UPDATE motive SET drehort_id = COALESCE(drehort_id, $1) WHERE id = $2`, [drehortId, existing.id])
            }
            motivCache.set(unterKey, existing.id)
          }
        }
      } catch { /* ignore constraint violations */ }
    }

    res.json({
      folge_id: folge.id,
      werkstufe_id: werkstufe.id,
      stage_id: stage.id,
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
