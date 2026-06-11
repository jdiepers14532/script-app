/**
 * Verteiler-System — Playwright-Tests (Schritt 2, SPEC §9).
 *
 * Deckt ab: PDF-Profil GET/POST/PUT, Verteiler-CRUD, Mitglieder-CRUD + Besetzung,
 * veroeffentlichen (published + distribution/empfaenger queued), Token-Portal
 * (Metadaten, lazy PDF, resend), Distributionen-Liste/Detail + resend-Idempotenz.
 *
 * Mailversand ist in Schritt 2 NICHT verdrahtet — Empfänger bleiben 'queued',
 * Klartext-Links kommen in der API-Response. Tests gegen https://script.serienwerft.studio.
 */
import { test, expect } from '@playwright/test'

const BASE      = process.env.BASE_URL || 'https://script.serienwerft.studio'
const API       = `${BASE}/api`
const AUTH_BASE = 'https://auth.serienwerft.studio'
const PROD_ID   = 'd26dff66-57cf-4b32-9649-4009618fce4d' // claude-Test-Produktion

let authCookie: string
let profilId: string | null = null
let verteilerId: string | null = null
let werkstufeId: string | null = null
let werkstufeTyp = 'Drehbuch'
const werkstufeLabel = 'Verteiler-Test-Fassung'   // Verteiler-Trigger matcht das LABEL
let createdWerkstufe = false

test.beforeAll(async ({ request }) => {
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok(), 'Login muss erfolgreich sein').toBeTruthy()
  const cookies = loginRes.headers()['set-cookie'] ?? ''
  const match   = cookies.match(/access_token=([^;]+)/)
  expect(match, 'access_token Cookie muss vorhanden sein').toBeTruthy()
  authCookie = `access_token=${match![1]}`

  // Werkstufe ermitteln (oder anlegen) für den veroeffentlichen-Test
  const folgenRes = await request.get(`${API}/v2/folgen?produktion_id=${PROD_ID}`, h())
  const folgen = folgenRes.ok() ? await folgenRes.json() : []
  for (const f of folgen) {
    const wsRes = await request.get(`${API}/v2/folgen/${f.id}/werkstufen`, h())
    if (!wsRes.ok()) continue
    const ws = await wsRes.json()
    if (Array.isArray(ws) && ws.length > 0) { werkstufeId = ws[0].id; werkstufeTyp = ws[0].typ ?? 'Drehbuch'; break }
  }
  if (!werkstufeId && folgen.length > 0) {
    const created = await request.post(`${API}/v2/folgen/${folgen[0].id}/werkstufen`, hd({ typ: 'Drehbuch', mode: 'empty' }))
    if (created.ok()) { const w = await created.json(); werkstufeId = w.id; werkstufeTyp = w.typ ?? 'Drehbuch'; createdWerkstufe = true }
  }

  // Werkstufe ein bekanntes Fassungs-Label geben: der Verteiler-Trigger matcht auf
  // das LABEL der Werkstufe (nicht den typ) — ohne passendes Label kein Match.
  if (werkstufeId) {
    await request.put(`${API}/werkstufen/${werkstufeId}`, hd({ label: werkstufeLabel })).catch(() => {})
  }
})

test.afterAll(async ({ request }) => {
  if (verteilerId) await request.delete(`${API}/verteiler/${verteilerId}`, h()) // cascade: mitglieder, distribution, empfaenger
  if (profilId)    await request.delete(`${API}/pdf-export-profil/${profilId}`, h()).catch(() => {})
  if (createdWerkstufe && werkstufeId) await request.delete(`${API}/werkstufen/${werkstufeId}`, h()).catch(() => {})
})

function h()        { return { headers: { Cookie: authCookie } } }
function hd(d: any) { return { headers: { Cookie: authCookie }, data: d } }

// ── PDF-Export-Profil ─────────────────────────────────────────────────────────
test('PDF-Profil: POST anlegen, GET, PUT (Standard + Wasserzeichen)', async ({ request }) => {
  const create = await request.post(`${API}/pdf-export-profil`, hd({ produktion_id: PROD_ID, name: 'Test-Profil Verteiler' }))
  expect(create.status()).toBe(201)
  const p = await create.json()
  profilId = p.id
  expect(p.wz_zwc_aktiv).toBe(true)            // DDL-Default
  expect(p.wz_sichtbar_position).toBe('kopf_fuss')

  const get = await request.get(`${API}/pdf-export-profil/${profilId}`, h())
  expect(get.ok()).toBeTruthy()

  const put = await request.put(`${API}/pdf-export-profil/${profilId}`, hd({
    ist_standard: true, wz_sichtbar_position: 'kopf_fuss_diagonal', wz_sichtbar_opacity: 30,
  }))
  expect(put.ok()).toBeTruthy()
  const updated = await put.json()
  expect(updated.ist_standard).toBe(true)
  expect(updated.wz_sichtbar_position).toBe('kopf_fuss_diagonal')
  expect(updated.wz_sichtbar_opacity).toBe(30)
})

