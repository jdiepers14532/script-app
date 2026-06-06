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
import kiRouter, { kiAdminRouter, kiProviderRouter } from './routes/ki'
import { importRouter } from './routes/import'
import { importBatchRouter } from './routes/import-batch'
import meRouter from './routes/me'
import weatherRouter from './routes/weather'
import watermarkAdminRouter from './routes/watermark-admin'
import appSettingsRouter from './routes/app-settings'
import { folgenRouter } from './routes/folgen'
import {
  charactersRouter, charKategorienRouter,
} from './routes/characters'
import {
  vorstoppEinstellungenRouter,
} from './routes/vorstopp'
import {
  stageLabelsRouter, revisionColorsRouter,
  revisionEinstellungenRouter, revisionFarbenPresetsRouter,
} from './routes/revision'
import dokAdminRouter from './routes/dokument-admin'
import autocompleteRouter from './routes/autocomplete'
import { commentWebhookRouter, stagesCommentRouter, szenenCommentRouter } from './routes/scene-comments'
import { characterFotosRouter, motivFotosRouter, fotosStaticRouter, fotosThumbnailRouter } from './routes/fotos'
import { produktionFelderRouter, characterFeldwerteRouter, motivFeldwerteRouter } from './routes/charakter-felder'
import { produktionMotiveRouter, motivRouter, produktionDrehorteRouter } from './routes/motive'
import { rollenprofilImportRouter } from './routes/rollenprofil-import'
import { dkSettingsRouter, dkAccessAdminRouter } from './routes/dk-access'
import themePresetsRouter from './routes/theme-presets'
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
  adminColabRegisterRouter,
} from './routes/teamwork'
import { notificationsRouter } from './routes/notifications'
import { autorenplanRouter } from './routes/autorenplan'
import { taetigkeitenInternalRouter } from './routes/taetigkeitenInternal'
import { runPrivatModusWorker } from './workers/privatModusWorker'
import analysisRouter from './routes/analysis'
import { privateDokumenteRouter } from './routes/private-dokumente'
import { rollenFreigabeRouter, rollenFreigabePublicRouter } from './routes/rollen-freigabe'
import { freigabenRouter } from './routes/freigaben'
import { ntEintraegeRouter } from './routes/nt-eintraege'
import { checksRouter } from './routes/checks'
import { planungRouter } from './routes/planung'
import { bibleRouter } from './routes/bible'
import { planungVersionenRouter } from './routes/planung-versionen'
import { konzeptImportRouter } from './routes/konzept-import'
import { planungKiRouter } from './routes/planung-ki'
import { importJobsRouter } from './routes/import-jobs'
import { beziehungstypenRouter, beziehungenRouter } from './routes/beziehungen'
import { anmerkungenRouter, ankerRouter } from './routes/anmerkungen'
import { lesemodusRouter } from './routes/lesemodus'

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
app.use('/api/public/freigabe', rollenFreigabePublicRouter)
app.use('/api/produktionen', produktionenRouter)
app.use('/api/folgen', locksRouter)       // GET/POST/DELETE /:produktionId/:folgeNummer/lock
app.use('/api/locks', contractLocksRouter) // POST /contract-update
// Internal routes — MUST be before exportsRouter (which applies authMiddleware to all /api/*)
app.use('/api/internal', commentWebhookRouter)
app.use('/api/internal', taetigkeitenInternalRouter)
app.use('/api', exportsRouter)            // werkstufe/:id/export/* routes
app.use('/api/stages', stagesCommentRouter)
app.use('/api/szenen', szenenCommentRouter)

