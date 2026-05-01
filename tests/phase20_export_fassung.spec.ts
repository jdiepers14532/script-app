import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 7: Export-System for dokument_szenen', () => {

  let fassungId: string

  test('setup: get fassung_id', async ({ request }) => {
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    const docs = await dokRes.json()
    fassungId = docs[0].fassung_id
    expect(fassungId).toBeTruthy()
  })

  test('GET /api/stages/fassung/:id/export/fountain returns text', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/fassung/${fassungId}/export/fountain`)
    expect(res.ok()).toBeTruthy()
    const text = await res.text()
    expect(text).toContain('PHASE3 TESTORT')
    expect(text).toContain('TAG')
    const ct = res.headers()['content-type']
    expect(ct).toContain('text/plain')
  })

  test('GET /api/stages/fassung/:id/export/fdx returns XML', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/fassung/${fassungId}/export/fdx`)
    expect(res.ok()).toBeTruthy()
    const xml = await res.text()
    expect(xml).toContain('FinalDraft')
    expect(xml).toContain('PHASE3 TESTORT')
    const ct = res.headers()['content-type']
    expect(ct).toContain('xml')
  })

  test('GET /api/stages/fassung/:id/export/pdf returns HTML', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/fassung/${fassungId}/export/pdf`)
    expect(res.ok()).toBeTruthy()
    const html = await res.text()
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('PHASE3 TESTORT')
    expect(html).toContain('scene-heading')
  })

  test('exports contain both scenes', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/fassung/${fassungId}/export/fountain`)
    const text = await res.text()
    expect(text).toContain('PHASE3 TESTORT')
    expect(text).toContain('PHASE3 GARTEN')
  })

  test('exports contain watermark', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/fassung/${fassungId}/export/fdx`)
    const xml = await res.text()
    // FDX watermark is embedded as XML comment
    expect(xml).toContain('<!--')
  })

  test('invalid fassung_id returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/fassung/00000000-0000-0000-0000-000000000000/export/fountain`)
    expect(res.status()).toBe(404)
  })
})
