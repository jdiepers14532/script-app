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
import { request as httpsRequest } from 'https'
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

function fetchBase64(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? httpsRequest : httpRequest
    try {
      const r = mod(url, res => {
        if (!res.statusCode || res.statusCode >= 400) { resolve(null); return }
        const ct = res.headers['content-type'] ?? 'image/png'
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(`data:${ct};base64,${Buffer.concat(chunks).toString('base64')}`))
        res.on('error', () => resolve(null))
      })
      r.on('error', () => resolve(null))
      r.setTimeout(5000, () => { r.destroy(); resolve(null) })
      r.end()
    } catch { resolve(null) }
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

// ── Visuelle Methoden → HTML/SVG ──────────────────────────────────────────────

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0')
}

function renderStrangHeatmapHtml(data: any): string {
  const straenge = data?.straenge ?? []
  if (!straenge.length) return '<p>Keine Strang-Daten</p>'
  const folgen: number[] = [...new Set<number>(straenge.flatMap((s: any) => s.szenen.map((z: any) => Number(z.folge_nr))))].sort((a, b) => a - b)
  const intensityAlpha = [0, 0.12, 0.28, 0.48, 0.68, 0.90]

  const rows = straenge.map((s: any) => {
    const grid: Record<number, number> = {}
    for (const z of s.szenen) grid[z.folge_nr] = Math.max(grid[z.folge_nr] ?? 0, z.intensitaet)
    const cells = folgen.map(f => {
      const v = Math.min(grid[f] ?? 0, 5)
      const alpha = v > 0 ? intensityAlpha[v] + 0.08 : 0
      const bg = v > 0 ? hexWithAlpha(s.farbe, alpha) : '#f0f0f0'
      const border = v > 0 ? hexWithAlpha(s.farbe, 0.5) : '#e0e0e0'
      const color = v >= 4 ? '#fff' : v > 0 ? s.farbe : '#ccc'
      return `<td style="width:34px;height:24px;padding:0;text-align:center;border:1px solid ${border};background:${bg};font-size:9pt;font-weight:${v >= 4 ? 700 : 400};color:${color}">${v > 0 ? v : ''}</td>`
    }).join('')
    return `<tr>
      <td style="padding:4px 10px 4px 0;white-space:nowrap;font-size:9pt;border:none">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(s.farbe)};margin-right:5px;vertical-align:middle"></span><strong>${esc(s.name)}</strong> <span style="color:#999;font-size:8pt">(${s.szenen.length})</span>
      </td>${cells}</tr>`
  }).join('')

  return `<table style="border-collapse:separate;border-spacing:2px;font-size:9pt">
    <thead><tr>
      <th style="text-align:left;padding:4px 10px 4px 0;border:none;border-bottom:1.5px solid #000">Strang</th>
      ${folgen.map(f => `<th style="width:34px;text-align:center;border:none;border-bottom:1.5px solid #000;padding:4px 2px;font-size:9pt">F${f}</th>`).join('')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:8pt;color:#666;margin-top:6pt">Intensität 1–5 · Farbtiefe = Stärke der Folge</p>`
}

