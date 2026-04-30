import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { pool } from './db'
import { createHocuspocusServer } from './hocuspocus'

import healthRouter from './routes/health'
import staffelnRouter from './routes/staffeln'
import { stagesRouter } from './routes/stages'
import { szenenRouter, stagesSzenenRouter } from './routes/szenen'
import { locksRouter, contractLocksRouter } from './routes/locks'
import versionenRouter from './routes/versionen'
import exportsRouter from './routes/exports'
import entitiesRouter from './routes/entities'
import kiRouter, { kiAdminRouter, kiProviderRouter } from './routes/ki'
import { szenenKommentareRouter, kommentareRouter } from './routes/kommentare'
import { importRouter } from './routes/import'
import meRouter from './routes/me'
import weatherRouter from './routes/weather'
import watermarkAdminRouter from './routes/watermark-admin'
import appSettingsRouter from './routes/app-settings'
import { folgenRouter } from './routes/folgen'
import {
  charactersRouter, sceneCharactersRouter, charKategorienRouter,
} from './routes/characters'
import {
  szenenVorstoppRouter, vorstoppEinstellungenRouter,
} from './routes/vorstopp'
import {
  stageLabelsRouter, revisionColorsRouter,
  revisionEinstellungenRouter, szenenRevisionenRouter,
} from './routes/revision'
import { folgenDokumenteRouter, dokumentRouter } from './routes/dokumente'
import { fassungenRouter, annotationenRouter } from './routes/fassungen'
import dokAdminRouter from './routes/dokument-admin'
import autocompleteRouter from './routes/autocomplete'
import { stagesCommentRouter, szenenCommentRouter, commentWebhookRouter } from './routes/scene-comments'
import { characterFotosRouter, motivFotosRouter, fotosStaticRouter, fotosThumbnailRouter } from './routes/fotos'
import { staffelFelderRouter, characterFeldwerteRouter, motivFeldwerteRouter } from './routes/charakter-felder'
import { staffelMotiveRouter, motivRouter } from './routes/motive'
import { rollenprofilImportRouter } from './routes/rollenprofil-import'

// Load .env from project root or backend dir
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3014

// Trust nginx reverse proxy so rate limiter sees real client IPs
app.set('trust proxy', 1)

// Security: Helmet headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

// CORS
app.use(cors({
  origin: true,
  credentials: true,
}))

app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))

// Rate limiting: general — 300 req/min per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen, bitte später erneut versuchen' },
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
app.use('/api/stages', stagesRouter)
app.use('/api/szenen', szenenRouter)
app.use('/api/stages', stagesSzenenRouter)
app.use('/api/folgen', locksRouter)       // GET/POST/DELETE /:staffelId/:folgeNummer/lock
app.use('/api/locks', contractLocksRouter) // POST /contract-update
app.use('/api/szenen', versionenRouter)
app.use('/api/stages', exportsRouter)
// Internal webhook — no auth, must be registered BEFORE the catch-all /api entitiesRouter
app.use('/api/internal', commentWebhookRouter)

