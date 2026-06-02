/**
 * Analyse-Editor Routen
 *
 * POST /api/analysis/run             — Analyse starten (Modus A: Block)
 * GET  /api/analysis/run/:id         — Run-Details + Ergebnisse
 * GET  /api/analysis/block/:pid/:nr  — Alle Runs für einen Block
 * GET  /api/analysis/models          — Verfügbare Claude-Modelle
 * GET  /api/analysis/settings        — Analyse-Admin-Einstellungen
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { request as httpRequest } from 'http'
import puppeteer from 'puppeteer'
import { authMiddleware } from '../auth'
import { query, queryOne } from '../db'
import { getProviderApiKey } from './ki'
import { prepareAnalysisRun, executeAnalysisRun, AnalysisMethod } from '../lib/analysis/runner'

// ── PDF-Export Hilfsfunktionen ─────────────────────────────────────────────────

function fetchAuthJson(apiPath: string): Promise<any> {
  return new Promise(resolve => {
    const req = httpRequest({ hostname: '127.0.0.1', port: 3002, path: apiPath, method: 'GET' }, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => { req.destroy(); resolve(null) })
    req.end()
  })
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function mdInline(s: string): string {
  return esc(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`([^`\n]+?)`/g, '<code>$1</code>')
}

function markdownToHtml(md: string): string {
  const lines = (md ?? '').split('\n')
  const out: string[] = []
  let state: 'none' | 'ul' | 'ol' | 'pre' | 'table' = 'none'
  const pre: string[] = []

  const closeState = () => {
    if (state === 'ul') out.push('</ul>')
    else if (state === 'ol') out.push('</ol>')
    else if (state === 'table') out.push('</table>')
    state = 'none'
  }

  for (const line of lines) {
    if (line.startsWith('```') || line.startsWith('~~~')) {
      if (state === 'pre') {
        out.push(`<pre><code>${pre.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
        pre.length = 0; state = 'none'
      } else { closeState(); state = 'pre' }
      continue
    }
    if (state === 'pre') { pre.push(line); continue }

    const hm = line.match(/^(#{1,6}) (.+)$/)
    if (hm) { closeState(); out.push(`<h${hm[1].length}>${mdInline(hm[2])}</h${hm[1].length}>`); continue }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { closeState(); out.push('<hr>'); continue }

    const bq = line.match(/^> ?(.*)$/)
    if (bq) { closeState(); out.push(`<blockquote>${mdInline(bq[1])}</blockquote>`); continue }

    const ul = line.match(/^[*\-+] (.+)$/)
    if (ul) {
      if (state === 'ol' || state === 'table') closeState()
      if (state !== 'ul') { out.push('<ul>'); state = 'ul' }
      out.push(`<li>${mdInline(ul[1])}</li>`); continue
    }

    const ol = line.match(/^\d+[.)]\s+(.+)$/)
    if (ol) {
      if (state === 'ul' || state === 'table') closeState()
      if (state !== 'ol') { out.push('<ol>'); state = 'ol' }
      out.push(`<li>${mdInline(line.replace(/^\d+[.)]\s+/, ''))}</li>`); continue
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      if (/^\|[\s\-:|]+\|$/.test(line)) continue
      if (state === 'ul' || state === 'ol') closeState()
      if (state !== 'table') { out.push('<table>'); state = 'table' }
      const cells = line.slice(1, -1).split('|').map(c => `<td>${mdInline(c.trim())}</td>`).join('')
      out.push(`<tr>${cells}</tr>`); continue
    }

    if (!line.trim()) { closeState(); out.push('<div class="gap"></div>'); continue }
    if (state === 'table') closeState()
    if (state !== 'ul' && state !== 'ol') out.push(`<p>${mdInline(line)}</p>`)
  }
  closeState()
  return out.join('\n')
}

function renderStructuredHtml(method: string, data: any): string {
  if (method === 'strang_heatmap') {
    const straenge = data?.straenge ?? []
    if (!straenge.length) return '<p>Keine Strang-Daten</p>'
    const folgen: number[] = [...new Set<number>(straenge.flatMap((s: any) => s.szenen.map((z: any) => Number(z.folge_nr))))].sort((a, b) => a - b)
    const rows = straenge.map((s: any) => {
      const grid: Record<number, number> = {}
      for (const z of s.szenen) grid[z.folge_nr] = Math.max(grid[z.folge_nr] ?? 0, z.intensitaet)
      const cells = folgen.map(f => { const v = grid[f] ?? 0; return `<td style="padding:3px 6px;text-align:center${v ? '' : ';color:#bbb'}">${v || '—'}</td>` }).join('')
      return `<tr><td style="padding:3px 10px 3px 0;white-space:nowrap">${esc(s.name)} <span style="color:#999">(${s.szenen.length})</span></td>${cells}</tr>`
    }).join('')
    return `<table style="border-collapse:collapse;font-size:9pt">
      <thead><tr><th style="text-align:left;padding:3px 10px 3px 0;border-bottom:1px solid #ddd">Strang</th>${folgen.map(f => `<th style="padding:3px 6px;text-align:center;border-bottom:1px solid #ddd">F${f}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="font-size:8pt;color:#666;margin-top:6pt">Werte = maximale Intensität (1–5) pro Strang und Folge</p>`
  }
  if (method === 'figuren_agency') {
    const charaktere = data?.charaktere ?? []
    if (!charaktere.length) return '<p>Keine Figuren-Daten</p>'
    const folgen: number[] = [...new Set<number>(charaktere.flatMap((c: any) => c.episoden.map((e: any) => Number(e.folge_nr))))].sort((a, b) => a - b)
    const rows = charaktere.map((c: any) => {
      const epMap: Record<number, any> = {}
      for (const e of c.episoden) epMap[e.folge_nr] = e
      const totalA = c.episoden.filter((e: any) => e.mode === 'AKTIV').length
      const totalR = c.episoden.filter((e: any) => e.mode === 'REAKTIV').length
      const cells = folgen.map(f => { const ep = epMap[f]; const v = !ep ? '—' : ep.mode === 'AKTIV' ? 'A' : ep.mode === 'REAKTIV' ? 'R' : 'P'; return `<td style="padding:3px 6px;text-align:center">${v}</td>` }).join('')
      return `<tr><td style="padding:3px 10px 3px 0;white-space:nowrap">${esc(c.name)}</td>${cells}<td style="padding:3px 6px;text-align:center">${totalA}:${totalR}</td></tr>`
    }).join('')
    return `<p style="font-size:8pt;margin-bottom:6pt">A = Aktiv (Entscheidung) &nbsp;·&nbsp; R = Reaktiv &nbsp;·&nbsp; — = nicht präsent</p>
      <table style="border-collapse:collapse;font-size:9pt">
      <thead><tr><th style="text-align:left;padding:3px 10px 3px 0;border-bottom:1px solid #ddd">Figur</th>${folgen.map(f => `<th style="padding:3px 6px;text-align:center;border-bottom:1px solid #ddd">F${f}</th>`).join('')}<th style="padding:3px 6px;border-bottom:1px solid #ddd">A:R</th></tr></thead>
      <tbody>${rows}</tbody></table>`
  }
  if (method === 'vonnegut_arcs') {
    const straenge = data?.straenge ?? []
    if (!straenge.length) return '<p>Keine Arc-Daten</p>'
    const rows = straenge.map((s: any) => {
      const pts = [...s.punkte].sort((a: any, b: any) => a.folge_nr - b.folge_nr || a.scene_nr - b.scene_nr)
        .map((p: any) => `F${p.folge_nr}/Sz${p.scene_nr}: ${p.wert > 0 ? '+' : ''}${p.wert}`).join('  ·  ')
      return `<tr><td style="padding:3px 10px 3px 0;white-space:nowrap;font-weight:500">${esc(s.name)}</td><td style="padding:3px 0;font-size:8pt">${pts}</td></tr>`
    }).join('')
    return `<p style="font-size:8pt;margin-bottom:6pt">Werte von −5 (Tiefpunkt) bis +5 (Höhepunkt) pro Szene</p>
      <table style="border-collapse:collapse;font-size:9pt;width:100%">
      <thead><tr><th style="text-align:left;padding:3px 10px 3px 0;border-bottom:1px solid #ddd;white-space:nowrap">Strang</th><th style="text-align:left;padding:3px 0;border-bottom:1px solid #ddd">Punkte</th></tr></thead>
      <tbody>${rows}</tbody></table>`
  }
  return '<p>Visuelle Analyse — vollständige Darstellung in der App</p>'
}

const ANALYSIS_METHOD_LABELS: Record<string, string> = {
  story_consultant_pur: 'Showrunner-Check',
  story_consultant_framework: 'Story-Consultant (Reagan, Toubia, Rocchi)',
  strang_heatmap: 'Strang-Heatmap',
  figuren_agency: 'Figuren-Agency-Matrix',
  vonnegut_arcs: 'Vonnegut-Arcs',
}

function buildAnalysisPdfHtml(run: any, companyInfo: any): string {
  const scope = run.folge_nummer != null ? `Folge ${run.folge_nummer}` : `Block ${run.block_nummer}`
  const titel = run.produktion_titel ? `${esc(run.produktion_titel)} · ` : ''
  const dateStr = new Date(run.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
  const co = companyInfo
  const companyLine = [co?.name ?? co?.firma_name, co?.adresse].filter(Boolean).join(' · ')

  const sections = (run.method_results ?? []).map((mr: any) => {
    const label = ANALYSIS_METHOD_LABELS[mr.method] || mr.method
    let content: string
    if (mr.status === 'error') {
      content = `<p style="color:#c00;padding:8pt;background:#fff0f0;border-radius:4pt;margin:0">Fehler: ${esc(mr.error_detail || 'Unbekannter Fehler')}</p>`
    } else if (mr.markdown) {
      content = markdownToHtml(mr.markdown)
    } else if (mr.structured) {
      content = renderStructuredHtml(mr.method, mr.structured)
    } else {
      content = '<p>Kein Inhalt</p>'
    }
    return `<section class="ms"><h2>${esc(label)}</h2>${content}</section>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10pt;line-height:1.55;color:#111}
.header{margin-bottom:20pt;padding-bottom:12pt;border-bottom:2pt solid #000}
.header h1{font-size:17pt;font-weight:700;margin-bottom:3pt}
.meta{font-size:9pt;color:#666}
h2{font-size:12.5pt;font-weight:700;margin:0 0 8pt;padding-bottom:4pt;border-bottom:1.5pt solid #000}
h3{font-size:11pt;font-weight:600;margin:10pt 0 4pt}
h4{font-size:10pt;font-weight:600;margin:8pt 0 3pt}
p{margin:0 0 6pt}
ul,ol{margin:0 0 8pt 18pt}
li{margin-bottom:2pt}
hr{border:none;border-top:1pt solid #ccc;margin:10pt 0}
table{border-collapse:collapse;margin:6pt 0}
td,th{padding:3px 8px;border:0.75pt solid #ddd;font-size:9pt}
th{background:#f5f5f5;font-weight:600}
pre{background:#f5f5f5;padding:8pt;border-radius:3pt;font-size:8pt;margin:6pt 0}
code{background:#f0f0f0;padding:1pt 3pt;border-radius:2pt;font-size:8.5pt}
blockquote{border-left:3pt solid #ccc;padding-left:8pt;color:#555;margin:6pt 0}
.gap{height:8pt}
.ms+.ms{page-break-before:always}
</style>
</head><body>
<div class="header">
  <h1>Story-Analyse · ${scope}</h1>
  <div class="meta">${titel}Erstellt am ${dateStr}${companyLine ? ` · ${esc(companyLine)}` : ''}</div>
</div>
${sections}
</body></html>`
}

function buildPuppeteerZone(zones: { left?: any[]; center?: any[]; right?: any[] }, companyInfo: any): string {
  const renderZone = (zone?: any[]): string => {
    if (!zone?.length) return ''
    return zone.map((el: any) => {
      if (el.type === 'text') return esc(el.value ?? '')
      if (el.type === 'token') switch (el.key) {
        case 'firma_logo':
        case 'firma_name': return esc(companyInfo?.name ?? companyInfo?.firma_name ?? '')
        case 'firma_adresse': return esc(companyInfo?.adresse ?? companyInfo?.firma_adresse ?? '')
        case 'pflichtangaben': return esc(companyInfo?.pflichtangaben ?? '')
        case 'seite': return 'Seite <span class="pageNumber"></span>&thinsp;/&thinsp;<span class="totalPages"></span>'
        case 'datum': return new Date().toLocaleDateString('de-DE')
      }
      return ''
    }).join('&nbsp;')
  }
  const l = renderZone(zones.left)
  const c = renderZone(zones.center)
  const r = renderZone(zones.right)
  if (!l && !c && !r) return ''
  return `<div style="font-size:8pt;font-family:sans-serif;color:#666;width:100%;padding:0 2.5cm;display:flex;justify-content:space-between;align-items:center"><span style="flex:1;overflow:hidden;white-space:nowrap">${l}</span><span style="flex:1;text-align:center;overflow:hidden;white-space:nowrap">${c}</span><span style="flex:1;text-align:right;overflow:hidden;white-space:nowrap">${r}</span></div>`
}

// ──────────────────────────────────────────────────────────────────────────────

const router = Router()
router.use(authMiddleware)

async function getAllowedRoles(): Promise<string[]> {
  const row = await queryOne(
    `SELECT value FROM app_settings WHERE key = 'analysis_allowed_roles'`,
    []
  )
  if (!row?.value) return []
  try { return JSON.parse(row.value) } catch { return [] }
}

async function canAnalyse(roles: string[]): Promise<boolean> {
  const allowed = await getAllowedRoles()
  return roles.some(r => allowed.includes(r))
}

// ── POST /api/analysis/run ────────────────────────────────────────────────────
router.post('/run', async (req, res) => {
  try {
    const userRoles: string[] = req.user!.roles || [req.user!.role]
    if (!await canAnalyse(userRoles)) {
      return res.status(403).json({ error: 'Keine Berechtigung für Analyse' })
    }

    const { produktion_id, block_nummer, folge_nummer, methods, strang_filter, force_fresh } = req.body

    if (!produktion_id || block_nummer == null) {
      return res.status(400).json({ error: 'produktion_id und block_nummer erforderlich' })
    }

    if (!Array.isArray(methods) || methods.length === 0) {
      return res.status(400).json({ error: 'Mindestens eine Methode erforderlich' })
    }

    const validMethods: AnalysisMethod[] = ['story_consultant_pur', 'story_consultant_framework', 'strang_heatmap', 'figuren_agency', 'vonnegut_arcs']
    const invalid = (methods as string[]).filter(m => !validMethods.includes(m as AnalysisMethod))
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Unbekannte Methoden: ${invalid.join(', ')}` })
    }

    // Synchrone Vorbereitung (nur DB-Queries, schnell)
    const ctx = await prepareAnalysisRun({
      produktion_id,
      block_nummer: Number(block_nummer),
      folge_nummer: folge_nummer != null ? Number(folge_nummer) : null,
      methods: methods as AnalysisMethod[],
      strang_filter: strang_filter ?? undefined,
      created_by: req.user!.user_id,
      force_fresh: !!force_fresh,
    } as any)

    // run_id sofort zurückgeben — KI-Ausführung läuft im Hintergrund
    res.json({ run_id: ctx.run_id, status: 'queued' })

    setImmediate(() => {
      executeAnalysisRun(ctx).catch(async (err: any) => {
        console.error('[analysis/execute]', err)
        try {
          const { query: dbQuery } = await import('../db')
          await dbQuery(
            `UPDATE analysis_runs SET status = 'error', completed_at = NOW() WHERE id = $1`,
            [ctx.run_id]
          )
        } catch {}
      })
    })
  } catch (err: any) {
    console.error('[analysis/run]', err)
    res.status(500).json({ error: err.message || String(err) })
  }
})

// ── GET /api/analysis/run/:id ─────────────────────────────────────────────────
router.get('/run/:id', async (req, res) => {
  try {
    const run = await queryOne(
      `SELECT r.id, r.block_nummer, r.folge_nummer, r.status, r.created_at, r.completed_at,
         COALESCE(json_agg(
           json_build_object(
             'id', mr.id, 'method', mr.method, 'method_version', mr.method_version,
             'status', mr.status, 'markdown', mr.result_markdown,
             'structured', mr.result_structured,
             'error_detail', mr.error_detail, 'from_cache', mr.from_cache,
             'duration_ms', mr.duration_ms
           ) ORDER BY mr.created_at ASC
         ) FILTER (WHERE mr.id IS NOT NULL), '[]') AS method_results,
         COALESCE(
           (SELECT json_agg(jsonb_build_object(
              'typ', w.typ, 'version_nummer', w.version_nummer, 'label', w.label,
              'stand_datum', w.stand_datum,
              'erstellt_am', w.erstellt_am
            ) ORDER BY w.version_nummer DESC)
            FROM werkstufen w WHERE w.id = ANY(r.werkstufen_ids)),
           '[]'::json
         ) AS werkstufen_info
       FROM analysis_runs r
       LEFT JOIN analysis_method_results mr ON mr.run_id = r.id
       WHERE r.id = $1
       GROUP BY r.id`,
      [req.params.id]
    )
    if (!run) return res.status(404).json({ error: 'Run nicht gefunden' })
    res.set('Cache-Control', 'no-store')
    res.json(run)
  } catch (err: any) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/analysis/block/:produktion_id/:block_nummer ─────────────────────
router.get('/block/:produktion_id/:block_nummer', async (req, res) => {
  try {
    const { produktion_id, block_nummer } = req.params
    const latestOnly = req.query.latest === 'true'

    const rows = await query(
      `SELECT r.id, r.block_nummer, r.folge_nummer, r.status, r.created_at, r.completed_at,
         COALESCE(json_agg(
           json_build_object(
             'id', mr.id, 'method', mr.method, 'method_version', mr.method_version,
             'status', mr.status, 'markdown', mr.result_markdown,
             'structured', mr.result_structured,
             'error_detail', mr.error_detail, 'from_cache', mr.from_cache,
             'duration_ms', mr.duration_ms
           ) ORDER BY mr.created_at ASC
         ) FILTER (WHERE mr.id IS NOT NULL), '[]') AS method_results,
         COALESCE(
           (SELECT json_agg(jsonb_build_object(
              'typ', w.typ, 'version_nummer', w.version_nummer, 'label', w.label,
              'stand_datum', w.stand_datum,
              'erstellt_am', w.erstellt_am
            ) ORDER BY w.version_nummer DESC)
            FROM werkstufen w WHERE w.id = ANY(r.werkstufen_ids)),
           '[]'::json
         ) AS werkstufen_info
       FROM analysis_runs r
       LEFT JOIN analysis_method_results mr ON mr.run_id = r.id
       WHERE r.produktion_id = $1 AND r.block_nummer = $2
       GROUP BY r.id
       ORDER BY r.created_at DESC
       ${latestOnly ? 'LIMIT 1' : ''}`,
      [produktion_id, Number(block_nummer)]
    )
    res.json(rows)
  } catch (err: any) {
    res.status(500).json({ error: String(err) })
  }
})

// ── DELETE /api/analysis/run/:id ──────────────────────────────────────────────
router.delete('/run/:id', async (req, res) => {
  try {
    await query(`DELETE FROM analysis_method_results WHERE run_id = $1`, [req.params.id])
    await query(`DELETE FROM analysis_costs WHERE run_id = $1`, [req.params.id])
    const result = await query(`DELETE FROM analysis_runs WHERE id = $1 RETURNING id`, [req.params.id])
    if (!result.length) return res.status(404).json({ error: 'Run nicht gefunden' })
    res.json({ deleted: true })
  } catch (err: any) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/analysis/models — Dynamische Claude-Modellliste ─────────────────
router.get('/models', async (_req, res) => {
  const fallback = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
  try {
    const apiKey = await getProviderApiKey('claude')
    if (!apiKey) return res.json({ models: fallback })

    const client = new Anthropic({ apiKey })
    const response = await client.models.list()
    const models = response.data
      .map((m: any) => m.id)
      .filter((id: string) => id.startsWith('claude-'))
      .sort()
    res.json({ models: models.length > 0 ? models : fallback })
  } catch {
    res.json({ models: fallback })
  }
})

// ── GET /api/analysis/settings ────────────────────────────────────────────────
router.get('/settings', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT key, value FROM app_settings WHERE key IN ('analysis_model', 'analysis_allowed_roles')`
    )
    const settings: Record<string, any> = {}
    for (const r of rows) {
      settings[r.key] = r.key === 'analysis_allowed_roles'
        ? JSON.parse(r.value || '[]')
        : r.value
    }
    res.json(settings)
  } catch (err: any) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/analysis/run/:id/pdf ─────────────────────────────────────────────
router.get('/run/:id/pdf', async (req, res) => {
  try {
    const userRoles: string[] = req.user!.roles || [req.user!.role]
    if (!await canAnalyse(userRoles)) {
      return res.status(403).json({ error: 'Keine Berechtigung' })
    }

    const run = await queryOne(
      `SELECT r.id, r.block_nummer, r.folge_nummer, r.status, r.created_at,
         COALESCE(json_agg(
           json_build_object(
             'method', mr.method, 'status', mr.status,
             'markdown', mr.result_markdown, 'structured', mr.result_structured,
             'error_detail', mr.error_detail
           ) ORDER BY mr.created_at ASC
         ) FILTER (WHERE mr.id IS NOT NULL), '[]') AS method_results,
         p.titel AS produktion_titel
       FROM analysis_runs r
       LEFT JOIN analysis_method_results mr ON mr.run_id = r.id
       LEFT JOIN produktionen p ON p.id = r.produktion_id
       WHERE r.id = $1
       GROUP BY r.id, p.titel`,
      [req.params.id]
    )
    if (!run) return res.status(404).json({ error: 'Run nicht gefunden' })
    if (run.status !== 'completed') {
      return res.status(409).json({ error: 'Analyse noch nicht abgeschlossen' })
    }

    const [companyInfo, templateData] = await Promise.all([
      fetchAuthJson('/api/public/company-info'),
      fetchAuthJson('/api/public/document-templates/default'),
    ])

    const html = buildAnalysisPdfHtml(run, companyInfo)

    const headerZone = buildPuppeteerZone(
      { left: templateData?.header_left, center: templateData?.header_center, right: templateData?.header_right },
      companyInfo
    )
    const footerZone = buildPuppeteerZone(
      { left: templateData?.footer_left, center: templateData?.footer_center, right: templateData?.footer_right },
      companyInfo
    )
    const fallbackFooter = `<div style="font-size:8pt;font-family:sans-serif;color:#888;width:100%;text-align:center">Seite <span class="pageNumber"></span>&thinsp;/&thinsp;<span class="totalPages"></span></div>`

    const browser = await puppeteer.launch({
      executablePath: puppeteer.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuf = await page.pdf({
        format: 'A4',
        margin: { top: '2.2cm', bottom: '2.2cm', left: '2.5cm', right: '2.5cm' },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: headerZone || '<span style="font-size:0"></span>',
        footerTemplate: footerZone || fallbackFooter,
      })
      await page.close()

      const scopeSlug = run.folge_nummer != null ? `folge${run.folge_nummer}` : `block${run.block_nummer}`
      res.set('Content-Type', 'application/pdf')
      res.set('Content-Disposition', `attachment; filename="analyse-${scopeSlug}-${new Date().toISOString().slice(0, 10)}.pdf"`)
      res.send(Buffer.from(pdfBuf))
    } finally {
      await browser.close()
    }
  } catch (err: any) {
    console.error('[analysis/pdf]', err)
    res.status(500).json({ error: err.message || String(err) })
  }
})

export default router
