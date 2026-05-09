import { Router } from 'express'
import multer from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import { authMiddleware } from '../auth'

const UPLOAD_DIR = process.env.EDITOR_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'editor-images')

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => cb(null, IMAGE_MIMES.includes(file.mimetype)),
})

const router = Router()
router.use(authMiddleware)

// POST /api/editor-uploads — upload image for inline editor use
router.post('/', upload.single('image'), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'Kein Bild hochgeladen' })
  const url = `/uploads/editor-images/${req.file.filename}`
  res.json({ url })
})

export const editorUploadsRouter = router
