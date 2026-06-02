/**
 * Analysis Runner — Orchestrierung
 *
 * prepareAnalysisRun  — DB-Prep (Block auflösen, Szenen laden, Run anlegen) → run_id sofort
 * executeAnalysisRun  — KI-Aufrufe im Hintergrund, Status-Updates in DB
 */

import * as crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { query, queryOne } from '../../db'
import { resolveBlock } from '../blocks/resolver'
import { runStoryConsultant, calcCostEurCent } from './methods/story-consultant'
import { runStrangHeatmap } from './methods/strang-heatmap'
import { runFigurenAgency } from './methods/figuren-agency'
import { runVonnegutArcs } from './methods/vonnegut-arcs'
import { DocumentScene } from './scene-renderer'

export type AnalysisMethod =
  | 'story_consultant_pur'
  | 'story_consultant_framework'
  | 'strang_heatmap'
  | 'figuren_agency'
  | 'vonnegut_arcs'

const METHOD_VERSIONS: Record<AnalysisMethod, string> = {
  story_consultant_pur:       'story-consultant-pur-v2',
  story_consultant_framework: 'story-consultant-framework-v1',
  strang_heatmap:             'strang-heatmap-v1',
  figuren_agency:             'figuren-agency-v1',
  vonnegut_arcs:              'vonnegut-arcs-v1',
}

export interface MethodResult {
  method: string
  method_version: string
  status: 'completed' | 'error'
  markdown?: string
  error_detail?: string
  from_cache: boolean
  duration_ms?: number
}

export interface PreparedAnalysisContext {
  run_id: string
  methods: AnalysisMethod[]
  szenen: DocumentScene[]
  folgenRows: any[]
  werkstufenRows: any[]
  roteRosenMeta: Record<string, any> | null
  produktionRow: { id: string; titel: string }
  dreh_von?: string | null
  dreh_bis?: string | null
  block_nummer: number
  folge_nummer?: number | null
  block_version_hash: string
}

// ── Schritt 1: Synchrone Vorbereitung (nur DB-Queries, kein KI-Aufruf) ────────

