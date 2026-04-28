import { Router } from 'express'
import multer from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const execFileAsync = promisify(execFile)

const UPLOAD_DIR = process.env.FOTO_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'fotos')
const THUMB_DIR  = path.join(UPLOAD_DIR, 'thumbnails')

for (const dir of [UPLOAD_DIR, THUMB_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIMES.includes(file.mimetype)),
})

function getMediaTyp(mime: string): 'image' | 'video' | 'pdf' {
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  return 'image'
}

// PDF-Thumbnail via Ghostscript (erste Seite → JPEG)
async function generatePdfThumbnail(filePath: string, baseKey: string): Promise<string | null> {
  const thumbFilename = `${baseKey}_thumb.jpg`
  const thumbPath = path.join(THUMB_DIR, thumbFilename)
  try {
    await Promise.race([
      execFileAsync('/usr/bin/gs', [
        '-dNOPAUSE', '-dBATCH', '-dSAFER',
        '-sDEVICE=jpeg', '-r120', '-dJPEGQ=85',
        '-dFirstPage=1', '-dLastPage=1',
        `-sOutputFile=${thumbPath}`,
        filePath,
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30_000)),
    ])
    if (fs.existsSync(thumbPath)) return thumbFilename
    return null
  } catch (err) {
    console.error('[PDF Thumbnail] Fehler:', err)
    return null
  }
}

// Video-Thumbnail via ffmpeg (bei 10% der Laufzeit, min. 2s)
async function generateVideoThumbnail(filePath: string, baseKey: string): Promise<string | null> {
  const thumbFilename = `${baseKey}_thumb.jpg`
  const thumbPath = path.join(THUMB_DIR, thumbFilename)
  try {
    // Kurze Probe um Dauer zu ermitteln
    let thumbTime = 2
    try {
      const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
      ])
      const duration = parseFloat(stdout.trim())
      if (!isNaN(duration) && duration > 5) thumbTime = Math.round(duration * 0.1)
    } catch { /* ffprobe nicht verfügbar – Fallback auf 2s */ }

    await execFileAsync('/usr/bin/ffmpeg', [
      '-ss', String(thumbTime), '-i', filePath,
      '-vframes', '1', '-q:v', '3', '-y', thumbPath,
    ])
    if (fs.existsSync(thumbPath)) return thumbFilename
    return null
  } catch (err) {
    console.error('[Video Thumbnail] Fehler:', err)
    return null
  }
}

// ── Gemeinsame Upload-Logik ────────────────────────────────────────────────────

