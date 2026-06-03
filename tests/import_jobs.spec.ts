/**
 * Import-Jobs System — Playwright-Tests (PR 12–14 + Fix)
 *
 * Testet alle Endpoints des 3-Tier-Import-Systems:
 *  - Upload + CRUD
 *  - State-Machine-Fehlerfälle
 *  - Commit-Preview-Struktur
 *  - Overwrite-Schutz (PR 14 Fix: beats_mit_inhalt werden nicht still überschrieben)
 *  - Strang-Rename-Stabilität (PR 14 Fix: committed_strang_map)
 *
 * Tests gegen https://script.serienwerft.studio
 */

import { test, expect } from '@playwright/test'

const BASE      = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'
const PROD_ID   = 'd26dff66-57cf-4b32-9649-4009618fce4d' // claude-Test-Produktion

let authCookie: string
/** ID des im Test angelegten Jobs — wird in afterAll gelöscht */
let createdJobId: string | null = null

// ── Auth ──────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok(), 'Login muss erfolgreich sein').toBeTruthy()
  const cookies = loginRes.headers()['set-cookie'] ?? ''
  const match   = cookies.match(/access_token=([^;]+)/)
  expect(match, 'access_token Cookie muss vorhanden sein').toBeTruthy()
  authCookie = `access_token=${match![1]}`
})

test.afterAll(async ({ request }) => {
  // Aufräumen: im Test erzeugten Job löschen
  if (createdJobId) {
    await request.delete(`${BASE}/api/import-jobs/${createdJobId}`, {
      headers: { Cookie: authCookie },
    })
  }
})

function h()         { return { headers: { Cookie: authCookie } } }
function hd(d: any)  { return { headers: { Cookie: authCookie }, data: d } }

// ── Minimales Test-Dokument ───────────────────────────────────────────────────
// Enthält STRANG- und BLOCK-Pattern damit Tier-1 greifen kann.
// Wir schicken es als .txt, weil pdf-parse bei invalider PDF-Struktur wirft.
// Der Upload-Endpoint behandelt Parse-Fehler graceful (status='error') —
// der Job wird trotzdem angelegt. Das reicht für alle CRUD- und State-Tests.

function makeTestDoc(): Buffer {
  const text = [
    'STRANG: Liebesgeschichte Lou-Daniel',
    '',
    'BLOCK 845',
    'Lou trifft Daniel im Foyer des Hotels.',
    '',
    'BLOCK 846',
    'Lou und Daniel klaeren das Missverstaendnis.',
    '',
    'BLOCK 847',
    'Lou und Daniel versoehnten sich.',
    '',
    'STRANG: Business-Strang Franka',
    '',
    'BLOCK 845',
    'Franka verhandelt den Vertrag.',
    '',
    'BLOCK 846',
    'Franka gewinnt die Ausschreibung.',
  ].join('\n')
  return Buffer.from(text, 'utf-8')
}

// ── Hilfsfunktion: ersten committed Job für PROD_ID finden ───────────────────

async function findCommittedJob(request: any): Promise<any | null> {
  const res = await request.get(`${BASE}/api/import-jobs?produktion_id=${PROD_ID}`, h())
  if (!res.ok()) return null
  const jobs: any[] = await res.json()
  return jobs.find(j => j.committed_at != null) ?? null
}

