import { Router } from 'express'
import { pool } from '../db'
import { authMiddleware } from '../auth'

// ── GET /api/stages/:stageId/szenen-comment-counts ─────────────────────────
// Mounted at /api/stages — bulk unread count per scene for a stage
export const stagesCommentRouter = Router()
stagesCommentRouter.use(authMiddleware)

stagesCommentRouter.get('/:stageId/szenen-comment-counts', async (req, res) => {
  const userId = req.user?.user_id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const stageId = parseInt(req.params.stageId, 10)
  if (isNaN(stageId)) return res.status(400).json({ error: 'Invalid stageId' })

  try {
    const { rows } = await pool.query(`
      SELECT
        s.id AS scene_id,
        COUNT(sce.id) FILTER (
          WHERE sce.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)
            AND sce.deleted_at IS NULL
        ) AS unread_count
      FROM szenen s
      LEFT JOIN scene_comment_events sce ON sce.scene_id = s.id
      LEFT JOIN scene_comment_read_state rs
        ON rs.scene_id = s.id AND rs.user_id = $2
      WHERE s.stage_id = $1
      GROUP BY s.id, rs.last_read_at
    `, [stageId, userId])

    const result: Record<number, number> = {}
    for (const row of rows) {
      result[row.scene_id] = parseInt(row.unread_count, 10)
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/szenen/:szeneId/mark-comments-read ────────────────────────────
// Mounted at /api/szenen — fire-and-forget from frontend when comment panel opens
export const szenenCommentRouter = Router()
szenenCommentRouter.use(authMiddleware)

szenenCommentRouter.post('/:szeneId/mark-comments-read', async (req, res) => {
  const userId = req.user?.user_id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const szeneId = parseInt(req.params.szeneId, 10)
  if (isNaN(szeneId)) return res.status(400).json({ error: 'Invalid szeneId' })

  try {
    await pool.query(`
      INSERT INTO scene_comment_read_state (scene_id, user_id, last_read_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (scene_id, user_id) DO UPDATE SET last_read_at = NOW()
    `, [szeneId, userId])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/internal/scene-comment-webhook ────────────────────────────────
// Messenger-App → Script-App: new or deleted annotation for a scene
// Protected by shared secret, NOT by auth middleware
export const commentWebhookRouter = Router()

commentWebhookRouter.post('/scene-comment-webhook', async (req, res) => {
  const secret = req.headers['x-script-webhook-secret']
  const expected = process.env.SCRIPT_WEBHOOK_SECRET
  if (!expected || secret !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { annotation_id, scene_id, event_type } = req.body
  if (!annotation_id || !scene_id || !event_type) {
    return res.status(400).json({ error: 'annotation_id, scene_id, event_type required' })
  }

  const sceneIdInt = parseInt(String(scene_id), 10)
  if (isNaN(sceneIdInt)) return res.status(400).json({ error: 'Invalid scene_id' })

  try {
    if (event_type === 'created') {
      await pool.query(`
        INSERT INTO scene_comment_events (scene_id, messenger_annotation_id)
        VALUES ($1, $2)
        ON CONFLICT (messenger_annotation_id) DO NOTHING
      `, [sceneIdInt, String(annotation_id)])
    } else if (event_type === 'deleted') {
      await pool.query(`
        UPDATE scene_comment_events SET deleted_at = NOW()
        WHERE messenger_annotation_id = $1 AND deleted_at IS NULL
      `, [String(annotation_id)])
    } else {
      return res.status(400).json({ error: 'event_type must be created or deleted' })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
