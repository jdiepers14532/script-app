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

// Parse "4x PatientInnen o.T." → { name, anzahl, headerOT }
function parseKomparseEntry(raw: string): { name: string; anzahl: number; headerOT: boolean } {
  let rest = raw.trim()
  let anzahl = 1
  const countM = rest.match(/^(\d+)x\s+(.+)$/)
  if (countM) { anzahl = parseInt(countM[1], 10); rest = countM[2].trim() }
  const headerOT = /\bo\.T\.?\s*$/i.test(rest)
  if (headerOT) rest = rest.replace(/\s*\bo\.T\.?\s*$/i, '').trim()
  return { name: rest, anzahl, headerOT }
}

// Analyze scene textelemente for a character/komparse: spiel_typ + repliken count
function analyzeInContent(
  textelemente: any[], charName: string
): { spiel_typ: 'o.t.' | 'spiel' | 'text'; repliken: number } {
  const nameUpper = charName.toUpperCase()
  const stem = nameUpper
    .replace(/(INNEN|INNEN|EN|ER|E)$/, '')
    .slice(0, Math.max(4, nameUpper.length - 3))

  let repliken = 0
  let mentionedInAction = false

  for (const te of textelemente) {
    if (!te.text) continue
    const textUpper = te.text.toUpperCase()

    if (te.type === 'character') {
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

// ── Rich-Text builder for non-scene elements ──

function textNode(text: string, marks?: Array<{ type: string }>): any {
  const node: any = { type: 'text', text }
  if (marks && marks.length > 0) node.marks = marks
  return node
}

function para(content?: any[]): any {
  if (!content || content.length === 0) return { type: 'paragraph' }
  return { type: 'paragraph', content }
}

function heading(text: string, level: number): any {
  return { type: 'heading', attrs: { level }, content: [textNode(text, [{ type: 'bold' }])] }
}

/** Parse text with UPPERCASE names → bold marks */
function richTextWithBoldNames(text: string): any[] {
  const parts: any[] = []
  // Match ALL-CAPS words (2+ chars, may include hyphens) that are character names
  const re = /\b([A-ZÄÖÜ][A-ZÄÖÜ\-]{1,})\b/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(textNode(text.slice(lastIndex, m.index)))
    parts.push(textNode(m[1], [{ type: 'bold' }]))
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) parts.push(textNode(text.slice(lastIndex)))
  return parts.length > 0 ? parts : [textNode(text)]
}

/** Merge consecutive non-empty lines into paragraphs, split on empty lines */
function textToParagraphs(text: string, boldNames = false): any[] {
  const nodes: any[] = []
  const rawLines = text.split('\n')
  let currentPara = ''
  for (const line of rawLines) {
    if (line.trim() === '') {
      if (currentPara) {
        const t = currentPara.trim()
        nodes.push(boldNames ? para(richTextWithBoldNames(t)) : para([textNode(t)]))
        currentPara = ''
      } else {
        nodes.push(para())
      }
    } else {
      currentPara += (currentPara ? ' ' : '') + line.trim()
    }
  }
  if (currentPara) {
    const t = currentPara.trim()
    nodes.push(boldNames ? para(richTextWithBoldNames(t)) : para([textNode(t)]))
  }
  return nodes.length > 0 ? nodes : [para()]
}

function buildNonSceneContent(type: string, content: string): any[] {
  if (!content) return [para()]

  if (type === 'cover') {
    // Cover: key-value pairs separated by " · "
    const nodes: any[] = []
    const parts = content.split(' · ')
    // Title line (first 2-3 parts: Staffel, Episode, Block)
    const titleParts = parts.filter(p => /^(Staffel|Episode|Block)\b/.test(p))
    const metaParts = parts.filter(p => !/^(Staffel|Episode|Block)\b/.test(p))
    if (titleParts.length > 0) {
      nodes.push(heading(titleParts.join(' · '), 2))
    }
    for (const p of metaParts) {
      const colonIdx = p.indexOf(':')
      if (colonIdx > 0) {
        const label = p.slice(0, colonIdx + 1)
        const value = p.slice(colonIdx + 1).trim()
        nodes.push(para([textNode(label + ' ', [{ type: 'bold' }]), textNode(value)]))
      } else if (p.trim()) {
        nodes.push(para([textNode(p.trim())]))
      }
    }
    return nodes.length > 0 ? nodes : [para()]
  }

  if (type === 'synopsis') {
    // Synopsis: merge lines, bold UPPERCASE character names
    return textToParagraphs(content, true)
  }

  if (type === 'memo') {
    // Recaps/Precaps: numbered items — each "N. ..." is a paragraph
    const lines = content.split('\n')
    const nodes: any[] = []
    let currentItem = ''
    for (const line of lines) {
      const t = line.trim()
      if (/^\d+\./.test(t) && currentItem) {
        nodes.push(para(richTextWithBoldNames(currentItem.trim())))
        currentItem = t
      } else {
        currentItem += (currentItem ? ' ' : '') + t
      }
    }
    if (currentItem) nodes.push(para(richTextWithBoldNames(currentItem.trim())))
    return nodes.length > 0 ? nodes : [para()]
  }

  // Fallback: plain paragraphs
  return textToParagraphs(content)
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

    // Enrich szenen with repliken counts + komparsen detail
    const enrichedSzenen = result.szenen.map((sz: any) => {
      // Rollen: count repliken per character
      const charaktere_detail = (sz.charaktere || []).map((name: string) => {
        const analysis = analyzeInContent(sz.textelemente || [], name)
        return { name, repliken: analysis.repliken }
      })

      // Komparsen: parse entry + analyze content
      const komparsen_detail = (sz.komparsen || []).map((raw: string) => {
        const { name, anzahl, headerOT } = parseKomparseEntry(raw)
        const analysis = analyzeInContent(sz.textelemente || [], name)
        let hat_spiel = false
        let hat_text = false
        if (analysis.spiel_typ === 'text') { hat_text = true; hat_spiel = true }
        else if (analysis.spiel_typ === 'spiel') { hat_spiel = true }
        else if (!headerOT) { hat_spiel = true } // no o.T. in header → assume spiel
        return { name, anzahl, hat_spiel, hat_text, repliken: analysis.repliken }
      })

      return { ...sz, charaktere_detail, komparsen_detail }
    })

    res.json({
      format: result.meta.format,
      version: result.meta.version,
      total_scenes: result.meta.total_scenes,
      total_textelemente: result.meta.total_textelemente,
      charaktere: result.meta.charaktere,
      komparsen: allKomparsen,
      motive: allMotive,
      warnings: result.meta.warnings,
      szenen: enrichedSzenen,
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

    // Stand-Datum: prefer frontend override, then filename date
    const standDatum = req.body.stand_datum || filenameMeta.fassungsdatum || null

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

    // Parse frontend scene overrides (field corrections)
    let sceneOverrides: Record<number, Record<string, any>> = {}
    if (req.body.scene_overrides) {
      try { sceneOverrides = JSON.parse(req.body.scene_overrides) } catch {}
    }

    // Create scene_identities + dokument_szenen for each scene
    const sceneIdentityIds: { identityId: string; szeneIdx: number }[] = []
    for (const [idx, szene] of result.szenen.entries()) {
      const ov = sceneOverrides[idx] || {}
      const intExt = ov.int_ext ?? szene.int_ext
      const tageszeit = ov.tageszeit ?? szene.tageszeit
      const ortName = ov.ort_name ?? szene.ort_name
      const spieltag = ov.spieltag ?? szene.spieltag
      const zusammenfassung = ov.zusammenfassung ?? szene.zusammenfassung
      const szeneninfo = ov.szeneninfo ?? szene.szeneninfo
      const stoppzeitSek = ov.dauer_sekunden ?? szene.dauer_sekunden ?? null
      // Per-scene format override (display label → DB value)
      const formatMap: Record<string, string> = { 'Drehbuch': 'drehbuch', 'Storyline': 'storyline', 'Notiz': 'notiz' }
      const sceneFormat = ov.format ? (formatMap[ov.format] || docTyp) : docTyp
      // Override charaktere/komparsen lists if provided
      if (ov.charaktere && Array.isArray(ov.charaktere)) szene.charaktere = ov.charaktere
      if (ov.komparsen && Array.isArray(ov.komparsen)) szene.komparsen = ov.komparsen
      const isWechselschnitt = szene.isWechselschnitt || false

      const identity = await queryOne(
        `INSERT INTO scene_identities (folge_id, created_by) VALUES ($1, $2) RETURNING id`,
        [folge.id, req.user!.name || req.user!.user_id]
      )

      // Convert textelemente to ProseMirror format (screenplay_element nodes)
      const pmNodes: any[] = []

      // Scene heading node
      const headingParts = [intExt, ortName].filter(Boolean)
      if (tageszeit) headingParts.push(`- ${tageszeit}`)
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
          intExt, tageszeit, ortName || null,
          zusammenfassung || null, JSON.stringify(pmNodes),
          spieltag || null, stoppzeitSek, isWechselschnitt,
          szeneninfo || null, sceneFormat, req.user!.name || req.user!.user_id,
        ]
      )
      sceneIdentityIds.push({ identityId: identity.id, szeneIdx: idx })
    }

    const scenesImported = sceneIdentityIds.length

    // ── Non-scene elements (cover, synopsis, memo) ──
    let nonSceneCount = 0
    const rawNonSceneElements = req.body.non_scene_elements
    if (rawNonSceneElements) {
      try {
        const nonSceneElements: Array<{ type: string; label: string; content: string }> = JSON.parse(rawNonSceneElements)
        for (const [nsIdx, elem] of nonSceneElements.entries()) {
          const elemType = ['cover', 'synopsis', 'memo'].includes(elem.type) ? elem.type : 'memo'
          const pmNodes = buildNonSceneContent(elem.type, elem.content)
          await queryOne(
            `INSERT INTO dokument_szenen
               (werkstufe_id, scene_identity_id, sort_order, scene_nummer,
                content, format, element_type, geloescht, updated_by, zusammenfassung)
             VALUES ($1, NULL, $2, NULL, $3, 'notiz', $4, false, $5, $6)`,
            [
              werkstufe.id, -(nonSceneElements.length - nsIdx), JSON.stringify(pmNodes),
              elemType, req.user!.name || req.user!.user_id, elem.label,
            ]
          )
          nonSceneCount++
        }
      } catch { /* ignore parse errors */ }
    }

    // ── Characters: use new characters + character_productions system ──
    // Load existing kategorien for this staffel — auto-create defaults if empty
    let kategorien = await query(
      `SELECT id, name, typ FROM character_kategorien WHERE produktion_id = $1`,
      [produktion_id]
    )
    if (kategorien.length === 0) {
      await query(
        `INSERT INTO character_kategorien (produktion_id, name, typ, sort_order)
         VALUES ($1, 'Episoden-Rolle', 'rolle', 1), ($1, 'Komparse o.T.', 'komparse', 2)
         ON CONFLICT (produktion_id, name) DO NOTHING`,
        [produktion_id]
      )
      kategorien = await query(
        `SELECT id, name, typ FROM character_kategorien WHERE produktion_id = $1`,
        [produktion_id]
      )
    }
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
        const analysis = analyzeInContent(szene.textelemente, charName)
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
          const analysis = analyzeInContent(szene.textelemente, kompCleanName)
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
    // A.D. regex: matches "A.D.", "A. D.", "AD", "A.D", "AD.", "A D" etc.
    const AD_REGEX = /^A\.?\s*D\.?\s+/i

    // Strip A.D. prefix from a name and return { cleanName, isAD }
    function stripAD(name: string): { cleanName: string; isAD: boolean } {
      if (AD_REGEX.test(name)) {
        return { cleanName: name.replace(AD_REGEX, '').trim(), isAD: true }
      }
      return { cleanName: name, isAD: false }
    }

    function normalizeOrtName(raw: string): string {
      return raw.replace(/^A\.?\s*D\.?\s*/i, 'Außendreh / ').replace(/\s*\/\s*/g, ' / ')
    }

    function parseOrtName(raw: string): { drehortLabel: string | null; motivName: string; untermotivName: string | null; isAD: boolean } {
      const normalized = normalizeOrtName(raw)
      const parts = normalized.split(' / ').map(p => p.trim()).filter(Boolean)
      let drehortLabel: string | null = null
      let motivName: string
      let untermotivName: string | null = null
      let isAD = false

      if (parts.length >= 3) {
        drehortLabel = parts[0]; motivName = parts[1]; untermotivName = parts.slice(2).join(' / ')
      } else if (parts.length === 2) {
        const isDrehort = /^(Stu\.|Studio|Außendreh|Innendreh)/i.test(parts[0])
        if (isDrehort) { drehortLabel = parts[0]; motivName = parts[1] }
        else { motivName = parts[0]; untermotivName = parts[1] }
      } else {
        motivName = parts[0] || raw
      }

      // Detect Außendreh from drehort label
      if (drehortLabel && /Außendreh/i.test(drehortLabel)) isAD = true

      // Strip residual A.D. from motiv name (e.g. "A. D. Kurpark" after split)
      const stripped = stripAD(motivName)
      motivName = stripped.cleanName
      if (stripped.isAD) isAD = true

      // Also strip from untermotiv
      if (untermotivName) {
        const strippedUnter = stripAD(untermotivName)
        untermotivName = strippedUnter.cleanName
        if (strippedUnter.isAD) isAD = true
      }

      return { drehortLabel, motivName, untermotivName, isAD }
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
        const { drehortLabel, motivName, untermotivName, isAD } = parseOrtName(szene.ort_name)
        const drehortId = drehortLabel ? await getOrCreateDrehort(drehortLabel) : null
        const motivTyp = szene.int_ext === 'EXT' ? 'exterior' : 'interior'
        const istStudio = !isAD

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
              `INSERT INTO motive (produktion_id, name, typ, drehort_id, ist_studio, meta_json)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [produktion_id, motivName, motivTyp, untermotivName ? null : drehortId, istStudio,
               JSON.stringify({ import_auto_created: true, import_source: req.file!.originalname })]
            )
            motiveCreated++
          } else if (drehortId && !untermotivName) {
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
                `INSERT INTO motive (produktion_id, name, typ, parent_id, drehort_id, ist_studio, meta_json)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [produktion_id, untermotivName, motivTyp, motivId, drehortId, istStudio,
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
      scenes_imported: scenesImported,
      non_scene_elements_imported: nonSceneCount,
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