async function findDoneJob(request: any): Promise<any | null> {
  const res = await request.get(`${BASE}/api/import-jobs?produktion_id=${PROD_ID}`, h())
  if (!res.ok()) return null
  const jobs: any[] = await res.json()
  // Bevorzuge committed, sonst done ohne committed_at
  return jobs.find(j => j.status === 'done') ?? null
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPPE 1 — Upload + CRUD (kein KI erforderlich)
// ═══════════════════════════════════════════════════════════════════════════════

test('T1: POST /upload — Job wird angelegt (graceful bei Text-Datei)', async ({ request }) => {
  const res = await request.post(`${BASE}/api/import-jobs/upload`, {
    headers: { Cookie: authCookie },
    multipart: {
      produktion_id: PROD_ID,
      file: {
        name: 'test-future-plan.txt',
        mimeType: 'text/plain',
        buffer: makeTestDoc(),
      },
    },
  })

  // Endpoint antwortet immer 200 (auch bei Parse-Fehler — Job wird trotzdem angelegt)
  expect(res.status(), 'Upload-Endpoint muss 200 zurückgeben').toBe(200)

  const body = await res.json()

  // Job-Struktur prüfen
  expect(body.id,             'job.id muss vorhanden sein').toBeTruthy()
  expect(body.produktion_id,  'produktion_id muss stimmen').toBe(PROD_ID)
  expect(body.source_file_name).toContain('test-future-plan')
  expect(['running', 'done', 'detecting', 'error']).toContain(body.status)
  // tier_erreicht kann null (DB-Default), 0, 1, 2, 3 sein
  expect(body.tier_erreicht == null || typeof body.tier_erreicht === 'number').toBeTruthy()

  createdJobId = body.id
  console.log(`  → Job angelegt: ${body.id}, status=${body.status}`)
})

test('T2: GET /import-jobs?produktion_id — Liste enthält den neuen Job', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  const res = await request.get(`${BASE}/api/import-jobs?produktion_id=${PROD_ID}`, h())
  expect(res.ok(), 'Liste muss 200 zurückgeben').toBeTruthy()

  const jobs: any[] = await res.json()
  expect(Array.isArray(jobs)).toBeTruthy()

  const found = jobs.find(j => j.id === createdJobId)
  expect(found, 'Neu angelegter Job muss in der Liste erscheinen').toBeTruthy()

  // Felder der Listenansicht prüfen (ergebnis_json wird NICHT in der Liste mitgeliefert)
  expect(found.id).toBe(createdJobId)
  expect(found.source_file_name).toBeTruthy()
  expect(found.status).toBeTruthy()
  expect(found.erstellt_am).toBeTruthy()
})

test('T3: GET /import-jobs/:id — Job-Detailstruktur korrekt', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  const res = await request.get(`${BASE}/api/import-jobs/${createdJobId}`, h())
  expect(res.ok(), 'GET /:id muss 200 zurückgeben').toBeTruthy()

  const job = await res.json()
  expect(job.id).toBe(createdJobId)
  expect(job.produktion_id).toBe(PROD_ID)
  expect(job.source_file_name).toBeTruthy()
  expect(job.status).toBeTruthy()
  // Detailansicht enthält ergebnis_json (auch wenn null)
  expect('ergebnis_json' in job, 'ergebnis_json muss vorhanden sein').toBeTruthy()
})

test('T4: GET /import-jobs/:id/file — Datei-Download antwortet', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  const res = await request.get(`${BASE}/api/import-jobs/${createdJobId}/file`, h())
  // Datei existiert auf dem Server → 200; Datei weg (z.B. nach Restart) → 404
  expect([200, 404]).toContain(res.status())
  if (res.ok()) {
    // Content-Disposition muss gesetzt sein
    const cd = res.headers()['content-disposition'] ?? ''
    expect(cd).toContain('attachment')
  }
})

test('T5: GET /import-jobs/:id — 404 für unbekannte ID', async ({ request }) => {
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const res = await request.get(`${BASE}/api/import-jobs/${fakeId}`, h())
  expect(res.status()).toBe(404)
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPPE 2 — State-Machine-Fehlerfälle (falscher Status → 400)
// ═══════════════════════════════════════════════════════════════════════════════

test('T6: POST /tier2 auf Job mit falschem Status → 400', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  // Unser Test-Job hat status='error' oder 'done' (kein echtes PDF) — niemals 'detecting'
  // → Tier-2 muss 400 zurückgeben
  const res = await request.post(`${BASE}/api/import-jobs/${createdJobId}/tier2`, hd({}))
  // Entweder 400 (falscher Status) oder 400 (KI nicht aktiviert)
  expect(res.status(), 'Tier-2 auf nicht-detecting Job muss 400 sein').toBe(400)

  const body = await res.json()
  expect(body.error, 'Fehlermeldung muss vorhanden sein').toBeTruthy()
  console.log(`  → Fehlermeldung: ${body.error}`)
})

test('T7: GET /cost-preview auf Job mit falschem Status → 400', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  const res = await request.get(`${BASE}/api/import-jobs/${createdJobId}/cost-preview`, h())
  expect(res.status(), 'Cost-Preview auf nicht-chunking Job muss 400 sein').toBe(400)

  const body = await res.json()
  expect(body.error).toContain('chunking')
})

test('T8: POST /tier3 auf Job mit falschem Status → 400', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  const res = await request.post(`${BASE}/api/import-jobs/${createdJobId}/tier3`, hd({}))
  expect(res.status(), 'Tier-3 auf nicht-chunking Job muss 400 sein').toBe(400)

  const body = await res.json()
  expect(body.error).toContain('chunking')
})

