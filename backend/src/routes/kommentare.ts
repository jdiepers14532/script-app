import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const szenenKommentareRouter = Router()
export const kommentareRouter = Router()

szenenKommentareRouter.use(authMiddleware)
kommentareRouter.use(authMiddleware)

function parseMentions(text: string): string[] {
  const matches = text.match(/@(\w+)/g) || []
  return matches.map(m => m.slice(1))
}

async function notifyMessenger(toUserId: string, fromUser: string, message: string, link: string) {
  const secret = process.env.INTERNAL_MESSENGER_SECRET
  if (!secret) return
  try {
    await fetch('http://127.0.0.1:3012/api/internal/notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
      body: JSON.stringify({ from_app: 'script', to_user_id: toUserId, message: `${fromUser}: ${message}`, link }),
    })
  } catch {
    console.log(`Messenger notification failed for user ${toUserId}`)
  }
}

// GET /api/szenen/:szeneId/kommentare
szenenKommentareRouter.get('/:szeneId/kommentare', async (req, res) => {
  try {
    const { resolved } = req.query
    let sql = 'SELECT * FROM kommentare WHERE szene_id = $1'
    const params: any[] = [req.params.szeneId]
    if (resolved === 'true') sql += ' AND resolved = true'
    else if (resolved === 'false') sql += ' AND resolved = false'
    sql += ' ORDER BY created_at DESC'
    const rows = await query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/szenen/:szeneId/kommentare
szenenKommentareRouter.post('/:szeneId/kommentare', async (req, res) => {
  try {
    const { text, line_ref } = req.body
    if (!text) return res.status(400).json({ error: 'text erforderlich' })
    const user = req.user!

    const comment = await queryOne(
      `INSERT INTO kommentare (szene_id, user_id, user_name, text, line_ref)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.szeneId, user.user_id, user.name || user.user_id, text, line_ref || null]
    )

    const mentions = parseMentions(text)
    for (const mention of mentions) {
      await notifyMessenger(mention, user.name || user.user_id, text.substring(0, 100), `/editor?szene=${req.params.szeneId}`)
    }

    res.status(201).json(comment)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/kommentare/:id/resolve
kommentareRouter.patch('/:id/resolve', async (req, res) => {
  try {
    const user = req.user!
    const comment = await queryOne(
      `UPDATE kommentare SET resolved = true, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2 RETURNING *`,
      [user.user_id, req.params.id]
    )
    if (!comment) return res.status(404).json({ error: 'Kommentar nicht gefunden' })
    res.json(comment)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/kommentare/:id
kommentareRouter.delete('/:id', async (req, res) => {
  try {
    const user = req.user!
    const comment = await queryOne('SELECT * FROM kommentare WHERE id = $1', [req.params.id])
    if (!comment) return res.status(404).json({ error: 'Kommentar nicht gefunden' })

    const isAdmin = user.roles.some(r => ['superadmin', 'herstellungsleitung'].includes(r))
    if (comment.user_id !== user.user_id && !isAdmin) {
      return res.status(403).json({ error: 'Nur Autor oder Admin kann Kommentar löschen' })
    }

    await query('DELETE FROM kommentare WHERE id = $1', [req.params.id])
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default szenenKommentareRouter
