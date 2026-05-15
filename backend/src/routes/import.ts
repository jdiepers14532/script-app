import { Router } from 'express'
import multer from 'multer'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { detectFormat, parseScript, ParseOptions } from '../importers'
import { stripWatermark, decodeWatermarkFromText } from '../utils/watermark'
import { parseFilename } from '../importers/roteRosen'
import { calcPageLength } from '../utils/calcPageLength'

const UPLOAD_BASE = process.env.UPLOAD_DIR || '/srv/script/uploads/originals'

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

  if (type === 'titelseite' || type === 'cover') {
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

  if (type === 'memo' || type === 'recap' || type === 'precap') {
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

// ── Parse result cache (avoid double-parse between /preview and /commit) ──
interface ParseCacheEntry { result: any; expiresAt: number }
const parseCache = new Map<string, ParseCacheEntry>()
const CACHE_TTL_MS = 30 * 60 * 1000

function makeParseKey(buffer: Buffer, opts: ParseOptions): string {
  return crypto.createHash('sha256').update(buffer).digest('hex') + ':' + JSON.stringify(opts)
}
function cacheGet(key: string): any | null {
  const entry = parseCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { parseCache.delete(key); return null }
  return entry.result
}
function cacheSet(key: string, result: any): void {
  if (parseCache.size > 50) {
    const now = Date.now()
    for (const [k, v] of parseCache) { if (now > v.expiresAt) parseCache.delete(k) }
  }
  parseCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ── buildPmNodesForScene — module-level for reuse in commit ──
function buildPmNodesForScene(
  textelemente: any[],
  sceneFormat: string,
  docTyp: string,
  useAbsatzNodes: boolean,
  elementTypeToFormatId: Map<string, string>,
  textbausteinFormats: any[],
  absatzformate: any[]
): any[] {
  const pmNodes: any[] = []

  function buildInlineContent(te: any): any[] | undefined {
    if (!te.text && !te.richContent) return undefined
    if (te.richContent && te.richContent.length > 0) {
      return te.richContent.map((n: any) => ({
        type: 'text',
        text: n.text,
        ...(n.marks && n.marks.length > 0 ? { marks: n.marks } : {}),
      }))
    }
    return [{ type: 'text', text: te.text }]
  }

  for (const te of textelemente) {
    let inlineContent = buildInlineContent(te)

    if (sceneFormat === 'notiz' || sceneFormat === 'storyline') {
      if (useAbsatzNodes) {
        let notizFmtId: string | undefined
        if (te.type === 'heading') {
          notizFmtId = elementTypeToFormatId.get('heading')
            || absatzformate.find((f: any) => f.name === 'Headline')?.id
        }
        if (!notizFmtId) {
          const firstText = inlineContent?.[0]?.type === 'text' ? inlineContent[0].text : ''
          for (const tbFmt of textbausteinFormats) {
            const prefix = tbFmt.textbaustein as string
            if (firstText.toLowerCase().startsWith(prefix.toLowerCase())) {
              notizFmtId = tbFmt.id
              const stripped = firstText.slice(prefix.length).replace(/^[:\s]+/, '')
              if (stripped) {
                inlineContent = [{ ...inlineContent![0], text: stripped }, ...inlineContent!.slice(1)]
              } else {
                inlineContent = inlineContent!.slice(1)
              }
              break
            }
          }
        }
        if (!notizFmtId) {
          notizFmtId = elementTypeToFormatId.get('haupttext')
            || absatzformate.find((f: any) => f.name === 'Haupttext')?.id
            || absatzformate.find((f: any) => f.kategorie === 'storyline')?.id
            || absatzformate[0]?.id
        }
        const notizFmtName = absatzformate.find((f: any) => f.id === notizFmtId)?.name ?? 'Haupttext'
        const attrs: any = { format_id: notizFmtId ?? null, format_name: notizFmtName }
        if (te.textAlign && te.textAlign !== 'left') attrs.textAlign = te.textAlign
        pmNodes.push({
          type: 'absatz',
          attrs,
          content: inlineContent && inlineContent.length > 0 ? inlineContent : [{ type: 'text', text: '' }],
        })
      } else {
        const attrs: any = {}
        if (te.textAlign && te.textAlign !== 'left') attrs.textAlign = te.textAlign
        pmNodes.push({
          type: 'paragraph',
          ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
          content: inlineContent,
        })
      }
      continue
    }

    const pmType = (['action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'heading'].includes(te.type))
      ? te.type : 'action'

    if (useAbsatzNodes) {
      let fmtId: string | undefined
      let matchedTextbaustein = false
      const firstText = inlineContent?.[0]?.type === 'text' ? inlineContent[0].text : ''
      for (const tbFmt of textbausteinFormats) {
        const prefix = tbFmt.textbaustein as string
        if (firstText.toLowerCase().startsWith(prefix.toLowerCase())) {
          fmtId = tbFmt.id
          matchedTextbaustein = true
          const stripped = firstText.slice(prefix.length).replace(/^[:\s]+/, '')
          if (stripped) {
            inlineContent = [{ ...inlineContent![0], text: stripped }, ...inlineContent!.slice(1)]
          } else {
            inlineContent = inlineContent!.slice(1)
          }
          break
        }
      }
      if (!matchedTextbaustein) {
        const episodenendeFmtId = elementTypeToFormatId.get('episodenende')
        if (episodenendeFmtId && /^Ende\s+der\s+(Folge|Episode)\s+\d+/i.test(firstText)) {
          fmtId = episodenendeFmtId
        } else if (docTyp === 'storyline') {
          fmtId = elementTypeToFormatId.get('haupttext')
            || absatzformate.find((f: any) => f.name === 'Haupttext')?.id
            || absatzformate.find((f: any) => f.kategorie === 'storyline')?.id
            || absatzformate[0]?.id
        } else {
          fmtId = elementTypeToFormatId.get(pmType)
        }
      }
      const fmtName = absatzformate.find((f: any) => f.id === fmtId)?.name ?? pmType
      const attrs: any = { format_id: fmtId ?? null, format_name: fmtName }
      if (te.textAlign && te.textAlign !== 'left') attrs.textAlign = te.textAlign
      pmNodes.push({
        type: 'absatz',
        attrs,
        content: inlineContent && inlineContent.length > 0 ? inlineContent : [{ type: 'text', text: '' }],
      })
    } else {
      const attrs: any = { element_type: pmType }
      if (te.textAlign && te.textAlign !== 'left') attrs.textAlign = te.textAlign
      pmNodes.push({
        type: 'screenplay_element',
        attrs,
        content: inlineContent,
      })
    }
  }

  return pmNodes
}

export const importRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

// GET /api/import/ocr-status — Check if Mistral OCR is available
importRouter.get('/ocr-status', async (req, res) => {
  try {
    const setting = await queryOne(
      `SELECT ks.enabled, ks.provider, ks.model_name, kp.is_active,
              CASE WHEN kp.api_key IS NOT NULL AND kp.api_key != '' THEN true ELSE false END as has_key
       FROM ki_settings ks
       LEFT JOIN ki_providers kp ON kp.provider = ks.provider
       WHERE ks.funktion = 'pdf_ocr'`,
      []
    )
    res.json({
      mistral_available: !!(setting?.enabled && setting?.is_active && setting?.has_key),
      provider: setting?.provider || null,
      model: setting?.model_name || null,
    })
  } catch {
    res.json({ mistral_available: false, provider: null, model: null })
  }
})

// POST /api/import/detect — Auto-Detect only, no save
importRouter.post('/detect', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })
    const result = detectFormat(req.file.originalname, req.file.buffer)

    // SHA-256 hash for duplicate check
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex')
    const duplicate = await queryOne(
      `SELECT w.id, w.label, w.typ, f.folge_nummer, p.titel AS produktion_titel
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.datei_hash = $1`,
      [fileHash]
    )

    res.json({
      ...result,
      file_hash: fileHash,
      duplicate: duplicate ? {
        werkstufe_id: duplicate.id,
        label: duplicate.label,
        typ: duplicate.typ,
        folge_nummer: duplicate.folge_nummer,
        produktion: duplicate.produktion_titel,
      } : null,
    })
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

    // PDF extraction options from request body
    const parseOpts: ParseOptions = {}
    if (req.body.pdf_method === 'mistral') parseOpts.pdfMethod = 'mistral'
    if (req.body.pdf_crop_left || req.body.pdf_crop_right || req.body.pdf_crop_bottom) {
      parseOpts.pdfCrop = {
        cropLeft: parseInt(req.body.pdf_crop_left || '0', 10),
        cropRight: parseInt(req.body.pdf_crop_right || '0', 10),
        cropBottom: parseInt(req.body.pdf_crop_bottom || '0', 10),
      }
    } else if (req.body.pdf_crop_percent) {
      parseOpts.pdfCropPercent = parseInt(req.body.pdf_crop_percent, 10)
    }

    const cacheKey = makeParseKey(parseBuffer, parseOpts)
    let result = cacheGet(cacheKey)
    if (!result) {
      result = await parseScript(req.file.originalname, parseBuffer, parseOpts)
      cacheSet(cacheKey, result)
    }

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
      const charaktere_detail = (sz.charaktere || []).map((name: string) => {
        const analysis = analyzeInContent(sz.textelemente || [], name)
        return { name, repliken: analysis.repliken }
      })
      const komparsen_detail = (sz.komparsen || []).map((raw: string) => {
        const { name, anzahl, headerOT } = parseKomparseEntry(raw)
        const analysis = analyzeInContent(sz.textelemente || [], name)
        let hat_spiel = false
        let hat_text = false
        if (analysis.spiel_typ === 'text') { hat_text = true; hat_spiel = true }
        else if (analysis.spiel_typ === 'spiel') { hat_spiel = true }
        else if (!headerOT) { hat_spiel = true }
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
      non_scene_elements: result.nonSceneElements || [],
      file_metadata: fileMeta,
      filename_metadata: filenameMeta,
      watermark_found: wmPayload !== null,
      rote_rosen_meta: result.meta.roteRosenMeta || null,
    })
  } catch (err) {
    res.status(422).json({ error: String(err) })
  }
})

// POST /api/import/commit — Full import into DB (transactional, bulk inserts)
importRouter.post('/commit', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

    const produktion_id = req.body.produktion_id
    const folge_nummer = parseInt(req.body.folge_nummer)

    if (!produktion_id || isNaN(folge_nummer)) {
      return res.status(400).json({ error: 'produktion_id und folge_nummer erforderlich' })
    }

    let stage_type = req.body.stage_type || 'draft'
    const validStageTypes = ['expose', 'treatment', 'draft', 'final']
    if (!validStageTypes.includes(stage_type)) {
      return res.status(400).json({ error: `Ungültiger stage_type: ${stage_type}` })
    }

    // ── Strip watermark + build parseOpts ──
    const isPdf = req.file.originalname.toLowerCase().endsWith('.pdf')
    let parseBuffer = req.file.buffer
    if (!isPdf) {
      parseBuffer = Buffer.from(stripWatermark(req.file.buffer.toString('utf8')), 'utf8')
    }

    const parseOpts: ParseOptions = {}
    if (req.body.pdf_method === 'mistral') parseOpts.pdfMethod = 'mistral'
    if (req.body.pdf_crop_left || req.body.pdf_crop_right || req.body.pdf_crop_bottom) {
      parseOpts.pdfCrop = {
        cropLeft: parseInt(req.body.pdf_crop_left || '0', 10),
        cropRight: parseInt(req.body.pdf_crop_right || '0', 10),
        cropBottom: parseInt(req.body.pdf_crop_bottom || '0', 10),
      }
    } else if (req.body.pdf_crop_percent) {
      parseOpts.pdfCropPercent = parseInt(req.body.pdf_crop_percent, 10)
    }

    // ── Parse — use cache from /preview if available ──
    const cacheKey = makeParseKey(parseBuffer, parseOpts)
    let result = cacheGet(cacheKey)
    if (!result) {
      result = await parseScript(req.file.originalname, parseBuffer, parseOpts)
      cacheSet(cacheKey, result)
    }

    // Auto-detect stage_type from Rote-Rosen metadata if not explicitly set
    if (result.meta.roteRosenMeta && !req.body.stage_type) {
      const rrDocType = result.meta.roteRosenMeta.document_type
      if (rrDocType === 'treatment') stage_type = 'treatment'
      else if (rrDocType === 'drehbuch') stage_type = 'draft'
    }

    const fileMeta  = extractFileMetadata(req.file.originalname, req.file.buffer)
    const filenameMeta = parseFilename(req.file.originalname)
    const saveMetadata = req.body.save_metadata === 'true'

    const metaJson: Record<string, any> = {
      source_filename: req.file.originalname,
      imported_at: new Date().toISOString(),
      imported_by: req.user!.name || req.user!.user_id,
    }
    if (saveMetadata && Object.keys(fileMeta).length > 0) metaJson.import_metadata = fileMeta
    if (Object.keys(filenameMeta).length > 0) metaJson.filename_metadata = filenameMeta
    if (result.meta.roteRosenMeta) metaJson.rote_rosen = result.meta.roteRosenMeta

    let versionLabel = `Import: ${req.file.originalname}`
    if (filenameMeta.fassungsdatum) versionLabel = `Import ${filenameMeta.fassungsdatum}`
    const standDatum = req.body.stand_datum || filenameMeta.fassungsdatum || null

    const stageToDocTyp: Record<string, string> = {
      treatment: 'storyline', draft: 'drehbuch', expose: 'notiz', final: 'drehbuch',
    }
    const docTyp = stageToDocTyp[stage_type] || 'drehbuch'

    // ── Load absatzformate outside transaction (read-only) ──
    const absatzformate = await query(
      `SELECT id, name, textbaustein, kategorie FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order`,
      [produktion_id]
    )
    const textbausteinFormats = absatzformate
      .filter((f: any) => f.textbaustein)
      .sort((a: any, b: any) => b.textbaustein.length - a.textbaustein.length)
    const elementTypeToFormatId = new Map<string, string>()
    if (absatzformate.length > 0) {
      const nameMap: Record<string, string> = {
        scene_heading: 'Szenenueberschrift', action: 'Action', character: 'Character',
        dialogue: 'Dialogue', parenthetical: 'Parenthetical', transition: 'Transition',
        shot: 'Shot', heading: 'Headline',
      }
      for (const [elemType, formatName] of Object.entries(nameMap)) {
        const fmt = absatzformate.find((f: any) => f.name === formatName)
        if (fmt) elementTypeToFormatId.set(elemType, fmt.id)
      }
      for (const name of ['Haupttext', 'Status Quo', 'Anmerkung', 'Strang-Marker']) {
        const fmt = absatzformate.find((f: any) => f.name === name)
        if (fmt) elementTypeToFormatId.set(name.toLowerCase().replace(/ /g, '_'), fmt.id)
      }
      const episodenendeFmt = absatzformate.find((f: any) => f.name === 'Episodenende')
      if (episodenendeFmt) elementTypeToFormatId.set('episodenende', episodenendeFmt.id)
    }
    const useAbsatzNodes = elementTypeToFormatId.size > 0

    // ── Parse frontend scene overrides ──
    let sceneOverrides: Record<number, Record<string, any>> = {}
    if (req.body.scene_overrides) {
      try { sceneOverrides = JSON.parse(req.body.scene_overrides) } catch {}
    }

    // ── Pre-compute all scene data in memory ──
    const formatMap: Record<string, string> = { 'Drehbuch': 'drehbuch', 'Storyline': 'storyline', 'Notiz': 'notiz' }
    type SceneData = {
      sortOrder: number; sceneNummer: any; intExt: any; tageszeit: any; ortName: any
      spieltag: any; zusammenfassung: any; szeneninfo: any; stoppzeitSek: any
      sceneFormat: string; sondertyp: string | null; pmNodes: any[]; pageLength: number
      charaktere: string[]; komparsen: string[]; wechselschnittPartner: number[]
    }
    const sceneDataList: SceneData[] = []
    for (const [idx, szene] of result.szenen.entries()) {
      const ov = sceneOverrides[idx] || {}
      if (ov.charaktere && Array.isArray(ov.charaktere)) szene.charaktere = ov.charaktere
      if (ov.komparsen && Array.isArray(ov.komparsen)) szene.komparsen = ov.komparsen
      const sceneFormat = ov.format ? (formatMap[ov.format] || docTyp) : docTyp
      const isWechselschnitt = szene.isWechselschnitt || false
      const isStockshot = szene.isStockshot || false
      const pmNodes = buildPmNodesForScene(
        szene.textelemente || [], sceneFormat, docTyp,
        useAbsatzNodes, elementTypeToFormatId, textbausteinFormats, absatzformate
      )
      sceneDataList.push({
        sortOrder: idx,
        sceneNummer: szene.nummer,
        intExt: ov.int_ext ?? szene.int_ext ?? null,
        tageszeit: ov.tageszeit ?? szene.tageszeit ?? null,
        ortName: (ov.ort_name ?? szene.ort_name) || null,
        spieltag: (ov.spieltag ?? szene.spieltag) || null,
        zusammenfassung: (ov.zusammenfassung ?? szene.zusammenfassung) || null,
        szeneninfo: (ov.szeneninfo ?? szene.szeneninfo) || null,
        stoppzeitSek: ov.dauer_sekunden ?? szene.dauer_sekunden ?? null,
        sceneFormat,
        sondertyp: isWechselschnitt ? 'wechselschnitt' : isStockshot ? 'stockshot' : null,
        pmNodes,
        pageLength: calcPageLength(pmNodes),
        charaktere: szene.charaktere || [],
        komparsen: szene.komparsen || [],
        wechselschnittPartner: szene.wechselschnittPartner || [],
      })
    }

    // ── Pre-compute non-scene elements ──
    const allNonScene: Array<{ type: string; label: string; content: string }> = []
    if (result.nonSceneElements) allNonScene.push(...result.nonSceneElements)
    if (req.body.non_scene_elements) {
      try {
        const frontendNonScene = JSON.parse(req.body.non_scene_elements)
        const existingTypes = new Set(allNonScene.map(e => e.type))
        for (const elem of frontendNonScene) {
          if (!existingTypes.has(elem.type)) allNonScene.push(elem)
        }
      } catch {}
    }
    type NonSceneData = { pmNodes: any[]; pageLength: number; elemType: string; label: string; sortOrder: number }
    const nonSceneDataList: NonSceneData[] = allNonScene.map((elem, nsIdx) => {
      const elemType = ['titelseite', 'synopsis', 'recap', 'precap', 'memo', 'cover'].includes(elem.type) ? elem.type : 'memo'
      const pmNodes = buildNonSceneContent(elem.type, elem.content)
      return { pmNodes, pageLength: calcPageLength(pmNodes), elemType, label: elem.label, sortOrder: -(allNonScene.length - nsIdx) }
    })

    const userName = req.user!.name || req.user!.user_id
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex')

    // ── BEGIN TRANSACTION ──
    const client = await pool.connect()
    let folgeId!: string
    let werkstufeId!: string
    let scenesImported = 0
    let nonSceneCount = 0
    let charactersCreated = 0
    let komparsenCreated = 0
    let motiveCreated = 0

    try {
      await client.query('BEGIN')

      // Ensure folgen row exists
      let folgeRow = (await client.query(
        `SELECT id FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2`,
        [produktion_id, folge_nummer]
      )).rows[0]
      if (!folgeRow) {
        folgeRow = (await client.query(
          `INSERT INTO folgen (produktion_id, folge_nummer, erstellt_von) VALUES ($1, $2, $3) RETURNING id`,
          [produktion_id, folge_nummer, userName]
        )).rows[0]
      }
      folgeId = folgeRow.id

      // Create werkstufe
      const maxVerRow = (await client.query(
        `SELECT COALESCE(MAX(version_nummer), 0) AS m FROM werkstufen WHERE folge_id = $1 AND typ = $2`,
        [folgeId, docTyp]
      )).rows[0]
      const werkRow = (await client.query(
        `INSERT INTO werkstufen (folge_id, typ, version_nummer, label, sichtbarkeit, erstellt_von, stand_datum)
         VALUES ($1, $2, $3, $4, 'team', $5, $6) RETURNING id`,
        [folgeId, docTyp, (maxVerRow?.m ?? 0) + 1, versionLabel, userName, standDatum]
      )).rows[0]
      werkstufeId = werkRow.id

      // ── Bulk insert scene_identities (generate_series → N rows in 1 query) ──
      const sceneCount = sceneDataList.length
      let sceneIdentityIds: string[] = []
      if (sceneCount > 0) {
        const siResult = await client.query(
          `INSERT INTO scene_identities (folge_id, created_by)
           SELECT $1, $2 FROM generate_series(1, $3)
           RETURNING id`,
          [folgeId, userName, sceneCount]
        )
        sceneIdentityIds = siResult.rows.map((r: any) => r.id)
      }

      // ── Bulk insert dokument_szenen (UNNEST → 1 query) ──
      let dokSzeneIds: string[] = []
      if (sceneCount > 0) {
        const dsResult = await client.query(
          `INSERT INTO dokument_szenen (
             werkstufe_id, scene_identity_id, sort_order, scene_nummer,
             int_ext, tageszeit, ort_name, zusammenfassung, content,
             spieltag, stoppzeit_sek, szeneninfo, format, geloescht, updated_by, page_length, sondertyp
           )
           SELECT $1, unnest($2::uuid[]), unnest($3::int[]), unnest($4::int[]),
                  unnest($5::text[]), unnest($6::text[]), unnest($7::text[]), unnest($8::text[]),
                  unnest($9::text[])::jsonb, unnest($10::text[]), unnest($11::int[]),
                  unnest($12::text[]), unnest($13::text[]), false, $14,
                  unnest($15::float8[]), unnest($16::text[])
           RETURNING id`,
          [
            werkstufeId,
            sceneIdentityIds,
            sceneDataList.map(s => s.sortOrder),
            sceneDataList.map(s => s.sceneNummer ?? null),
            sceneDataList.map(s => s.intExt),
            sceneDataList.map(s => s.tageszeit),
            sceneDataList.map(s => s.ortName),
            sceneDataList.map(s => s.zusammenfassung),
            sceneDataList.map(s => JSON.stringify(s.pmNodes)),
            sceneDataList.map(s => s.spieltag),
            sceneDataList.map(s => s.stoppzeitSek),
            sceneDataList.map(s => s.szeneninfo),
            sceneDataList.map(s => s.sceneFormat),
            userName,
            sceneDataList.map(s => s.pageLength),
            sceneDataList.map(s => s.sondertyp),
          ]
        )
        dokSzeneIds = dsResult.rows.map((r: any) => r.id)
      }
      scenesImported = sceneCount

      // ── Bulk insert wechselschnitt_partner ──
      const nummerToIdentity = new Map<number, string>()
      for (let i = 0; i < sceneDataList.length; i++) {
        if (sceneDataList[i].sceneNummer != null) {
          nummerToIdentity.set(sceneDataList[i].sceneNummer, sceneIdentityIds[i])
        }
      }
      const wpDocIds: string[] = []
      const wpPartnerIds: string[] = []
      const wpPositions: number[] = []
      for (let i = 0; i < sceneDataList.length; i++) {
        for (let pos = 0; pos < sceneDataList[i].wechselschnittPartner.length; pos++) {
          const partnerIdentityId = nummerToIdentity.get(sceneDataList[i].wechselschnittPartner[pos])
          if (!partnerIdentityId) continue
          wpDocIds.push(dokSzeneIds[i])
          wpPartnerIds.push(partnerIdentityId)
          wpPositions.push(pos)
        }
      }
      if (wpDocIds.length > 0) {
        await client.query(
          `INSERT INTO wechselschnitt_partner (dokument_szene_id, partner_identity_id, position)
           SELECT unnest($1::uuid[]), unnest($2::uuid[]), unnest($3::int[])
           ON CONFLICT (dokument_szene_id, partner_identity_id) DO NOTHING`,
          [wpDocIds, wpPartnerIds, wpPositions]
        )
      }

      // ── Bulk insert non-scene identities + dokument_szenen ──
      nonSceneCount = nonSceneDataList.length
      if (nonSceneCount > 0) {
        const nsIdResult = await client.query(
          `INSERT INTO scene_identities (folge_id, created_by)
           SELECT $1, $2 FROM generate_series(1, $3)
           RETURNING id`,
          [folgeId, userName, nonSceneCount]
        )
        const nsIdentityIds = nsIdResult.rows.map((r: any) => r.id)
        await client.query(
          `INSERT INTO dokument_szenen (
             werkstufe_id, scene_identity_id, sort_order, scene_nummer,
             content, format, element_type, geloescht, updated_by, zusammenfassung, page_length
           )
           SELECT $1, unnest($2::uuid[]), unnest($3::int[]), NULL,
                  unnest($4::text[])::jsonb, 'notiz', unnest($5::text[]), false, $6,
                  unnest($7::text[]), unnest($8::float8[])`,
          [
            werkstufeId,
            nsIdentityIds,
            nonSceneDataList.map(d => d.sortOrder),
            nonSceneDataList.map(d => JSON.stringify(d.pmNodes)),
            nonSceneDataList.map(d => d.elemType),
            userName,
            nonSceneDataList.map(d => d.label),
            nonSceneDataList.map(d => d.pageLength),
          ]
        )
      }

      // ── Characters: bulk lookup + create + link ──
      let kategorien = (await client.query(
        `SELECT id, name, typ FROM character_kategorien WHERE produktion_id = $1`,
        [produktion_id]
      )).rows
      if (kategorien.length === 0) {
        await client.query(
          `INSERT INTO character_kategorien (produktion_id, name, typ, sort_order)
           VALUES ($1, 'Episoden-Rolle', 'rolle', 1), ($1, 'Komparse o.T.', 'komparse', 2)
           ON CONFLICT (produktion_id, name) DO NOTHING`,
          [produktion_id]
        )
        kategorien = (await client.query(
          `SELECT id, name, typ FROM character_kategorien WHERE produktion_id = $1`,
          [produktion_id]
        )).rows
      }
      const rolleKatId = kategorien.find((k: any) => k.name === 'Episoden-Rolle')?.id
        || kategorien.find((k: any) => k.typ === 'rolle')?.id || null
      const komparseKatId = kategorien.find((k: any) => k.name === 'Komparse o.T.')?.id
        || kategorien.find((k: any) => k.typ === 'komparse')?.id || null

      const charNameToId = new Map<string, string>()
      const allRollenNames = [...new Set(
        (result.meta.charaktere as string[]).filter((n: string) => n.trim())
      )]
      const allKomparsenSet = new Set<string>()
      for (const szene of result.szenen) {
        if (szene.komparsen) {
          for (const k of szene.komparsen) {
            const { name } = parseKomparseEntry(k)
            if (name) allKomparsenSet.add(name)
          }
        }
      }
      const allKomparsenNames = [...allKomparsenSet]
      const allCharNames = [...allRollenNames, ...allKomparsenNames]

      if (allCharNames.length > 0) {
        const upperNames = allCharNames.map(n => n.toUpperCase())

        // Bulk lookup globally
        const existingRows = (await client.query(
          `SELECT id, UPPER(name) AS upper_name FROM characters WHERE UPPER(name) = ANY($1::text[])`,
          [upperNames]
        )).rows
        for (const row of existingRows) charNameToId.set(row.upper_name, row.id)

        // Bulk create missing characters
        const needsNew = upperNames.filter(u => !charNameToId.has(u))
        if (needsNew.length > 0) {
          const originalNames = needsNew.map(u => allCharNames.find(n => n.toUpperCase() === u) || u)
          const isKomparseFlags = needsNew.map(u =>
            allKomparsenNames.some(k => k.toUpperCase() === u) && !allRollenNames.some(r => r.toUpperCase() === u)
          )
          const newChars = (await client.query(
            `INSERT INTO characters (name, meta_json)
             SELECT unnest($1::text[]), unnest($2::jsonb[])
             RETURNING id, UPPER(name) AS upper_name`,
            [
              originalNames,
              originalNames.map((_: string, i: number) => JSON.stringify({
                import_auto_created: true,
                ...(isKomparseFlags[i] ? { is_komparse: true } : {}),
                import_source: req.file!.originalname,
              })),
            ]
          )).rows
          for (let i = 0; i < newChars.length; i++) {
            charNameToId.set(newChars[i].upper_name, newChars[i].id)
            if (isKomparseFlags[i]) komparsenCreated++
            else charactersCreated++
          }
        }

        // Bulk upsert character_productions
        const cpCharIds: string[] = []
        const cpKatIds: string[] = []
        for (const name of allRollenNames) {
          const id = charNameToId.get(name.toUpperCase())
          if (id && rolleKatId) { cpCharIds.push(id); cpKatIds.push(rolleKatId) }
        }
        const rollenUpperSet = new Set(allRollenNames.map(n => n.toUpperCase()))
        for (const name of allKomparsenNames) {
          if (rollenUpperSet.has(name.toUpperCase())) continue
          const id = charNameToId.get(name.toUpperCase())
          if (id && komparseKatId) { cpCharIds.push(id); cpKatIds.push(komparseKatId) }
        }
        if (cpCharIds.length > 0) {
          await client.query(
            `INSERT INTO character_productions (character_id, produktion_id, kategorie_id)
             SELECT unnest($1::uuid[]), $2, unnest($3::int[])
             ON CONFLICT (character_id, produktion_id) DO NOTHING`,
            [cpCharIds, produktion_id, cpKatIds]
          )
        }
      }

      // ── Bulk insert scene_characters ──
      const scCharIdentityIds: string[] = []
      const scCharIds: string[] = []
      const scKatIds: string[] = []
      const scSpielTypen: string[] = []
      const scRepliken: number[] = []
      const scAnzahl: (number | null)[] = []
      const scHeaderOT: (boolean | null)[] = []

      for (let i = 0; i < sceneDataList.length; i++) {
        const identityId = sceneIdentityIds[i]
        const sd = sceneDataList[i]
        const szene = result.szenen[sd.sortOrder]
        const textelemente = szene.textelemente || []

        for (const charName of sd.charaktere) {
          const charId = charNameToId.get(charName.toUpperCase())
          if (!charId || !rolleKatId) continue
          const analysis = analyzeInContent(textelemente, charName)
          scCharIdentityIds.push(identityId)
          scCharIds.push(charId)
          scKatIds.push(rolleKatId)
          scSpielTypen.push(analysis.spiel_typ === 'text' ? 'text' : 'spiel')
          scRepliken.push(analysis.repliken)
          scAnzahl.push(1)
          scHeaderOT.push(false)
        }

        for (const kompRaw of sd.komparsen) {
          const { name: kompName, anzahl, headerOT } = parseKomparseEntry(kompRaw)
          const charId = charNameToId.get(kompName.toUpperCase())
          if (!charId || !komparseKatId) continue
          const analysis = analyzeInContent(textelemente, kompName)
          let spiel_typ = headerOT ? 'o.t.' : 'spiel'
          if (analysis.spiel_typ === 'text') spiel_typ = 'text'
          scCharIdentityIds.push(identityId)
          scCharIds.push(charId)
          scKatIds.push(komparseKatId)
          scSpielTypen.push(spiel_typ)
          scRepliken.push(analysis.repliken)
          scAnzahl.push(anzahl)
          scHeaderOT.push(headerOT)
        }
      }

      if (scCharIdentityIds.length > 0) {
        await client.query(
          `INSERT INTO scene_characters
             (scene_identity_id, character_id, kategorie_id, spiel_typ, repliken_anzahl, anzahl, header_o_t, werkstufe_id)
           SELECT unnest($1::uuid[]), unnest($2::uuid[]), unnest($3::int[]),
                  unnest($4::text[]), unnest($5::int[]), unnest($6::int[]), unnest($7::boolean[]), $8
           ON CONFLICT (werkstufe_id, scene_identity_id, character_id)
             WHERE werkstufe_id IS NOT NULL AND scene_identity_id IS NOT NULL DO NOTHING`,
          [scCharIdentityIds, scCharIds, scKatIds, scSpielTypen, scRepliken, scAnzahl, scHeaderOT, werkstufeId]
        )
      }

      // ── Motive: parse ort_name → drehort / motiv / untermotiv ──
      const AD_REGEX = /^A\.?\s*D\.?\s+/i

      function stripAD(name: string): { cleanName: string; isAD: boolean } {
        if (AD_REGEX.test(name)) return { cleanName: name.replace(AD_REGEX, '').trim(), isAD: true }
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

        if (drehortLabel && /Außendreh/i.test(drehortLabel)) isAD = true
        const stripped = stripAD(motivName)
        motivName = stripped.cleanName
        if (stripped.isAD) isAD = true
        if (untermotivName) {
          const strippedUnter = stripAD(untermotivName)
          untermotivName = strippedUnter.cleanName
          if (strippedUnter.isAD) isAD = true
        }

        return { drehortLabel, motivName, untermotivName, isAD }
      }

      const drehortCache = new Map<string, string>()
      async function getOrCreateDrehort(label: string): Promise<string> {
        const key = label.toUpperCase()
        if (drehortCache.has(key)) return drehortCache.get(key)!
        let row = (await client.query(
          `SELECT id FROM drehorte WHERE produktion_id = $1 AND UPPER(label) = UPPER($2)`,
          [produktion_id, label]
        )).rows[0]
        if (!row) {
          row = (await client.query(
            `INSERT INTO drehorte (produktion_id, label) VALUES ($1, $2)
             ON CONFLICT (produktion_id, label) DO UPDATE SET label = EXCLUDED.label RETURNING id`,
            [produktion_id, label]
          )).rows[0]
        }
        drehortCache.set(key, row.id)
        return row.id
      }

      const motivCache = new Map<string, string>()
      for (const szene of result.szenen) {
        if (!szene.ort_name) continue
        try {
          const { drehortLabel, motivName, untermotivName, isAD } = parseOrtName(szene.ort_name)
          const drehortId = drehortLabel ? await getOrCreateDrehort(drehortLabel) : null
          const motivTyp = szene.int_ext === 'EXT' ? 'exterior' : 'interior'
          const istStudio = !isAD

          const motivKey = `|${motivName.toUpperCase()}`
          let motivId: string
          if (motivCache.has(motivKey)) {
            motivId = motivCache.get(motivKey)!
          } else {
            let existing = (await client.query(
              `SELECT id FROM motive WHERE produktion_id = $1 AND UPPER(name) = UPPER($2) AND parent_id IS NULL`,
              [produktion_id, motivName]
            )).rows[0]
            if (!existing) {
              existing = (await client.query(
                `INSERT INTO motive (produktion_id, name, typ, drehort_id, ist_studio, meta_json)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [produktion_id, motivName, motivTyp, untermotivName ? null : drehortId, istStudio,
                 JSON.stringify({ import_auto_created: true, import_source: req.file!.originalname })]
              )).rows[0]
              motiveCreated++
            } else if (drehortId && !untermotivName) {
              await client.query(
                `UPDATE motive SET drehort_id = COALESCE(drehort_id, $1) WHERE id = $2`,
                [drehortId, existing.id]
              )
            }
            motivId = existing.id
            motivCache.set(motivKey, motivId)
          }

          if (untermotivName) {
            const unterKey = `${motivId}|${untermotivName.toUpperCase()}`
            if (!motivCache.has(unterKey)) {
              let existing = (await client.query(
                `SELECT id FROM motive WHERE produktion_id = $1 AND UPPER(name) = UPPER($2) AND parent_id = $3`,
                [produktion_id, untermotivName, motivId]
              )).rows[0]
              if (!existing) {
                existing = (await client.query(
                  `INSERT INTO motive (produktion_id, name, typ, parent_id, drehort_id, ist_studio, meta_json)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                  [produktion_id, untermotivName, motivTyp, motivId, drehortId, istStudio,
                   JSON.stringify({ import_auto_created: true, import_source: req.file!.originalname })]
                )).rows[0]
                motiveCreated++
              } else if (drehortId) {
                await client.query(
                  `UPDATE motive SET drehort_id = COALESCE(drehort_id, $1) WHERE id = $2`,
                  [drehortId, existing.id]
                )
              }
              motivCache.set(unterKey, existing.id)
            }
          }
        } catch { /* ignore constraint violations */ }
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // ── File archiving (after commit, best-effort) ──
    const uploadDir = path.join(UPLOAD_BASE, produktion_id, String(folge_nummer))
    try {
      fs.mkdirSync(uploadDir, { recursive: true })
      const ext = path.extname(req.file.originalname) || '.bin'
      const archivePath = path.join(uploadDir, `${werkstufeId}${ext}`)
      fs.writeFileSync(archivePath, req.file.buffer)
      const relPath = path.join(produktion_id, String(folge_nummer), `${werkstufeId}${ext}`)
      await query(
        `UPDATE werkstufen SET original_datei = $1, original_dateiname = $2, datei_hash = $3, datei_groesse = $4 WHERE id = $5`,
        [relPath, req.file.originalname, fileHash, req.file.buffer.length, werkstufeId]
      )
    } catch (archiveErr) {
      console.error('[Import] File archive failed (non-fatal):', archiveErr)
      await query(
        `UPDATE werkstufen SET original_dateiname = $1, datei_hash = $2, datei_groesse = $3 WHERE id = $4`,
        [req.file.originalname, fileHash, req.file.buffer.length, werkstufeId]
      ).catch(() => {})
    }

    res.json({
      folge_id: folgeId,
      folge_nummer,
      werkstufe_id: werkstufeId,
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
