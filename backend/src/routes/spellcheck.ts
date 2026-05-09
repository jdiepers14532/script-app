import { Router } from 'express'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

const LT_URL = process.env.LANGUAGETOOL_URL || 'http://127.0.0.1:8081'

// POST /api/spellcheck — proxy to LanguageTool
router.post('/', async (req, res) => {
  try {
    const { text, language } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' })
    }
    const params = new URLSearchParams({
      text,
      language: language || 'de-DE',
      disabledRules: 'WHITESPACE_RULE',
    })
    const resp = await fetch(`${LT_URL}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) {
      return res.status(502).json({ error: 'LanguageTool error', status: resp.status })
    }
    const data: any = await resp.json()
    // Return only matches (slim response)
    res.json({
      matches: (data.matches || []).map((m: any) => ({
        message: m.message,
        shortMessage: m.shortMessage,
        offset: m.offset,
        length: m.length,
        replacements: (m.replacements || []).slice(0, 5).map((r: any) => r.value),
        rule: { id: m.rule?.id, category: m.rule?.category?.id },
      })),
    })
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'LanguageTool timeout' })
    }
    console.error('spellcheck proxy error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

export { router as spellcheckRouter }
