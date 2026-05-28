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
import { authMiddleware } from '../auth'
import { query, queryOne } from '../db'
import { getProviderApiKey } from './ki'
import { prepareAnalysisRun, executeAnalysisRun, AnalysisMethod } from '../lib/analysis/runner'

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

    const { produktion_id, block_nummer, folge_nummer, methods, strang_filter } = req.body

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
    })

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

export default router
