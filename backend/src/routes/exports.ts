/**
 * Export-Routen — Phase 2 (Job-Infrastruktur)
 *
 * POST /api/export/job              — Job erstellen + starten
 * GET  /api/export/job/:id          — Status pollen
 * GET  /api/export/job/:id/download — Ergebnis herunterladen
 *
 * Die eigentlichen Exporter werden in Phase 3 (PDF), 5 (DOCX), 6 (Fountain/FDX) eingehängt.
 */

import { Router } from 'express'
import { authMiddleware } from '../auth'
import { pool } from '../db'
import {
  createJob,
  runJob,
  getJob,
  ExportJobParams,
  ExportFormat,
} from '../utils/exportJobQueue'
import { assemblePdf, assemblePreviewHtml, PdfAssemblerInput } from '../utils/pdfAssembler'

const router = Router()
router.use(authMiddleware)

const VALID_FORMATS: ExportFormat[] = ['pdf', 'docx', 'fountain', 'fdx']

// ── POST /api/export/job ──────────────────────────────────────────────────────

router.post('/export/job', async (req, res) => {
  const { werkstufId, format, options = {} } = req.body

  if (!werkstufId || typeof werkstufId !== 'string') {
    return res.status(400).json({ error: 'werkstufId erforderlich' })
  }
  if (!VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: `format muss einer von ${VALID_FORMATS.join(', ')} sein` })
  }

  const user = req.user!
  const params: ExportJobParams = {
    werkstufId,
    format,
    userId: user.user_id,
    userName: user.name,
    options: {
      notizWerkstufIds:       Array.isArray(options.notizWerkstufIds)       ? options.notizWerkstufIds       : undefined,
      dokumentVorlagenIds:    Array.isArray(options.dokumentVorlagenIds)   ? options.dokumentVorlagenIds   : undefined,
      persoenlicher_ausdruck: options.persoenlicher_ausdruck           ? String(options.persoenlicher_ausdruck) : undefined,
      revision:               options.revision                         ? String(options.revision)               : undefined,
      revisions_farbe_hex:    options.revisions_farbe_hex              ? String(options.revisions_farbe_hex)    : undefined,
      compareWerkstufId:      options.compareWerkstufId                ? String(options.compareWerkstufId)      : undefined,
      revisionNurGeaendert:   typeof options.revisionNurGeaendert === 'boolean' ? options.revisionNurGeaendert : true,
    },
  }

  const jobId = createJob(params)

  // Job asynchron starten — Response ist bereits gesendet
  runJob(jobId, async (setProgress) => {
    // ── Dispatcher: ruft je nach Format den passenden Exporter auf ──
    // Phase 5: DOCX    → docxAssembler
    // Phase 6: Fountain / FDX → textAssembler
    if (format === 'pdf') {
      return assemblePdf(
        { werkstufId, userId: params.userId, userName: params.userName, options: params.options },
        setProgress
      )
    }
    setProgress(10)
    throw new Error(`Format "${format}" noch nicht implementiert — wird in Phase 5–6 eingehängt.`)
  }).then(() => {
    // Export-Log bei Erfolg schreiben
    const job = getJob(jobId)
    if (job?.status === 'done' && job.result) {
      pool.query(
        `INSERT INTO export_log
           (user_id, user_name, werkstufe_id, format, persoenlicher_ausdruck, revision_label, file_size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          params.userId,
          params.userName,
          params.werkstufId,
          params.format,
          params.options.persoenlicher_ausdruck ?? null,
          params.options.revision ?? null,
          job.result.buffer.length,
        ]
      ).catch((e: any) => console.error('[export_log] INSERT fehlgeschlagen:', e))
    }
  }).catch(() => { /* Job-Fehler bereits im Job-Zustand gespeichert */ })

  res.json({ jobId })
})

// ── GET /api/export/job/:id ───────────────────────────────────────────────────

router.get('/export/job/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) {
    return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen (max. 10 Minuten)' })
  }
  res.json({
    status:   job.status,
    progress: job.progress,
    error:    job.error ?? null,
  })
})

// ── GET /api/export/job/:id/download ─────────────────────────────────────────

router.get('/export/job/:id/download', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) {
    return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' })
  }
  if (job.status === 'error') {
    return res.status(500).json({ error: job.error ?? 'Export fehlgeschlagen' })
  }
  if (job.status !== 'done' || !job.result) {
    return res.status(425).json({ error: 'Export noch nicht fertig', status: job.status, progress: job.progress })
  }

  const { buffer, mimeType, filename } = job.result
  res.setHeader('Content-Type', mimeType)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.setHeader('Content-Length', String(buffer.length))
  res.send(buffer)
})

// ── Hilfsfunktion: Query-Params → PdfAssemblerInput ──────────────────────────

function previewParamsFromQuery(req: any): PdfAssemblerInput {
  const werkstufId = req.query.werkstufId as string
  const rawDv = req.query.dokumentVorlagenIds as string | undefined
  const rawNz = req.query.notizWerkstufIds    as string | undefined
  const user  = req.user!
  return {
    werkstufId,
    userId:   user.user_id,
    userName: user.name,
    options: {
      dokumentVorlagenIds: rawDv ? rawDv.split(',').filter(Boolean) : undefined,
      notizWerkstufIds:    rawNz ? rawNz.split(',').filter(Boolean) : undefined,
    },
  }
}

// ── GET /api/export/preview ───────────────────────────────────────────────────
// Gibt das vollständige HTML als text/html zurück (kein Puppeteer).

router.get('/export/preview', async (req, res) => {
  const werkstufId = req.query.werkstufId as string | undefined
  if (!werkstufId) return res.status(400).json({ error: 'werkstufId erforderlich' })

  try {
    const html = await assemblePreviewHtml(previewParamsFromQuery(req), () => {})
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.send(html)
  } catch (err: any) {
    res.status(500).send(`<pre style="color:red">Vorschau-Fehler: ${err?.message ?? err}</pre>`)
  }
})

// ── GET /api/export/pdf-preview ───────────────────────────────────────────────
// Echter PDF-Vorschau: läuft synchron durch Puppeteer, liefert das PDF inline
// im Browser-PDF-Viewer — identisch mit dem späteren Download.

router.get('/export/pdf-preview', async (req, res) => {
  const werkstufId = req.query.werkstufId as string | undefined
  if (!werkstufId) return res.status(400).json({ error: 'werkstufId erforderlich' })

  try {
    const result = await assemblePdf(previewParamsFromQuery(req), () => {})
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'no-store')
    res.send(result.buffer)
  } catch (err: any) {
    res.status(500).send(`<pre style="color:red">PDF-Vorschau-Fehler: ${err?.message ?? err}</pre>`)
  }
})

export default router
