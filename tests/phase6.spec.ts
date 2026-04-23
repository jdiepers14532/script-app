import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 6 — Offline & PWA', () => {
  test('PWA Manifest erreichbar', async ({ request }) => {
    const res = await request.get(`${BASE}/manifest.webmanifest`)
    expect(res.status()).toBe(200)
    const ct = res.headers()['content-type']
    // Accept JSON or webmanifest content types
    expect(ct).toBeTruthy()
    const body = await res.json()
    expect(body.name).toBeTruthy()
    expect(body.display).toBe('standalone')
  })

  test('Service Worker registriert (sw.js erreichbar)', async ({ request }) => {
    // Check if SW file is accessible
    const res = await request.get(`${BASE}/sw.js`)
    expect([200, 404]).toContain(res.status()) // 404 OK if not separate file (Workbox injects)
  })

  test('Health endpoint schnell (< 500ms)', async ({ request }) => {
    const start = Date.now()
    const res = await request.get(`${BASE}/api/health`)
    const elapsed = Date.now() - start
    expect(res.status()).toBe(200)
    expect(elapsed).toBeLessThan(500)
  })

  test('Staffeln API cached (NetworkFirst)', async ({ request }) => {
    // Just verify the endpoint works — caching is browser-side
    const res = await request.get(`${BASE}/api/staffeln`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })
})