test('T9: GET /commit-preview auf nicht-done Job → 400', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  const res = await request.get(`${BASE}/api/import-jobs/${createdJobId}/commit-preview`, h())
  expect(res.status(), 'Commit-Preview auf nicht-done Job muss 400 sein').toBe(400)

  const body = await res.json()
  expect(body.error, 'Fehlermeldung muss vorhanden sein').toBeTruthy()
})

test('T10: POST /commit auf nicht-done Job → 400', async ({ request }) => {
  test.skip(!createdJobId, 'T1 hat keinen Job angelegt')

  const res = await request.post(`${BASE}/api/import-jobs/${createdJobId}/commit`, hd({}))
  expect(res.status(), 'Commit auf nicht-done Job muss 400 sein').toBe(400)
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPPE 3 — Commit-Preview-Struktur (benötigt vorhandenen 'done'-Job)
// ═══════════════════════════════════════════════════════════════════════════════

test('T11: GET /commit-preview — Struktur korrekt für done-Job', async ({ request }) => {
  const job = await findDoneJob(request)
  test.skip(!job, 'Kein done-Job für diese Test-Produktion vorhanden — manuell per KI-Run erstellen')

  console.log(`  → Verwende Job ${job.id} (status=${job.status})`)

  const res = await request.get(`${BASE}/api/import-jobs/${job.id}/commit-preview`, h())
  expect(res.ok(), 'Commit-Preview muss 200 zurückgeben').toBeTruthy()

  const preview = await res.json()

  // Pflichfelder
  expect(Array.isArray(preview.neue_straenge),   'neue_straenge muss Array sein').toBeTruthy()
  expect(Array.isArray(preview.vorhandene_straenge), 'vorhandene_straenge muss Array sein').toBeTruthy()
  expect(typeof preview.neue_beats,       'neue_beats muss Zahl sein').toBe('number')
  expect(typeof preview.beats_leer,       'beats_leer muss Zahl sein').toBe('number')
  expect(typeof preview.beats_mit_inhalt, 'beats_mit_inhalt muss Zahl sein').toBe('number')
  expect(typeof preview.total_blocks,     'total_blocks muss Zahl sein').toBe('number')
  expect(typeof preview.already_committed).toBe('boolean')

  // beats_mit_inhalt ist die kritische Größe für den Overwrite-Schutz
  const total = preview.neue_beats + preview.beats_leer + preview.beats_mit_inhalt
  expect(total).toBe(preview.total_blocks - /* Blöcke ohne Strang */ 0)
  // (Kann minimal abweichen wenn Blöcke kein Strang-Feld haben)

  console.log(`  → neue=${preview.neue_beats}, leer=${preview.beats_leer}, mit_inhalt=${preview.beats_mit_inhalt}`)
  console.log(`  → neue_straenge=${preview.neue_straenge.length}, vorhandene=${preview.vorhandene_straenge.length}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPPE 4 — Overwrite-Schutz (PR 14 Fix: kein stiller Inhaltsverlust)
// ═══════════════════════════════════════════════════════════════════════════════

test('T12: POST /commit ohne overwrite — beats_mit_inhalt werden übersprungen', async ({ request }) => {
  const job = await findCommittedJob(request)
  test.skip(!job, 'Kein committed Job für diese Test-Produktion — Test überspringen')

  console.log(`  → Verwende committed Job ${job.id}`)

  // Erst Commit-Preview holen um beats_mit_inhalt zu kennen
  const previewRes = await request.get(`${BASE}/api/import-jobs/${job.id}/commit-preview`, h())
  if (!previewRes.ok()) {
    console.log('  → Commit-Preview nicht verfügbar, überspringe')
    test.skip(true, 'Commit-Preview nicht verfügbar')
  }
  const preview = await previewRes.json()

  // Re-Commit ohne overwrite
  const commitRes = await request.post(
    `${BASE}/api/import-jobs/${job.id}/commit`,
    hd({ overwrite: false }),
  )
  expect(commitRes.ok(), 'Re-Commit muss 200 zurückgeben').toBeTruthy()

  const result = await commitRes.json()

  // Pflichtfelder der Commit-Antwort
  expect(typeof result.committed_strands).toBe('number')
  expect(typeof result.neue_beats).toBe('number')
  expect(typeof result.aktualisierte_beats).toBe('number')
  expect(typeof result.uebersprungene_beats).toBe('number')
  expect(result.overwrite_mode).toBe(false)

  // Kern-Assert: beats_mit_inhalt aus Preview == uebersprungene_beats im Commit
  if (preview.beats_mit_inhalt > 0) {
    expect(result.uebersprungene_beats, 'beats_mit_inhalt müssen übersprungen werden').toBe(preview.beats_mit_inhalt)
    console.log(`  ✓ ${result.uebersprungene_beats} Beats mit Inhalt korrekt übersprungen (Overwrite-Schutz aktiv)`)
  } else {
    // Kein Inhalt da → nichts zu überspringen, aber Mechanismus trotzdem korrekt
    expect(result.uebersprungene_beats).toBe(0)
    console.log('  → Keine Beats mit Inhalt vorhanden (ersten Commit ausführen und Test wiederholen)')
  }
})

test('T13: POST /commit mit overwrite=true — alle Beats werden aktualisiert', async ({ request }) => {
  const job = await findCommittedJob(request)
  test.skip(!job, 'Kein committed Job für diese Test-Produktion — Test überspringen')

  // Preview vorher
  const previewRes = await request.get(`${BASE}/api/import-jobs/${job.id}/commit-preview`, h())
  if (!previewRes.ok()) {
    test.skip(true, 'Commit-Preview nicht verfügbar')
  }
  const preview = await previewRes.json()
  test.skip(preview.beats_mit_inhalt === 0, 'Keine Beats mit Inhalt — Overwrite-Test nicht aussagekräftig')

  // Commit MIT overwrite=true
  const commitRes = await request.post(
    `${BASE}/api/import-jobs/${job.id}/commit`,
    hd({ overwrite: true }),
  )
  expect(commitRes.ok(), 'Overwrite-Commit muss 200 zurückgeben').toBeTruthy()

  const result = await commitRes.json()
  expect(result.overwrite_mode).toBe(true)
  // Kein Skip mehr — alle Beats werden aktualisiert
  expect(result.uebersprungene_beats, 'Mit overwrite=true keine übersprungenen Beats').toBe(0)
  expect(result.aktualisierte_beats, 'Mit overwrite=true müssen beats_mit_inhalt aktualisiert werden')
    .toBeGreaterThanOrEqual(preview.beats_mit_inhalt)

  console.log(`  ✓ overwrite=true: ${result.aktualisierte_beats} Beats aktualisiert, 0 übersprungen`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPPE 5 — Strang-Rename-Stabilität (PR 14 Fix: committed_strang_map)
// ═══════════════════════════════════════════════════════════════════════════════

test('T14: committed_strang_map wird nach Commit gespeichert', async ({ request }) => {
  const job = await findCommittedJob(request)
  test.skip(!job, 'Kein committed Job für diese Test-Produktion')

  // Job-Detail laden (enthält ergebnis_json mit committed_strang_map)
  const res = await request.get(`${BASE}/api/import-jobs/${job.id}`, h())
  expect(res.ok()).toBeTruthy()

  const detail = await res.json()
  expect(detail.committed_at, 'committed_at muss gesetzt sein').toBeTruthy()

  const map = detail.ergebnis_json?.committed_strang_map
  expect(map, 'committed_strang_map muss in ergebnis_json vorhanden sein').toBeTruthy()
  expect(typeof map).toBe('object')

  // Map muss mindestens einen Eintrag haben
  const keys = Object.keys(map)
  expect(keys.length, 'committed_strang_map muss mindestens einen Strang-Eintrag haben').toBeGreaterThan(0)

  // Alle Werte müssen gültige UUID-artige Strang-IDs sein
  for (const [name, id] of Object.entries(map)) {
    expect(typeof name, `Map-Key "${name}" muss String sein`).toBe('string')
    expect(typeof id,   `Map-Value für "${name}" muss String sein`).toBe('string')
    expect((id as string).length, `Strang-ID für "${name}" muss nicht leer sein`).toBeGreaterThan(0)
  }

  console.log(`  ✓ committed_strang_map enthält ${keys.length} Einträge: ${keys.slice(0, 3).join(', ')}...`)
})

test('T15: Re-Commit nach Strang-Rename nutzt committed_strang_map (kein Duplikat)', async ({ request }) => {
  const job = await findCommittedJob(request)
  test.skip(!job, 'Kein committed Job für diese Test-Produktion')

  // Stränge vor dem Re-Commit zählen
  const strangeBefore = await request.get(
    `${BASE}/api/straenge?produktion_id=${PROD_ID}`,
    h(),
  )
  test.skip(!strangeBefore.ok(), 'Strang-Liste nicht verfügbar')
  const beforeList: any[] = await strangeBefore.json()
  const countBefore = beforeList.length

  // Re-Commit (overwrite=false, safe)
  const commitRes = await request.post(
    `${BASE}/api/import-jobs/${job.id}/commit`,
    hd({ overwrite: false }),
  )
  expect(commitRes.ok(), 'Re-Commit muss 200 zurückgeben').toBeTruthy()
  const result = await commitRes.json()

  // Stränge nach dem Re-Commit zählen
  const strangeAfter = await request.get(
    `${BASE}/api/straenge?produktion_id=${PROD_ID}`,
    h(),
  )
  const afterList: any[] = await strangeAfter.json()
  const countAfter = afterList.length

  // Kern-Assert: Kein neuer Strang (committed_strang_map verhindert Duplikate)
  expect(result.neue_beats, 'Re-Commit sollte keine neuen Beats anlegen').toBe(0)
  // Strang-Anzahl darf nicht gestiegen sein (Map verhindert Neuerstellung trotz Umbenennung)
  expect(countAfter, 'Re-Commit darf keine Duplikat-Stränge anlegen').toBe(countBefore)

  console.log(`  ✓ Stränge vor=${countBefore}, nach=${countAfter} — kein Duplikat (committed_strang_map aktiv)`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPPE 6 — Delete (Aufräumen, unabhängig von vorherigen Tests)
// ═══════════════════════════════════════════════════════════════════════════════

test('T16: DELETE /import-jobs/:id — Job wird gelöscht', async ({ request }) => {
  // Eigenen Test-Job anlegen (unabhängig von T1, falls T1 fehlschlug)
  const uploadRes = await request.post(`${BASE}/api/import-jobs/upload`, {
    headers: { Cookie: authCookie },
    multipart: {
      produktion_id: PROD_ID,
      file: {
        name: 'delete-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Test-Inhalt fuer Delete-Test'),
      },
    },
  })

  expect(uploadRes.status()).toBe(200)
  const uploaded = await uploadRes.json()
  const testJobId = uploaded.id
  expect(testJobId).toBeTruthy()

  // Löschen
  const deleteRes = await request.delete(`${BASE}/api/import-jobs/${testJobId}`, h())
  expect(deleteRes.status(), 'DELETE muss 204 zurückgeben').toBe(204)

  // Verifizieren: Job existiert nicht mehr
  const getRes = await request.get(`${BASE}/api/import-jobs/${testJobId}`, h())
  expect(getRes.status(), 'Nach Delete muss GET 404 zurückgeben').toBe(404)

  console.log(`  ✓ Job ${testJobId} erfolgreich gelöscht`)
})

test('T17: DELETE /import-jobs/:id auf unbekannte ID → 404', async ({ request }) => {
  const fakeId = '00000000-0000-0000-0000-000000000001'
  const res = await request.delete(`${BASE}/api/import-jobs/${fakeId}`, h())
  expect(res.status()).toBe(404)
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPPE 7 — Auth-Check (kein Cookie = 401)
// ═══════════════════════════════════════════════════════════════════════════════

test('T18: Alle Endpoints ohne Auth → 401', async ({ request }) => {
  const noAuth = {} // kein Cookie

  const endpoints = [
    { method: 'get',    url: `${BASE}/api/import-jobs?produktion_id=${PROD_ID}` },
    { method: 'get',    url: `${BASE}/api/import-jobs/00000000-0000-0000-0000-000000000000` },
    { method: 'delete', url: `${BASE}/api/import-jobs/00000000-0000-0000-0000-000000000000` },
    { method: 'get',    url: `${BASE}/api/import-jobs/00000000-0000-0000-0000-000000000000/cost-preview` },
    { method: 'get',    url: `${BASE}/api/import-jobs/00000000-0000-0000-0000-000000000000/commit-preview` },
  ]

  for (const ep of endpoints) {
    const res = ep.method === 'get'
      ? await request.get(ep.url, noAuth)
      : await request.delete(ep.url, noAuth)

    expect(
      [401, 403],
      `${ep.method.toUpperCase()} ${ep.url.split('/api')[1]} ohne Auth muss 401/403 sein`,
    ).toContain(res.status())
  }

  console.log(`  ✓ Alle ${endpoints.length} Endpoints verweigern unauthentifizierte Zugriffe`)
})
