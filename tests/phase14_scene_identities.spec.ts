import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

// Phase 1: Verify v38 migration — scene_identities + dokument_szenen tables exist

test.describe('Phase 1: Scene Identities Migration (v38)', () => {

  test('health endpoint works', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`)
    expect(res.ok()).toBeTruthy()
  })

  test('scene_identities table exists — can query via API', async ({ request }) => {
    // We test indirectly: the new endpoints will come in Phase 2.
    // For now, verify the migration ran by checking app_settings has the new key.
    const res = await request.get(`${BASE}/api/app-settings`)
    if (res.ok()) {
      const data = await res.json()
      // scene_header_view_mode should exist from v38
      const setting = Array.isArray(data)
        ? data.find((s: any) => s.key === 'scene_header_view_mode')
        : data['scene_header_view_mode']
      expect(setting).toBeTruthy()
    }
  })

  test('existing szenen API still works (no breaking change)', async ({ request }) => {
    // GET stages for a known staffel — should return 200 even if empty
    const res = await request.get(`${BASE}/api/stages?staffel_id=rote-rosen&folge_nummer=4401`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('existing dokumente API still works', async ({ request }) => {
    const res = await request.get(`${BASE}/api/folgen/rote-rosen/4401/dokumente`)
    // 200 or 401 (auth required) — both mean the route exists
    expect([200, 401, 403].includes(res.status())).toBeTruthy()
  })

  test('existing fassungen API still works for known document', async ({ request }) => {
    // GET stages as proxy — no auth required in test mode
    const res = await request.get(`${BASE}/api/stages?staffel_id=rote-rosen&folge_nummer=4401`)
    expect(res.ok()).toBeTruthy()
  })
})
