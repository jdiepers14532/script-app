/**
 * Statistik-HTML-Renderer — Phase A4
 *
 * Rendert einen Statistik-Report als reines HTML für die Einbettung in
 * den PDF-Export via pdfAssembler. Direkte DB-Abfragen, kein HTTP.
 *
 * Optisch identisch mit dem StatistikModal-Frontend (gleiche Sektionen,
 * gleiche Datenaggregation, gleiche Sektion-Reihenfolge).
 */

import { pool } from '../db'

// ── Öffentliche Interface-Definition ─────────────────────────────────────────

export interface StatistikFormatConfig {
  fontFamily?: string
  fontSize?: number
  lineHeight?: number
}

export interface OnlinerFormatConfig {
  /** Schriftart für Tabellen-Inhalt */
  tableFontFamily?: string
  /** Schriftgröße (pt) für Tabellen-Inhalt */
  tableFontSize?: number
  /** Zeilenabstand für Tabellen-Inhalt */
  tableLineHeight?: number
  /** Schriftart für Überschrift */
  headingFontFamily?: string
  /** Schriftgröße (pt) für Überschrift */
  headingFontSize?: number
  /** Fettschrift für Überschrift */
  headingBold?: boolean
  /** Breite (pt) der Szenenreferenz-Spalte */
  refColWidthPt?: number
}

export interface StatistikExportConfig {
  /** Folge-IDs (eine für Folge-Modus, mehrere für Block-Modus) */
  folge_ids: number[]
  /** Repräsentative Folgen-Nummer für den Anzeige-Titel */
  folge_nummer: number
  /** 'folge' = einzelne Folge, 'block' = mehrere Folgen desselben Blocks */
  mode: 'folge' | 'block'
  /** Welche Sektionen rendern: uebersicht | rollen_pro_bild | rollen | motive | drehorte */
  sections: string[]
  /** Szenen-Nummern die im Export enthalten sind — null = alle; mit Filter = Teilmenge */
  includedSceneNumbers?: number[] | null
}

// ── Interne Typen ─────────────────────────────────────────────────────────────

interface StatistikConfig {
  szenenanzahl: {
    stockshots_mitzaehlen: boolean
    flashbacks_ganzeszene_referenz_mitzaehlen: boolean
  }
  stoppzeit: {
    stockshots_mitzaehlen: boolean
    flashbacks_ganzeszene_referenz_mitzaehlen: boolean
    wechselschnitt_nur_erste: boolean
  }
}

const STATISTIK_CONFIG_DEFAULT: StatistikConfig = {
  szenenanzahl: { stockshots_mitzaehlen: false, flashbacks_ganzeszene_referenz_mitzaehlen: false },
  stoppzeit: { stockshots_mitzaehlen: false, flashbacks_ganzeszene_referenz_mitzaehlen: false, wechselschnitt_nur_erste: true },
}

// ── Hilfsfunktionen (dupliziert aus statistik.ts, um zirkuläre Imports zu vermeiden) ──

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatStoppzeit(sek: number): string {
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return `${m}:${String(s).padStart(2, '0')} min`
}

function parseSeiten(s: string | null): number {
  if (!s) return 0
  const t = s.trim()
  const m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (m) return parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3])
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}

function formatSeiten(total: number): string {
  const whole = Math.floor(total)
  const frac = total - whole
  const eighths = Math.round(frac * 8)
  if (eighths === 0) return String(whole)
  if (eighths === 8) return String(whole + 1)
  return `${whole} ${eighths}/8`
}

function parseOrt(ort: string | null): { drehort: string; motiv: string } {
  if (!ort) return { drehort: 'Unbekannt', motiv: 'Unbekannt' }
  const idx = ort.indexOf(' / ')
  if (idx >= 0) return { drehort: ort.slice(0, idx).trim(), motiv: ort.slice(idx + 3).trim() }
  return { drehort: ort.trim(), motiv: ort.trim() }
}