function renderFigurenAgencyHtml(data: any): string {
  const charaktere = data?.charaktere ?? []
  if (!charaktere.length) return '<p>Keine Figuren-Daten</p>'
  const folgen: number[] = [...new Set<number>(charaktere.flatMap((c: any) => c.episoden.map((e: any) => Number(e.folge_nr))))].sort((a, b) => a - b)

  const rows = charaktere.map((c: any) => {
    const epMap: Record<number, any> = {}
    for (const e of c.episoden) epMap[e.folge_nr] = e
    const totalA = c.episoden.filter((e: any) => e.mode === 'AKTIV').length
    const totalR = c.episoden.filter((e: any) => e.mode === 'REAKTIV').length
    const cells = folgen.map(f => {
      const ep = epMap[f]
      if (!ep) return `<td style="padding:4px 6px;text-align:center;color:#ccc;border:1px solid #eee">—</td>`
      const isA = ep.mode === 'AKTIV'
      const isR = ep.mode === 'REAKTIV'
      const bg = isA ? '#e8fff0' : isR ? '#fff4e0' : '#f5f5f5'
      const color = isA ? '#00C853' : isR ? '#FF9500' : '#999'
      const label = isA ? 'A' : isR ? 'R' : 'P'
      return `<td style="padding:4px 6px;text-align:center;background:${bg};color:${color};font-weight:700;border:1px solid ${isA ? '#00C85330' : isR ? '#FF950030' : '#e0e0e0'}">${label}</td>`
    }).join('')
    return `<tr>
      <td style="padding:4px 10px 4px 0;white-space:nowrap;font-size:9pt;border:none">${esc(c.name)}</td>
      ${cells}
      <td style="padding:4px 8px;text-align:center;font-size:9pt;color:#555;border:1px solid #eee">${totalA}:${totalR}</td>
    </tr>`
  }).join('')

  return `<p style="font-size:8pt;margin-bottom:6pt"><span style="color:#00C853;font-weight:700">A</span> = Aktiv (Entscheidung) &nbsp;·&nbsp; <span style="color:#FF9500;font-weight:700">R</span> = Reaktiv &nbsp;·&nbsp; — = nicht präsent</p>
  <table style="border-collapse:separate;border-spacing:2px;font-size:9pt">
    <thead><tr>
      <th style="text-align:left;padding:4px 10px 4px 0;border:none;border-bottom:1.5px solid #000">Figur</th>
      ${folgen.map(f => `<th style="padding:4px 6px;text-align:center;border:none;border-bottom:1.5px solid #000">F${f}</th>`).join('')}
      <th style="padding:4px 6px;text-align:center;border:none;border-bottom:1.5px solid #000">A:R</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function wrapSvgText(text: string, maxChars: number): string[] {
  if (!text) return []
  const words = text.split(' ')
  const lines: string[] = []
  let curr = ''
  for (const w of words) {
    const next = curr ? `${curr} ${w}` : w
    if (next.length > maxChars) {
      if (curr) lines.push(curr)
      curr = w.length > maxChars ? `${w.substring(0, maxChars - 1)}\u2026` : w
    } else {
      curr = next
    }
  }
  if (curr) lines.push(curr)
  return lines
}

/** Entfernt Markdown-Formatierungszeichen aus KI-generiertem Text (_italic_, *bold*, führende Sonderzeichen). */
function cleanText(s: string): string {
  return s
    .replace(/_+([^_\n]+)_+/g, '$1')   // _italic_ → text
    .replace(/\*+([^*\n]+)\*+/g, '$1') // *bold* / **bold** → text
    .replace(/^[\s_*#`>-]+/gm, '')     // führende Markdown-Zeichen pro Zeile
    .replace(/[\s_*`]+$/gm, '')        // abschließende Markdown-Zeichen pro Zeile
    .replace(/\s+/g, ' ')
    .trim()
}

function renderVonnegutSvg(data: any): string {
  const straenge = data?.straenge ?? []
  if (!straenge.length) return '<p>Keine Arc-Daten</p>'

  const allKeys = straenge.flatMap((s: any) => s.punkte.map((p: any) => `${p.folge_nr}.${p.scene_nr}`))
  const xKeys: string[] = [...new Set<string>(allKeys)].sort((a, b) => {
    const [af, as_] = a.split('.').map(Number)
    const [bf, bs] = b.split('.').map(Number)
    return af - bf || as_ - bs
  })

  const pMaps: Array<Record<string, number>> = straenge.map((s: any) => {
    const m: Record<string, number> = {}
    for (const p of s.punkte) m[`${p.folge_nr}.${p.scene_nr}`] = p.wert
    return m
  })
  const detailMaps: Array<Record<string, any>> = straenge.map((s: any) => {
    const m: Record<string, any> = {}
    for (const p of s.punkte) m[`${p.folge_nr}.${p.scene_nr}`] = p
    return m
  })

  const PX_PER = 14
  const W = Math.max(600, xKeys.length * PX_PER + 140)
  const CH = 170
  const PAD = { top: 26, right: 50, bottom: 36, left: 50 }
  const cW = W - PAD.left - PAD.right
  const cH = CH - PAD.top - PAD.bottom

  const xPos = (i: number) => xKeys.length > 1
    ? PAD.left + (i / (xKeys.length - 1)) * cW
    : PAD.left + cW / 2
  const yPos = (v: number) => PAD.top + ((5 - v) / 10) * cH

  const ENTRY_W = 200      // px width of each annotation box
  const LINE_H  = 14       // px per text line
  const ENTRY_PAD = 8      // vertical padding inside box
  const MAX_CHARS = 22     // chars per wrapped line (bei font-size 10 und 200px Box)

  // ── One SVG page per strand ─────────────────────────────────────────────────
  const pages = straenge.map((curStrang: any, si: number) => {
    const sp: string[] = []

    // Strand title header
    sp.push(`<text x="${PAD.left}" y="15" font-size="10" font-weight="700" fill="${esc(curStrang.farbe)}" font-family="sans-serif">● ${esc(curStrang.name)}</text>`)

    // Y-axis grid + labels
    for (const v of [-5, -4, -2, 0, 2, 4, 5]) {
      const y = yPos(v).toFixed(1)
      const isMid = v === 0
      sp.push(`<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="${isMid ? '#888' : '#ddd'}" stroke-width="${isMid ? 1 : 0.5}"${isMid ? '' : ' stroke-dasharray="2,4"'}/>`)
      if (v === 5 || v === 0 || v === -5)
        sp.push(`<text x="${PAD.left - 6}" y="${(yPos(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="7" fill="#777">${v > 0 ? '+' : ''}${v}</text>`)
    }

    // Folge separators + x-axis labels
    let lastFolge = -1
    xKeys.forEach((k, i) => {
      const f = Number(k.split('.')[0])
      if (f !== lastFolge) {
        if (i > 0) sp.push(`<line x1="${xPos(i).toFixed(1)}" y1="${PAD.top}" x2="${xPos(i).toFixed(1)}" y2="${CH - PAD.bottom}" stroke="#ebebeb" stroke-width="1"/>`)
        sp.push(`<text x="${xPos(i).toFixed(1)}" y="${CH - PAD.bottom + 11}" text-anchor="middle" font-size="7" fill="#666" font-weight="500">F${f}</text>`)
        lastFolge = f
      }
    })

    // All strand curves — current full, others faded
    straenge.forEach((strand: any, i: number) => {
      const isCur = i === si
      const pts = xKeys
        .map((k, idx) => pMaps[i][k] != null ? { x: xPos(idx), y: yPos(pMaps[i][k]) } : null)
        .filter(Boolean) as { x: number; y: number }[]
      if (!pts.length) return
      const path = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      sp.push(`<path d="${path}" fill="none" stroke="${esc(strand.farbe)}" stroke-width="${isCur ? 2.5 : 1}" stroke-linejoin="round" opacity="${isCur ? 1 : 0.35}"/>`)
      if (isCur)
        pts.forEach(p => sp.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${esc(curStrang.farbe)}" stroke="#fff" stroke-width="1.5"/>`))
    })

    // Legend (below chart)
    const LEG_Y  = CH + 10
    const LEG_IW = 140
    const LEG_COLS = Math.max(1, Math.floor(W / LEG_IW))
    const LEG_ROWS = Math.ceil(straenge.length / LEG_COLS)
    const LEG_RH = 13
    straenge.forEach((strand: any, i: number) => {
      const col = i % LEG_COLS, row = Math.floor(i / LEG_COLS)
      const lx = PAD.left + col * LEG_IW
      const ly = LEG_Y + row * LEG_RH + LEG_RH / 2
      const isCur = i === si
      sp.push(`<line x1="${lx}" y1="${ly.toFixed(1)}" x2="${(lx + 11).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${esc(strand.farbe)}" stroke-width="${isCur ? 2 : 1}" opacity="${isCur ? 1 : 0.5}"/>`)
      sp.push(`<circle cx="${(lx + 5.5).toFixed(1)}" cy="${ly.toFixed(1)}" r="${isCur ? 2.5 : 1.8}" fill="${esc(strand.farbe)}" stroke="#fff" stroke-width="0.8" opacity="${isCur ? 1 : 0.5}"/>`)
      sp.push(`<text x="${lx + 15}" y="${(ly + 3).toFixed(1)}" font-size="7" font-family="sans-serif" fill="${isCur ? '#222' : '#888'}" font-weight="${isCur ? 700 : 400}">${esc(strand.name)}</text>`)
    })

    // ── Build annotation entries (stagger algorithm) ──────────────────────────
    const ANNO_TOP = LEG_Y + LEG_ROWS * LEG_RH + 14

    interface AnnoEntry {
      cx: number; cy: number
      loc: string; val: string
      textLines: string[]  // figuren/zusammenfassung/notiz lines (already wrapped)
      level: number; totalLines: number
    }
    const placed: Array<{ cx: number; level: number }> = []
    const entries: AnnoEntry[] = []

    xKeys.forEach((k, i) => {
      const p = detailMaps[si][k]
      if (!p || (!p.figuren && !p.zusammenfassung && !p.notiz)) return
      const cx = xPos(i)
      const cy = yPos(p.wert)

      // Text lines (cleanText entfernt Markdown-Sonderzeichen wie führende Unterstriche)
      const textLines: string[] = []
      if (p.figuren) wrapSvgText(cleanText(p.figuren), MAX_CHARS).forEach(l => textLines.push(l))
      if (p.zusammenfassung) wrapSvgText(cleanText(p.zusammenfassung), MAX_CHARS).forEach(l => textLines.push(l))
      if (p.notiz) wrapSvgText(cleanText(p.notiz), MAX_CHARS).forEach(l => textLines.push(`\u2014\u202f${l}`))
      const totalLines = 1 + textLines.length  // 1 header + content

      // Stagger: find lowest level without x-collision
      let level = 0
      while (placed.some(e => e.level === level && Math.abs(e.cx - cx) < ENTRY_W + 6)) level++
      placed.push({ cx, level })

      entries.push({
        cx, cy,
        loc: `F${p.folge_nr}\u2009Sz.\u2009${p.scene_nr}`,
        val: `${p.wert > 0 ? '+' : ''}${p.wert}`,
        textLines, level, totalLines,
      })
    })

    // ── Level-Offsets zuerst berechnen (werden für Guide-Linien gebraucht) ────
    const levelMaxLines: number[] = []
    entries.forEach(e => { levelMaxLines[e.level] = Math.max(levelMaxLines[e.level] ?? 0, e.totalLines) })
    const levelY: number[] = []
    let cumY = ANNO_TOP
    for (let l = 0; l < levelMaxLines.length; l++) {
      levelY[l] = cumY
      cumY += (levelMaxLines[l] ?? 0) * LINE_H + ENTRY_PAD * 2 + 6
    }
    const totalAnnoH = levelMaxLines.length > 0 ? cumY - ANNO_TOP : 0

    // Guide lines — von Datenpunkt bis Oberkante der zugehörigen Annotationsbox
    entries.forEach(({ cx, cy, level }) => {
      const bx = Math.max(PAD.left, Math.min(W - ENTRY_W - 4, cx - ENTRY_W / 2))
      const boxCenterX = bx + ENTRY_W / 2
      const lineY2 = levelY[level] - 2
      sp.push(`<line x1="${cx.toFixed(1)}" y1="${(cy + 5).toFixed(1)}" x2="${boxCenterX.toFixed(1)}" y2="${lineY2.toFixed(1)}" stroke="${esc(curStrang.farbe)}" stroke-width="0.75" stroke-dasharray="3,3" opacity="0.5"/>`)
    })

    // Draw annotation boxes
    entries.forEach(({ cx, loc, val, textLines, level }) => {
      const bx = Math.max(PAD.left, Math.min(W - ENTRY_W - 4, cx - ENTRY_W / 2))
      const by = levelY[level]
      const boxH = (1 + textLines.length) * LINE_H + ENTRY_PAD * 2
      // subtle background
      sp.push(`<rect x="${bx - 2}" y="${by}" width="${ENTRY_W + 4}" height="${boxH}" fill="${hexWithAlpha(curStrang.farbe, 0.07)}" rx="3"/>`)
      // Folge/Szene label + value
      const headerY = by + ENTRY_PAD + LINE_H - 2
      sp.push(`<text x="${bx + 3}" y="${headerY}" font-size="8" font-family="sans-serif" fill="${esc(curStrang.farbe)}" opacity="0.8">${esc(loc)}</text>`)
      sp.push(`<text x="${bx + ENTRY_W - 3}" y="${headerY}" font-size="10" font-family="sans-serif" font-weight="700" fill="${esc(curStrang.farbe)}" text-anchor="end">${esc(val)}</text>`)
      // Content lines
      textLines.forEach((line, li) => {
        const ty = by + ENTRY_PAD + (li + 2) * LINE_H - 2
        const isNotiz = line.startsWith('\u2014')
        sp.push(`<text x="${bx + 3}" y="${ty}" font-size="9" font-family="sans-serif" fill="${isNotiz ? '#666' : '#222'}" font-style="${isNotiz ? 'italic' : 'normal'}">${esc(line)}</text>`)
      })
    })

    const totalH = ANNO_TOP + totalAnnoH + 6
    const pageBreak = si < straenge.length - 1 ? 'page-break-after:always;' : ''

    return `<div style="${pageBreak}page-break-inside:avoid"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" style="display:block;width:100%;height:auto;max-height:13cm;font-family:sans-serif">${sp.join('')}</svg></div>`
  })

  return pages.join('\n')
}

