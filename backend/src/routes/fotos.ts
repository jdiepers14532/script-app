import { Router } from 'express'
import multer from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const UPLOAD_DIR = process.env.FOTO_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'fotos')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    cb(null, allowed.includes(file.mimetype))
  },
})

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

characterFotosRouter.post('/', upload.single('foto'), async (req, res) => {
  const p = req.params as any
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })
  try {
    const maxOrder = await queryOne('SELECT COALESCE(MAX(sort_order), 0) AS m FROM charakter_fotos WHERE character_id = $1', [p.id])
    const cnt = await queryOne('SELECT COUNT(*) AS cnt FROM charakter_fotos WHERE character_id = $1', [p.id])
    const row = await queryOne(
      `INSERT INTO charakter_fotos (character_id, dateiname, originalname, sort_order, ist_primaer)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [p.id, req.file.filename, req.file.originalname, maxOrder.m + 1, Number(cnt.cnt) === 0]
    )
    res.status(201).json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

characterFotosRouter.patch('/reorder', async (req, res) => {
  const p = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne('UPDATE charakter_fotos SET sort_order = $1 WHERE id = $2 AND character_id = $3', [sort_order, id, p.id])
    }
    const rows = await query('SELECT * FROM charakter_fotos WHERE character_id = $1 ORDER BY sort_order, id', [p.id])
    res.json(rows)
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
    if (!row) return res.status(404).json({ error: 'Foto nicht gefunden' })
    res.json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

characterFotosRouter.delete('/:fotoId', async (req, res) => {
  const p = req.params as any
  try {
    const row = await queryOne('DELETE FROM charakter_fotos WHERE id = $1 AND character_id = $2 RETURNING dateiname', [p.fotoId, p.id])
    if (!row) return res.status(404).json({ error: 'Foto nicht gefunden' })
    const filePath = path.join(UPLOAD_DIR, row.dateiname)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
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

motivFotosRouter.post('/', upload.single('foto'), async (req, res) => {
  const p = req.params as any
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })
  try {
    const maxOrder = await queryOne('SELECT COALESCE(MAX(sort_order), 0) AS m FROM motiv_fotos WHERE motiv_id = $1', [p.id])
    const cnt = await queryOne('SELECT COUNT(*) AS cnt FROM motiv_fotos WHERE motiv_id = $1', [p.id])
    const row = await queryOne(
      `INSERT INTO motiv_fotos (motiv_id, dateiname, originalname, sort_order, ist_primaer)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [p.id, req.file.filename, req.file.originalname, maxOrder.m + 1, Number(cnt.cnt) === 0]
    )
    res.status(201).json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

motivFotosRouter.patch('/reorder', async (req, res) => {
  const p = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne('UPDATE motiv_fotos SET sort_order = $1 WHERE id = $2 AND motiv_id = $3', [sort_order, id, p.id])
    }
    const rows = await query('SELECT * FROM motiv_fotos WHERE motiv_id = $1 ORDER BY sort_order, id', [p.id])
    res.json(rows)
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
    if (!row) return res.status(404).json({ error: 'Foto nicht gefunden' })
    res.json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

motivFotosRouter.delete('/:fotoId', async (req, res) => {
  const p = req.params as any
  try {
    const row = await queryOne('DELETE FROM motiv_fotos WHERE id = $1 AND motiv_id = $2 RETURNING dateiname', [p.fotoId, p.id])
    if (!row) return res.status(404).json({ error: 'Foto nicht gefunden' })
    const filePath = path.join(UPLOAD_DIR, row.dateiname)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Static file serving ───────────────────────────────────────────────────────

export const fotosStaticRouter = Router()
fotosStaticRouter.use('/', (req, res) => {
  const filename = path.basename(req.path)
  const filePath = path.join(UPLOAD_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Foto nicht gefunden' })
  res.sendFile(filePath)
})
