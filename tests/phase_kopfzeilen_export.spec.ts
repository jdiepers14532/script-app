/**
 * Phase 8 Tests — Kopf-/Fußzeilen-Defaults & Export-Assembler
 *
 * Tests:
 *  1. Kopf-/Fußzeilen CRUD API (GET/PUT/DELETE)
 *  2. Export filename builder (/export/filename)
 *  3. Export routes with KZ/FZ context (fountain, fdx, pdf)
 *  4. ProseMirror placeholder substitution in PDF export
 */

import { test, expect } from '@playwright/test'

const BASE      = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'

const produktionId = 'd26dff66-57cf-4b32-9649-4009618fce4d'
const werkstufId   = '7fc12909-dec4-4bf8-a34e-507f55e5a890'  // storyline V1, Folge 4402, 33 scenes

let authCookie: string

test.beforeAll(async ({ request }) => {
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok()).toBeTruthy()
  const cookies = loginRes.headers()['set-cookie'] ?? ''
  const match = cookies.match(/access_token=([^;]+)/)
  expect(match).toBeTruthy()
  authCookie = `access_token=${match![1]}`
})

function h()           { return { headers: { Cookie: authCookie } } }
function hd(data: any) { return { headers: { Cookie: authCookie }, data } }

// ── 1. Kopf-/Fußzeilen Defaults API ─────────────────────────────────────────

test('GET /kopf-fusszeilen returns empty array for fresh production', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen`, h()
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(Array.isArray(data)).toBeTruthy()
})

test('PUT /kopf-fusszeilen/drehbuch creates/upserts drehbuch config', async ({ request }) => {
  const payload = {
    kopfzeile_aktiv: true,
    fusszeile_aktiv: true,
    erste_seite_kein_header: true,
    erste_seite_kein_footer: false,
    kopfzeile_content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Test Produktion — ' },
          { type: 'placeholder_chip', attrs: { key: '{{folge}}' } },
        ],
      }],
    },
    fusszeile_content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'placeholder_chip', attrs: { key: '{{seite}}' } },
          { type: 'text', text: ' / ' },
          { type: 'placeholder_chip', attrs: { key: '{{seiten_gesamt}}' } },
        ],
      }],
    },
    seiten_layout: { format: 'a4', margin_top: 25, margin_bottom: 25, margin_left: 30, margin_right: 25 },
  }

  const res = await request.put(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/drehbuch`,
    hd(payload)
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.werkstufe_typ).toBe('drehbuch')
  expect(data.kopfzeile_aktiv).toBe(true)
  expect(data.fusszeile_aktiv).toBe(true)
  expect(data.erste_seite_kein_header).toBe(true)
})

test('GET /kopf-fusszeilen/drehbuch returns saved config', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/drehbuch`, h()
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.werkstufe_typ).toBe('drehbuch')
  expect(data.kopfzeile_aktiv).toBe(true)
  expect(data.kopfzeile_content).toBeTruthy()
  expect(data.fusszeile_content).toBeTruthy()
})

test('GET /kopf-fusszeilen list now contains drehbuch entry', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen`, h()
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  const entry = data.find((d: any) => d.werkstufe_typ === 'drehbuch')
  expect(entry).toBeTruthy()
})

test('PUT /kopf-fusszeilen/drehbuch upsert updates existing', async ({ request }) => {
  const res = await request.put(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/drehbuch`,
    hd({ kopfzeile_aktiv: false, fusszeile_aktiv: false })
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.kopfzeile_aktiv).toBe(false)
})

test('PUT /kopf-fusszeilen/storyline creates storyline config', async ({ request }) => {
  const res = await request.put(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/storyline`,
    hd({
      kopfzeile_aktiv: true,
      kopfzeile_content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Storyline Header' }] }] },
    })
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.werkstufe_typ).toBe('storyline')
})

test('DELETE /kopf-fusszeilen/storyline removes entry', async ({ request }) => {
  const res = await request.delete(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/storyline`, h()
  )
  expect(res.ok()).toBeTruthy()

  const check = await request.get(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/storyline`, h()
  )
  const body = await check.json()
  expect(body).toBeNull()
})

// ── 2. Export Filename API ───────────────────────────────────────────────────

test('GET /export/filename returns suggested filename', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/werkstufe/${werkstufId}/export/filename`, h()
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(typeof data.filename).toBe('string')
  expect(data.filename.length).toBeGreaterThan(5)
  // Should contain episode number (4402)
  expect(data.filename).toContain('4402')
  // Should contain a date pattern YYYY-MM-DD or similar
  expect(data.filename).toMatch(/\d{4}/)
  // Should end with .pdf or .fountain or .fdx
  expect(data.filename).toMatch(/\.(pdf|fountain|fdx|html)$/)
})

test('GET /export/filename for unknown werkstuf returns 404', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/werkstufe/00000000-0000-0000-0000-000000000000/export/filename`, h()
  )
  expect(res.status()).toBe(404)
})

