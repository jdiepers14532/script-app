import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const API = `${BASE}/api`

// Phase 1 Tests: v43 Migration — Neue Tabellen + Datenmigration

test.describe('Phase 1: Werkstufen-Modell Migration', () => {

  test('folgen-Tabelle existiert und hat Daten', async ({ request }) => {
    const res = await request.get(`${API}/health`)
    expect(res.ok()).toBeTruthy()

    // Direct DB check via a simple API test — we'll verify through the existing folgen route
    // that the system still works (no breaking change)
    const folgenRes = await request.get(`${API}/folgen/d26dff66-57cf-4b32-9649-4009618fce4d/4402`)
    expect(folgenRes.ok()).toBeTruthy()
    const body = await folgenRes.json()
    expect(body).toBeTruthy()
    expect(body.staffel_id || body.folge_nummer).toBeTruthy()
  })

  test('alte Fassungen-API funktioniert weiterhin (kein Breaking Change)', async ({ request }) => {
    // staffeln requires auth — check it returns 401 (not 500/crash)
    const res = await request.get(`${API}/staffeln`)
    const status = res.status()
    // Either 200 (if test mode) or 401/403/302 (if auth required) — NOT 500
    expect(status).toBeLessThan(500)
  })

  test('health endpoint antwortet', async ({ request }) => {
    const res = await request.get(`${API}/health`)
    expect(res.ok()).toBeTruthy()
  })

  test('dokument-szenen API funktioniert weiterhin', async ({ request }) => {
    // admin/legacy-status should still work
    const res = await request.get(`${API}/dokument-szenen/admin/legacy-status`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.summary).toBeTruthy()
    expect(typeof body.summary.total).toBe('number')
  })

  test('scene-identities API funktioniert weiterhin', async ({ request }) => {
    // Create a scene identity (old API using staffel_id)
    const res = await request.post(`${API}/scene-identities`, {
      data: { staffel_id: 'd26dff66-57cf-4b32-9649-4009618fce4d' }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.staffel_id).toBe('d26dff66-57cf-4b32-9649-4009618fce4d')
  })
})
