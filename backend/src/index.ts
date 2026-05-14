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
import produktionenRouter from './routes/produktionen'
import { locksRouter, contractLocksRouter } from './routes/locks'
import exportsRouter from './routes/exports'
import entitiesRouter from './routes/entities'
import kiRouter, { kiAdminRouter, kiProviderRouter } from './routes/ki'
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
  revisionEinstellungenRouter,
} from './routes/revision'
import dokAdminRouter from './routes/dokument-admin'
import autocompleteRouter from './routes/autocomplete'
import { commentWebhookRouter } from './routes/scene-comments'
import { characterFotosRouter, motivFotosRouter, fotosStaticRouter, fotosThumbnailRouter } from './routes/fotos'
import { produktionFelderRouter, characterFeldwerteRouter, motivFeldwerteRouter } from './routes/charakter-felder'
import { produktionMotiveRouter, motivRouter, produktionDrehorteRouter } from './routes/motive'
import { rollenprofilImportRouter } from './routes/rollenprofil-import'
import { dkSettingsRouter, dkAccessAdminRouter } from './routes/dk-access'
import { dokumentSzenenRouter, sceneIdentitiesRouter, stockshotArchivRouter, stockshotTemplatesRouter } from './routes/dokument-szenen'
import { folgenV2Router } from './routes/folgen-v2'
import { statistikRouter } from './routes/statistik'
import { folgeWerkstufenRouter, werkstufenRouter, werkstufenSzenenRouter } from './routes/werkstufen'
import { dokumentVorlagenRouter } from './routes/dokument-vorlagen'
import { absatzformateRouter, absatzformatPresetsRouter } from './routes/absatzformate'
import { editorUploadsRouter } from './routes/editor-uploads'
import { spellcheckRouter } from './routes/spellcheck'
import searchRouter from './routes/search'
import { straengeRouter } from './routes/straenge'
import kopfFusszeilen from './routes/kopf-fusszeilen'
import {
  colabGruppenRouter,
  werkstufenSessionsRouter,
  sichtbarkeitRouter,
  privatModeTokensPublicRouter,
} from './routes/teamwork'
import { runPrivatModusWorker } from './workers/privatModusWorker'

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

// Rate limiting: general — 600 req/min per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
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
// Public routes (no auth) — MUST be before the catch-all /api routers with auth middleware
app.use('/api/privat-mode-tokens', privatModeTokensPublicRouter)
app.use('/api/produktionen', produktionenRouter)
app.use('/api/folgen', locksRouter)       // GET/POST/DELETE /:produktionId/:folgeNummer/lock
app.use('/api/locks', contractLocksRouter) // POST /contract-update
app.use('/api/stages', exportsRouter)     // legacy stage export routes
app.use('/api', exportsRouter)            // werkstufe/:id/export/* routes
// Internal webhook — no auth, must be registered BEFORE the catch-all /api entitiesRouter
app.use('/api/internal', commentWebhookRouter)