async function handleUpload(req: any, res: any, table: 'charakter_fotos' | 'motiv_fotos', idCol: 'character_id' | 'motiv_id') {
  const p = req.params as any
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

  const mime: string = req.file.mimetype
  const mediaTyp = getMediaTyp(mime)
  const baseKey = path.basename(req.file.filename, path.extname(req.file.filename))
  const filePath = path.join(UPLOAD_DIR, req.file.filename)

  // Thumbnail generieren (PDF + Video)
  let thumbnailDateiname: string | null = null
  if (mediaTyp === 'pdf') {
    thumbnailDateiname = await generatePdfThumbnail(filePath, baseKey)
  } else if (mediaTyp === 'video') {
    thumbnailDateiname = await generateVideoThumbnail(filePath, baseKey)
  }

  try {
    const maxOrder = await queryOne(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${table} WHERE ${idCol} = $1`, [p.id])
    const cnt      = await queryOne(`SELECT COUNT(*) AS cnt FROM ${table} WHERE ${idCol} = $1`, [p.id])
    const row = await queryOne(
      `INSERT INTO ${table} (${idCol}, dateiname, originalname, sort_order, ist_primaer, media_typ, thumbnail_dateiname)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [p.id, req.file.filename, req.file.originalname, maxOrder.m + 1, Number(cnt.cnt) === 0, mediaTyp, thumbnailDateiname]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}

// ── Character Fotos ──────────────────────────────────────────────────────────

export const characterFotosRouter = Router({ mergeParams: true })
characterFotosRouter.use(authMiddleware)

characterFotosRouter.get('/', async (req, res) => {
  const p = req.params as any
  try {
    const rows = await query('SELECT * FROM charakter_fotos WHERE character_id = $1 ORDER BY sort_order, id', [p.id])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

characterFotosRouter.post('/', upload.single('foto'), (req, res) => handleUpload(req, res, 'charakter_fotos', 'character_id'))

characterFotosRouter.patch('/reorder', async (req, res) => {
  const p = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne('UPDATE charakter_fotos SET sort_order = $1 WHERE id = $2 AND character_id = $3', [sort_order, id, p.id])
    }
    res.json(await query('SELECT * FROM charakter_fotos WHERE character_id = $1 ORDER BY sort_order, id', [p.id]))
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

characterFotosRouter.put('/:fotoId', async (req, res) => {
  const p = req.params as any
  const { label, ist_primaer } = req.body
  try {
    if (ist_primaer) await queryOne('UPDATE charakter_fotos SET ist_primaer = FALSE WHERE character_id = $1', [p.id])
    const row = await queryOne(
      `UPDATE charakter_fotos SET label = COALESCE($1, label), ist_primaer = COALESCE($2, ist_primaer)
       WHERE id = $3 AND character_id = $4 RETURNING *`,
      [label ?? null, ist_primaer ?? null, p.fotoId, p.id]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' })
    res.json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

characterFotosRouter.delete('/:fotoId', async (req, res) => {
  const p = req.params as any
  try {
    const row = await queryOne(
      'DELETE FROM charakter_fotos WHERE id = $1 AND character_id = $2 RETURNING dateiname, thumbnail_dateiname',
      [p.fotoId, p.id]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' })
    deleteFiles(row.dateiname, row.thumbnail_dateiname)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Motiv Fotos ───────────────────────────────────────────────────────────────

export const motivFotosRouter = Router({ mergeParams: true })
motivFotosRouter.use(authMiddleware)

motivFotosRouter.get('/', async (req, res) => {
  const p = req.params as any
  try {
    const rows = await query('SELECT * FROM motiv_fotos WHERE motiv_id = $1 ORDER BY sort_order, id', [p.id])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

motivFotosRouter.post('/', upload.single('foto'), (req, res) => handleUpload(req, res, 'motiv_fotos', 'motiv_id'))

motivFotosRouter.patch('/reorder', async (req, res) => {
  const p = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne('UPDATE motiv_fotos SET sort_order = $1 WHERE id = $2 AND motiv_id = $3', [sort_order, id, p.id])
    }
    res.json(await query('SELECT * FROM motiv_fotos WHERE motiv_id = $1 ORDER BY sort_order, id', [p.id]))
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

motivFotosRouter.put('/:fotoId', async (req, res) => {
  const p = req.params as any
  const { label, ist_primaer } = req.body
  try {
    if (ist_primaer) await queryOne('UPDATE motiv_fotos SET ist_primaer = FALSE WHERE motiv_id = $1', [p.id])
    const row = await queryOne(
      `UPDATE motiv_fotos SET label = COALESCE($1, label), ist_primaer = COALESCE($2, ist_primaer)
       WHERE id = $3 AND motiv_id = $4 RETURNING *`,
      [label ?? null, ist_primaer ?? null, p.fotoId, p.id]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' })
    res.json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

motivFotosRouter.delete('/:fotoId', async (req, res) => {
  const p = req.params as any
  try {
    const row = await queryOne(
      'DELETE FROM motiv_fotos WHERE id = $1 AND motiv_id = $2 RETURNING dateiname, thumbnail_dateiname',
      [p.fotoId, p.id]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' })
    deleteFiles(row.dateiname, row.thumbnail_dateiname)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function deleteFiles(dateiname: string | null, thumbnailDateiname: string | null) {
  if (dateiname) {
    const fp = path.join(UPLOAD_DIR, dateiname)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  }
  if (thumbnailDateiname) {
    const tp = path.join(THUMB_DIR, thumbnailDateiname)
    if (fs.existsSync(tp)) fs.unlinkSync(tp)
  }
}

// ── Static file serving ───────────────────────────────────────────────────────

export const fotosStaticRouter = Router()
fotosStaticRouter.use('/', (req, res) => {
  const filename = path.basename(req.path)
  const filePath = path.join(UPLOAD_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden' })
  res.sendFile(filePath)
})

export const fotosThumbnailRouter = Router()
fotosThumbnailRouter.use('/', (req, res) => {
  const filename = path.basename(req.path)
  const filePath = path.join(THUMB_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Thumbnail nicht gefunden' })
  res.sendFile(filePath)
})
