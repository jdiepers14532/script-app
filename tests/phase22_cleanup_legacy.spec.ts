import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const API = `${BASE}/api`

test.describe('Phase 7: Cleanup — folgen_meta dropped, legacy references removed', () => {

  test('folgen_meta table is gone (query should fail)', async ({ request }) => {
    // The folgen API used to auto-create folgen_meta rows — now it uses folgen table
    // We verify indirectly: PUT to folgen endpoint works (uses folgen table, not folgen_meta)
    const res = await request.put(`${API}/folgen/rote-rosen/9997`, {
      data: { arbeitstitel: 'Cleanup Test', synopsis: 'Phase 7 test' }
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.arbeitstitel).toBe('Cleanup Test')
    expect(data.synopsis).toBe('Phase 7 test')
  })

  test('GET /api/folgen/:staffelId/:folgeNummer returns data from folgen table', async ({ request }) => {
    const res = await request.get(`${API}/folgen/rote-rosen/9997`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.arbeitstitel).toBe('Cleanup Test')
    expect(data.synopsis).toBe('Phase 7 test')
    expect(data.staffel_id).toBe('rote-rosen')
    expect(data.folge_nummer).toBe(9997)
  })

  test('synopsis endpoint returns data from folgen table', async ({ request }) => {
    const res = await request.get(`${API}/folgen/rote-rosen/9997/synopsis`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.arbeitstitel).toBe('Cleanup Test')
    expect(data.synopsis).toBe('Phase 7 test')
  })

  test('legacy-status endpoint is gone (404)', async ({ request }) => {
    const res = await request.get(`${API}/dokument-szenen/admin/legacy-status`)
    expect(res.status()).toBe(404)
  })

  test('v_legacy_data_status view is gone (v2 folgen list still works)', async ({ request }) => {
    const res = await request.get(`${API}/v2/folgen?staffel_id=rote-rosen`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('stages API still works (kept for frontend compat)', async ({ request }) => {
    const res = await request.get(`${API}/stages?staffel_id=rote-rosen&folge_nummer=8888`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('folgen dokumente endpoint works without folgen_meta', async ({ request }) => {
    const res = await request.get(`${API}/folgen/rote-rosen/8888/dokumente`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('cleanup: reset test folge 9997 metadata', async ({ request }) => {
    // Clear test data by setting fields to null
    const res = await request.put(`${API}/folgen/rote-rosen/9997`, {
      data: { arbeitstitel: null, synopsis: null }
    })
    expect(res.ok()).toBeTruthy()
  })
})