export async function prepareAnalysisRun(opts: {
  produktion_id: string
  block_nummer: number
  folge_nummer?: number | null
  methods: AnalysisMethod[]
  strang_filter?: string[]
  created_by: string
}): Promise<PreparedAnalysisContext> {
  const { produktion_id, block_nummer, folge_nummer, methods, strang_filter, created_by } = opts

  // 1. Block auflösen
  const block = await resolveBlock(produktion_id, block_nummer)
  if (block.folgen_ids.length === 0) {
    throw new Error(`Block ${block_nummer} hat keine Folgen in script_db (noch kein Import)`)
  }

  // 1b. Folgen-Filter: bei Folge-Analyse nur eine Folge laden
  let active_folgen_ids = block.folgen_ids
  if (folge_nummer != null) {
    const folgeRow = await query(
      `SELECT id FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2`,
      [produktion_id, folge_nummer]
    )
    const folgeId = folgeRow[0]?.id
    if (!folgeId) throw new Error(`Folge ${folge_nummer} nicht in dieser Produktion gefunden`)
    if (!block.folgen_ids.includes(folgeId)) throw new Error(`Folge ${folge_nummer} gehört nicht zu Block ${block_nummer}`)
    active_folgen_ids = [folgeId]
  }

  // 2. Aktuellste Werkstufe pro Folge
  const werkstufenRows = await query(
    `SELECT DISTINCT ON (folge_id)
       id, folge_id, typ, version_nummer, meta_json
     FROM werkstufen
     WHERE folge_id = ANY($1::int[])
       AND typ IN ('drehbuch', 'storyline')
       AND sichtbarkeit != 'privat'
     ORDER BY folge_id,
       CASE WHEN typ = 'drehbuch' THEN 1 ELSE 0 END DESC,
       version_nummer DESC`,
    [active_folgen_ids]
  )

  const werkstufen_ids: string[] = werkstufenRows.map((w: any) => w.id)
  if (werkstufen_ids.length === 0) {
    throw new Error(`Keine importierten Werkstufen für ${folge_nummer != null ? `Folge ${folge_nummer}` : `Block ${block_nummer}`} gefunden`)
  }

  // 3. block_version_hash
  const hashInput =
    [...active_folgen_ids].sort((a, b) => a - b).join(',') +
    ':' +
    [...werkstufen_ids].sort().join(',')
  const block_version_hash = crypto.createHash('sha256').update(hashInput).digest('hex')

  // 4. Produktion laden
  const produktionRow = await queryOne(
    `SELECT id, titel FROM produktionen WHERE id = $1`,
    [produktion_id]
  )
  if (!produktionRow) throw new Error(`Produktion ${produktion_id} nicht gefunden`)

  // 5. Folgen laden
  const folgenRows = await query(
    `SELECT id, folge_nummer FROM folgen
     WHERE id = ANY($1::int[])
     ORDER BY folge_nummer ASC`,
    [active_folgen_ids]
  )

  // 6. Szenen laden
  const szenenRows = await query(
    `SELECT
       ds.id, ds.werkstufe_id, f.folge_nummer,
       ds.scene_nummer, ds.scene_nummer_suffix,
       ds.int_ext, ds.tageszeit, ds.ort_name,
       ds.spieltag, ds.zusammenfassung, ds.szeneninfo,
       ds.content, ds.format, ds.sondertyp, ds.element_type,
       ds.geloescht,
       COALESCE(
         (SELECT array_agg(
            (SELECT ds2.scene_nummer FROM dokument_szenen ds2
             WHERE ds2.scene_identity_id = wp.partner_identity_id
               AND ds2.werkstufe_id = ds.werkstufe_id
             LIMIT 1)
            ORDER BY wp.position)
          FROM wechselschnitt_partner wp
          WHERE wp.dokument_szene_id = ds.id),
         '{}'::int[]
       ) AS wechselschnitt_partner,
       COALESCE(
         (SELECT array_agg(c.name ORDER BY c.name)
          FROM scene_characters sc
          JOIN characters c ON c.id = sc.character_id
          LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
          WHERE sc.scene_identity_id = ds.scene_identity_id
            AND sc.werkstufe_id = ds.werkstufe_id
            AND (ck.typ = 'rolle' OR ck.id IS NULL)),
         '{}'::text[]
       ) AS charaktere,
       COALESCE(
         (SELECT array_agg(c.name ORDER BY c.name)
          FROM scene_characters sc
          JOIN characters c ON c.id = sc.character_id
          JOIN character_kategorien ck ON ck.id = sc.kategorie_id
          WHERE sc.scene_identity_id = ds.scene_identity_id
            AND sc.werkstufe_id = ds.werkstufe_id
            AND ck.typ = 'komparse'),
         '{}'::text[]
       ) AS komparsen
     FROM dokument_szenen ds
     JOIN scene_identities si ON si.id = ds.scene_identity_id
     JOIN folgen f ON f.id = si.folge_id
     WHERE ds.werkstufe_id = ANY($1::uuid[])
       AND ds.geloescht = false
     ORDER BY f.folge_nummer ASC, ds.scene_nummer ASC NULLS LAST, ds.sort_order ASC`,
    [werkstufen_ids]
  )

  // 7. roteRosenMeta aus erster Werkstufe mit meta_json
  let roteRosenMeta: Record<string, any> | null = null
  for (const w of werkstufenRows) {
    if (w.meta_json?.rote_rosen) {
      roteRosenMeta = w.meta_json.rote_rosen
      break
    }
  }

  // 8. Run anlegen (status=queued)
  const runRow = await queryOne(
    `INSERT INTO analysis_runs
       (produktion_id, block_nummer, folge_nummer, folgen_ids, werkstufen_ids, block_version_hash,
        requested_methods, strang_filter, created_by, status)
     VALUES ($1, $2, $3, $4::int[], $5::uuid[], $6, $7::jsonb, $8, $9, 'queued')
     RETURNING id`,
    [
      produktion_id,
      block_nummer,
      folge_nummer ?? null,
      active_folgen_ids,
      werkstufen_ids,
      block_version_hash,
      JSON.stringify(methods),
      strang_filter ?? null,
      created_by,
    ]
  )

  return {
    run_id: runRow.id,
    methods,
    szenen: szenenRows,
    folgenRows,
    werkstufenRows,
    roteRosenMeta,
    produktionRow,
    dreh_von: block.dreh_von,
    dreh_bis: block.dreh_bis,
    block_nummer,
    folge_nummer: folge_nummer ?? null,
    block_version_hash,
  }
}