app.use('/api/entities', entitiesRouter)
app.use('/api', entitiesRouter)            // for /api/stages/:id/entities
app.use('/api/ki', kiLimiter, kiRouter)
app.use('/api/admin/ki-settings', kiAdminRouter)
app.use('/api/admin/ki-providers', kiProviderRouter)
app.use('/api/import', importRouter)
app.use('/api/me', meRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/folgen', folgenRouter)
app.use('/api/admin/watermark', watermarkAdminRouter)
app.use('/api/admin/app-settings', appSettingsRouter)
app.use('/api/dk-settings', dkSettingsRouter)
app.use('/api/admin/dk-access', dkAccessAdminRouter)

// Rollenprofil Import (must be before /api/characters to avoid route conflict)
app.use('/api/characters/rollenprofil-import', rollenprofilImportRouter)

// Characters
app.use('/api/characters', charactersRouter)
app.use('/api/produktionen/:produktionId/character-kategorien', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, charKategorienRouter)

// Vorstopp
app.use('/api/produktionen/:produktionId/vorstopp-einstellungen', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, vorstoppEinstellungenRouter)

// Stage Labels + Revision
app.use('/api/produktionen/:produktionId/stage-labels', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, stageLabelsRouter)
app.use('/api/produktionen/:produktionId/revision-colors', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, revisionColorsRouter)
app.use('/api/produktionen/:produktionId/revision-einstellungen', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, revisionEinstellungenRouter)

// Werkstufen-Modell (v2)
app.use('/api/v2/folgen', folgenV2Router)
app.use('/api/v2/folgen/:folgeId/werkstufen', (req, _res, next) => {
  (req.params as any).folgeId = req.params.folgeId; next()
}, folgeWerkstufenRouter)
app.use('/api/werkstufen', werkstufenRouter)
app.use('/api/werkstufen/:werkId/szenen', (req, _res, next) => {
  (req.params as any).werkId = req.params.werkId; next()
}, werkstufenSzenenRouter)

// Dokument-Vorlagen (Templates)
app.use('/api/produktionen/:produktionId/dokument-vorlagen', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, dokumentVorlagenRouter)

// Kopf-/Fußzeilen-Defaults
app.use('/api/produktionen', kopfFusszeilen)

// Absatzformate
app.use('/api/produktionen/:produktionId/absatzformate', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, absatzformateRouter)
app.use('/api/absatzformat-presets', absatzformatPresetsRouter)

// Dokument-Szenen
app.use('/api/dokument-szenen', dokumentSzenenRouter)
app.use('/api/scene-identities', sceneIdentitiesRouter)
app.use('/api/stockshot-archiv', stockshotArchivRouter)
app.use('/api/stockshot-templates', stockshotTemplatesRouter)

// Suchen & Ersetzen
app.use('/api/search', searchRouter)

// Story-Straenge
app.use('/api/straenge', straengeRouter)

// Team-Work: Colab-Gruppen, Sessions, Sichtbarkeit
app.use('/api/colab-gruppen', colabGruppenRouter)
app.use('/api/werkstufen-sessions', werkstufenSessionsRouter)
app.use('/api/werkstufen', sichtbarkeitRouter)

app.use('/api/statistik', statistikRouter)
app.use('/api/admin', dokAdminRouter)
app.use('/api/autocomplete', autocompleteRouter)

// Spellcheck (LanguageTool proxy)
app.use('/api/spellcheck', spellcheckRouter)

// Editor image uploads
app.use('/api/editor-uploads', editorUploadsRouter)
app.use('/uploads/editor-images', express.static(path.join(process.cwd(), 'uploads', 'editor-images')))

// Fotos
app.use('/api/characters/:id/fotos', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, characterFotosRouter)
app.use('/api/motive/:id/fotos', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, motivFotosRouter)
app.use('/uploads/script-fotos/thumbnails', fotosThumbnailRouter)
app.use('/uploads/script-fotos', fotosStaticRouter)

// Charakter-Felder + Feldwerte
app.use('/api/produktionen/:produktionId/charakter-felder', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, produktionFelderRouter)
app.use('/api/characters/:id/feldwerte', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, characterFeldwerteRouter)
app.use('/api/motive/:id/feldwerte', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, motivFeldwerteRouter)

// Motive + Drehorte
app.use('/api/produktionen/:produktionId/motive', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, produktionMotiveRouter)
app.use('/api/motive/:id', (req, _res, next) => { (req.params as any).id = req.params.id; next() }, motivRouter)
app.use('/api/produktionen/:produktionId/drehorte', (req, _res, next) => { (req.params as any).produktionId = req.params.produktionId; next() }, produktionDrehorteRouter)

// Cron: Clean up expired locks every 5 minutes
setInterval(async () => {
  try {
    await pool.query("DELETE FROM episode_locks WHERE lock_type = 'exclusive' AND expires_at < NOW()")
  } catch (err) {
    console.error('Lock cleanup error:', err)
  }
}, 5 * 60 * 1000)

// Cron: Privat-Modus Auto-Ablauf Worker — alle 15 Minuten
setInterval(runPrivatModusWorker, 15 * 60 * 1000)

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
    'v37_dk_settings.sql',
    'v38_scene_identities.sql',
    'v39_scene_identity_characters.sql',
    'v40_nullable_szene_id.sql',
    'v41_revision_dokument_szene.sql',
    'v42_deprecate_legacy_tables.sql',
    'v43_werkstufen_modell.sql',
    'v43_1_fassung_nullable.sql',
    'v43_2_szene_yjs_state.sql',
    'v44_cleanup_legacy.sql',
    'v45_komparsen_spiel.sql',
    'v46_statistik.sql',
    'v47_rename_produktionen.sql',
    'v48_werkstufe_stand_datum.sql',
    'v48_statistik_report.sql',
    'v49_drop_stimmung.sql',
    'v50_drehorte_motive.sql',
    'v51_drop_legacy_tables.sql',
    'v52_element_type.sql',
    'v53_motive_ist_studio.sql',
    'v54_notiz_motiv_id.sql',
    'v55_dokument_vorlagen.sql',
    'v56_absatzformate.sql',
    'v57_page_length.sql',
    'v58_replik_nummern.sql',
    'v59_terminologie.sql',
    'v60_shortcut_headline.sql',
    'v61_straenge.sql',
    'v62_notiz_vorlagen_ocr.sql',
    'v63_sonderszenen.sql',
    'v64_datei_archiv_hash.sql',
    'v65_episodenende_format.sql',
    'v66_kopf_fusszeilen.sql',
    'v67_pwa_settings.sql',
    'v68_teamwork.sql',
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
