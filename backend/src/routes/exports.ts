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

// ── Validierung: OrderedExportItems (Modul-Level für Wiederverwendung) ────────

function parseOrderedItems(raw: any): import('../utils/exportJobQueue').OrderedExportItem[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw
    .filter((x: any) => x && typeof x === 'object')
    .map((x: any) => ({
      type: (x.type === 'statistik' ? 'statistik'
           : x.type === 'onliner'   ? 'onliner'
           : x.type === 'synopse'   ? 'synopse'
           : 'notiz') as 'notiz' | 'statistik' | 'onliner' | 'synopse',
      id: x.id ? String(x.id) : undefined,
      szeneId: x.szeneId ? String(x.szeneId) : undefined,
      label: x.label ? String(x.label) : undefined,
      enabled: x.enabled !== false,
      statistikConfig: x.statistikConfig && typeof x.statistikConfig === 'object'
        ? {
            folge_ids: Array.isArray(x.statistikConfig.folge_ids) ? x.statistikConfig.folge_ids.map(Number) : [],
            folge_nummer: Number(x.statistikConfig.folge_nummer),
            mode: x.statistikConfig.mode === 'block' ? 'block' as const : 'folge' as const,
            sections: Array.isArray(x.statistikConfig.sections) ? x.statistikConfig.sections.map(String) : ['uebersicht', 'rollen', 'motive'],
            includedSceneNumbers: Array.isArray(x.statistikConfig.includedSceneNumbers)
              ? x.statistikConfig.includedSceneNumbers.map(Number)
              : null,
          }
        : undefined,
    }))
}

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
      notizWerkstufIds:         Array.isArray(options.notizWerkstufIds) ? options.notizWerkstufIds : undefined,
      preItems:                 parseOrderedItems(options.preItems),
      postItems:                parseOrderedItems(options.postItems),
      hauptinhaltAktiv:         typeof options.hauptinhaltAktiv === 'boolean' ? options.hauptinhaltAktiv : undefined,
      pdfBookmarks:             options.pdfBookmarks === true,
      persoenlicher_ausdruck:   options.persoenlicher_ausdruck   ? String(options.persoenlicher_ausdruck)  : undefined,
      revision:                 options.revision                  ? String(options.revision)                : undefined,
      revisions_farbe_hex:      options.revisions_farbe_hex       ? String(options.revisions_farbe_hex)     : undefined,
      compareWerkstufId:        options.compareWerkstufId         ? String(options.compareWerkstufId)       : undefined,
      revisionNurGeaendert:     typeof options.revisionNurGeaendert === 'boolean' ? options.revisionNurGeaendert : true,
      szenenAuswahl:            options.szenenAuswahl             ? String(options.szenenAuswahl)           : undefined,
      filterRollen:             Array.isArray(options.filterRollen)   ? options.filterRollen.map(String)   : undefined,
      filterMotive:             Array.isArray(options.filterMotive)   ? options.filterMotive.map(String)   : undefined,
      filterKomparsen:          Array.isArray(options.filterKomparsen) ? options.filterKomparsen.map(String) : undefined,
      userTimezone:             options.userTimezone                ? String(options.userTimezone)          : undefined,
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
  const rawNz = req.query.notizWerkstufIds as string | undefined
  const user  = req.user!
  return {
    werkstufId,
    userId:   user.user_id,
    userName: user.name,
    options: {
      notizWerkstufIds: rawNz ? rawNz.split(',').filter(Boolean) : undefined,
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

// ── POST /api/export/preview ──────────────────────────────────────────────────
// Wie GET /preview, aber akzeptiert die vollständige Export-Konfiguration im Body
// (preItems, postItems, hauptinhaltAktiv). Gibt HTML zurück.

router.post('/export/preview', async (req, res) => {
  const { werkstufId, options = {} } = req.body
  if (!werkstufId || typeof werkstufId !== 'string') {
    return res.status(400).json({ error: 'werkstufId erforderlich' })
  }

  try {
    const user = req.user!
    const html = await assemblePreviewHtml({
      werkstufId,
      userId:   user.user_id,
      userName: user.name,
      options: {
        preItems:         parseOrderedItems(options.preItems),
        postItems:        parseOrderedItems(options.postItems),
        hauptinhaltAktiv: typeof options.hauptinhaltAktiv === 'boolean' ? options.hauptinhaltAktiv : undefined,
      },
    }, () => {})
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.send(html)
  } catch (err: any) {
    res.status(500).send(`<pre style="color:red">Vorschau-Fehler: ${err?.message ?? err}</pre>`)
  }
})

// ── POST /api/export/pdf-preview ──────────────────────────────────────────────
// Echter PDF-Vorschau mit vollständiger Export-Konfiguration (preItems, postItems,
// hauptinhaltAktiv). Liefert das PDF inline — identisch mit dem späteren Download.

router.post('/export/pdf-preview', async (req, res) => {
  const { werkstufId, options = {} } = req.body
  if (!werkstufId || typeof werkstufId !== 'string') {
    return res.status(400).json({ error: 'werkstufId erforderlich' })
  }

  try {
    const user = req.user!
    const result = await assemblePdf({
      werkstufId,
      userId:   user.user_id,
      userName: user.name,
      options: {
        preItems:         parseOrderedItems(options.preItems),
        postItems:        parseOrderedItems(options.postItems),
        hauptinhaltAktiv: typeof options.hauptinhaltAktiv === 'boolean' ? options.hauptinhaltAktiv : undefined,
        szenenAuswahl:    options.szenenAuswahl    ? String(options.szenenAuswahl)    : undefined,
        filterRollen:     Array.isArray(options.filterRollen)    ? options.filterRollen.map(String)    : undefined,
        filterKomparsen:  Array.isArray(options.filterKomparsen) ? options.filterKomparsen.map(String) : undefined,
        filterMotive:     Array.isArray(options.filterMotive)    ? options.filterMotive.map(String)    : undefined,
      },
    }, () => {})
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'no-store')
    res.send(result.buffer)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'PDF-Vorschau fehlgeschlagen' })
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

// ── GET /api/export/filter-options ───────────────────────────────────────────
// Liefert verfügbare Rollen und Motive einer Werkstufe für die Export-Filter-UI.

router.get('/export/filter-options', async (req, res) => {
  const werkstufId = req.query.werkstufId as string | undefined
  if (!werkstufId) return res.status(400).json({ error: 'werkstufId erforderlich' })

  try {
    const client = await pool.connect()
    try {
      const [rollenRes, komparsenRes, motiveRes] = await Promise.all([
        client.query<{ name: string }>(
          `SELECT DISTINCT c.name
           FROM scene_characters sc
           JOIN characters c ON c.id = sc.character_id
           LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
           WHERE sc.werkstufe_id = $1 AND COALESCE(ck.typ, 'rolle') <> 'komparse'
           ORDER BY c.name`,
          [werkstufId]
        ),
        client.query<{ name: string }>(
          `SELECT DISTINCT c.name
           FROM scene_characters sc
           JOIN characters c ON c.id = sc.character_id
           LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
           WHERE sc.werkstufe_id = $1 AND ck.typ = 'komparse'
           ORDER BY c.name`,
          [werkstufId]
        ),
        client.query<{ ort_name: string }>(
          `SELECT DISTINCT ort_name
           FROM dokument_szenen
           WHERE werkstufe_id = $1 AND geloescht = false AND ort_name IS NOT NULL AND ort_name <> ''
           ORDER BY ort_name`,
          [werkstufId]
        ),
      ])
      res.json({
        rollen:    rollenRes.rows.map(r => r.name),
        komparsen: komparsenRes.rows.map(r => r.name),
        motive:    motiveRes.rows.map(r => r.ort_name),
      })
    } finally {
      client.release()
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Fehler beim Laden der Filter-Optionen' })
  }
})

// ── GET /api/export/notiz-szenen ─────────────────────────────────────────────
// Liefert format='notiz' + scene_nummer=null Rows der Werkstufe (freie Dokument-Elemente)
// sowie die Block-Grenzen (min/max sort_order aller Rows mit scene_nummer != null).
// Wird vom ExportDrawer genutzt um Notiz-Elemente automatisch in VOR/NACH einzusortieren.

router.get('/export/notiz-szenen', async (req, res) => {
  const werkstufId = req.query.werkstufId as string | undefined
  if (!werkstufId) return res.status(400).json({ error: 'werkstufId erforderlich' })

  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      `SELECT id, format, scene_nummer, zusammenfassung, sort_order
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = false
       ORDER BY sort_order`,
      [werkstufId]
    )

    // Block-Grenzen: alle Rows mit scene_nummer != null (unabhängig vom Format)
    const blockRows = rows.filter((r: any) => r.scene_nummer != null)
    const blockSortOrderMin = blockRows.length > 0 ? Math.min(...blockRows.map((r: any) => r.sort_order)) : null
    const blockSortOrderMax = blockRows.length > 0 ? Math.max(...blockRows.map((r: any) => r.sort_order)) : null

    // Freie Notiz-Elemente: format='notiz', scene_nummer=null
    const items = rows
      .filter((r: any) => r.format === 'notiz' && r.scene_nummer == null)
      .map((r: any) => ({
        id: String(r.id),
        label: r.zusammenfassung || 'Notiz-Element',
        sort_order: r.sort_order,
      }))

    res.json({ items, blockSortOrderMin, blockSortOrderMax })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Fehler beim Laden der Notiz-Elemente' })
  } finally {
    client.release()
  }
})

export default router