app.use('/api/ki', kiLimiter, kiRouter)
app.use('/api/admin/ki-settings', kiAdminRouter)
app.use('/api/admin/ki-providers', kiProviderRouter)
app.use('/api/import', importRouter)
app.use('/api/import', importBatchRouter)
app.use('/api/me', meRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/folgen', folgenRouter)
app.use('/api/admin/watermark', watermarkAdminRouter)
app.use('/api/admin/app-settings', appSettingsRouter)
app.use('/api/dk-settings', dkSettingsRouter)
app.use('/api/admin/dk-access', dkAccessAdminRouter)
app.use('/api/theme-presets', themePresetsRouter)

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
app.use('/api/revision-farben-presets', revisionFarbenPresetsRouter)

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

// Analyse-Editor
app.use('/api/analysis', analysisRouter)

// Private-Dokumente-Verwaltung (DK)
app.use('/api/dk/private-dokumente', privateDokumenteRouter)

// Rollen-Freigabe
app.use('/api/rollen-freigabe', rollenFreigabeRouter)

// Freigaben-Übersicht (Phase 5)
app.use('/api/freigaben', freigabenRouter)

// NT-Eintraege (P8)
app.use('/api/nt-eintraege', ntEintraegeRouter)
app.use('/api/checks', checksRouter)

// Autorenplan
app.use('/api/autorenplan', autorenplanRouter)

// Story-Straenge
app.use('/api/straenge', straengeRouter)
app.use('/api/planung', planungRouter)
app.use('/api/bible', bibleRouter)
app.use('/api/planung-versionen', planungVersionenRouter)
app.use('/api/konzept-import', konzeptImportRouter)
app.use('/api/planung-ki', planungKiRouter)
app.use('/api/import-jobs', importJobsRouter)

// Team-Work: Colab-Gruppen, Sessions, Sichtbarkeit
app.use('/api/colab-gruppen', colabGruppenRouter)
app.use('/api/werkstufen-sessions', werkstufenSessionsRouter)
app.use('/api/werkstufen', sichtbarkeitRouter)

app.use('/api/statistik', statistikRouter)
app.use('/api/admin/colab-gruppen-register', adminColabRegisterRouter)

// Figuren-Beziehungsbaum (v189)
app.use('/api/beziehungstypen', beziehungstypenRouter)
app.use('/api/beziehungen', beziehungenRouter)

// Anmerkungen-Hub (v196): Anker-Fundament + Anmerkungs-Service
app.use('/api/anmerkungen', anmerkungenRouter)
app.use('/api/anker', ankerRouter)
app.use('/api/lesemodus', lesemodusRouter)
app.use('/api/notifications', notificationsRouter)
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
    'v69_drop_folge_air_date.sql',
    'v70_vorlagen_aktiv.sql',
    'v71_revision_tracking.sql',
    'v72_drop_legacy.sql',
    'v73_notiz_vorlage_id.sql',
    'v74_szenen_revisionen.sql',
    'v75_notifications.sql',
    'v76_autorenplan.sql',
    'v77_autorenplan_job_kategorien.sql',
    'v78_szenen_snapshots.sql',
    'v79_absatzformat_sh_to_txt.sql',
    'v79_snapshot_metadata.sql',
    'v80_snapshot_is_current.sql',
    'v81_daily_preset_szenen_kopf.sql',
    'v82_flashback_erweiterung.sql',
    'v83_flashback_werkstufe_ref.sql',
    'v84_flashback_freitext.sql',
    'v85_drop_stockshot_stimmung.sql',
    'v86_preset_layout_settings.sql',
    'v87_revision_farben_presets.sql',
    'v88_drop_format_templates.sql',
    'v89_vorlage_zeilennummerierung.sql',
    'v90_platzhalter_cache.sql',
    'v91_stockshot_template_felder.sql',
    'v92_einsatz_datumfelder.sql',
    'v93_prozess_id_nullable.sql',
    'v94_job_kat_gagen.sql',
    'v95_dk_glossar.sql',
    'v96_ws_spezifikation.sql',
    'v97_einsatz_gage_kat.sql',
    'v98_glossar_defaults_data.sql',
    'v99_autorenplan_settings.sql',
    'v100_einsatz_gage_kategorie_id.sql',
    'v101_status_tracking.sql',
    'v102_gage_kat_nr.sql',
    'v103_einsatz_is_zusatz.sql',
    'v104_jk_kostenstelle.sql',
    'v105_zusatz_standalone.sql',
    'v106_wysiwyg_merged.sql',
    'v107_pre_vorlage_content.sql',
    // v108_glossar_linear_nonlinear.sql: Dead entry — file was deleted from repo and never applied to DB.
    // Removed 2026-06-02. The migration runner matches by name; removal is safe (nothing to skip).
    'v109_analysis_runs.sql',
    'v110_backfill_replik_count.sql',
    'v111_dokument_szenen_unique.sql',
    'v112_export_log.sql',
    'v113_titelseite_felder.sql',
    'v114_export_admin_settings.sql',
    'v115_glossar_kategorie.sql',
    'v116_timestamp_tz_fix.sql',
    'v117_freie_dokumente.sql',
    'v118_freie_dokument_labels.sql',
    'v119_kzfz_margin_migration.sql',
    'v120_sichtbarkeit_frei_align.sql',
    'v121_private_docs_management.sql',
    'v122_us_master_scene_format_preset.sql',
    'v123_us_preset_szenen_kopf.sql',
    'v124_preset_sort_order.sql',
    'v125_neue_presets_wga_theater.sql',
    'v126_sichtbarkeit_frei_default.sql',
    'v127_rename_szenenueberschrift_to_standard.sql',
    'v128_analysis_queued_status.sql',
    'v129_glossar_term_en_kategorien.sql',
    'v130_analysis_folge_scope.sql',
    'v131_seitenzahlen.sql',
    'v132_rollen_freigabe.sql',
    'v133_glossar_off_erklaerung.sql',
    'v134_nt_eintraege.sql',
    'v135_query_expand.sql',
    'v136_drehbuch_checks.sql',
    'v137_ki_prompts.sql',
    'v138_freigabe_context.sql',
    'v139_tageszeit_stimmungen.sql',
    'v140_werkstufen_snapshots.sql',
    'v141_synopsis_300.sql',
    'v142_synopsis_felder.sql',
    'v143_ki_prompts_synopsis.sql',
    'v144_check_meta.sql',
    'v145_synopsis_neue_spalten.sql',
    'v146_synopsis_lektor.sql',
    'v147_synopsis_deskriptoren_fsk.sql',
    'v148_deskriptor_vorlagen.sql',
    // Phase 0a — Figuren-/Motiv-Freigabe Schema
    'v149_freigabe_genehmiger_umbau.sql',
    'v150_freigabe_konfiguration_erweitern.sql',
    'v151_dk_settings_access_scope.sql',
    'v152_scene_characters_status_cp_audit.sql',
    // Glossar-PR — Besetzungs-/Freigabe-Begriffe
    'v153_glossar_besetzung_freigabe_seed.sql',
    // Phase 0b — neue Tabellen für Dispo-Scope, Motive, KI-Audit, Override-Audit
    'v154_szenen_freigabe_anfragen.sql',
    'v155_motiv_freigabe_anfragen.sql',
    'v156_komparse_klassifizierung.sql',
    'v157_freigabe_overrides.sql',
    'v158_freigabe_genehmiger_compat.sql',
    // Phase 2 — Komparsen-Klassifizierung KI-Settings
    'v159_ki_komparse_klassifizierung.sql',
    // Lock-Gate Werkstufen-Typ
    'v160_lock_trigger_typ.sql',
    // Lock-Gate Schwellenwert-Logik
    'v161_lock_trigger_version_nummer.sql',
    // NT-Einträge: Replik-Positionen
    'v162_nt_repliken_positionen.sql',
    // Beat-Migration: prosa_text + block_nummer + beat_charaktere + drop block_label
    'v163_beat_prosa_block_nummer.sql',
    'v164_drop_block_label.sql',
    // KI-Audit-Log + beat_kurztext ki_settings entry
    'v165_ki_audit_log.sql',
    // Rollen-Einsatzplanung (Gantt) + Befund-Register
    'v166_rollen_einsatz_befunde.sql',
    // Bible-Modus: Beziehungen erweitern + bible_chronologie + bible_felder_config
    'v167_bible.sql',
    // Versionierung: future_versionen + konzept_versionen + versions_aenderungen
    'v168_versionen_import.sql',
    // Glossar — Wechselschnitt erweitert + verwandte Schnitttermini (Parallelmontage, RB, Vision, Insert)
    'v169_glossar_wechselschnitt_verwandte.sql',
    // Planung-KI-Runs: fire-and-forget Storyline-Abgleich + Beziehungswiderspruch-Check
    'v170_planung_runs.sql',
    // Handoff 1 Phase 1: Backfill node_id auf alle Top-Level-Blöcke in dokument_szenen.content
    'v171_node_id_backfill.sql',
    // Handoff 1 Phase 1 (Fix): v171 war No-Op (falsches Format). Korrekte Version für Array-Format.
    'v172_node_id_backfill_fix.sql',
    // Handoff 1 Phase 2a: Re-Backfill nach Hocuspocus-Überschreibung beim Server-Neustart (217 Blöcke)
    'v173_node_id_rebackfill.sql',
    // Handoff 1 Phase 2b: block_uuid in szenen_revisionen — UUID-basiertes Revision-Matching
    'v174_szenen_revisionen_block_uuid.sql',
    // Titel-Alternativen: KI-Vorschläge persistent speichern
    'v175_titel_alternativen.sql',
    // scene_characters: idx_scene_chars_identity_char auf werkstufe_id IS NULL einschränken
    'v176_scene_chars_constraint_fix.sql',
    // Handoff 1 Phase 3: Werkstufen einfrieren (Revisionsstufen)
    'v177_werkstufen_einfrieren.sql',
    // Handoff 1 Phase 4: NT revisionssicher — repliken_node_ids + konsistenz_status
    'v178_nt_repliken_node_ids.sql',
    // Glossar: erklaerung_lang + quellen Felder + Unterbruch-Eintrag
    'v179_glossar_erklaerung_lang.sql',
    // PR 11: ki_providers base_url + Gemini/Custom-Seed
    'v180_ki_providers_base_url_gemini.sql',
    // PR 11: import_jobs-Tabelle für 3-Tier-PDF-Import
    'v181_import_jobs.sql',
    // Glossar: "Im Unterbruch" (neu) + CA erklaerung_lang
    'v182_glossar_im_unterbruch_ca.sql',
    // Handoff 2 Option C: Cleanup verwaiste werkstufen.label-Einträge (generisch, idempotent)
    'v183_cleanup_orphan_labels.sql',
    // PR 13: ki_settings für import_detect + import_extract (Tier-2/3)
    'v184_ki_import_settings.sql',
    // PR 13: extracted_text-Spalte in import_jobs (PDF-Text-Cache für Tier-2/3)
    'v185_import_jobs_text_cache.sql',
    // PR 14: committed_at/strands/beats für Import-Commit-Schritt
    'v186_import_commit.sql',
    // Handoff 3: ki_settings für Check-Engine KI-Checks (oneliner_vorhanden, spielzeit_uhrzeit)
    'v187_ki_check_settings.sql',
    // Handoff 3 §7: Audit-Tabelle für Check-Gate-Overrides
    'v188_check_gate_overrides.sql',
    // Beziehungsbaum: Typ-Katalog, charakter_beziehungen-Erweiterung, figuren_layout, Seed-Staging
    'v189_beziehungsbaum.sql',
    // Bereichs-Switcher: Bereich-Zugriffs-Keys (konzept_allowed_roles + analysis_allowed_roles-Seed)
    'v190_bereich_access_seed.sql',
    // Glossar: SL (Storyline/Treatment) + DB (Drehbuch/Dialogbuch) Abkürzungen
    'v191_glossar_sl_db.sql',
    // Seed-Staging: ziel_verstorben-Flag (†-Markierung aus Wiki)
    'v192_seed_verstorben.sql',
    // Kanten: normalisierter Unique-Index LEAST/GREATEST für symmetrische Typen
    'v193_kante_sym_unique.sql',
    // Seed: rolle (Rollenbez. → label beim Promote) + methode (regel_parser|fliesstext|llm)
    'v194_seed_rolle_methode.sql',
    'v195_fassungen_ueberschreibschutz.sql',
    // Anmerkungen-Hub Schritt 1: Anker-Fundament + Anmerkungs-System + fn_werkstufe_sichtbar
    'v196_anker_anmerkungen.sql',
    // Bulk-Import: mehrere Dokumente gleichzeitig (import_batches + import_batch_jobs)
    'v197_import_batches.sql',
    // Weg B: Content-Anker auf scene_identity_id (Pflicht) + block_index + Quote; node_id optional
    // (v198 ist im Anmerkungs-Paket für Handoff 6 reserviert → Bewertungs-Freigabe; hier übersprungen)
    'v199_anker_scene_primary.sql',
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
      path.join(__dirname, '..', 'migrations', file),
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
  // Upload-Verzeichnis für Import-Dokumente (PDF-Speicherung)
  try {
    const importDocsDir = path.join(process.cwd(), 'uploads', 'import-docs')
    if (!fs.existsSync(importDocsDir)) fs.mkdirSync(importDocsDir, { recursive: true })
  } catch {}
  // Orphaned Analysis-Runs bereinigen (nach PM2-Neustart hängen gebliebene running/queued)
  try {
    const { query: dbQuery } = await import('./db')
    const { rowCount } = await dbQuery(
      `UPDATE analysis_runs SET status = 'error', completed_at = NOW()
       WHERE status IN ('running', 'queued') AND completed_at IS NULL`
    ) as any
    if (rowCount > 0) console.log(`[analysis] ${rowCount} orphaned run(s) auf error gesetzt`)
  } catch {}
  console.log(`Script backend running on port ${PORT} (HTTP + WebSocket)`)
})

// Graceful shutdown — verhindert EADDRINUSE-Crash-Loop bei PM2-Restarts
async function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} empfangen — fahre herunter...`)
  httpServer.close(async () => {
    try {
      const { pool } = await import('./db')
      await pool.end()
    } catch {}
    console.log('[shutdown] Abgeschlossen.')
    process.exit(0)
  })
  // Sicherheits-Timeout: nach 8s hart beenden
  setTimeout(() => {
    console.error('[shutdown] Timeout — hard exit')
    process.exit(1)
  }, 8000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
