import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy, Check, RefreshCw, ChevronRight, ChevronLeft, Clock, Database, Plus, X, Trash2, FileDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AppShell from '../components/AppShell'
import { useSelectedProduction } from '../contexts'
import { api } from '../api/client'

// ── Typen ─────────────────────────────────────────────────────────────────────

interface Block {
  proddb_id: string
  block_nummer: number
  folge_von: number
  folge_bis: number
  dreh_von?: string | null
  dreh_bis?: string | null
}

interface WerkstufInfo {
  typ: string
  version_nummer: number
  label: string | null
  stand_datum?: string | null
  erstellt_am?: string | null
}

interface MethodResult {
  method: string
  method_version: string
  status: 'completed' | 'error' | 'running'
  markdown?: string
  structured?: any
  error_detail?: string
  from_cache: boolean
  duration_ms?: number
}

interface RunData {
  id: string
  block_nummer: number
  folge_nummer: number | null
  status: 'queued' | 'running' | 'completed' | 'error'
  created_at: string
  method_results: MethodResult[]
  werkstufen_info: WerkstufInfo[]
}

const METHOD_LABELS: Record<string, { label: string; desc: string; cost: string; disabled?: boolean }> = {
  story_consultant_pur: {
    label: 'Showrunner-Check',
    desc: 'Produktionsorientierte Analyse: Welche Szenen tragen wirklich — und was kann gestrichen werden, wenn morgen zwei Drehtage wegfallen?',
    cost: '~2 €',
  },
  story_consultant_framework: {
    label: 'Story-Consultant (Reagan, Toubia, Rocchi)',
    desc: 'Analyse mit drei Dramaturgie-Modellen als explizitem Werkzeug. Befunde, die auch in "Pur" erscheinen, sind besonders verlässlich.',
    cost: '~2 €',
  },
  strang_heatmap: {
    label: 'Strang-Heatmap',
    desc: 'Visualisierung der Strang-Verteilung über Folgen und Szenen',
    cost: '~0,50 €',
  },
  figuren_agency: {
    label: 'Figuren-Agency-Matrix',
    desc: 'Wer trifft Entscheidungen? Wer reagiert nur?',
    cost: '~0,50 €',
  },
  vonnegut_arcs: {
    label: 'Vonnegut-Arcs',
    desc: 'Emotionale Kurven der Stränge über den Block',
    cost: '~0,50 €',
  },
}

const WERKSTUFE_ABBR: Record<string, string> = {
  drehbuch: 'DB', storyline: 'SL', notiz: 'NO', treatment: 'TR', expose: 'EX',
}

const ALL_METHODS = Object.keys(METHOD_LABELS)
const POLL_INTERVAL_MS = 4000
const POLL_STORAGE_KEY = 'analysis_polling_run_id'
const DEFAULT_SIDEBAR_WIDTH = 276

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDuration(ms?: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function statusLabel(status: string) {
  if (status === 'queued') return 'In Warteschlange …'
  if (status === 'running') return 'Claude analysiert …'
  return status
}

function fmtStandDatum(ws: WerkstufInfo[]): string {
  if (!ws || ws.length === 0) return ''
  // Neueste Fassung (höchste version_nummer)
  const latest = [...ws].sort((a, b) => b.version_nummer - a.version_nummer)[0]
  const raw = latest.stand_datum ?? latest.erstellt_am ?? null
  if (!raw) return ''
  return new Date(raw).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Kompakte Werkstufen-Zusammenfassung: "DB v3 · Lüneburg" — immer neueste Fassung pro Folge */
function fmtWerkstufen(ws: WerkstufInfo[]): string {
  if (!ws || ws.length === 0) return ''
  const typen = [...new Set(ws.map(w => w.typ))]
  const abbr = typen.map(t => WERKSTUFE_ABBR[t] ?? t).join('/')
  const maxVersion = Math.max(...ws.map(w => w.version_nummer))
  // Label: "Import: xyz.pdf" → nur Dateiname ohne "Import: " Präfix kürzen
  const labels = [...new Set(ws.map(w => {
    if (!w.label) return null
    return w.label.startsWith('Import: ') ? w.label.slice(8).replace(/\.pdf$/i, '') : w.label
  }).filter(Boolean))]
  const labelStr = labels.length === 1 ? ` · ${labels[0]}` : ''
  return `${abbr} v${maxVersion}${labelStr}`
}

function getChildText(node: React.ReactNode): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getChildText).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    return getChildText((node as React.ReactElement).props.children)
  }
  return ''
}

// ── Beat-Bewertungs-Chip ───────────────────────────────────────────────────────

function BewertungsChip({ text }: { text: string }) {
  let bg = '', color = '', label = text
  const t = text.trim()
  if (/^Behalten/i.test(t)) { bg = 'rgba(0,200,83,0.12)'; color = '#00a844' }
  else if (/^Kürzen/i.test(t)) { bg = 'rgba(255,149,0,0.13)'; color = '#b86e00' }
  else if (/^Streichen/i.test(t)) { bg = 'rgba(255,59,48,0.12)'; color = '#cc2a1e' }

  if (!bg) return <>{text}</>

  // Hauptwort und Rest trennen (z.B. "Behalten — präziser Auftakt")
  const dash = t.indexOf('—')
  const main = dash > 0 ? t.slice(0, dash).trim() : t
  const rest = dash > 0 ? t.slice(dash + 1).trim() : ''

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: bg, color,
        padding: '2px 7px', borderRadius: 4,
        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {main}
      </span>
      {rest && <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{rest}</span>}
    </span>
  )
}

// ── MarkdownResult ─────────────────────────────────────────────────────────────

