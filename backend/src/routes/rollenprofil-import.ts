import { Router } from 'express'
import multer from 'multer'
import fetch from 'node-fetch'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { getProviderApiKey } from './ki'

export const rollenprofilImportRouter = Router()
rollenprofilImportRouter.use(authMiddleware)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Nur PDF-Dateien erlaubt'))
  },
})

async function getMistralOcrApiKey(): Promise<string | null> {
  const setting = await queryOne(
    `SELECT enabled FROM ki_settings WHERE funktion = 'rollenprofil_import'`
  )
  if (!setting?.enabled) return null
  return getProviderApiKey('mistral')
}

async function extractTextViaMistralOCR(pdfBase64: string, apiKey: string): Promise<string> {
  const resp = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${pdfBase64}`,
      },
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Mistral OCR Fehler (${resp.status}): ${body}`)
  }
  const data = await resp.json() as any
  const pages: any[] = data.pages || []
  return pages.map((p: any) => p.markdown || p.text || '').join('\n\n')
}

// ── Deterministic Parser ───────────────────────────────────────────────────────

// Labels sorted longest first to prevent partial matches (e.g. "KINDER" before "KINDER / VERWANDTE")
const LABELS: [string, string][] = [
  ['FAMILIENSTAND / WICHTIGE EREIGNISSE', 'familienstand'],
  ['FAMILIENSTAND/WICHTIGE EREIGNISSE',   'familienstand'],
  ['TICKS / RUNNING GAGS / LEIDENSCHAFTEN', 'leidenschaften'],
  ['TICKS/RUNNING GAGS/LEIDENSCHAFTEN',   'leidenschaften'],
  ['WAS BRAUCHT DIE FIGUR WIRKLICH',      'inneres_ziel'],
  ['ANBINDUNG AN DEN CAST',               'cast_anbindung'],
  ['DRAMATURGISCHE FUNKTION',             'dramaturgische_funktion'],
  ['CHARAKTEREIGENSCHAFTEN',              'typ'],
  ['VERLETZUNGEN / WUNDEN',               'verletzungen'],
  ['VERLETZUNGEN/WUNDEN',                 'verletzungen'],
  ['KINDER / VERWANDTE',                  'verwandte'],
  ['KINDER/VERWANDTE',                    'verwandte'],
  ['TICKS/LEIDENSCHAFTEN',                'leidenschaften'],
  ['AUSSEHEN / STIL',                     'aussehen'],
  ['AUSSEHEN/STIL',                       'aussehen'],
  ['WÜNSCHE / ZIELE',                     'wuensche'],
  ['WÜNSCHE/ZIELE',                       'wuensche'],
  ['WUNSCHE / ZIELE',                     'wuensche'],
  ['WUNSCHE/ZIELE',                       'wuensche'],
  ['FAMILIENSTAND',                       'familienstand'],
  ['GEBURTSORT',                          'geburtsort'],
  ['VERLETZUNGEN',                        'verletzungen'],
  ['LEIDENSCHAFTEN',                      'leidenschaften'],
  ['BACKSTORY',                           'backstory'],
  ['STÄRKEN',                             'staerken'],
  ['STARKEN',                             'staerken'],
  ['SCHWÄCHEN',                           'schwaechem'],
  ['SCHWACHEN',                           'schwaechem'],
  ['ELTERN',                              'eltern'],
  ['KINDER',                              'verwandte'],
  ['ALTER',                               'alter'],
  ['BERUF',                               'beruf'],
  ['WESEN',                               'wesen'],
  ['TYP',                                 'typ'],
  ['CHARAKTER',                           'charakter'],
]

function matchLabel(text: string): string | null {
  const up = text.toUpperCase().replace(/\s+/g, ' ').replace(/:\s*$/, '').trim()
  for (const [label, key] of LABELS) {
    if (up === label) return key
  }
  return null
}