// ── Schritt 2: KI-Ausführung im Hintergrund ───────────────────────────────────

export async function executeAnalysisRun(ctx: PreparedAnalysisContext): Promise<void> {
  const {
    run_id, methods, szenen, folgenRows, werkstufenRows, roteRosenMeta,
    produktionRow, dreh_von, dreh_bis, block_nummer, block_version_hash,
  } = ctx

  // Status auf 'running' setzen
  await query(`UPDATE analysis_runs SET status = 'running' WHERE id = $1`, [run_id])

  const method_results: MethodResult[] = []

  for (const method of methods) {
    const method_version = METHOD_VERSIONS[method]
    if (!method_version) {
      method_results.push({
        method, method_version: 'unknown', status: 'error',
        error_detail: `Unbekannte Methode: ${method}`, from_cache: false,
      })
      continue
    }

    const isVisual = ['strang_heatmap', 'figuren_agency', 'vonnegut_arcs'].includes(method)

    // Cache-Lookup
    const cached = await queryOne(
      `SELECT mr.id, mr.result_markdown, mr.result_structured, mr.duration_ms
       FROM analysis_method_results mr
       JOIN analysis_runs ar ON ar.id = mr.run_id
       WHERE mr.method = $1
         AND mr.method_version = $2
         AND mr.status = 'completed'
         AND ar.block_version_hash = $3
       ORDER BY mr.created_at DESC
       LIMIT 1`,
      [method, method_version, block_version_hash]
    )

    if (cached) {
      await queryOne(
        `INSERT INTO analysis_method_results
           (run_id, method, method_version, status, from_cache, result_markdown, result_structured, duration_ms)
         VALUES ($1, $2, $3, 'completed', true, $4, $5::jsonb, $6)
         RETURNING id`,
        [run_id, method, method_version,
         cached.result_markdown,
         cached.result_structured ? JSON.stringify(cached.result_structured) : null,
         cached.duration_ms]
      )
      method_results.push({
        method, method_version, status: 'completed',
        markdown: cached.result_markdown ?? undefined,
        from_cache: true, duration_ms: cached.duration_ms,
      })
      continue
    }

    // Neuer method_result (status=running)
    const methodResRow = await queryOne(
      `INSERT INTO analysis_method_results
         (run_id, method, method_version, status, from_cache)
       VALUES ($1, $2, $3, 'running', false)
       RETURNING id`,
      [run_id, method, method_version]
    )
    const method_result_id: string = methodResRow.id

    const runOpts = {
      produktion: { id: produktionRow.id, titel: produktionRow.titel },
      block_nummer, dreh_von, dreh_bis,
      folgen: folgenRows, szenen, roteRosenMeta,
    }

    try {
      if (method === 'strang_heatmap') {
        const result = await runStrangHeatmap(runOpts)
        await query(
          `UPDATE analysis_method_results SET status = 'completed', result_structured = $1::jsonb, duration_ms = $2 WHERE id = $3`,
          [JSON.stringify(result.structured), result.duration_ms, method_result_id]
        )
        await _logCost(method_result_id, run_id, result.usage)
        method_results.push({ method, method_version, status: 'completed', from_cache: false, duration_ms: result.duration_ms })

      } else if (method === 'figuren_agency') {
        const result = await runFigurenAgency(runOpts)
        await query(
          `UPDATE analysis_method_results SET status = 'completed', result_structured = $1::jsonb, duration_ms = $2 WHERE id = $3`,
          [JSON.stringify(result.structured), result.duration_ms, method_result_id]
        )
        await _logCost(method_result_id, run_id, result.usage)
        method_results.push({ method, method_version, status: 'completed', from_cache: false, duration_ms: result.duration_ms })

      } else if (method === 'vonnegut_arcs') {
        const result = await runVonnegutArcs(runOpts)
        await query(
          `UPDATE analysis_method_results SET status = 'completed', result_structured = $1::jsonb, duration_ms = $2 WHERE id = $3`,
          [JSON.stringify(result.structured), result.duration_ms, method_result_id]
        )
        await _logCost(method_result_id, run_id, result.usage)
        method_results.push({ method, method_version, status: 'completed', from_cache: false, duration_ms: result.duration_ms })

      } else {
        // story_consultant_pur / story_consultant_framework
        const result = await runStoryConsultant({
          method: method as 'story_consultant_pur' | 'story_consultant_framework',
          ...runOpts,
        })
        await query(
          `UPDATE analysis_method_results SET status = 'completed', result_markdown = $1, duration_ms = $2 WHERE id = $3`,
          [result.markdown, result.duration_ms, method_result_id]
        )
        await _logCost(method_result_id, run_id, result.usage)
        method_results.push({ method, method_version, status: 'completed', markdown: result.markdown, from_cache: false, duration_ms: result.duration_ms })
      }

    } catch (err: any) {
      let errMsg = String(err?.message || err)
      // Anthropic API-Fehler → verständliche Meldung (auch für Methoden ohne eigenes try-catch)
      if (err instanceof Anthropic.RateLimitError) {
        const m = err.message?.toLowerCase() ?? ''
        errMsg = (m.includes('credit') || m.includes('balance') || m.includes('quota'))
          ? 'Claude API-Guthaben erschöpft — bitte im Anthropic-Account aufladen.'
          : 'Claude API-Rate-Limit erreicht — bitte kurz warten und erneut versuchen.'
      } else if (err instanceof Anthropic.InternalServerError && (err as any).status === 529) {
        errMsg = 'Claude API ist momentan überlastet — bitte in einigen Minuten erneut versuchen.'
      } else if (err instanceof Anthropic.AuthenticationError) {
        errMsg = 'Claude API-Key ungültig oder abgelaufen — bitte in Admin → KI-Provider prüfen.'
      } else if (err instanceof Anthropic.APIConnectionError) {
        errMsg = 'Verbindung zur Claude API fehlgeschlagen — Netzwerkproblem auf dem Server.'
      }
      await query(
        `UPDATE analysis_method_results SET status = 'error', error_detail = $1 WHERE id = $2`,
        [errMsg, method_result_id]
      )
      method_results.push({ method, method_version, status: 'error', error_detail: errMsg, from_cache: false })
    }
  }

  // Run-Status finalisieren
  const finalStatus = method_results.every(r => r.status === 'error') ? 'error' : 'completed'
  await query(
    `UPDATE analysis_runs SET status = $1, completed_at = NOW() WHERE id = $2`,
    [finalStatus, run_id]
  )
}

// Hilfsfunktion: Kosten loggen
async function _logCost(
  method_result_id: string,
  run_id: string,
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
) {
  const modelRow = await queryOne(`SELECT value FROM app_settings WHERE key = 'analysis_model'`, [])
  const model = (modelRow?.value as string | undefined) || 'claude-sonnet-4-6'
  const { calcCostEurCent } = await import('./methods/story-consultant')
  const costEurCent = calcCostEurCent(usage, model)
  await query(
    `INSERT INTO analysis_costs
       (method_result_id, run_id, provider, model,
        input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_eur_cent)
     VALUES ($1, $2, 'claude', $3, $4, $5, $6, $7, $8)`,
    [method_result_id, run_id, model,
     usage.input_tokens, usage.output_tokens,
     usage.cache_creation_input_tokens, usage.cache_read_input_tokens,
     costEurCent]
  )
}
