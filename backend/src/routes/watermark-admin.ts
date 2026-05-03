import { Router } from 'express'
import multer from 'multer'
import { authMiddleware, requireRole } from '../auth'
import { decodeWatermarkFromText, parsePayload } from '../utils/watermark'
import { query, queryOne } from '../db'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// POST /api/admin/watermark/decode — Upload file, extract & resolve watermark
router.post('/decode',
  authMiddleware,
  requireRole('superadmin', 'herstellungsleitung'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

      const text = req.file.buffer.toString('utf8')
      const payload = decodeWatermarkFromText(text)

      if (!payload) {
        return res.json({ found: false, message: 'Kein Wasserzeichen in dieser Datei gefunden.' })
      }

      const parsed = parsePayload(payload)
      if (!parsed) {
        return res.json({ found: true, payload, message: 'Wasserzeichen gefunden, Format unbekannt.' })
      }

      const log = await queryOne(
        `SELECT el.*, s.stage_type, s.version_label, s.folge_nummer, st.titel AS staffel_titel
         FROM export_logs el
         LEFT JOIN stages s ON s.id = el.stage_id
         LEFT JOIN produktionen st ON st.id = el.produktion_id
         WHERE el.id = $1`,
        [parsed.exportId]
      )

      res.json({ found: true, user_id: parsed.userId, export_id: parsed.exportId, log: log || null })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// GET /api/admin/watermark/logs — Export-Log listing
router.get('/logs',
  authMiddleware,
  requireRole('superadmin', 'herstellungsleitung'),
  async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit  as string || '100'), 500)
      const offset = parseInt(req.query.offset as string || '0')
      const logs = await query(
        `SELECT el.*, s.stage_type, s.version_label, s.folge_nummer, st.titel AS staffel_titel
         FROM export_logs el
         LEFT JOIN stages s  ON s.id  = el.stage_id
         LEFT JOIN produktionen st ON st.id = el.produktion_id
         ORDER BY el.exported_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      )
      res.json(logs)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

export default router