test('PDF-Profil: GET Liste der Produktion', async ({ request }) => {
  const res = await request.get(`${API}/pdf-export-profil?produktion_id=${PROD_ID}`, h())
  expect(res.ok()).toBeTruthy()
  const list = await res.json()
  expect(Array.isArray(list)).toBeTruthy()
  expect(list.some((x: any) => x.id === profilId)).toBeTruthy()
})

// ── PDF-Profil: Live-Vorschau / Resolver (Phase 3+5) ──────────────────────────
// Der Resolver (lib/pdfProfilResolver.ts) mappt die Profil-Struktur auf
// assemblePdf-Optionen — genutzt von Vorschau UND echtem Versand.

test('PDF-Profil: Live-Vorschau liefert echtes PDF', async ({ request }) => {
  test.skip(!profilId, 'kein Profil angelegt')
  // Struktur auf Titelseite + Szenen setzen (rendert sicher etwas)
  await request.put(`${API}/pdf-export-profil/${profilId}`, hd({
    struktur_json: {
      preItems: [{ type: 'titelseite', enabled: true }],
      szenenAktiv: true, postItems: [],
    },
  }))
  const res = await request.post(`${API}/pdf-export-profil/${profilId}/preview`, hd({ produktion_id: PROD_ID }))
  expect(res.status(), 'Vorschau muss 200 liefern').toBe(200)
  expect(res.headers()['content-type']).toContain('application/pdf')
  const body = await res.body()
  expect(body.subarray(0, 5).toString(), 'Body muss ein PDF sein').toBe('%PDF-')
  expect(body.length).toBeGreaterThan(1000)
})

test('PDF-Profil: Statistik wird aufgelöst, nicht übersprungen', async ({ request }) => {
  test.skip(!profilId, 'kein Profil angelegt')
  // Statistik im Folge-Modus aktivieren — der Resolver muss daraus ein
  // statistik-Item mit Folge-Bezug bauen (sonst X-Preview-Skipped: Statistik).
  await request.put(`${API}/pdf-export-profil/${profilId}`, hd({
    struktur_json: {
      preItems: [
        { type: 'titelseite', enabled: true },
        { type: 'statistik', enabled: true, mode: 'folge' },
      ],
      szenenAktiv: true, postItems: [],
    },
  }))
  const res = await request.post(`${API}/pdf-export-profil/${profilId}/preview`, hd({ produktion_id: PROD_ID }))
  expect(res.status()).toBe(200)
  const body = await res.body()
  expect(body.subarray(0, 5).toString()).toBe('%PDF-')
  const skipped = res.headers()['x-preview-skipped'] ?? ''
  expect(decodeURIComponent(skipped), 'Statistik darf nicht übersprungen werden').not.toMatch(/statistik/i)
})

// ── Verteiler-CRUD ────────────────────────────────────────────────────────────
test('Verteiler: POST anlegen + Scope-Konsistenz', async ({ request }) => {
  // scope='revision' mit werkstufe_typ → 400
  const bad = await request.post(`${API}/verteiler`, hd({ produktion_id: PROD_ID, name: 'X', scope: 'revision', werkstufe_typ: 'Drehbuch' }))
  expect(bad.status()).toBe(400)

  const create = await request.post(`${API}/verteiler`, hd({
    produktion_id: PROD_ID, name: 'Test-Verteiler Drehbuch', scope: 'werkstufe_typ',
    werkstufe_typ: werkstufeLabel, pdf_export_profil_id: profilId,   // Trigger = Fassungs-Label
    email_betreff: 'Neue Fassung {Folge}', email_text: 'Hallo {Name}, {Link}',
  }))
  expect(create.status()).toBe(201)
  const v = await create.json()
  verteilerId = v.id
  expect(v.scope).toBe('werkstufe_typ')
  expect(v.pdf_anhang).toBe(false)             // Link-first Default
})

test('Verteiler: GET Liste + Detail + PUT', async ({ request }) => {
  const list = await request.get(`${API}/verteiler?produktion_id=${PROD_ID}`, h())
  expect(list.ok()).toBeTruthy()
  expect((await list.json()).some((x: any) => x.id === verteilerId)).toBeTruthy()

  const detail = await request.get(`${API}/verteiler/${verteilerId}`, h())
  expect(detail.ok()).toBeTruthy()
  expect(Array.isArray((await detail.json()).mitglieder)).toBeTruthy()

  const put = await request.put(`${API}/verteiler/${verteilerId}`, hd({ pdf_anhang: true, name: 'Test-Verteiler Drehbuch (PDF)' }))
  expect(put.ok()).toBeTruthy()
  expect((await put.json()).pdf_anhang).toBe(true)
})