function renderStructuredHtml(method: string, data: any): string {
  if (method === 'strang_heatmap') return renderStrangHeatmapHtml(data)
  if (method === 'figuren_agency') return renderFigurenAgencyHtml(data)
  if (method === 'vonnegut_arcs') return renderVonnegutSvg(data)
  return '<p>Visuelle Analyse — vollständige Darstellung in der App</p>'
}

// ── Company Info Helpers (Auth API) ───────────────────────────────────────────

function buildFirmaAdresse(raw: any): string {
  if (!raw) return ''
  const addr = raw.company_address
  const name = raw.company_name ?? ''
  const street = addr?.street ?? ''
  const zip = addr?.zip ?? ''
  const city = addr?.city ?? ''
  const addrStr = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [name, addrStr].filter(Boolean).join(' · ')
}

function buildPflichtangaben(raw: any): string {
  if (!raw) return ''
  const parts: string[] = []
  const lf = (raw.company_legal_form ?? '').toUpperCase()
  if (lf) parts.push(lf)
  if (raw.company_register_number) parts.push(`HRB ${raw.company_register_number}`)
  if (raw.company_register_court) parts.push(raw.company_register_court)
  if (raw.company_vat_id) parts.push(`USt-IdNr.: ${raw.company_vat_id}`)
  try {
    const mgmt: string[] = JSON.parse(raw.company_management || '[]')
    if (mgmt.length) parts.push(`GF: ${mgmt.join(', ')}`)
  } catch {}
  return parts.join(' · ')
}