async function getStatistikConfig(client: any, produktion_id: string): Promise<StatistikConfig> {
  try {
    const r = await client.query(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'statistik_config'`,
      [produktion_id]
    )
    if (!r.rows.length) return STATISTIK_CONFIG_DEFAULT
    const parsed = JSON.parse(r.rows[0].value)
    return {
      szenenanzahl: { ...STATISTIK_CONFIG_DEFAULT.szenenanzahl, ...(parsed.szenenanzahl ?? {}) },
      stoppzeit:    { ...STATISTIK_CONFIG_DEFAULT.stoppzeit,    ...(parsed.stoppzeit    ?? {}) },
    }
  } catch { return STATISTIK_CONFIG_DEFAULT }
}

function keepForSzenenanzahl(s: any, cfg: StatistikConfig): boolean {
  if ((s.format ?? 'storyline') === 'notiz') return false
  if (!cfg.szenenanzahl.stockshots_mitzaehlen && s.sondertyp === 'stockshot') return false
  if (!cfg.szenenanzahl.flashbacks_ganzeszene_referenz_mitzaehlen &&
      s.sondertyp === 'flashback' && s.flashback_ganze_szene && s.flashback_referenz_id) return false
  return true
}

function stoppzeitOf(s: any, cfg: StatistikConfig, wsPartnerIds: Set<string>): number {
  if ((s.format ?? 'storyline') === 'notiz') return 0
  if (!cfg.stoppzeit.stockshots_mitzaehlen && s.sondertyp === 'stockshot') return 0
  if (!cfg.stoppzeit.flashbacks_ganzeszene_referenz_mitzaehlen &&
      s.sondertyp === 'flashback' && s.flashback_ganze_szene && s.flashback_referenz_id) return 0
  if (cfg.stoppzeit.wechselschnitt_nur_erste && wsPartnerIds.has(String(s.scene_identity_id))) return 0
  return Number(s.stoppzeit_sek) || 0
}

// ── HTML-Bausteine ────────────────────────────────────────────────────────────

/** Überschreibt die Base-Styles von .stat-wrap wenn Format-Config gesetzt */
function buildFormatOverride(format?: StatistikFormatConfig): string {
  if (!format) return ''
  const parts: string[] = []
  if (format.fontFamily) parts.push(`font-family: '${format.fontFamily}', sans-serif;`)
  if (format.fontSize)   parts.push(`font-size: ${format.fontSize}pt;`)
  if (format.lineHeight) parts.push(`line-height: ${format.lineHeight};`)
  if (!parts.length)     return ''
  return `<style>.stat-wrap { ${parts.join(' ')} }</style>`
}

const STYLES = `
<style>
  .stat-wrap {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10pt;
    color: #111;
    line-height: 1.5;
    max-width: 165mm;
  }
  .stat-title {
    font-size: 13pt;
    font-weight: bold;
    margin: 0 0 16pt;
    letter-spacing: 0.03em;
  }
  .stat-section {
    margin-bottom: 18pt;
    break-inside: avoid;
  }
  .stat-section-header {
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #888;
    margin: 0 0 4pt;
    padding-bottom: 3pt;
    border-bottom: 0.5pt solid #ddd;
  }
  .stat-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 2pt 0;
    border-bottom: 0.3pt solid #f0f0f0;
  }
  .stat-row:last-child { border-bottom: none; }
  .stat-row-name {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .stat-row-sub {
    font-size: 8.5pt;
    color: #666;
    margin-left: 4pt;
  }
  .stat-badge {
    font-size: 8.5pt;
    font-weight: bold;
    background: #f0f0f0;
    color: #444;
    border-radius: 3pt;
    padding: 0.5pt 4pt;
    margin-left: 8pt;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .stat-scene-refs {
    font-size: 7.5pt;
    color: #999;
    margin-top: 1pt;
    line-height: 1.4;
    display: block;
  }
  .stat-scene-ref {
    display: inline-block;
    margin-right: 4pt;
    white-space: nowrap;
  }
  .stat-scene-ref a {
    color: #555;
    text-decoration: none;
  }
  .stat-scene-ref a:hover { text-decoration: underline; }
  .stat-overview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4pt 16pt;
    margin-top: 2pt;
  }
  .stat-kv {
    display: flex;
    justify-content: space-between;
    padding: 1.5pt 0;
    border-bottom: 0.3pt solid #f0f0f0;
    font-size: 9.5pt;
  }
  .stat-kv-label { color: #555; }
  .stat-kv-value { font-weight: bold; }
  .stat-empty {
    color: #bbb;
    font-style: italic;
    font-size: 9pt;
    padding: 4pt 0;
  }
  .stat-histogram {
    display: flex;
    align-items: flex-end;
    gap: 4pt;
    height: 40pt;
    margin: 4pt 0 8pt;
  }
  .stat-histogram-bar-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    height: 100%;
    justify-content: flex-end;
  }
  .stat-histogram-count {
    font-size: 7pt;
    color: #888;
    margin-bottom: 1pt;
  }
  .stat-histogram-bar {
    width: 100%;
    background: #333;
    min-height: 2pt;
  }
  .stat-histogram-label {
    font-size: 7pt;
    color: #666;
    margin-top: 2pt;
  }
  .stat-page-break { break-before: page; }
</style>
`

function sceneRef(
  ref: string,
  includedSceneNumbers: Set<number> | null
): string {
  // ref = "4402.6" (folge_nummer.scene_nummer)
  const parts = ref.split('.')
  const sceneNr = parts.length >= 2 ? parseInt(parts[parts.length - 1], 10) : NaN
  const display = esc(ref)
  if (includedSceneNumbers === null || (sceneNr && includedSceneNumbers.has(sceneNr))) {
    return `<span class="stat-scene-ref"><a href="#scene-${sceneNr}">${display}</a></span>`
  }
  return `<span class="stat-scene-ref">${display}</span>`
}

function sceneRefs(scenes: string[], includedNrs: Set<number> | null): string {
  if (!scenes.length) return ''
  return `<span class="stat-scene-refs">${scenes.map(s => sceneRef(s, includedNrs)).join('')}</span>`
}

function sectionHeader(title: string): string {
  return `<div class="stat-section-header">${esc(title)}</div>`
}

// ── Sektion-Renderer ──────────────────────────────────────────────────────────

function renderUebersicht(data: {
  bilder: number; seiten_display: string
  vorstopp_sek: number; chars_total: number; repliken: number
  wechselschnitt?: number; stockshots?: number; flashbacks?: number
}): string {
  const items: [string, string][] = [
    ['Bilder (Szenen)', String(data.bilder)],
    ['Drehbuchseiten', data.seiten_display],
    ['Vorstopp', data.vorstopp_sek > 0 ? formatStoppzeit(data.vorstopp_sek) : '–'],
    ['Figuren', String(data.chars_total)],
    ['Repliken gesamt', String(data.repliken)],
  ]
  if ((data.wechselschnitt ?? 0) > 0) items.push(['Wechselschnitte', String(data.wechselschnitt)])
  if ((data.stockshots ?? 0) > 0)    items.push(['Stockshots', String(data.stockshots)])
  if ((data.flashbacks ?? 0) > 0)    items.push(['Flashbacks', String(data.flashbacks)])

  const rows = items.map(([label, value]) =>
    `<div class="stat-kv"><span class="stat-kv-label">${esc(label)}</span><span class="stat-kv-value">${esc(value)}</span></div>`
  ).join('')
  return `<div class="stat-section">
    ${sectionHeader('Übersicht')}
    ${rows}
  </div>`
}

function renderRollenProBild(rollen_pro_bild: Array<{ rollen_count: number; bilder_count: number }>): string {
  if (!rollen_pro_bild.length) {
    return `<div class="stat-section">${sectionHeader('Figuren pro Bild')}<div class="stat-empty">Keine Daten</div></div>`
  }
  const maxBilder = Math.max(...rollen_pro_bild.map(r => r.bilder_count), 1)
  const bars = rollen_pro_bild.map(r => {
    const pct = Math.round((r.bilder_count / maxBilder) * 100)
    return `<div class="stat-histogram-bar-wrap">
      <div class="stat-histogram-count">${r.bilder_count}</div>
      <div class="stat-histogram-bar" style="height:${pct}%"></div>
      <div class="stat-histogram-label">${r.rollen_count}</div>
    </div>`
  }).join('')
  return `<div class="stat-section">
    ${sectionHeader('Figuren pro Bild')}
    <div class="stat-histogram">${bars}</div>
    <div style="font-size:7pt;color:#aaa;text-align:right">Anzahl Figuren →</div>
  </div>`
}

function renderRollen(
  rollen: Array<{ character_name: string; darsteller_name: string | null; kategorie_name: string | null; kategorie_typ: string | null; scene_count: number; scenes: string[] }>,
  includedNrs: Set<number> | null
): string {
  // Aufteilen in Rollen (nicht komparse) und Komparsen
  const hauptrollen = rollen.filter(r => r.kategorie_typ !== 'komparse')
  const komparsen   = rollen.filter(r => r.kategorie_typ === 'komparse')

  const renderGroup = (items: typeof rollen) => {
    if (!items.length) return '<div class="stat-empty">Keine Einträge</div>'
    return items.map(r => {
      const sub = r.darsteller_name ? ` (${esc(r.darsteller_name)})` : ''
      return `<div class="stat-row" style="flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <span class="stat-row-name">${esc(r.character_name)}</span>
          ${sub ? `<span class="stat-row-sub">${sub}</span>` : ''}
          ${sceneRefs(r.scenes, includedNrs)}
        </div>
        <span class="stat-badge">${r.scene_count} Sz.</span>
      </div>`
    }).join('')
  }

  const parts: string[] = []
  if (hauptrollen.length) {
    parts.push(`<div class="stat-section">
      ${sectionHeader('Rollen')}
      ${renderGroup(hauptrollen)}
    </div>`)
  }
  if (komparsen.length) {
    parts.push(`<div class="stat-section">
      ${sectionHeader('Komparsen m. Sp.')}
      ${renderGroup(komparsen)}
    </div>`)
  }
  if (!parts.length) {
    parts.push(`<div class="stat-section">${sectionHeader('Rollen')}<div class="stat-empty">Keine Rollen erfasst</div></div>`)
  }
  return parts.join('\n')
}

function renderMotive(
  motive: Array<{ name: string; drehort: string; scene_count: number; scenes: string[] }>,
  includedNrs: Set<number> | null
): string {
  if (!motive.length) {
    return `<div class="stat-section">${sectionHeader('Motive')}<div class="stat-empty">Keine Motive erfasst</div></div>`
  }
  const rows = motive.map(m =>
    `<div class="stat-row" style="flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <span class="stat-row-name">${esc(m.name)}</span>
        ${m.drehort !== m.name ? `<span class="stat-row-sub">${esc(m.drehort)}</span>` : ''}
        ${sceneRefs(m.scenes, includedNrs)}
      </div>
      <span class="stat-badge">${m.scene_count} Sz.</span>
    </div>`
  ).join('')
  return `<div class="stat-section">
    ${sectionHeader('Motive')}
    ${rows}
  </div>`
}

function renderDrehorte(drehorte: Array<{ name: string; scene_count: number }>): string {
  if (!drehorte.length) {
    return `<div class="stat-section">${sectionHeader('Drehorte')}<div class="stat-empty">Keine Drehorte erfasst</div></div>`
  }
  const rows = drehorte.map(d =>
    `<div class="stat-row">
      <span class="stat-row-name">${esc(d.name)}</span>
      <span class="stat-badge">${d.scene_count} Sz.</span>
    </div>`
  ).join('')
  return `<div class="stat-section">
    ${sectionHeader('Drehorte')}
    ${rows}
  </div>`
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

/**
 * Rendert den Statistik-Report als einbettbares HTML-Fragment.
 * Enthält eigene <style>-Tags. Kein <html>/<body>.
 */
export async function renderStatistikHtml(config: StatistikExportConfig, format?: StatistikFormatConfig): Promise<string> {
  const client = await pool.connect()
  try {
    // 1. Produktion aus erster Folge ermitteln
    const folgeIds = config.folge_ids
    if (!folgeIds.length) {
      return `<div style="color:#c00;font-family:sans-serif">Statistik: Keine Folge-IDs angegeben.</div>`
    }
    const folgeRes = await client.query(
      `SELECT f.id, f.folge_nummer, f.folgen_titel, f.produktion_id, p.titel AS produktion_titel
       FROM folgen f
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE f.id = $1`,
      [folgeIds[0]]
    )
    if (!folgeRes.rows.length) {
      return `<div style="color:#c00;font-family:sans-serif">Statistik: Folge ${folgeIds[0]} nicht gefunden.</div>`
    }
    const folge = folgeRes.rows[0]

    // 2. Werkstufen ermitteln (latest drehbuch, fallback storyline)
    let wsRows: any[] = []

    for (const typ of ['drehbuch', 'storyline', 'notiz']) {
      const r = await client.query(
        `SELECT DISTINCT ON (w.folge_id) w.id, w.folge_id, f.folge_nummer
         FROM werkstufen w
         JOIN folgen f ON f.id = w.folge_id
         WHERE f.id = ANY($1::int[]) AND w.typ = $2 AND f.produktion_id = $3
         ORDER BY w.folge_id, w.version_nummer DESC`,
        [folgeIds, typ, folge.produktion_id]
      )
      if (r.rows.length) { wsRows = r.rows; break }
    }

    if (!wsRows.length) {
      return `<div style="color:#888;font-family:sans-serif;font-size:9pt">Keine Werkstufe für diese Folge verfügbar.</div>`
    }

    const wsIds = wsRows.map((r: any) => r.id)

    // 3. Statistik-Konfiguration
    const cfg = await getStatistikConfig(client, folge.produktion_id)

    // 4. Szenen laden
    const scenesRes = await client.query(
      `SELECT ds.scene_identity_id, ds.scene_nummer, ds.ort_name, ds.int_ext,
              ds.seiten, ds.stoppzeit_sek, ds.werkstufe_id, ds.format,
              ds.sondertyp, ds.flashback_ganze_szene, ds.flashback_referenz_id,
              f.folge_nummer, w.folge_id
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.werkstufe_id = ANY($1::uuid[]) AND ds.geloescht = false
       ORDER BY f.folge_nummer, ds.scene_nummer`,
      [wsIds]
    )
    const scenes = scenesRes.rows

    // 5. Wechselschnitt-Partner
    let wsPartnerIds = new Set<string>()
    if (cfg.stoppzeit.wechselschnitt_nur_erste && wsIds.length > 0) {
      const partnerRes = await client.query(
        `SELECT DISTINCT wp.partner_identity_id::text
         FROM wechselschnitt_partner wp
         JOIN dokument_szenen main_ds ON main_ds.id = wp.dokument_szene_id
         WHERE main_ds.werkstufe_id = ANY($1::uuid[]) AND main_ds.geloescht = false`,
        [wsIds]
      )
      wsPartnerIds = new Set(partnerRes.rows.map((r: any) => r.partner_identity_id))
    }

    // 6. Charaktere laden
    const charsRes = await client.query(
      `SELECT sc.scene_identity_id, sc.werkstufe_id, sc.character_id, sc.spiel_typ,
              sc.repliken_anzahl, sc.anzahl,
              c.name AS character_name,
              cp.darsteller_name,
              ck.name AS kategorie_name, ck.typ AS kategorie_typ,
              ds.scene_nummer, f.folge_nummer
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_productions cp ON cp.character_id = c.id AND cp.produktion_id = $2
       JOIN dokument_szenen ds ON ds.scene_identity_id = sc.scene_identity_id
                               AND ds.werkstufe_id = sc.werkstufe_id
                               AND ds.geloescht = false
                               AND COALESCE(ds.format, 'storyline') != 'notiz'
       JOIN werkstufen w ON w.id = sc.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       LEFT JOIN character_kategorien ck ON ck.id = COALESCE(cp.kategorie_id, sc.kategorie_id)
       WHERE sc.werkstufe_id = ANY($1::uuid[])
       ORDER BY c.name, f.folge_nummer, ds.scene_nummer`,
      [wsIds, folge.produktion_id]
    )
    const chars = charsRes.rows

    // 7. Filter anwenden
    const filteredScenes = scenes.filter(s => keepForSzenenanzahl(s, cfg))
    const filteredSceneKeys = new Set(
      filteredScenes.map((s: any) => `${s.werkstufe_id}:${s.scene_identity_id}`)
    )
    const filteredChars = chars.filter((ch: any) =>
      filteredSceneKeys.has(`${ch.werkstufe_id}:${ch.scene_identity_id}`)
    )

    // includedSceneNumbers: null = alle verlinken; sonst nur enthaltene
    const includedNrs: Set<number> | null = config.includedSceneNumbers
      ? new Set(config.includedSceneNumbers)
      : null

    // 8. Aggregationen

    // Übersicht
    const bilder = filteredScenes.length
    const seitenTotal = filteredScenes.reduce((sum: number, s: any) => sum + parseSeiten(s.seiten), 0)
    const vorstopp_sek = scenes.reduce((sum: number, s: any) => sum + stoppzeitOf(s, cfg, wsPartnerIds), 0)
    const chars_total = new Set(filteredChars.map((c: any) => c.character_id)).size
    const repliken = filteredChars.reduce((sum: number, c: any) => sum + (Number(c.repliken_anzahl) || 0), 0)
    const wechselschnitt = scenes.filter((s: any) => s.sondertyp === 'wechselschnitt').length
    const stockshots    = scenes.filter((s: any) => s.sondertyp === 'stockshot').length
    const flashbacks    = scenes.filter((s: any) => s.sondertyp === 'flashback').length

    // Rollen pro Bild (Histogram)
    const sceneCharCounts = new Map<string, number>()
    for (const s of filteredScenes) {
      sceneCharCounts.set(`${s.werkstufe_id}:${s.scene_identity_id}`, 0)
    }
    for (const ch of filteredChars) {
      const key = `${ch.werkstufe_id}:${ch.scene_identity_id}`
      sceneCharCounts.set(key, (sceneCharCounts.get(key) || 0) + 1)
    }
    const histogram = new Map<number, number>()
    for (const count of sceneCharCounts.values()) {
      histogram.set(count, (histogram.get(count) || 0) + 1)
    }
    const rollen_pro_bild = [...histogram.entries()]
      .filter(([c]) => c > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([rollen_count, bilder_count]) => ({ rollen_count, bilder_count }))

    // Rollen (character list)
    const rollenMap = new Map<string, {
      character_name: string; darsteller_name: string | null
      kategorie_name: string | null; kategorie_typ: string | null
      scene_count: number; scenes: string[]
    }>()
    for (const ch of filteredChars) {
      if (!rollenMap.has(ch.character_id)) {
        rollenMap.set(ch.character_id, {
          character_name: ch.character_name,
          darsteller_name: ch.darsteller_name || null,
          kategorie_name: ch.kategorie_name || null,
          kategorie_typ: ch.kategorie_typ || null,
          scene_count: 0, scenes: [],
        })
      }
      const r = rollenMap.get(ch.character_id)!
      r.scene_count++
      r.scenes.push(`${ch.folge_nummer}.${ch.scene_nummer}`)
    }
    const rollen = [...rollenMap.values()].sort((a, b) => b.scene_count - a.scene_count)

    // Motive
    const motivMap = new Map<string, { name: string; drehort: string; scene_count: number; scenes: string[] }>()
    for (const s of filteredScenes) {
      const key = s.ort_name || 'Unbekannt'
      if (!motivMap.has(key)) {
        const p = parseOrt(s.ort_name)
        motivMap.set(key, { name: p.motiv, drehort: p.drehort, scene_count: 0, scenes: [] })
      }
      const m = motivMap.get(key)!
      m.scene_count++
      m.scenes.push(`${s.folge_nummer}.${s.scene_nummer}`)
    }
    const motive = [...motivMap.values()].sort((a, b) => b.scene_count - a.scene_count)

    // Drehorte
    const drehortMap = new Map<string, number>()
    for (const s of filteredScenes) {
      const { drehort } = parseOrt(s.ort_name)
      drehortMap.set(drehort, (drehortMap.get(drehort) || 0) + 1)
    }
    const drehorte = [...drehortMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, scene_count]) => ({ name, scene_count }))

    // 9. Titel aufbauen
    const folgenLabel = config.mode === 'block' && wsRows.length > 1
      ? `Block (${wsRows.map((r: any) => r.folge_nummer).sort((a: number, b: number) => a - b).join(', ')})`
      : `Folge ${config.folge_nummer}${folge.folgen_titel ? ' – ' + folge.folgen_titel : ''}`

    const titleHtml = `<div class="stat-title">Statistik — ${esc(folgenLabel)}</div>`

    // 10. Sektionen rendern
    const sectionOrder = ['uebersicht', 'rollen_pro_bild', 'rollen', 'motive', 'drehorte']
    const activeSections = sectionOrder.filter(s => config.sections.includes(s))
    const sectionHtmlParts: string[] = []

    for (const sec of activeSections) {
      switch (sec) {
        case 'uebersicht':
          sectionHtmlParts.push(renderUebersicht({
            bilder, seiten_display: formatSeiten(seitenTotal),
            vorstopp_sek, chars_total, repliken,
            wechselschnitt, stockshots, flashbacks,
          }))
          break
        case 'rollen_pro_bild':
          sectionHtmlParts.push(renderRollenProBild(rollen_pro_bild))
          break
        case 'rollen':
          sectionHtmlParts.push(renderRollen(rollen, includedNrs))
          break
        case 'motive':
          sectionHtmlParts.push(renderMotive(motive, includedNrs))
          break
        case 'drehorte':
          sectionHtmlParts.push(renderDrehorte(drehorte))
          break
      }
    }

    if (!sectionHtmlParts.length) {
      return `<div style="color:#aaa;font-size:9pt">Keine Statistik-Sektionen ausgewählt.</div>`
    }

    return `${STYLES}${buildFormatOverride(format)}
<div class="stat-wrap">
  ${titleHtml}
  ${sectionHtmlParts.join('\n')}
</div>`

  } finally {
    client.release()
  }
}

// ── Ergänzende Stile ───────────────────────────────────────────────────────────

function buildOnlinerStyles(fmt?: OnlinerFormatConfig): string {
  const tableFf = fmt?.tableFontFamily ? `'${fmt.tableFontFamily}', sans-serif` : "'Courier New', Courier, monospace"
  const tableFs = fmt?.tableFontSize   ? `${fmt.tableFontSize}pt`               : '10pt'
  const tableLh = fmt?.tableLineHeight ? String(fmt.tableLineHeight)             : '1.4'
  const refW    = fmt?.refColWidthPt   ? `${fmt.refColWidthPt}pt`               : '52pt'

  const titleOverrides: string[] = []
  if (fmt?.headingFontFamily) titleOverrides.push(`font-family: '${fmt.headingFontFamily}', sans-serif;`)
  if (fmt?.headingFontSize)   titleOverrides.push(`font-size: ${fmt.headingFontSize}pt;`)
  if (fmt?.headingBold === false) titleOverrides.push(`font-weight: normal;`)
  const titleOverride = titleOverrides.length
    ? `\n  .stat-title { ${titleOverrides.join(' ')} }`
    : ''

  return `<style>
  .onliner-table {
    width: 100%;
    border-collapse: collapse;
    font-family: ${tableFf};
    font-size: ${tableFs};
    line-height: ${tableLh};
  }
  .onliner-th {
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #888;
    padding: 0 8pt 4pt 0;
    border-bottom: 0.5pt solid #ddd;
    text-align: left;
    white-space: nowrap;
  }
  .onliner-td-ref {
    width: ${refW};
    padding: 2.5pt 8pt 2.5pt 0;
    vertical-align: top;
    white-space: nowrap;
    font-weight: bold;
    color: #333;
    border-bottom: 0.3pt solid #f0f0f0;
    font-size: 9.5pt;
  }
  .onliner-td-text {
    padding: 2.5pt 0;
    vertical-align: top;
    border-bottom: 0.3pt solid #f0f0f0;
  }
  .onliner-empty { color: #ccc; }${titleOverride}
</style>`
}

// ── Shared helper: Werkstufen-IDs für eine Folgen-Menge ermitteln ──────────────

async function resolveWsIds(client: any, folgeIds: number[], produktionId: string): Promise<string[]> {
  for (const typ of ['drehbuch', 'storyline']) {
    const r = await client.query(
      `SELECT DISTINCT ON (w.folge_id) w.id
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       WHERE f.id = ANY($1::int[]) AND w.typ = $2 AND f.produktion_id = $3
       ORDER BY w.folge_id, w.version_nummer DESC`,
      [folgeIds, typ, produktionId]
    )
    if (r.rows.length) return r.rows.map((row: any) => row.id)
  }
  return []
}

// ── Onliner-Export ─────────────────────────────────────────────────────────────

/**
 * Rendert eine zweispaltige Onliner-Tabelle (Szenennummer | Onliner-Text).
 */
export async function renderOnlinerHtml(config: StatistikExportConfig, format?: OnlinerFormatConfig): Promise<string> {
  const client = await pool.connect()
  try {
    const { folge_ids: folgeIds } = config
    if (!folgeIds.length) {
      return `<div style="color:#c00;font-family:sans-serif">Onliner: Keine Folge-IDs angegeben.</div>`
    }

    const folgeRes = await client.query(
      `SELECT f.id, f.folge_nummer, f.folgen_titel, f.produktion_id
       FROM folgen f WHERE f.id = $1`,
      [folgeIds[0]]
    )
    if (!folgeRes.rows.length) {
      return `<div style="color:#c00;font-family:sans-serif">Onliner: Folge ${folgeIds[0]} nicht gefunden.</div>`
    }
    const folge = folgeRes.rows[0]
    const wsIds = await resolveWsIds(client, folgeIds, folge.produktion_id)

    if (!wsIds.length) {
      return `<div style="color:#888;font-family:sans-serif;font-size:9pt">Keine Werkstufe für diese Folge verfügbar.</div>`
    }

    const scenesRes = await client.query(
      `SELECT ds.scene_nummer, ds.scene_nummer_suffix, ds.zusammenfassung, f.folge_nummer
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.werkstufe_id = ANY($1::uuid[])
         AND ds.geloescht = false
         AND COALESCE(ds.format, 'storyline') != 'notiz'
       ORDER BY f.folge_nummer, ds.scene_nummer, COALESCE(ds.scene_nummer_suffix, '')`,
      [wsIds]
    )

    const folgenLabel = config.mode === 'block' && folgeIds.length > 1
      ? `Block ab Folge ${config.folge_nummer}`
      : `Folge ${config.folge_nummer}${folge.folgen_titel ? ' \u2013 ' + folge.folgen_titel : ''}`

    const titleHtml = `<div class="stat-title">Onliner \u2014 ${esc(folgenLabel)}</div>`

    if (!scenesRes.rows.length) {
      return `${STYLES}${buildOnlinerStyles(format)}<div class="stat-wrap">${titleHtml}<div class="stat-empty">Keine Szenen gefunden.</div></div>`
    }

    const rows = scenesRes.rows.map((s: any) => {
      const ref = `${s.folge_nummer}.${s.scene_nummer}${s.scene_nummer_suffix ?? ''}`
      const text = s.zusammenfassung?.trim()
      return `<tr>
        <td class="onliner-td-ref">${esc(ref)}</td>
        <td class="onliner-td-text">${text ? esc(text) : '<span class="onliner-empty">\u2014</span>'}</td>
      </tr>`
    }).join('\n')

    return `${STYLES}${buildOnlinerStyles(format)}
<div class="stat-wrap">
  ${titleHtml}
  <div>
    <table class="onliner-table">
      <thead>
        <tr>
          <th class="onliner-th">Szene</th>
          <th class="onliner-th">Onliner</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</div>`
  } finally {
    client.release()
  }
}