app.use('/api/entities', entitiesRouter)
app.use('/api', entitiesRouter)            // for /api/stages/:id/entities
app.use('/api/ki', kiLimiter, kiRouter)
app.use('/api/admin/ki-settings', kiAdminRouter)
app.use('/api/admin/ki-providers', kiProviderRouter)
app.use('/api/szenen', szenenKommentareRouter)
app.use('/api/kommentare', kommentareRouter)
app.use('/api/import', importRouter)
app.use('/api/me', meRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/folgen', folgenRouter)
app.use('/api/admin/watermark', watermarkAdminRouter)
app.use('/api/admin/app-settings', appSettingsRouter)

// Rollenprofil Import (must be before /api/characters to avoid route conflict)
app.use('/api/characters/rollenprofil-import', rollenprofilImportRouter)

// Characters
app.use('/api/characters', charactersRouter)
app.use('/api/szenen/:szeneId/characters', (req, _res, next) => { (req.params as any).szeneId = req.params.szeneId; next() }, sceneCharactersRouter)
app.use('/api/staffeln/:staffelId/character-kategorien', (req, _res, next) => { (req.params as any).staffelId = req.params.staffelId; next() }, charKategorienRouter)

// Vorstopp
app.use('/api/szenen/:szeneId/vorstopp', (req, _res, next) => { (req.params as any).szeneId = req.params.szeneId; next() }, szenenVorstoppRouter)
app.use('/api/staffeln/:staffelId/vorstopp-einstellungen', (req, _res, next) => { (req.params as any).staffelId = req.params.staffelId; next() }, vorstoppEinstellungenRouter)

// Stage Labels + Revision
app.use('/api/staffeln/:staffelId/stage-labels', (req, _res, next) => { (req.params as any).staffelId = req.params.staffelId; next() }, stageLabelsRouter)
app.use('/api/staffeln/:staffelId/revision-colors', (req, _res, next) => { (req.params as any).staffelId = req.params.staffelId; next() }, revisionColorsRouter)
app.use('/api/staffeln/:staffelId/revision-einstellungen', (req, _res, next) => { (req.params as any).staffelId = req.params.staffelId; next() }, revisionEinstellungenRouter)
app.use('/api/szenen/:szeneId/revisionen', (req, _res, next) => { (req.params as any).szeneId = req.params.szeneId; next() }, szenenRevisionenRouter)       // GET/PUT /:staffelId/:folgeNummer + besetzung/synopsis

// Dokument-Editor System
app.use('/api/folgen/:staffelId/:folgeNummer/dokumente', (req, _res, next) => {
  (req.params as any).staffelId = req.params.staffelId
  ;(req.params as any).folgeNummer = req.params.folgeNummer
  next()
}, folgenDokumenteRouter)
app.use('/api/folgen/:staffelId/:folgeNummer/dokumente/:dokumentId', (req, _res, next) => {
  (req.params as any).dokumentId = req.params.dokumentId
  next()
}, dokumentRouter)
app.use('/api/dokumente/:dokumentId/fassungen', (req, _res, next) => {
  (req.params as any).dokumentId = req.params.dokumentId
  next()
}, fassungenRouter)
app.use('/api/dokumente/:dokumentId/annotationen', (req, _res, next) => {
  (req.params as any).dokumentId = req.params.dokumentId
  next()
}, annotationenRouter)
app.use('/api/admin', dokAdminRouter)
app.use('/api/autocomplete', autocompleteRouter)
app.use('/api/stages', stagesCommentRouter)
app.use('/api/szenen', szenenCommentRouter)

// Fotos
app.use('/api/characters/:id/fotos', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, characterFotosRouter)
app.use('/api/motive/:id/fotos', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, motivFotosRouter)
app.use('/uploads/script-fotos/thumbnails', fotosThumbnailRouter)
app.use('/uploads/script-fotos', fotosStaticRouter)

// Charakter-Felder + Feldwerte
app.use('/api/staffeln/:staffelId/charakter-felder', (req, _res, next) => { (req.params as any).staffelId = req.params.staffelId; next() }, staffelFelderRouter)
app.use('/api/characters/:id/feldwerte', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, characterFeldwerteRouter)
app.use('/api/motive/:id/feldwerte', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, motivFeldwerteRouter)

// Motive
app.use('/api/staffeln/:staffelId/motive', (req, _res, next) => { (req.params as any).staffelId = req.params.staffelId; next() }, staffelMotiveRouter)
app.use('/api/motive/:id', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, motivRouter)

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
  const migrationFiles = [
    'v1_init.sql', 'v2_locks.sql', 'v3_versionen.sql', 'v4_entities.sql',
    'v5_ki.sql', 'v6_kommentare.sql', 'v7_entities_unique.sql',
    'v8_user_settings.sql', 'v9_proddb_sync.sql', 'v10_proddb_direct.sql', 'v11_ui_settings.sql',
    'v12_export_logs.sql', 'v13_app_settings.sql',
    'v16_szenen_columns.sql', 'v17_characters.sql', 'v18_vorstopp.sql', 'v19_stages_revision.sql',
    'v20_szenen_extended.sql', 'v21_szenen_updated_by.sql', 'v22_szenen_info_logging.sql',
    'v23_dokument_system.sql',
    'v24_storyline_richtext.sql',
    'v25_yjs_state.sql',
    'v26_scene_comment_read_state.sql',
    'v27_rollen_motive.sql',
    'v28_media_typ.sql',
    'v29_adresse_feld.sql',
    'v30_rollenprofil_import.sql',
    'v31_ki_providers.sql',
    'v32_notizen_richtext.sql',
    'v33_rollenprofil_felder.sql',
    'v34_charakter_feld_links.sql',
    'v35_stages_meta_json.sql',
    'v36_wechselschnitt_dauer.sql',
  ]

  // Tracking-Tabelle anlegen (idempotent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Bootstrap: Wenn szenen-Tabelle bereits existiert aber schema_migrations leer ist,
  // alle bis v34 als applied markieren (Übergang vom alten trackingfreien System)
  const { rows: existingTables } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='szenen'"
  )
  const { rows: existingMigrations } = await pool.query(
    'SELECT COUNT(*) AS cnt FROM schema_migrations'
  )
  if (existingTables.length > 0 && parseInt(existingMigrations[0].cnt) === 0) {
    const bootstrapFiles = migrationFiles.filter(f => {
      const num = parseInt(f.replace(/^v(\d+).*/, '$1'))
      return num <= 34
    })
    for (const file of bootstrapFiles) {
      await pool.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      )
    }
  }

  for (const file of migrationFiles) {
    // Skip wenn bereits applied
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file]
    )
    if (rows.length > 0) continue

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
      await pool.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file]
      )
      console.log(`Migration ${file} applied`)
    }
  }
}

// Create HTTP server for Express + Hocuspocus WebSocket on same port
const httpServer = createServer(app)

// Hocuspocus real-time collaboration (WebSocket at /ws/collab)
const hocuspocus = createHocuspocusServer()
const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (request, socket, head) => {
  const url = request.url ?? ''
  if (url.startsWith('/ws/collab')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      hocuspocus.handleConnection(ws, request)
    })
  } else {
    socket.destroy()
  }
})

httpServer.listen(PORT, async () => {
  try {
    await runMigrations()
  } catch (err) {
    console.error('Migration error:', err)
  }
  console.log(`Script backend running on port ${PORT} (HTTP + WebSocket)`)
})