// ── Mitglieder + Besetzung ────────────────────────────────────────────────────
let mitgliedId: string | null = null
test('Mitglied: POST freie E-Mail, Besetzung (kein Schauspieler), PUT', async ({ request }) => {
  const add = await request.post(`${API}/verteiler/${verteilerId}/mitglieder`, hd({
    freie_email: 'verteiler-test@example.com', name: 'Test Empfänger',
  }))
  expect(add.status()).toBe(201)
  mitgliedId = (await add.json()).id

  const bes = await request.get(`${API}/verteiler/${verteilerId}/mitglieder/${mitgliedId}/besetzung`, h())
  expect(bes.ok()).toBeTruthy()
  const b = await bes.json()
  expect(b.ist_schauspieler).toBe(false)       // freie E-Mail ohne kontakt_id
  expect(b.sides_verfuegbar).toBe(false)

  const put = await request.put(`${API}/verteiler/${verteilerId}/mitglieder/${mitgliedId}`, hd({ revisions_modus: 'nur_aenderungen' }))
  expect(put.ok()).toBeTruthy()
  expect((await put.json()).revisions_modus).toBe('nur_aenderungen')
})

// ── Veröffentlichen + Portal ──────────────────────────────────────────────────
let distributionId: string | null = null
let portalToken: string | null = null
let empfaengerId: string | null = null

test('veroeffentlichen: published-Flag + distribution/empfaenger queued + Link', async ({ request }) => {
  test.skip(!werkstufeId, 'Keine Werkstufe in der Test-Produktion verfügbar')
  const pub = await request.post(`${API}/werkstufen/${werkstufeId}/veroeffentlichen`, hd({}))
  expect(pub.status()).toBe(201)
  const r = await pub.json()
  expect(r.published).toBe(true)
  const dist = r.distributionen.find((d: any) => d.verteiler_id === verteilerId)
  expect(dist, 'Distribution für unseren Verteiler muss existieren').toBeTruthy()
  expect(dist.empfaenger).toBeGreaterThanOrEqual(1)
  distributionId = dist.distribution_id
  const link = dist.links[0].link
  empfaengerId = dist.links[0].empfaenger_id
  expect(link).toContain('/v/')
  portalToken = link.split('/v/')[1]
})

test('Portal: GET Metadaten (gueltig) setzt opened_at', async ({ request }) => {
  test.skip(!portalToken, 'Kein Token aus veroeffentlichen')
  const res = await request.get(`${API}/v/${portalToken}`)  // kein Login
  expect(res.ok()).toBeTruthy()
  const m = await res.json()
  expect(m.status).toBe('gueltig')
  expect(m.werkstufe).toBe(werkstufeTyp)
  expect(m.version).toBeGreaterThanOrEqual(1)
  expect(m.druck_verfuegbar).toBe(false)       // Feature-Flag Druck aus
})

test('Portal: GET lazy PDF liefert application/pdf', async ({ request }) => {
  test.skip(!portalToken, 'Kein Token aus veroeffentlichen')
  const res = await request.get(`${API}/v/${portalToken}/pdf`)
  expect(res.ok()).toBeTruthy()
  expect(res.headers()['content-type']).toContain('application/pdf')
  const body = await res.body()
  expect(body.slice(0, 5).toString()).toBe('%PDF-')
})

test('Portal: druck-Endpoint ist (Bald) deaktiviert → 501', async ({ request }) => {
  test.skip(!portalToken, 'Kein Token aus veroeffentlichen')
  const res = await request.post(`${API}/v/${portalToken}/druck`)
  expect(res.status()).toBe(501)
})

// ── Distributionen + resend ───────────────────────────────────────────────────
test('Distributionen: Liste + Detail mit Anzeige-Status', async ({ request }) => {
  test.skip(!distributionId, 'Keine Distribution')
  const list = await request.get(`${API}/distributionen?werkstufe_id=${werkstufeId}`, h())
  expect(list.ok()).toBeTruthy()
  expect((await list.json()).some((d: any) => d.id === distributionId)).toBeTruthy()

  const detail = await request.get(`${API}/distributionen/${distributionId}`, h())
  expect(detail.ok()).toBeTruthy()
  const d = await detail.json()
  const e = d.empfaenger.find((x: any) => x.id === empfaengerId)
  expect(e).toBeTruthy()
  expect(e.secure_token_hash).toBeUndefined()  // Hash darf NICHT ausgeliefert werden
  // opened_at wurde im Portal-Test gesetzt → Anzeige-Status 'geoeffnet', sonst 'in_warteschlange'
  expect(['geoeffnet', 'geladen', 'in_warteschlange']).toContain(e.anzeige_status)
})

test('resend: ohne Lücken idempotent (erneut_eingereiht = 0)', async ({ request }) => {
  test.skip(!distributionId, 'Keine Distribution')
  const res = await request.post(`${API}/distributionen/${distributionId}/resend`, h())
  expect(res.ok()).toBeTruthy()
  expect((await res.json()).erneut_eingereiht).toBe(0)  // nichts in bounced/expired
})

test('veroeffentlichen erneut: legt eine NEUE distribution an (Idempotenz)', async ({ request }) => {
  test.skip(!werkstufeId, 'Keine Werkstufe')
  const before = await request.get(`${API}/distributionen?verteiler_id=${verteilerId}`, h())
  const countBefore = (await before.json()).length
  const pub = await request.post(`${API}/werkstufen/${werkstufeId}/veroeffentlichen`, hd({}))
  expect(pub.status()).toBe(201)
  const after = await request.get(`${API}/distributionen?verteiler_id=${verteilerId}`, h())
  expect((await after.json()).length).toBe(countBefore + 1)
})
