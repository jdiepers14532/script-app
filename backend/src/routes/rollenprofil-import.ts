import { Router } from 'express'
import multer from 'multer'
import fetch from 'node-fetch'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { getProviderApiKey, recordUsage } from './ki'

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

async function getRollenprofilImportConfig(): Promise<{ api_key: string; model_name: string } | null> {
  const setting = await queryOne(
    `SELECT model_name, enabled FROM ki_settings WHERE funktion = 'rollenprofil_import'`
  )
  if (!setting?.enabled) return null
  const apiKey = await getProviderApiKey('mistral')
  if (!apiKey) return null
  return { api_key: apiKey, model_name: setting.model_name || 'mistral-large-latest' }
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

const PARSE_SYSTEM_PROMPT = `Du bist ein Experte für TV-Drehbuch-Rollenbeschreibungen.
Extrahiere aus dem folgenden Text alle Felder eines Rollenprofils und gib sie als valides JSON zurück.

Folgende Felder sollen extrahiert werden (leer lassen wenn nicht vorhanden):
- name: Vollständiger Name der Figur (aus der Überschrift)
- alter: Altersangabe oder Geburtsjahr (z.B. "45" oder "*1980")
- kurzbeschreibung: Kurze Beschreibung aus der Überschrift (z.B. "Der Mann in der Krise")
- geburtsort: Geburtsort
- familienstand: Familienstand
- eltern: Namen der Eltern
- verwandte: Kinder und Verwandte (alle Angaben unter "KINDER / VERWANDTE")
- beruf: Berufsbezeichnung
- typ: Typbeschreibung (Feld "TYP")
- charakter: Charakterbeschreibung (Feld "CHARAKTER")
- aussehen: Aussehen und Stil
- dramaturgische_funktion: Dramaturgische Funktion
- staerken: Stärken der Figur
- schwaechem: Schwächen der Figur
- verletzungen: Verletzungen und Wunden
- leidenschaften: Ticks, Running Gags, Leidenschaften
- wuensche: Wünsche und Ziele
- inneres_ziel: Was braucht die Figur wirklich
- cast_anbindung: Anbindung an den Cast (Beziehungen zu anderen Figuren)
- backstory: Vollständiger Backstory-Freitext (alles nach "Backstory")
- produktion: Name der Produktion (z.B. "Rote Rosen")
- staffel: Staffel-Bezeichnung (z.B. "Staffel 24")
- folgen_range: Episodenbereich (z.B. "845-856")

Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblöcke.`

async function parseRollenprofilViaChat(
  text: string,
  apiKey: string,
  modelName: string
): Promise<{ parsed: Record<string, string>; tokensIn: number; tokensOut: number }> {
  const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PARSE_SYSTEM_PROMPT },
        { role: 'user', content: `Rollenprofil-Text:\n\n${text}` },
      ],
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Mistral Chat Fehler (${resp.status}): ${body}`)
  }
  const data = await resp.json() as any
  const content = data.choices?.[0]?.message?.content || '{}'
  const tokensIn = data.usage?.prompt_tokens ?? 0
  const tokensOut = data.usage?.completion_tokens ?? 0
  try {
    return { parsed: JSON.parse(content), tokensIn, tokensOut }
  } catch {
    throw new Error('Mistral hat kein valides JSON zurückgegeben')
  }
}

// POST /api/characters/rollenprofil-import/preview
rollenprofilImportRouter.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine PDF-Datei hochgeladen' })

    const config = await getRollenprofilImportConfig()
    if (!config) {
      return res.status(503).json({
        error: 'Rollenprofil-Import nicht aktiviert oder kein Mistral API-Key konfiguriert. Bitte in Admin → KI-Konfiguration einrichten.',
      })
    }

    const pdfBase64 = req.file.buffer.toString('base64')
    const extractedText = await extractTextViaMistralOCR(pdfBase64, config.api_key)
    const { parsed, tokensIn, tokensOut } = await parseRollenprofilViaChat(extractedText, config.api_key, config.model_name)

    // Record usage (chat completion only — OCR is page-based)
    await recordUsage('mistral', config.model_name, tokensIn, tokensOut)

    res.json({ parsed, raw_text: extractedText })
  } catch (err: any) {
    console.error('Rollenprofil import preview error:', err)
    res.status(500).json({ error: String(err.message || err) })
  }
})

// Mapping from parsed rollenprofil keys to charakter_felder_config names
const PARSED_TO_FELDNAME: Record<string, string> = {
  alter:                 'Alter',
  geburtsort:            'Geburtsort',
  familienstand:         'Familienstand',
  eltern:                'Eltern',
  verwandte:             'Kinder / Verwandte',
  beruf:                 'Beruf',
  typ:                   'Typ',
  charakter:             'Charakter',
  aussehen:              'Aussehen/Stil',
  dramaturgische_funktion: 'Dramaturgische Funktion',
  staerken:              'Stärken',
  schwaechem:            'Schwächen',
  verletzungen:          'Verletzungen/Wunden',
  leidenschaften:        'Ticks/Leidenschaften',
  wuensche:              'Wünsche/Ziele',
  inneres_ziel:          'Was braucht die Figur wirklich',
  cast_anbindung:        'Anbindung an den Cast',
  backstory:             'Beschreibung',
}

// POST /api/characters/rollenprofil-import/commit
rollenprofilImportRouter.post('/commit', async (req, res) => {
  const { staffel_id, parsed } = req.body
  if (!staffel_id || !parsed?.name) {
    return res.status(400).json({ error: 'staffel_id und parsed.name erforderlich' })
  }

  try {
    const { name, kurzbeschreibung, produktion, staffel, folgen_range, ...restParsed } = parsed

    // Store only non-field metadata in meta_json
    const char = await queryOne(
      `INSERT INTO characters (name, meta_json) VALUES ($1, $2) RETURNING *`,
      [name, JSON.stringify({ rollenprofil: { kurzbeschreibung, produktion, staffel, folgen_range } })]
    )

    await queryOne(
      `INSERT INTO character_productions (character_id, staffel_id) VALUES ($1, $2)
       ON CONFLICT (character_id, staffel_id) DO NOTHING`,
      [char.id, staffel_id]
    )

    // Load all configured felder for this staffel
    const felder = await query(
      'SELECT id, name FROM charakter_felder_config WHERE staffel_id = $1',
      [staffel_id]
    )
    const feldByName = Object.fromEntries(felder.map((f: any) => [f.name, f.id]))

    // Write each parsed field to charakter_feldwerte
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