// ── Analyse-PDF HTML ──────────────────────────────────────────────────────────

const ANALYSIS_METHOD_LABELS: Record<string, string> = {
  story_consultant_pur: 'Showrunner-Check',
  story_consultant_framework: 'Story-Consultant (Reagan, Toubia, Rocchi)',
  strang_heatmap: 'Strang-Heatmap',
  figuren_agency: 'Figuren-Agency-Matrix',
  vonnegut_arcs: 'Vonnegut-Arcs',
}

function buildAnalysisPdfHtml(run: any, companyInfo: any, singleMethod?: string): string {
  const scope = run.folge_nummer != null ? `Folge ${run.folge_nummer}` : `Block ${run.block_nummer}`
  const titel = run.produktion_titel ? `${esc(run.produktion_titel)} · ` : ''
  const dateStr = new Date(run.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })

  const results = (run.method_results ?? []).filter((mr: any) => !singleMethod || mr.method === singleMethod)
  const isSingle = results.length === 1
  const pageTitle = isSingle ? `Story-Analyse · ${ANALYSIS_METHOD_LABELS[results[0].method] || results[0].method} · ${scope}` : `Story-Analyse · ${scope}`

  const sections = results.map((mr: any, idx: number) => {
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
    const pbClass = idx > 0 ? ' class="pb"' : ''
    return `<section${pbClass}>${isSingle ? '' : `<h2>${esc(label)}</h2>`}${content}</section>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10pt;line-height:1.55;color:#111}
.header{margin-bottom:10pt;padding-bottom:6pt;border-bottom:1.5pt solid #000}
.header h1{font-size:12pt;font-weight:700;margin-bottom:2pt}
.meta{font-size:8pt;color:#666}
h2{font-size:12.5pt;font-weight:700;margin:0 0 8pt;padding-bottom:4pt;border-bottom:1.5pt solid #000}
h3{font-size:11pt;font-weight:600;margin:10pt 0 4pt}
h4{font-size:10pt;font-weight:600;margin:8pt 0 3pt}
p{margin:0 0 6pt}
ul,ol{margin:0 0 8pt 18pt}
li{margin-bottom:2pt}
hr{border:none;border-top:1pt solid #ccc;margin:10pt 0}
table{margin:6pt 0}
td,th{font-size:9pt}
pre{background:#f5f5f5;padding:8pt;border-radius:3pt;font-size:8pt;margin:6pt 0}
code{background:#f0f0f0;padding:1pt 3pt;border-radius:2pt;font-size:8.5pt}
blockquote{border-left:3pt solid #ccc;padding-left:8pt;color:#555;margin:6pt 0}
.gap{height:8pt}
.pb{page-break-before:always}
</style>
</head><body>
<div class="header">
  <h1>${esc(pageTitle)}</h1>
  <div class="meta">${titel}Erstellt am ${dateStr}</div>
</div>
${sections}
</body></html>`
}

// ── Puppeteer Header/Footer Zonen ─────────────────────────────────────────────

interface PdfCtx {
  companyInfo: any
  produktionTitel?: string
  logoBase64?: string | null
  logoHeight?: number       // aus template.logo_height
  logoWidthCm?: number | null // aus template.logo_width_cm
}

function buildPuppeteerZone(zones: { left?: any[]; center?: any[]; right?: any[] }, ctx: PdfCtx): string {
  const raw = ctx.companyInfo
  const renderZone = (zone?: any[]): string => {
    if (!zone?.length) return ''
    return zone.map((el: any): string => {
      if (el.type === 'text') return esc(el.value ?? '')
      if (el.type === 'newline') return '<br>'
      if (el.type === 'token') switch (el.key) {
        case 'firma_logo':
          if (ctx.logoBase64) {
            const h = ctx.logoHeight ?? (el.size === 'L' ? 32 : el.size === 'S' ? 16 : 24)
            const wStyle = ctx.logoWidthCm ? `max-width:${ctx.logoWidthCm}cm;` : ''
            return `<img src="${ctx.logoBase64}" style="max-height:${h}px;width:auto;${wStyle}vertical-align:middle">`
          }
          return esc(raw?.company_name ?? '')
        case 'firma_name': return esc(raw?.company_name ?? '')
        case 'firma_adresse': return esc(buildFirmaAdresse(raw))
        case 'pflichtangaben': return esc(buildPflichtangaben(raw))
        case 'seite': return 'Seite <span class="pageNumber"></span>&thinsp;/&thinsp;<span class="totalPages"></span>'
        case 'erstelldatum': return new Date().toLocaleDateString('de-DE')
        case 'produktion_titel': return esc(ctx.produktionTitel ?? '')
        case 'datum': return new Date().toLocaleDateString('de-DE')
      }
      return ''
    }).join('')
  }
  const l = renderZone(zones.left)
  const c = renderZone(zones.center)
  const r = renderZone(zones.right)
  if (!l && !c && !r) return ''
  return `<div style="font-size:8pt;font-family:sans-serif;color:#444;width:100%;padding:0 2.5cm;display:flex;justify-content:space-between;align-items:center"><span style="flex:1">${l}</span><span style="flex:1;text-align:center">${c}</span><span style="flex:1;text-align:right">${r}</span></div>`
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

// ── GET /api/analysis/run/:id/pdf?method=xxx ──────────────────────────────────
router.get('/run/:id/pdf', async (req, res) => {
  try {
    const userRoles: string[] = req.user!.roles || [req.user!.role]
    if (!await canAnalyse(userRoles)) {
      return res.status(403).json({ error: 'Keine Berechtigung' })
    }

    const methodFilter = req.query.method as string | undefined
    const inlinePreview = req.query.inline === '1'
    const landscapeParam = req.query.landscape as string | undefined
    const useLandscape = landscapeParam === '1' ? true : landscapeParam === '0' ? false : (methodFilter === 'vonnegut_arcs')
    const fzTextOverride = typeof req.query.fzText === 'string' ? req.query.fzText.trim() : ''

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
      fetchAuthJson('/api/public/document-templates/standard'),
    ])

    // Logo als Base64 für Puppeteer-Header (externe URLs laden dort nicht)
    const logoUrl: string | null = companyInfo?.logo_url ?? companyInfo?.logos?.light ?? null
    const logoBase64 = logoUrl ? await fetchBase64(logoUrl) : null

    const tmpl = templateData?.template ?? templateData ?? null

    const ctx: PdfCtx = {
      companyInfo,
      produktionTitel: run.produktion_titel ?? undefined,
      logoBase64,
      logoHeight: tmpl?.logo_height ?? undefined,
      logoWidthCm: tmpl?.logo_width_cm ? parseFloat(tmpl.logo_width_cm) : undefined,
    }

    const html = buildAnalysisPdfHtml(run, companyInfo, methodFilter)
    const headerZone = buildPuppeteerZone(
      { left: tmpl?.header_left, center: tmpl?.header_center, right: tmpl?.header_right },
      ctx
    )
    const footerZone = buildPuppeteerZone(
      { left: tmpl?.footer_left, center: tmpl?.footer_center, right: tmpl?.footer_right },
      ctx
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
      const effectiveFooter = fzTextOverride
        ? `<div style="font-size:8pt;font-family:sans-serif;color:#888;width:100%;padding:0 2.5cm;box-sizing:border-box;text-align:center">${fzTextOverride.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!))}</div>`
        : footerZone || fallbackFooter
      const pdfBuf = await page.pdf({
        format: 'A4',
        landscape: useLandscape,
        margin: { top: '2.5cm', bottom: '2.2cm', left: '2.5cm', right: '2.5cm' },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: headerZone || '<span style="font-size:0"></span>',
        footerTemplate: effectiveFooter,
      })
      await page.close()

      const scopeSlug = run.folge_nummer != null ? `folge${run.folge_nummer}` : `block${run.block_nummer}`
      const methodSlug = methodFilter ? `-${methodFilter.replace(/_/g, '-')}` : ''
      const filename = `analyse-${scopeSlug}${methodSlug}-${new Date().toISOString().slice(0, 10)}.pdf`
      res.set('Content-Type', 'application/pdf')
      res.set('Content-Disposition', `${inlinePreview ? 'inline' : 'attachment'}; filename="${filename}"`)
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