function parseRollenprofilDeterministic(ocrText: string): Record<string, string> {
  const result: Record<string, string> = {}

  // === Header metadata ===
  result.produktion = 'Rote Rosen'
  const staffelM = ocrText.match(/[Ss]taffel\s+(\d+)/i)
  if (staffelM) result.staffel = `Produktion ${staffelM[1]}`
  const folgenM = ocrText.match(/(\d{3,4})\s*[-–]\s*(\d{3,4})/)
  if (folgenM) result.folgen_range = `${folgenM[1]}-${folgenM[2]}`

  // === Normalize lines (strip markdown formatting) ===
  const lines = ocrText.split('\n').map(l =>
    l.replace(/\*\*([^*]*)\*\*/g, '$1')
     .replace(/\*([^*]*)\*/g, '$1')
     .replace(/^#+\s+/, '')
     .trim()
  )

  // === Extract character name from first 35 lines ===
  const nameSkip = /staffel|rote\s*rosen|futures?|figurenprofil|rollenprofil|\d{3,4}\s*[-–]\s*\d{3,4}|^\s*[-=|]+\s*$/i
  for (let i = 0; i < Math.min(lines.length, 35); i++) {
    const l = lines[i].replace(/[|#\\]/g, '').replace(/\s+/g, ' ').trim()
    if (!l || l.length < 3 || nameSkip.test(l)) continue

    // Mixed-case proper name: "Johanna Jansen" or "Victoria Kaiser"
    if (/^[A-ZÄÖÜ][a-zäöüß\-]+(\s+[A-ZÄÖÜ][a-zäöüß\-]+){1,3}$/.test(l)) {
      result.name = l
      break
    }
    // ALL-CAPS name: "VICTORIA KAISER" → "Victoria Kaiser"
    if (/^[A-ZÄÖÜ\s\-]{4,45}$/.test(l) && !/^[-\s]+$/.test(l) &&
        l.trim().split(/\s+/).filter(Boolean).length >= 2) {
      result.name = l.trim().split(/\s+/).filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
      break
    }
  }

  // === Kurzbeschreibung: subtitle with lowercase words, near the name ===
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const l = lines[i].replace(/[|*·•#]/g, '').replace(/\s+/g, ' ').trim()
    if (!l || l.length < 3 || l.length > 100) continue
    if (result.name && l.toLowerCase() === result.name.toLowerCase()) continue
    if (nameSkip.test(l)) continue
    if (/[a-zäöüß]/.test(l) && !/^(alter|beruf|geburtsort|eltern|kinder|charakter|typ|wesen)\b/i.test(l)) {
      // Exclude lines that look like field values (short standalone numbers/words)
      if (l.split(' ').length >= 2 || l.length > 8) {
        result.kurzbeschreibung = l
        break
      }
    }
  }

  // === Scan lines for field labels and accumulate content ===
  let currentKey: string | null = null
  let buf: string[] = []

  const flush = () => {
    if (currentKey && buf.length > 0 && !result[currentKey]) {
      result[currentKey] = buf.join('\n')
        .replace(/\|/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }
    buf = []
  }

  for (const line of lines) {
    // Skip pure separator lines (table borders like "---", "===", "| | |")
    if (/^[-=|:\s]+$/.test(line)) continue

    // Handle pipe-separated table row: "| ALTER | 37 | GEBURTSORT | Hannover |"
    if (line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean)
      if (cells.every(c => /^[-\s]+$/.test(c))) continue  // separator row

      let i = 0
      while (i < cells.length) {
        const key = matchLabel(cells[i])
        if (key) {
          flush()
          currentKey = key
          // Value might be immediately in next cell
          if (i + 1 < cells.length && !matchLabel(cells[i + 1]) && cells[i + 1]) {
            if (!result[key]) result[key] = cells[i + 1]
            buf = []
            i += 2
            continue
          }
        } else if (cells[i] && currentKey) {
          buf.push(cells[i])
        }
        i++
      }
      continue
    }

    // Check "Label: value" on same line
    const colonIdx = line.indexOf(':')
    if (colonIdx > 2 && colonIdx < 50) {
      const labelPart = line.slice(0, colonIdx).trim()
      const valuePart = line.slice(colonIdx + 1).trim()
      const key = matchLabel(labelPart)
      if (key) {
        flush()
        currentKey = key
        if (valuePart && !result[key]) { result[key] = valuePart; buf = [] }
        continue
      }
    }

    // Plain line: check if it's a label
    const key = matchLabel(line)
    if (key) {
      flush()
      currentKey = key
    } else if (line && currentKey) {
      buf.push(line)
    }
  }
  flush()

  return result
}

// POST /api/characters/rollenprofil-import/preview
rollenprofilImportRouter.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine PDF-Datei hochgeladen' })

    const apiKey = await getMistralOcrApiKey()
    if (!apiKey) {
      return res.status(503).json({
        error: 'Rollenprofil-Import nicht aktiviert oder kein Mistral API-Key konfiguriert. Bitte in Admin → KI-Konfiguration einrichten.',
      })
    }

    const pdfBase64 = req.file.buffer.toString('base64')
    const extractedText = await extractTextViaMistralOCR(pdfBase64, apiKey)
    const parsed = parseRollenprofilDeterministic(extractedText)

    res.json({ parsed, raw_text: extractedText })
  } catch (err: any) {
    console.error('Rollenprofil import preview error:', err)
    res.status(500).json({ error: String(err.message || err) })
  }
})

// Mapping from parsed rollenprofil keys to charakter_felder_config names
const PARSED_TO_FELDNAME: Record<string, string> = {
  alter:                   'Alter',
  geburtsort:              'Geburtsort',
  familienstand:           'Familienstand',
  eltern:                  'Eltern',
  verwandte:               'Kinder / Verwandte',
  beruf:                   'Beruf',
  typ:                     'Typ',
  charakter:               'Charakter',
  aussehen:                'Aussehen/Stil',
  dramaturgische_funktion: 'Dramaturgische Funktion',
  staerken:                'Stärken',
  schwaechem:              'Schwächen',
  verletzungen:            'Verletzungen/Wunden',
  leidenschaften:          'Ticks/Leidenschaften',
  wuensche:                'Wünsche/Ziele',
  inneres_ziel:            'Was braucht die Figur wirklich',
  wesen:                   'Wesen',
  cast_anbindung:          'Anbindung an den Cast',
  backstory:               'Beschreibung',
}

// POST /api/characters/rollenprofil-import/commit
rollenprofilImportRouter.post('/commit', async (req, res) => {
  const { produktion_id, parsed } = req.body
  if (!produktion_id || !parsed?.name) {
    return res.status(400).json({ error: 'produktion_id und parsed.name erforderlich' })
  }

  try {
    const { name, kurzbeschreibung, produktion, staffel, folgen_range, ...restParsed } = parsed

    const char = await queryOne(
      `INSERT INTO characters (name, meta_json) VALUES ($1, $2) RETURNING *`,
      [name, JSON.stringify({ rollenprofil: { kurzbeschreibung, produktion, staffel, folgen_range } })]
    )

    await queryOne(
      `INSERT INTO character_productions (character_id, produktion_id) VALUES ($1, $2)
       ON CONFLICT (character_id, produktion_id) DO NOTHING`,
      [char.id, produktion_id]
    )

    // Load all configured felder for this staffel
    const felder = await query(
      'SELECT id, name FROM charakter_felder_config WHERE produktion_id = $1',
      [produktion_id]
    )
    const feldByName = Object.fromEntries(felder.map((f: any) => [f.name, f.id]))

    for (const [key, feldName] of Object.entries(PARSED_TO_FELDNAME)) {
      const wert = restParsed[key]
      if (!wert?.trim()) continue
      const feldId = feldByName[feldName]
      if (!feldId) continue
      await queryOne(
        `INSERT INTO charakter_feldwerte (character_id, feld_id, wert_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (character_id, feld_id) WHERE character_id IS NOT NULL DO UPDATE SET wert_text = EXCLUDED.wert_text`,
        [char.id, feldId, wert]
      )
    }

    res.status(201).json({ character_id: char.id, name: char.name })
  } catch (err: any) {
    console.error('Rollenprofil import commit error:', err)
    res.status(500).json({ error: String(err.message || err) })
  }
})