function MarkdownResult({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => navigator.clipboard.writeText(markdown).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
        style={{
          position: 'absolute', top: 0, right: 0,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-subtle)', cursor: 'pointer',
          fontSize: 11, color: 'var(--text-secondary)',
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>

      <div style={{ paddingTop: 32, fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, margin: '20px 0 10px', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>{children}</h1>,
            h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 700, margin: '18px 0 8px' }}>{children}</h2>,
            h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>{children}</h3>,
            p:  ({ children }) => <p style={{ margin: '6px 0' }}>{children}</p>,
            ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ul>,
            ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ol>,
            li: ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
            strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
            table: ({ children }) => (
              <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead>{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => (
              <tr
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >{children}</tr>
            ),
            th: ({ children }) => (
              <th style={{
                border: '1px solid var(--border)', padding: '7px 12px',
                background: 'var(--bg-subtle)', fontWeight: 600, textAlign: 'left',
                whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '0.03em',
                color: 'var(--text-secondary)',
              }}>{children}</th>
            ),
            td: ({ children, node }: any) => {
              const getRaw = (n: any): string => {
                if (!n) return ''
                if (n.type === 'text') return n.value ?? ''
                if (Array.isArray(n)) return n.map(getRaw).join('')
                if (n.children) return n.children.map(getRaw).join('')
                return ''
              }
              const rawText = getRaw(node).trim()
              const isBewertung = /^(Behalten|Kürzen|Streichen)/i.test(rawText)
              return (
                <td style={{ border: '1px solid var(--border)', padding: '6px 12px', verticalAlign: 'top' }}>
                  {isBewertung ? <BewertungsChip text={rawText} /> : children}
                </td>
              )
            },
            blockquote: ({ children }) => (
              <blockquote style={{ borderLeft: '3px solid var(--border)', margin: '8px 0', paddingLeft: 12, color: 'var(--text-secondary)' }}>{children}</blockquote>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.startsWith('language-')
              if (isBlock) return (
                <pre style={{ background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: 6, overflowX: 'auto', fontSize: 12, margin: '8px 0' }}>
                  <code>{children}</code>
                </pre>
              )
              return <code style={{ background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>{children}</code>
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  )
}

// ── Glossar-Leiste ────────────────────────────────────────────────────────────

interface GlossarEintrag {
  label: string
  modell: 'A' | 'B' | 'C'
  modellName: string
  erklärung: string
  quelle: string
  link?: string       // DOI / Open-Access-Link zur Studie
  isModell?: boolean  // true = immer anzeigen, erklärt das Modell selbst
}

const GLOSSAR_EINTRAEGE: Record<string, GlossarEintrag> = {
  // Modell-Erklärungen — immer sichtbar
  'modell_a': {
    label: 'Reagan et al. (2016)', modell: 'A', modellName: 'Reagan et al.', isModell: true,
    erklärung: 'Identifiziert sechs emotionale Grundformen in Erzählungen durch Sentiment-Analyse von über 1.700 literarischen Texten. Die Modell-Typen (Rags to Riches, Tragedy, Man in a Hole, Icarus, Oedipus, Cinderella) beschreiben, wie die emotionale Valenz einer Geschichte im Zeitverlauf verläuft. Komplexere Arcs (Cinderella, Oedipus) korrelieren empirisch mit höherem Leser-Engagement.',
    quelle: 'Reagan, A.J. et al. (2016): The emotional arcs of stories are dominated by six basic shapes. PLOS ONE 11(12).',
    link: 'https://doi.org/10.1371/journal.pone.0165498',
  },
  'modell_b': {
    label: 'Toubia et al. (2021)', modell: 'B', modellName: 'Toubia et al.', isModell: true,
    erklärung: 'Misst drei narrative Eigenschaften über Text-Embeddings — Speed (thematische Sprungweite zwischen Szenen), Volume (thematische Bandbreite), Circuitousness (Wiederkehr zu früheren Themen). An TV-Piloten nachgewiesen: höhere Speed und moderates Volume (besonders am Episodenende) korrelieren mit besseren Zuschauer-Bewertungen und Staffel-Verlängerung.',
    quelle: 'Toubia, O., Berger, J. & Eliashberg, J. (2021): How Quantifying the Shape of Stories Predicts Their Virality. Management Science 67(4).',
    link: undefined,  // TODO: DOI eintragen, z.B. https://doi.org/10.1287/mnsc.XXXX
  },
  'modell_c': {
    label: 'Rocchi & Pescatore (2022)', modell: 'C', modellName: 'Rocchi & Pescatore', isModell: true,
    erklärung: 'Analysiert Daily-Soap-Narrative durch drei Erzählachsen (narrative Isotopien): Soap-Plot (Beziehungen, Emotionen, Familie), Genre-Plot (Berufswelt der Serie) und Anthology-Plot (episodisch abgeschlossene Handlungen). Die relative Gewichtung dieser Achsen — die "narrative Biomass" — ist die erzählerische DNA einer Serie und unterscheidet z.B. Rote Rosen von GZSZ.',
    quelle: 'Rocchi, M. & Pescatore, G. (2022): Narrative isotopies in serial fiction. Convergence 28(3).',
    link: undefined,  // TODO: DOI eintragen, z.B. https://doi.org/10.1177/XXXXXXXX
  },
  // Fachbegriffe — erscheinen wenn im Text erwähnt
  'oedipus':         { label: 'Oedipus-Arc',        modell: 'A', modellName: 'Reagan et al.',      erklärung: 'Fall → Aufstieg → Fall. Figur beginnt schwierig, gewinnt kurz, verliert wieder. Zwei Wendepunkte — komplexer Arc.', quelle: 'Reagan et al., PLOS ONE 2016' },
  'icarus':          { label: 'Icarus-Arc',          modell: 'A', modellName: 'Reagan et al.',      erklärung: 'Aufstieg → Fall. Nur ein Wendepunkt — dramaturgisch schwächer, weil vorhersehbar.', quelle: 'Reagan et al., PLOS ONE 2016' },
  'cinderella':      { label: 'Cinderella-Arc',      modell: 'A', modellName: 'Reagan et al.',      erklärung: 'Aufstieg → Fall → Aufstieg. Komplexester Basis-Arc. Korreliert in Studien mit höherem emotionalen Engagement.', quelle: 'Reagan et al., PLOS ONE 2016' },
  'man in a hole':   { label: 'Man in a Hole',       modell: 'A', modellName: 'Reagan et al.',      erklärung: 'Fall → Aufstieg. Figur gerät in Schwierigkeiten, findet dann heraus. Ein Wendepunkt.', quelle: 'Reagan et al., PLOS ONE 2016' },
  'rags to riches':  { label: 'Rags to Riches',      modell: 'A', modellName: 'Reagan et al.',      erklärung: 'Durchgehender Aufstieg ohne Wendepunkt. Dramaturgisch der einfachste und vorhersehbarste Arc.', quelle: 'Reagan et al., PLOS ONE 2016' },
  'tragedy':         { label: 'Tragedy-Arc',         modell: 'A', modellName: 'Reagan et al.',      erklärung: 'Durchgehender Fall (Riches to Rags). Kein Wendepunkt.', quelle: 'Reagan et al., PLOS ONE 2016' },
  'speed':           { label: 'Speed',               modell: 'B', modellName: 'Toubia et al.',      erklärung: 'Maß für thematische Sprünge zwischen aufeinanderfolgenden Szenen. Höhere Speed korreliert bei TV-Episoden mit besserer Publikumsbewertung.', quelle: 'Toubia et al., Management Science 2021' },
  'volume':          { label: 'Volume',              modell: 'B', modellName: 'Toubia et al.',      erklärung: 'Thematische Bandbreite einer Episode. Zu hohes Volume (zu viele unverbundene Themen) korreliert mit schlechteren Bewertungen — besonders am Episodenende.', quelle: 'Toubia et al., Management Science 2021' },
  'circuitousness':  { label: 'Circuitousness',      modell: 'B', modellName: 'Toubia et al.',      erklärung: 'Wie verschlungen der thematische Weg ist — ob Themen wiederkehren statt linear voranzuschreiten.', quelle: 'Toubia et al., Management Science 2021' },
  'isotopie':        { label: 'Narrative Isotopie',  modell: 'C', modellName: 'Rocchi & Pescatore', erklärung: 'Jede Szene gehört einer von drei Erzählachsen an: Soap-Plot, Genre-Plot, Anthology-Plot. Die Verteilung — "narrative Biomass" — ist die erzählerische Identität einer Serie.', quelle: 'Rocchi & Pescatore, Convergence 2022' },
  'soap-plot':       { label: 'Soap-Plot',           modell: 'C', modellName: 'Rocchi & Pescatore', erklärung: 'Erzählachse für Liebesbeziehungen, Familie, emotionale Konflikte. Bei Daily Soaps dominant (ca. 60–70 % der Szenen).', quelle: 'Rocchi & Pescatore, Convergence 2022' },
  'genre-plot':      { label: 'Genre-Plot',          modell: 'C', modellName: 'Rocchi & Pescatore', erklärung: 'Erzählachse für die Berufswelt der Serie (Hotel, Café, Tischlerei). Gibt der Soap ihre spezifische Alltagsumgebung.', quelle: 'Rocchi & Pescatore, Convergence 2022' },
  'anthology-plot':  { label: 'Anthology-Plot',      modell: 'C', modellName: 'Rocchi & Pescatore', erklärung: 'In sich abgeschlossene Storylines, die in wenigen Episoden enden. In Daily Soaps selten, aber nützlich für Gäste- und Episodenfiguren.', quelle: 'Rocchi & Pescatore, Convergence 2022' },
}

const MODELL_KEYS = ['modell_a', 'modell_b', 'modell_c']

const MODELL_COLORS: Record<string, { bg: string; color: string }> = {
  A: { bg: 'rgba(0,122,255,0.10)', color: '#007AFF' },
  B: { bg: 'rgba(175,82,222,0.10)', color: '#AF52DE' },
  C: { bg: 'rgba(255,149,0,0.10)',  color: '#FF9500' },
}

// ── Methoden-Info ─────────────────────────────────────────────────────────────

const METHODEN_INFO: Record<string, { was: string; wie: string; quelle: string; link?: string }> = {
  strang_heatmap: {
    was: 'Zeigt, wie stark jeder Story-Strang in jeder Folge präsent ist — von kaum sichtbar (1) bis dominant (5).',
    wie: 'Claude identifiziert die Story-Stränge des Blocks aus Figuren-Konstellationen und Szenen-Zusammenfassungen. Jede Szene wird einem oder mehreren Strängen zugeordnet. Die Heatmap zeigt pro Folge die maximale Intensität aller Szenen des jeweiligen Strangs.',
    quelle: 'Rocchi, M. & Pescatore, G. (2022): Narrative isotopies in serial fiction. Convergence 28(3).',
  },
  figuren_agency: {
    was: '„Agency" (Handlungsmacht) bezeichnet die Fähigkeit einer Figur, aktiv zu entscheiden und den Handlungsverlauf aus eigenem Antrieb zu verändern. Aktiv = die Figur trifft eine Entscheidung, die die Geschichte vorantreibt. Reaktiv = die Figur antwortet auf Impulse anderer. Hohe Agency kennzeichnet zentrale Hauptfiguren; sinkende Agency kann auf eine dramaturgische Abschiebung zur Nebenfigur hinweisen.',
    wie: 'Claude analysiert für jede Hauptfigur und Folge: Wie viele Szenen enthalten aktive Entscheidungen (Agency) und wie viele reaktive Momente — und was war die wichtigste Handlungs-Entscheidung der Folge?',
    quelle: 'Greimas, A.J. (1966): Strukturale Semantik (Aktantenmodell). Bordwell, D. (1985): Narration in the Fiction Film.',
  },
  vonnegut_arcs: {
    was: 'Emotionaler Verlauf jedes Story-Strangs. +5 = Höhepunkt (Glück, Erfolg, Liebe, Verbindung) · 0 = neutral · −5 = Tiefpunkt (Verlust, Scheitern, Schmerz, Trennung). Markierte Punkte auf der Linie sind dramaturgische Wendepunkte.',
    wie: 'Basiert auf Kurt Vonneguts Konzept „Shape of Stories" (Vortrag 1973). Reagan et al. (2016) haben durch Sentiment-Analyse an über 1.700 Texten gezeigt: Arcs mit mehreren Wendepunkten (z.B. Cinderella, Oedipus) erzeugen stärkeres emotionales Engagement als lineare Verläufe.',
    quelle: 'Vonnegut, K. (1973): Vortrag "Shape of Stories". Reagan, A.J. et al. (2016): PLOS ONE 11(12).',
    link: 'https://storytellingedge.substack.com/p/the-simple-shapes-of-great-stories',
  },
}

// Hover-Tooltip — bewusst nicht im SW-UI-Design (heller Hintergrund)
function InlineTooltip({ text, x, y }: { text: string; x: number; y: number }) {
  return (
    <div style={{
      position: 'fixed', left: x + 14, top: y - 10,
      background: '#fff', color: '#333', border: '1px solid #d8d8d8',
      borderRadius: 6, padding: '6px 10px', fontSize: 11, lineHeight: 1.5,
      maxWidth: 240, boxShadow: '0 2px 10px rgba(0,0,0,0.10)',
      pointerEvents: 'none', zIndex: 9999, whiteSpace: 'pre-wrap',
    }}>
      {text}
    </div>
  )
}

function VisualisierungsHeader({ method }: { method: string }) {
  const [open, setOpen] = useState(false)
  const info = METHODEN_INFO[method]
  const label = METHOD_LABELS[method]
  if (!info || !label) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {label.label}
        </span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            fontSize: 11, color: '#007AFF',
            background: 'none', border: '1px solid rgba(0,122,255,0.3)',
            borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          Methode &amp; Quelle {open ? '▴' : '▾'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {info.was}
      </div>
      {open && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 8,
          background: 'var(--bg-subtle)', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 8, color: 'var(--text-primary)' }}>
            <span style={{ fontWeight: 600 }}>Methode: </span>{info.wie}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <span style={{ fontWeight: 600 }}>Quelle: </span>{info.quelle}
            {info.link && (
              <a href={info.link} target="_blank" rel="noopener noreferrer"
                style={{ marginLeft: 8, color: '#007AFF', textDecoration: 'none', fontWeight: 500 }}>
                Weitere Information
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function findGlossarTerme(markdown: string): string[] {
  const found: string[] = []
  const lower = markdown.toLowerCase()
  for (const key of Object.keys(GLOSSAR_EINTRAEGE)) {
    if (GLOSSAR_EINTRAEGE[key].isModell) continue  // Modelle separat
    if (lower.includes(key)) found.push(key)
  }
  return found
}

function GlossarChip({ glossarKey, open, onClick }: {
  glossarKey: string
  open: boolean
  onClick: (key: string, e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const e = GLOSSAR_EINTRAEGE[glossarKey]
  const c = MODELL_COLORS[e.modell]
  return (
    <button
      onClick={ev => onClick(glossarKey, ev)}
      style={{
        fontSize: 10, padding: '2px 7px', borderRadius: 4,
        border: `1px solid ${open ? c.color : 'transparent'}`,
        background: open ? c.bg : 'var(--bg-card, #f8f8f8)',
        color: open ? c.color : 'var(--text-secondary)',
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        transition: 'all 0.12s',
      }}
    >
      {e.isModell
        ? <><span style={{ fontWeight: 700, marginRight: 4, color: c.color }}>Modell {e.modell}</span>{e.label}</>
        : <><span style={{ opacity: 0.6, marginRight: 3 }}>({e.modell})</span>{e.label}</>
      }
    </button>
  )
}

function GlossarLeiste({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)
  const terme = findGlossarTerme(markdown)

  const handleClick = (key: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (open === key) { setOpen(null); setPopoverPos(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setPopoverPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 310) })
    setOpen(key)
  }

  const entry = open ? GLOSSAR_EINTRAEGE[open] : null
  const mc = entry ? MODELL_COLORS[entry.modell] : null

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '5px 12px', background: 'var(--bg-subtle)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          Modelle
        </span>
        {MODELL_KEYS.map(key => (
          <GlossarChip key={key} glossarKey={key} open={open === key} onClick={handleClick} />
        ))}
        {terme.length > 0 && (
          <>
            <span style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Begriffe
            </span>
            {terme.map(key => (
              <GlossarChip key={key} glossarKey={key} open={open === key} onClick={handleClick} />
            ))}
          </>
        )}
      </div>

      {open && entry && mc && popoverPos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => { setOpen(null); setPopoverPos(null) }} />
          <div style={{
            position: 'fixed', top: popoverPos.top, left: popoverPos.left,
            width: 300, zIndex: 1001,
            background: 'var(--bg-surface, #fff)', border: `1px solid ${mc.color}`,
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.13)', padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: mc.bg, color: mc.color, fontWeight: 700 }}>
                {entry.isModell ? `Modell ${entry.modell}` : `Modell ${entry.modell} · ${entry.modellName}`}
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>{entry.label}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-primary)' }}>{entry.erklärung}</div>
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              {entry.quelle}
              {entry.link && (
                <a
                  href={entry.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 5, color: mc!.color, textDecoration: 'none', fontSize: 10 }}
                >
                  Weitere Information
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Strang-Heatmap ─────────────────────────────────────────────────────────────

function StrangHeatmap({ data }: { data: any }) {
  const straenge: any[] = data?.straenge ?? []
  if (!straenge.length) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Keine Strang-Daten vorhanden.</div>

  // Alle Folgen-Nummern sammeln und sortieren
  const folgen = [...new Set(straenge.flatMap(s => s.szenen.map((z: any) => z.folge_nr)))].sort((a, b) => a - b)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  // Pro Strang + Folge: max Intensität
  const grid: Record<string, Record<number, { max: number; count: number }>> = {}
  for (const s of straenge) {
    grid[s.name] = {}
    for (const f of folgen) grid[s.name][f] = { max: 0, count: 0 }
    for (const z of s.szenen) {
      if (!grid[s.name][z.folge_nr]) grid[s.name][z.folge_nr] = { max: 0, count: 0 }
      grid[s.name][z.folge_nr].max = Math.max(grid[s.name][z.folge_nr].max, z.intensitaet)
      grid[s.name][z.folge_nr].count++
    }
  }

  const [showNumbers, setShowNumbers] = useState(true)
  const intensityAlpha = (v: number) => [0, 0.12, 0.28, 0.48, 0.68, 0.90][Math.min(v, 5)]
  // Szenenanzahl-Tooltip: pro Strang + Folge
  const buildCellTooltip = (s: any, f: number): string => {
    const cell = grid[s.name]?.[f]
    if (!cell || cell.max === 0) return ''
    const scenesInFolge = s.szenen.filter((z: any) => z.folge_nr === f)
    const cliffs = scenesInFolge.filter((z: any) => z.funktion === 'CLIFF')
    const pens  = scenesInFolge.filter((z: any) => z.funktion === 'PEN')
    let text = `${s.name}\nFolge ${f}: Intensität ${cell.max} · ${cell.count} Szene${cell.count !== 1 ? 'n' : ''}`
    if (cliffs.length) text += `\n⚡ CLIFF (Sz. ${cliffs.map((z: any) => z.scene_nr).join(', ')})`
    if (pens.length)   text += `\n🔗 PEN (Sz. ${pens.map((z: any) => z.scene_nr).join(', ')})`
    return text
  }

  return (
    <div>
      <VisualisierungsHeader method="strang_heatmap" />
      {tooltip && <InlineTooltip {...tooltip} />}

      {/* Legende + Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>Intensität:</span>
          {[1,2,3,4,5].map(v => (
            <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{
                width: 18, height: 14, borderRadius: 3, display: 'inline-block',
                background: '#888', opacity: intensityAlpha(v),
                border: '1px solid #888',
              }} />
              <span>{v}</span>
            </span>
          ))}
        </div>
        <button
          onClick={() => setShowNumbers(n => !n)}
          style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            border: '1px solid var(--border)', background: showNumbers ? 'var(--bg-subtle)' : 'none',
            cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit',
            marginLeft: 'auto',
          }}
        >
          {showNumbers ? 'Zahlen ausblenden' : 'Zahlen einblenden'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 400 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: 160 }}>Strang</th>
              {folgen.map(f => (
                <th key={f} style={{ padding: '4px 6px', fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 10 }}>
                  Folge<br />{f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {straenge.map(s => (
              <tr key={s.name}>
                <td style={{ padding: '4px 12px 4px 0', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.farbe, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>({s.szenen.length})</span>
                  </div>
                </td>
                {folgen.map(f => {
                  const cell = grid[s.name]?.[f]
                  const v = cell?.max ?? 0
                  const tip = buildCellTooltip(s, f)
                  return (
                    <td key={f} style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <div
                        onMouseEnter={tip ? e => setTooltip({ text: tip, x: e.clientX, y: e.clientY }) : undefined}
                        onMouseLeave={tip ? () => setTooltip(null) : undefined}
                        onMouseMove={tip ? e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null) : undefined}
                        style={{
                          width: 34, height: 26, borderRadius: 4, margin: '0 auto',
                          background: v > 0 ? s.farbe : 'var(--border)',
                          opacity: v > 0 ? intensityAlpha(v) + 0.08 : 0.12,
                          border: `1px solid ${v > 0 ? s.farbe + '80' : 'transparent'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: tip ? 'default' : undefined,
                        }}>
                        {showNumbers && v > 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: v >= 4 ? '#fff' : s.farbe,
                            opacity: 1,
                          }}>{v}</span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Stränge · Klammerwert = Szenenanzahl im Block
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          {straenge.map(s => {
            const cliffCount = s.szenen.filter((z: any) => z.funktion === 'CLIFF').length
            const penCount   = s.szenen.filter((z: any) => z.funktion === 'PEN').length
            return (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.farbe, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontWeight: 500 }}>{s.name}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{s.szenen.length} Sz.</span>
                {cliffCount > 0 && <span style={{ fontSize: 10, color: '#FF3B30', fontWeight: 600 }}>{cliffCount}×CLIFF</span>}
                {penCount   > 0 && <span style={{ fontSize: 10, color: '#007AFF', fontWeight: 600 }}>{penCount}×PEN</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Figuren-Agency-Matrix ──────────────────────────────────────────────────────

function FigurenAgencyMatrix({ data }: { data: any }) {
  const charaktere: any[] = data?.charaktere ?? []
  if (!charaktere.length) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Keine Figuren-Daten vorhanden.</div>

  const folgen = [...new Set(charaktere.flatMap(c => c.episoden.map((e: any) => e.folge_nr)))].sort((a, b) => a - b)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  return (
    <div>
      <VisualisierungsHeader method="figuren_agency" />
      {tooltip && <InlineTooltip {...tooltip} />}
      <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span><span style={{ color: '#00C853', fontWeight: 700 }}>A</span> = Aktiv — Figur trifft eine Entscheidung</span>
        <span><span style={{ color: '#FF9500', fontWeight: 700 }}>R</span> = Reaktiv — Figur reagiert auf andere</span>
        <span style={{ color: 'var(--text-secondary)' }}>— = nicht präsent / passiv</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>Hover auf Zelle = zentrale Entscheidung der Folge</span>
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 400, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 16px 6px 0', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 120 }}>Figur</th>
            {folgen.map(f => (
              <th key={f} style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center', minWidth: 60 }}>
                Folge {f}
              </th>
            ))}
            <th style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center' }}>Gesamt A:R</th>
          </tr>
        </thead>
        <tbody>
          {charaktere.map(c => {
            const epMap: Record<number, any> = {}
            for (const e of c.episoden) epMap[e.folge_nr] = e
            const totalA = c.episoden.reduce((s: number, e: any) => s + (e.aktiv || 0), 0)
            const totalR = c.episoden.reduce((s: number, e: any) => s + (e.reaktiv || 0), 0)
            const ratio = totalA + totalR > 0 ? totalA / (totalA + totalR) : 0
            return (
              <tr key={c.name} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 16px 7px 0', fontWeight: 600 }}>{c.name}</td>
                {folgen.map(f => {
                  const ep = epMap[f]
                  if (!ep || (ep.aktiv === 0 && ep.reaktiv === 0)) {
                    return <td key={f} style={{ padding: '7px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11 }}>—</td>
                  }
                  return (
                    <td key={f} style={{ padding: '7px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                        {ep.aktiv > 0 && (
                          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,200,83,0.12)', color: '#00a844', fontWeight: 700 }}>
                            A{ep.aktiv > 1 ? `×${ep.aktiv}` : ''}
                          </span>
                        )}
                        {ep.reaktiv > 0 && (
                          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,149,0,0.12)', color: '#b86e00', fontWeight: 700 }}>
                            R{ep.reaktiv > 1 ? `×${ep.reaktiv}` : ''}
                          </span>
                        )}
                        {ep.top_entscheidung && (
                          <div
                            onMouseEnter={e => setTooltip({ text: ep.top_entscheidung, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setTooltip(null)}
                            onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                            style={{ fontSize: 9, color: 'var(--text-secondary)', maxWidth: 90, lineHeight: 1.3, marginTop: 2, textAlign: 'center', cursor: 'help' }}>
                            {ep.top_entscheidung.length > 40 ? ep.top_entscheidung.slice(0, 38) + '…' : ep.top_entscheidung}
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#00a844' }}>{totalA}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>:</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b86e00' }}>{totalR}</span>
                    <div style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginLeft: 4 }}>
                      <div style={{ width: `${ratio * 100}%`, height: '100%', background: '#00C853', borderRadius: 3 }} />
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

// ── Vonnegut-Arcs Chart ────────────────────────────────────────────────────────

function VonnegutArcsChart({ data }: { data: any }) {
  const straenge: any[] = data?.straenge ?? []
  if (!straenge.length) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Keine Arc-Daten vorhanden.</div>

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)
  const [showSceneNrs, setShowSceneNrs] = useState(false)
  const toggleStrang = (name: string) =>
    setHidden(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  // Alle Punkte über alle Stränge sammeln und sortieren (für x-Achse: immer alle, auch ausgeblendete)
  const allPunkte = straenge.flatMap(s =>
    s.punkte.map((p: any) => ({ ...p, strang: s.name }))
  ).sort((a, b) => a.folge_nr - b.folge_nr || a.scene_nr - b.scene_nr)

  // Eindeutige x-Positionen: folge_nr.scene_nr
  const xKeys = [...new Set(allPunkte.map(p => `${p.folge_nr}.${p.scene_nr}`))].sort((a, b) => {
    const [af, as_] = a.split('.').map(Number)
    const [bf, bs] = b.split('.').map(Number)
    return af - bf || as_ - bs
  })

  const pxPerPoint = 14 * zoom
  const W = Math.max(620, xKeys.length * pxPerPoint)
  const bottomPad = showSceneNrs ? 52 : 32
  const H = 220
  const PAD = { top: 20, right: 72, bottom: bottomPad, left: 42 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const xPos = (i: number) => PAD.left + (i / Math.max(xKeys.length - 1, 1)) * chartW
  const yPos = (v: number) => PAD.top + ((5 - v) / 10) * chartH  // -5..+5 → top..bottom
  const xSpacing = xKeys.length > 1 ? chartW / (xKeys.length - 1) : pxPerPoint

  // Episode-Grenzen für Grid-Linien
  const folgenWechsel: number[] = []
  let lastFolge = -1
  xKeys.forEach((k, i) => {
    const f = Number(k.split('.')[0])
    if (f !== lastFolge && i > 0) folgenWechsel.push(i)
    lastFolge = f
  })

  const yGridLines = [-5, -4, -2, 0, 2, 4, 5]
  const yAxisLabels: Record<number, string> = { 5: 'Höhepunkt', 0: 'Neutral', '-5': 'Tiefpunkt' } as any

  return (
    <div>
      <VisualisierungsHeader method="vonnegut_arcs" />
      {tooltip && <InlineTooltip {...tooltip} />}

      {/* Legende Stränge — klickbar zum Ein-/Ausblenden */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {straenge.map(s => {
          const isHidden = hidden.has(s.name)
          return (
            <button
              key={s.name}
              onClick={() => toggleStrang(s.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                padding: '3px 10px', borderRadius: 20,
                border: `1.5px solid ${isHidden ? 'var(--border)' : s.farbe}`,
                background: isHidden ? 'none' : `${s.farbe}18`,
                color: isHidden ? 'var(--text-secondary)' : 'var(--text-primary)',
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: isHidden ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: 20, height: 2.5, borderRadius: 1, display: 'inline-block',
                background: isHidden ? 'var(--border)' : s.farbe,
              }} />
              {s.name}
            </button>
          )
        })}
        {hidden.size > 0 && (
          <button
            onClick={() => setHidden(new Set())}
            style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 20,
              border: '1px solid var(--border)', background: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Alle einblenden
          </button>
        )}
      </div>

      {/* Toolbar: Zoom + Szenennummern */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Zoom</span>
          <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.5).toFixed(1)))}
            disabled={zoom <= 0.5}
            style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: zoom <= 0.5 ? 'var(--border)' : 'var(--text-primary)', fontFamily: 'inherit' }}>−</button>
          <span style={{ fontSize: 11, minWidth: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(5, +(z + 0.5).toFixed(1)))}
            disabled={zoom >= 5}
            style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: zoom >= 5 ? 'var(--border)' : 'var(--text-primary)', fontFamily: 'inherit' }}>+</button>
          {zoom !== 1 && (
            <button onClick={() => setZoom(1)}
              style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
              Zurücksetzen
            </button>
          )}
        </div>
        <button
          onClick={() => setShowSceneNrs(s => !s)}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 4,
            border: '1px solid var(--border)',
            background: showSceneNrs ? 'var(--bg-subtle)' : 'none',
            cursor: 'pointer', color: showSceneNrs ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontFamily: 'inherit',
          }}
        >
          Szenennummern {showSceneNrs ? 'ausblenden' : 'einblenden'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {/* Zebra-Streifen: ungerade Szenennummern */}
          {showSceneNrs && xKeys.map((k, i) => {
            const sceneNr = Number(k.split('.')[1])
            if (sceneNr % 2 === 0) return null
            return (
              <rect
                key={`band-${k}`}
                x={xPos(i) - xSpacing / 2}
                y={PAD.top}
                width={xSpacing}
                height={chartH}
                fill="rgba(0,0,0,0.04)"
              />
            )
          })}

          {/* Y-Grid */}
          {yGridLines.map(v => {
            const isMain = v === 0 || v === 5 || v === -5
            const label = v === 5 ? 'Höhepunkt' : v === -5 ? 'Tiefpunkt' : v === 0 ? 'Neutral' : null
            return (
              <g key={v}>
                <line
                  x1={PAD.left} x2={W - PAD.right}
                  y1={yPos(v)} y2={yPos(v)}
                  stroke={isMain ? (v === 0 ? '#999' : v > 0 ? 'rgba(0,200,83,0.3)' : 'rgba(255,59,48,0.25)') : 'var(--border)'}
                  strokeWidth={isMain ? (v === 0 ? 1.5 : 0.8) : 0.5}
                  strokeDasharray={v === 0 ? '' : '3,3'}
                />
                <text x={PAD.left - 4} y={yPos(v) + 3.5} textAnchor="end" fontSize={8} fill={isMain ? '#666' : 'var(--text-secondary)'} fontWeight={isMain ? '600' : '400'}>
                  {v > 0 ? `+${v}` : v}
                </text>
                {label && (
                  <text x={W - PAD.right + 4} y={yPos(v) + 3.5} textAnchor="start" fontSize={8} fill={v > 0 ? '#00a844' : v < 0 ? '#cc2a1e' : '#666'} fontWeight="500">
                    {label}
                  </text>
                )}
              </g>
            )
          })}
          {/* Episode-Grenzen — zwischen letzter Szene der alten und erster der neuen Folge */}
          {folgenWechsel.map(i => {
            const x = (xPos(i - 1) + xPos(i)) / 2
            return (
              <line key={i} x1={x} x2={x} y1={PAD.top - 4} y2={H - PAD.bottom}
                stroke="#aaa" strokeWidth={1.5} strokeDasharray="5,3" />
            )
          })}
          {/* Episode-Labels + optional Szenennummern */}
          {xKeys.map((k, i) => {
            const [fStr, sStr] = k.split('.')
            const f = Number(fStr)
            const sceneNr = Number(sStr)
            const prevF = i > 0 ? Number(xKeys[i - 1].split('.')[0]) : -1
            const isNewFolge = f !== prevF
            const folgeY = showSceneNrs ? H - bottomPad + 12 : H - 8
            return (
              <g key={k}>
                {isNewFolge && (
                  <text x={xPos(i)} y={folgeY} fontSize={9} fill="var(--text-secondary)" textAnchor="middle" fontWeight="500">
                    Folge {f}
                  </text>
                )}
                {showSceneNrs && (
                  <text
                    x={xPos(i)} y={H - bottomPad + 26}
                    fontSize={pxPerPoint >= 14 ? 8 : 7}
                    fill={isNewFolge ? '#007AFF' : 'var(--text-secondary)'}
                    textAnchor="middle"
                    opacity={pxPerPoint < 8 ? 0 : 1}
                  >
                    {sceneNr}
                  </text>
                )}
                {showSceneNrs && (
                  <line x1={xPos(i)} x2={xPos(i)} y1={H - bottomPad} y2={H - bottomPad + 4}
                    stroke="var(--border)" strokeWidth={0.5} />
                )}
              </g>
            )
          })}
          {/* Strang-Linien */}
          {straenge.map(s => {
            if (hidden.has(s.name)) return null
            const pts = s.punkte
              .sort((a: any, b: any) => a.folge_nr - b.folge_nr || a.scene_nr - b.scene_nr)
              .map((p: any) => {
                const key = `${p.folge_nr}.${p.scene_nr}`
                const xi = xKeys.indexOf(key)
                if (xi < 0) return null
                return { x: xPos(xi), y: yPos(p.wert), wert: p.wert, notiz: p.notiz, folge: p.folge_nr, scene: p.scene_nr }
              })
              .filter(Boolean)
            if (pts.length < 2) return null
            const d = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${p!.x},${p!.y}`).join(' ')
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={s.farbe} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p: any, i: number) => p?.notiz ? (
                  <circle
                    key={i} cx={p.x} cy={p.y} r={4}
                    fill={s.farbe} stroke="var(--bg-surface,#fff)" strokeWidth={1.5}
                    style={{ cursor: 'help' }}
                    onMouseEnter={e => setTooltip({ text: `${s.name} · Folge ${p.folge}, Sz. ${p.scene}\nWert: ${p.wert > 0 ? '+' : ''}${p.wert}\n\n${p.notiz}`, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                  />
                ) : (
                  <circle key={i} cx={p.x} cy={p.y} r={2} fill={s.farbe} opacity={0.4} />
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6 }}>
        Große gefüllte Punkte = Wendepunkte · Hover für Szenen-Notiz
      </div>
    </div>
  )
}

// ── MethodBadge ────────────────────────────────────────────────────────────────

function MethodBadge({ fromCache }: { fromCache: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: fromCache ? 'rgba(0,200,83,0.1)' : 'rgba(0,122,255,0.1)',
      color: fromCache ? '#00C853' : '#007AFF',
    }}>
      {fromCache ? <Database size={9} /> : <RefreshCw size={9} />}
      {fromCache ? 'Aus Cache' : 'Neu berechnet'}
    </span>
  )
}

// ── ReportView ─────────────────────────────────────────────────────────────────

function ReportView({ run, activeTab, onTabChange, onRerun, onDownloadPdf, isPolling }: {
  run: RunData
  activeTab: string | null
  onTabChange: (tab: string) => void
  onRerun?: () => void
  onDownloadPdf?: () => void
  isPolling?: boolean
}) {
  const currentTab = activeTab ?? run.method_results[0]?.method ?? null
  const result = run.method_results.find(r => r.method === currentTab)

  const scopeLabel = run.folge_nummer != null
    ? `Folge ${run.folge_nummer}`
    : `Block ${run.block_nummer}`
  const wsInfo = run.werkstufen_info ?? []
  const wsLabel = fmtWerkstufen(wsInfo)
  const standDatum = fmtStandDatum(wsInfo)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

      {/* Report-Header */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-subtle)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{scopeLabel}</span>
        {wsLabel && (
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 4,
            background: 'rgba(0,122,255,0.08)', color: '#007AFF',
          }}>{wsLabel}</span>
        )}
        {standDatum && (
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 4,
            background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}>Stand {standDatum}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {fmtDate(run.created_at)}
        </span>
        {onRerun && (
          <button
            onClick={onRerun}
            disabled={isPolling}
            title="Alle Methoden neu berechnen (Cache überspringen)"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 11, cursor: isPolling ? 'default' : 'pointer',
              opacity: isPolling ? 0.5 : 1, fontFamily: 'inherit', fontWeight: 500,
            }}
          >
            <RefreshCw size={11} /> Neu berechnen
          </button>
        )}
        {onDownloadPdf && (
          <button
            onClick={onDownloadPdf}
            title="Report als PDF exportieren"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
            }}
          >
            <FileDown size={11} /> PDF
          </button>
        )}
      </div>

      {/* Tab-Leiste */}
      {run.method_results.length > 1 && (
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface, var(--bg-card))', flexShrink: 0,
        }}>
          {run.method_results.map(r => (
            <button
              key={r.method}
              onClick={() => onTabChange(r.method)}
              style={{
                padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: currentTab === r.method ? 600 : 400,
                borderBottom: currentTab === r.method ? '2px solid var(--text-primary)' : '2px solid transparent',
                color: currentTab === r.method ? 'var(--text-primary)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              {METHOD_LABELS[r.method]?.label || r.method}
              {r.status === 'error' && <span style={{ color: '#FF3B30', fontSize: 10 }}>Fehler</span>}
            </button>
          ))}
        </div>
      )}

      {/* Glossar-Leiste — nur bei Framework */}
      {result?.method === 'story_consultant_framework' && result.markdown && (
        <GlossarLeiste markdown={result.markdown} />
      )}

      {/* Inhalt */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {result ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <MethodBadge fromCache={result.from_cache} />
              {result.duration_ms && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} /> {fmtDuration(result.duration_ms)}
                </span>
              )}
            </div>
            {result.status === 'error' ? (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(255,59,48,0.08)', color: '#FF3B30', fontSize: 13, lineHeight: 1.5 }}>
                Fehler: {result.error_detail}
              </div>
            ) : result.method === 'strang_heatmap' && result.structured ? (
              <StrangHeatmap data={result.structured} />
            ) : result.method === 'figuren_agency' && result.structured ? (
              <FigurenAgencyMatrix data={result.structured} />
            ) : result.method === 'vonnegut_arcs' && result.structured ? (
              <VonnegutArcsChart data={result.structured} />
            ) : result.markdown ? (
              <MarkdownResult markdown={result.markdown} />
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Kein Ergebnis vorhanden.</div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Kein Ergebnis ausgewählt.</div>
        )}
      </div>
    </div>
  )
}

// ── MethodenModal ──────────────────────────────────────────────────────────────

function MethodenModal({
  methods, onChange, onStart, onClose, submitting, error, blockInfo, scope, selectedFolgeNummer,
}: {
  methods: string[]
  onChange: (m: string[]) => void
  onStart: () => void
  onClose: () => void
  submitting: boolean
  error: string | null
  blockInfo: Block | null
  scope: 'block' | 'folge'
  selectedFolgeNummer: number | null
}) {
  const toggle = (m: string) =>
    onChange(methods.includes(m) ? methods.filter(x => x !== m) : [...methods, m])

  const activeMethods = methods.filter(m => !METHOD_LABELS[m]?.disabled)
  const estimatedCost = activeMethods.reduce((sum, m) => {
    const match = METHOD_LABELS[m]?.cost?.match(/[\d,.]+/)
    return sum + (match ? parseFloat(match[0].replace(',', '.')) : 0)
  }, 0)

  const scopeLabel = scope === 'folge' && selectedFolgeNummer != null
    ? `Folge ${selectedFolgeNummer}`
    : blockInfo ? `Block ${blockInfo.block_nummer} (Folge ${blockInfo.folge_von}–${blockInfo.folge_bis})` : ''

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000 }} onClick={!submitting ? onClose : undefined} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 460, maxWidth: '92vw',
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Neue Analyse</div>
            {scopeLabel && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{scopeLabel}</div>
            )}
          </div>
          <button onClick={onClose} disabled={submitting} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
            Analyse-Methode
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_METHODS.map(m => {
              const meta = METHOD_LABELS[m]
              const isDisabled = !!meta.disabled
              const isSelected = methods.includes(m)
              return (
                <label key={m} style={{
                  display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  border: `1px solid ${isSelected && !isDisabled ? 'var(--color-primary, #007AFF)' : 'var(--border)'}`,
                  background: isSelected && !isDisabled ? 'rgba(0,122,255,0.05)' : 'transparent',
                  opacity: isDisabled ? 0.45 : 1,
                }}>
                  <input type="checkbox" checked={isSelected && !isDisabled} disabled={isDisabled}
                    onChange={() => !isDisabled && toggle(m)} style={{ marginTop: 2, accentColor: '#007AFF' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{meta.label}</span>
                      <span style={{ color: isDisabled ? 'var(--text-secondary)' : '#00C853', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {isDisabled ? 'ab Phase 3' : meta.cost}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{meta.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
          {activeMethods.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Geschätzte Kosten</span>
              <span style={{ fontWeight: 600 }}>~{estimatedCost.toFixed(2).replace('.', ',')} €</span>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <div style={{ flex: 1, fontSize: 12, color: '#FF3B30', lineHeight: 1.4 }}>{error}</div>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={submitting} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Abbrechen
            </button>
            <button onClick={onStart} disabled={submitting || activeMethods.length === 0} style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: (submitting || activeMethods.length === 0) ? 'var(--border)' : '#000',
              color: (submitting || activeMethods.length === 0) ? 'var(--text-secondary)' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {submitting ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Wird gestartet…</> : 'Analyse starten'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { selectedProduction } = useSelectedProduction()
  const selectedProdId = selectedProduction?.id ?? ''

  // Block & Folge (via AppShell)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(DEFAULT_SIDEBAR_WIDTH)
  const isDragging = useRef(false)

  // Analyse-Scope: Block oder Folge
  const [scope, setScope] = useState<'block' | 'folge'>('block')

  // Modal
  const [methodenModalOpen, setMethodenModalOpen] = useState(false)
  const [methods, setMethods] = useState<string[]>(['story_consultant_pur'])

  // Runs
  const [prevRuns, setPrevRuns] = useState<RunData[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRunData, setSelectedRunData] = useState<RunData | null>(null)
  const [selectedTab, setSelectedTab] = useState<string | null>(null)
  const [loadingRun, setLoadingRun] = useState(false)

  // Polling
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeRunStatus, setActiveRunStatus] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isPolling = activeRunId != null && (activeRunStatus === 'queued' || activeRunStatus === 'running')

  // ── Drag Handle ─────────────────────────────────────────────────────────────

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    dragStartX.current = clientX
    dragStartWidth.current = sidebarWidth
    isDragging.current = true

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return
      const x = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX
      setSidebarWidth(Math.min(480, Math.max(200, dragStartWidth.current + (x - dragStartX.current))))
    }
    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }, [sidebarWidth])

  // ── Settings laden / speichern ──────────────────────────────────────────────

  const settingsLoaded = useRef(false)
  const [savedBlockNr, setSavedBlockNr] = useState<number | null>(null)
  const [savedFolgeNr, setSavedFolgeNr] = useState<number | null>(null)

  useEffect(() => {
    api.getSettings().then((s: any) => {
      const ui = s?.ui_settings || {}
      if (ui.analysis_last_block_nr) setSavedBlockNr(Number(ui.analysis_last_block_nr))
      if (ui.analysis_last_folge_nr) setSavedFolgeNr(Number(ui.analysis_last_folge_nr))
      settingsLoaded.current = true
    }).catch(() => { settingsLoaded.current = true })
  }, [])

  const saveAnalysisNav = useCallback((blockNr: number | null, folgeNr: number | null) => {
    api.updateSettings({ ui_settings: {
      analysis_last_block_nr: blockNr ?? null,
      analysis_last_folge_nr: folgeNr ?? null,
    }}).catch(() => {})
  }, [])

  // ── Blöcke laden ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedProdId) { setBlocks([]); setSelectedBlock(null); return }
    fetch(`/api/produktionen/${encodeURIComponent(selectedProdId)}/bloecke`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Block[]) => {
        setBlocks(data)
        if (data.length === 0) return
        // Gespeicherten Block wiederherstellen, sonst ersten Block
        const restored = savedBlockNr != null ? data.find(b => b.block_nummer === savedBlockNr) : null
        setSelectedBlock(prev => prev ?? restored ?? data[0])
      })
      .catch(() => setBlocks([]))
  }, [selectedProdId, savedBlockNr])

  // Wenn Block wechselt: gespeicherte Folge wiederherstellen oder erste Folge des Blocks
  useEffect(() => {
    if (!selectedBlock) return
    setSelectedFolgeNummer(prev => {
      // Wenn aktuelle Folge schon im Block liegt: beibehalten
      if (prev != null && prev >= selectedBlock.folge_von && prev <= selectedBlock.folge_bis) return prev
      // Gespeicherte Folge aus Settings verwenden, wenn im Block
      if (savedFolgeNr != null && savedFolgeNr >= selectedBlock.folge_von && savedFolgeNr <= selectedBlock.folge_bis) return savedFolgeNr
      return selectedBlock.folge_von
    })
    // Navigation persistieren
    saveAnalysisNav(selectedBlock.block_nummer, selectedFolgeNummer)
  }, [selectedBlock?.proddb_id])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vorherige Runs laden ─────────────────────────────────────────────────────

  const loadPrevRuns = useCallback(() => {
    if (!selectedProdId || !selectedBlock) return
    fetch(`/api/analysis/block/${encodeURIComponent(selectedProdId)}/${selectedBlock.block_nummer}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((runs: RunData[]) => {
        setPrevRuns(runs)
        setSelectedRunId(prev => {
          if (prev) return prev
          const latest = runs.find(r => r.status === 'completed')
          if (latest) {
            setSelectedRunData(latest)
            setSelectedTab(latest.method_results?.[0]?.method ?? null)
            return latest.id
          }
          return null
        })
      })
      .catch(() => {})
  }, [selectedProdId, selectedBlock?.block_nummer])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedRunId(null)
    setSelectedRunData(null)
    setPrevRuns([])
    loadPrevRuns()
  }, [loadPrevRuns])

  // ── Polling ──────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const pollRun = useCallback(async (runId: string) => {
    try {
      const resp = await fetch(`/api/analysis/run/${runId}`, { credentials: 'include' })
      if (!resp.ok) return
      const run: RunData = await resp.json()
      setActiveRunStatus(run.status)
      setPrevRuns(prev => { const w = prev.filter(r => r.id !== run.id); return [run, ...w] })
      if (run.status === 'completed' || run.status === 'error') {
        stopPolling()
        localStorage.removeItem(POLL_STORAGE_KEY)
        setActiveRunId(null)
        setSelectedRunId(run.id)
        setSelectedRunData(run)
        setSelectedTab(run.method_results?.[0]?.method ?? null)
      }
    } catch {}
  }, [stopPolling])

  const startPolling = useCallback((runId: string) => {
    stopPolling()
    setActiveRunId(runId)
    localStorage.setItem(POLL_STORAGE_KEY, runId)
    pollRef.current = setInterval(() => pollRun(runId), POLL_INTERVAL_MS)
    pollRun(runId)
  }, [stopPolling, pollRun])

  useEffect(() => {
    const stored = localStorage.getItem(POLL_STORAGE_KEY)
    if (stored) { setActiveRunId(stored); setActiveRunStatus('queued'); startPolling(stored) }
    return () => stopPolling()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analyse starten ──────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!selectedProdId || !selectedBlock || methods.length === 0) return
    if (scope === 'folge' && selectedFolgeNummer == null) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        produktion_id: selectedProdId,
        block_nummer: selectedBlock.block_nummer,
        methods,
      }
      if (scope === 'folge' && selectedFolgeNummer != null) {
        body.folge_nummer = selectedFolgeNummer
      }
      const resp = await fetch('/api/analysis/run', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      setMethodenModalOpen(false)
      setActiveRunStatus('queued')
      startPolling(data.run_id)
      loadPrevRuns()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Neu berechnen (force_fresh) ──────────────────────────────────────────────

  const handleRerun = useCallback(async () => {
    if (!selectedRunData || !selectedProdId || isPolling) return
    setSubmitting(true)
    setError(null)
    try {
      const methods = selectedRunData.method_results.map(r => r.method)
      const body: Record<string, unknown> = {
        produktion_id: selectedProdId,
        block_nummer: selectedRunData.block_nummer,
        methods,
        force_fresh: true,
      }
      if (selectedRunData.folge_nummer != null) body.folge_nummer = selectedRunData.folge_nummer
      const resp = await fetch('/api/analysis/run', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      setActiveRunStatus('queued')
      startPolling(data.run_id)
      loadPrevRuns()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }, [selectedRunData, selectedProdId, isPolling, startPolling, loadPrevRuns])

  // ── Run laden ────────────────────────────────────────────────────────────────

  const loadRun = useCallback(async (runId: string) => {
    if (runId === selectedRunId) return
    setSelectedRunId(runId)
    const existing = prevRuns.find(r => r.id === runId)
    if (existing) { setSelectedRunData(existing); setSelectedTab(existing.method_results?.[0]?.method ?? null); return }
    setLoadingRun(true)
    try {
      const resp = await fetch(`/api/analysis/run/${runId}`, { credentials: 'include' })
      if (!resp.ok) return
      const run: RunData = await resp.json()
      setSelectedRunData(run)
      setSelectedTab(run.method_results?.[0]?.method ?? null)
    } finally { setLoadingRun(false) }
  }, [selectedRunId, prevRuns])

  // ── Run löschen ─────────────────────────────────────────────────────────────

  const deleteRun = useCallback(async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Analyse löschen?')) return
    try {
      await fetch(`/api/analysis/run/${runId}`, { method: 'DELETE', credentials: 'include' })
      setPrevRuns(prev => prev.filter(r => r.id !== runId))
      if (selectedRunId === runId) { setSelectedRunId(null); setSelectedRunData(null) }
    } catch {}
  }, [selectedRunId])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppShell
      bloecke={blocks}
      selectedBlock={selectedBlock}
      onSelectBlock={(b: Block) => {
        setSelectedBlock(b); setSelectedRunId(null); setSelectedRunData(null); setPrevRuns([])
        saveAnalysisNav(b.block_nummer, selectedFolgeNummer)
      }}
      selectedFolgeNummer={selectedFolgeNummer}
      onSelectFolge={nr => { setSelectedFolgeNummer(nr); saveAnalysisNav(selectedBlock?.block_nummer ?? null, nr) }}
    >
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        {!sidebarCollapsed && (
          <div className="scene-list-sidebar" style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Block/Folge-Toggle + Neue-Analyse-Button */}
            <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Toggle */}
              <div style={{ display: 'flex', background: 'var(--bg-subtle)', borderRadius: 6, padding: 2, gap: 2 }}>
                {(['block', 'folge'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    style={{
                      flex: 1, padding: '5px 0', border: 'none', borderRadius: 5,
                      background: scope === s ? 'var(--bg-surface, #fff)' : 'transparent',
                      boxShadow: scope === s ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      fontSize: 12, fontWeight: scope === s ? 600 : 400,
                      color: scope === s ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                    }}
                  >
                    {s === 'block' ? 'Block' : 'Folge'}
                  </button>
                ))}
              </div>

              {/* Kontext-Anzeige */}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
                {scope === 'block' && selectedBlock
                  ? `Block ${selectedBlock.block_nummer} · Folge ${selectedBlock.folge_von}–${selectedBlock.folge_bis}`
                  : scope === 'folge' && selectedFolgeNummer != null
                    ? `Folge ${selectedFolgeNummer}`
                    : '—'
                }
              </div>

              {/* Neue-Analyse-Button */}
              <button
                onClick={() => { setError(null); setMethodenModalOpen(true) }}
                disabled={!selectedBlock || !selectedProdId || (scope === 'folge' && selectedFolgeNummer == null)}
                style={{
                  width: '100%', padding: '7px 12px', borderRadius: 6,
                  border: 'none', background: '#000', color: '#fff',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  opacity: (!selectedBlock || !selectedProdId) ? 0.4 : 1,
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={11} />
                Neue Analyse
              </button>

              {isPolling && (
                <div style={{ fontSize: 11, color: '#007AFF', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                  <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  {statusLabel(activeRunStatus || 'queued')}
                </div>
              )}
            </div>

            {/* Runs-Liste */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {prevRuns.length === 0 && !isPolling && (
                <div style={{ padding: '20px 10px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
                  Noch keine Analysen für diesen Block.
                </div>
              )}
              {prevRuns.map(run => {
                const isSelected = run.id === selectedRunId
                const isRunning = run.id === activeRunId && (run.status === 'queued' || run.status === 'running')
                const borderColor = run.status === 'completed' ? '#00C853' : run.status === 'error' ? '#FF3B30' : '#007AFF'
                const runScope = run.folge_nummer != null ? `Folge ${run.folge_nummer}` : `Block ${run.block_nummer}`
                const wsLabel = fmtWerkstufen(run.werkstufen_info ?? [])

                return (
                  <div
                    key={run.id}
                    className="analysis-run-item"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${borderColor}`,
                      background: isSelected ? 'var(--bg-active, rgba(0,0,0,0.05))' : 'transparent',
                      cursor: 'pointer', position: 'relative',
                    }}
                    onClick={() => loadRun(run.id)}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-subtle)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ padding: '9px 10px', paddingRight: 36 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{runScope}</span>
                        {wsLabel && (
                          <span style={{ fontSize: 10, color: '#007AFF', background: 'rgba(0,122,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>
                            {wsLabel}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
                        {run.method_results.length > 0
                          ? run.method_results.map(mr => METHOD_LABELS[mr.method]?.label || mr.method).join(', ')
                          : methods.map(m => METHOD_LABELS[m]?.label || m).join(', ')
                        }
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{fmtDate(run.created_at)}</div>
                      {isRunning && (
                        <div style={{ marginTop: 3, fontSize: 10, color: '#007AFF', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />
                          {statusLabel(activeRunStatus || '')}
                        </div>
                      )}
                      {run.status === 'error' && !isRunning && (
                        <div style={{ marginTop: 2, fontSize: 10, color: '#FF3B30' }}>Fehler</div>
                      )}
                    </div>
                    {/* Löschen-Button */}
                    <button
                      className="run-delete-btn"
                      onClick={(e) => deleteRun(run.id, e)}
                      title="Analyse löschen"
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: 3, borderRadius: 4,
                        display: 'flex',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Drag Handle + Collapse ─────────────────────────────────────── */}
        <div className="scene-list-handle" onMouseDown={!sidebarCollapsed ? onDragStart : undefined} onTouchStart={!sidebarCollapsed ? onDragStart : undefined}>
          <button className="scene-list-collapse-btn" onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Analysen öffnen' : 'Analysen schließen'}>
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* ── Hauptbereich ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {loadingRun ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', opacity: 0.35 }} />
            </div>
          ) : isPolling && !selectedRunData ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', opacity: 0.35, marginBottom: 14 }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{statusLabel(activeRunStatus || 'queued')}</div>
              <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
                Erwartet ca. 90 Sekunden pro Methode.<br />
                Du kannst die Seite verlassen — die Analyse läuft weiter.
              </div>
            </div>
          ) : selectedRunData ? (
            <ReportView
              run={selectedRunData}
              activeTab={selectedTab}
              onTabChange={setSelectedTab}
              onRerun={handleRerun}
              onDownloadPdf={() => window.open(`/api/analysis/run/${selectedRunData.id}/pdf`, '_blank')}
              isPolling={isPolling}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 24, gap: 12 }}>
              {!selectedProduction ? (
                <span>Produktion in der AppShell oben auswählen.</span>
              ) : !selectedBlock ? (
                <span>Block auswählen, dann „Neue Analyse" klicken.</span>
              ) : (
                <>
                  <span>Noch keine Analyse für Block {selectedBlock.block_nummer}.</span>
                  <button onClick={() => { setError(null); setMethodenModalOpen(true) }} style={{
                    padding: '8px 16px', borderRadius: 7, border: 'none', background: '#000', color: '#fff',
                    fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <Plus size={12} /> Neue Analyse starten
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {methodenModalOpen && (
        <MethodenModal
          methods={methods} onChange={setMethods}
          onStart={handleRun} onClose={() => { setMethodenModalOpen(false); setError(null) }}
          submitting={submitting} error={error}
          blockInfo={selectedBlock} scope={scope} selectedFolgeNummer={selectedFolgeNummer}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (pointer: coarse) { .scene-list-handle { width: 20px !important; } }
        .analysis-run-item .run-delete-btn { opacity: 0; transition: opacity 0.15s, color 0.15s; }
        .analysis-run-item:hover .run-delete-btn { opacity: 1; }
        .run-delete-btn:hover { color: #FF3B30 !important; }
        @media (pointer: coarse) { .analysis-run-item .run-delete-btn { opacity: 0.45; } }
      `}</style>
    </AppShell>
  )
}
