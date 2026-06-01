import { Router } from 'express'
import multer from 'multer'
import pdfParse from 'pdf-parse'
import { PDFDocument } from 'pdf-lib'
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

      const isPdf = req.file.mimetype === 'application/pdf'
        || req.file.originalname?.toLowerCase().endsWith('.pdf')

      let payload: string | null = null

      if (isPdf) {
        // 1. Priorität: Keywords-Feld im PDF-Info-Dictionary (neues Verfahren via pdf-lib)
        try {
          const pdfDoc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true })
          const kw = pdfDoc.getKeywords()
          if (kw && kw.startsWith('wm1:')) payload = kw
        } catch { /* ignorieren — Fallback folgt */ }

        // 2. Fallback: ZWC-Extraktion aus PDF-Text (ältere Exporte)
        if (!payload) {
          const parsed = await pdfParse(req.file.buffer)
          payload = decodeWatermarkFromText(parsed.text)
        }
      } else {
        payload = decodeWatermarkFromText(req.file.buffer.toString('utf8'))
      }

      if (!payload) {
        return res.json({ found: false, message: 'Kein Wasserzeichen in dieser Datei gefunden.' })
      }

      const parsed = parsePayload(payload)
      if (!parsed) {
        return res.json({ found: true, payload, message: 'Wasserzeichen gefunden, Format unbekannt.' })
      }

      const log = await queryOne(
        `SELECT el.*, w.typ AS werkstufe_typ, w.version_nummer, w.label AS werkstufe_label,
                f.folge_nummer, st.titel AS staffel_titel
         FROM export_logs el
         LEFT JOIN werkstufen w ON w.id = el.werkstufe_id
         LEFT JOIN folgen f ON f.id = w.folge_id
         LEFT JOIN produktionen st ON st.id = f.produktion_id
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
        `SELECT el.*, w.typ AS werkstufe_typ, w.version_nummer, w.label AS werkstufe_label,
                f.folge_nummer, st.titel AS staffel_titel
         FROM export_logs el
         LEFT JOIN werkstufen w ON w.id = el.werkstufe_id
         LEFT JOIN folgen f ON f.id = w.folge_id
         LEFT JOIN produktionen st ON st.id = f.produktion_id
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