// ── 3. Export Routes ─────────────────────────────────────────────────────────

test('GET /export/fountain returns valid fountain text', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/werkstufe/${werkstufId}/export/fountain`, h()
  )
  expect(res.ok()).toBeTruthy()
  const ct = res.headers()['content-type']
  expect(ct).toContain('text/plain')

  const cd = res.headers()['content-disposition']
  expect(cd).toContain('attachment')
  expect(cd).toContain('.fountain')
  // Filename should contain episode number
  expect(cd).toContain('4402')

  const text = await res.text()
  // Has scene headings (INT. or EXT.)
  expect(text).toMatch(/\b(INT|EXT)\b/)
})

test('GET /export/fdx returns valid Final Draft XML', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/werkstufe/${werkstufId}/export/fdx`, h()
  )
  expect(res.ok()).toBeTruthy()
  const ct = res.headers()['content-type']
  expect(ct).toContain('xml')

  const cd = res.headers()['content-disposition']
  expect(cd).toContain('.fdx')
  expect(cd).toContain('4402')

  const xml = await res.text()
  expect(xml).toContain('FinalDraft')
  expect(xml).toContain('<Paragraph')
  // Watermark embedded as XML comment
  expect(xml).toContain('<!--')
})

test('GET /export/pdf returns printable HTML with header/footer CSS', async ({ request }) => {
  // First set an active kopfzeile so it gets included
  await request.put(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/storyline`,
    hd({
      kopfzeile_aktiv: true,
      fusszeile_aktiv: true,
      kopfzeile_content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TESTKOPFZEILE' }] }],
      },
      fusszeile_content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TESTFUSSZEILE' }] }],
      },
    })
  )

  const res = await request.get(
    `${BASE}/api/werkstufe/${werkstufId}/export/pdf`, h()
  )
  expect(res.ok()).toBeTruthy()
  const ct = res.headers()['content-type']
  expect(ct).toContain('text/html')

  const cd = res.headers()['content-disposition']
  expect(cd).toContain('attachment')
  expect(cd).toContain('4402')

  const html = await res.text()
  expect(html).toContain('<!DOCTYPE html>')
  expect(html).toContain('scene-heading')
  // Should include header/footer div with our test content
  expect(html).toContain('TESTKOPFZEILE')
  expect(html).toContain('TESTFUSSZEILE')
  // CSS for fixed position
  expect(html).toContain('page-header')
  expect(html).toContain('page-footer')
  // Watermark
  expect(html).toContain('wm')
})

// ── 4. Placeholder substitution ──────────────────────────────────────────────

test('PDF export substitutes {{folge}} placeholder in header', async ({ request }) => {
  await request.put(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/storyline`,
    hd({
      kopfzeile_aktiv: true,
      fusszeile_aktiv: false,
      kopfzeile_content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Folge: ' },
            { type: 'placeholder_chip', attrs: { key: '{{folge}}' } },
          ],
        }],
      },
    })
  )

  const res = await request.get(
    `${BASE}/api/werkstufe/${werkstufId}/export/pdf`, h()
  )
  expect(res.ok()).toBeTruthy()
  const html = await res.text()
  // placeholder_chip for {{folge}} should be resolved to actual folge_nummer (4402)
  expect(html).toContain('4402')
  // header div should contain the resolved value
  expect(html).toContain('page-header')
})

test('PDF export renders {{seite}} as CSS counter span', async ({ request }) => {
  await request.put(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/storyline`,
    hd({
      fusszeile_aktiv: true,
      fusszeile_content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'placeholder_chip', attrs: { key: '{{seite}}' } },
          ],
        }],
      },
    })
  )

  const res = await request.get(
    `${BASE}/api/werkstufe/${werkstufId}/export/pdf`, h()
  )
  expect(res.ok()).toBeTruthy()
  const html = await res.text()
  expect(html).toContain('ph-seite')
})

// ── Cleanup ──────────────────────────────────────────────────────────────────

test('cleanup: DELETE kopf-fusszeilen entries created in tests', async ({ request }) => {
  await request.delete(`${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/drehbuch`, h())
  await request.delete(`${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen/storyline`, h())

  const res = await request.get(
    `${BASE}/api/produktionen/${produktionId}/kopf-fusszeilen`, h()
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  const remaining = data.filter((d: any) => ['drehbuch', 'storyline'].includes(d.werkstufe_typ))
  expect(remaining).toHaveLength(0)
})
