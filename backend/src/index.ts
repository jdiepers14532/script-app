import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { pool } from './db'

import healthRouter from './routes/health'
import staffelnRouter from './routes/staffeln'
import { episodenRouter, bloeckeRouter } from './routes/episoden'
import { stagesRouter, episodenStagesRouter } from './routes/stages'
import { szenenRouter, stagesSzenenRouter } from './routes/szenen'
import { locksRouter, contractLocksRouter } from './routes/locks'
import versionenRouter from './routes/versionen'
import exportsRouter from './routes/exports'
import entitiesRouter from './routes/entities'
import kiRouter, { kiAdminRouter } from './routes/ki'
import { szenenKommentareRouter, kommentareRouter } from './routes/kommentare'

// Load .env from project root or backend dir
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3014

// Security: Helmet headers
app.use(helmet({
  contentSecurityPolicy: false, // CSP handled by nginx
  crossOriginEmbedderPolicy: false,
}))

// CORS
app.use(cors({
  origin: true,
  credentials: true,
}))

app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))

// Rate limiting: general — 100 req/min per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen, bitte später erneut versuchen' },
  // Skip in test mode
  skip: () => process.env.PLAYWRIGHT_TEST_MODE === 'true',
})

// Rate limiting: KI — 20 req/min per IP
const kiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'KI-Rate-Limit erreicht (20/min)' },
  skip: () => process.env.PLAYWRIGHT_TEST_MODE === 'true',
})

app.use(generalLimiter)

// Routes
app.use('/api', healthRouter)
app.use('/api/staffeln', staffelnRouter)
app.use('/api/episoden', episodenRouter)
app.use('/api/bloecke', bloeckeRouter)
app.use('/api/stages', stagesRouter)
app.use('/api/episoden', episodenStagesRouter)
app.use('/api/szenen', szenenRouter)
app.use('/api/stages', stagesSzenenRouter)
app.use('/api/episoden', locksRouter)
app.use('/api/locks', contractLocksRouter)
app.use('/api/szenen', versionenRouter)
app.use('/api/stages', exportsRouter)
app.use('/api/entities', entitiesRouter)
app.use('/api', entitiesRouter) // for /api/stages/:id/entities
app.use('/api/ki', kiLimiter, kiRouter)
app.use('/api/admin/ki-settings', kiAdminRouter)
app.use('/api/szenen', szenenKommentareRouter)
app.use('/api/kommentare', kommentareRouter)

// Cron: Clean up expired locks every 5 minutes
setInterval(async () => {
  try {
    await pool.query("DELETE FROM episode_locks WHERE lock_type = 'exclusive' AND expires_at < NOW()")
  } catch (err) {
    console.error('Lock cleanup error:', err)
  }
}, 5 * 60 * 1000)

// Run migration on startup
async function runMigrations() {
  const migrationFiles = ['v1_init.sql', 'v2_locks.sql', 'v3_versionen.sql', 'v4_entities.sql', 'v5_ki.sql', 'v6_kommentare.sql']
  for (const file of migrationFiles) {
    const paths = [
      path.join(__dirname, 'migrations', file),
      path.join(__dirname, '..', 'src', 'migrations', file),
    ]
    let sql: string | null = null
    for (const p of paths) {
      if (fs.existsSync(p)) { sql = fs.readFileSync(p, 'utf-8'); break }
    }
    if (sql) {
      await pool.query(sql)
      console.log(`Migration ${file} applied`)
    }
  }
}

app.listen(PORT, async () => {
  try {
    await runMigrations()
  } catch (err) {
    console.error('Migration error:', err)
  }
  console.log(`Script backend running on port ${PORT}`)
})
