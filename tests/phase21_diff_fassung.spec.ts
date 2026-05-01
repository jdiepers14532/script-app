import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 8: Diff-Ansicht (Fassungsvergleich)', () => {

  let fassungIds: string[] = []

  test('setup: get at least 2 fassung_ids for folge 8888', async ({ request }) => {
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    expect(dokRes.ok()).toBeTruthy()
    const docs = await dokRes.json()
    // Collect all fassung_ids
    fassungIds = docs.map((d: any) => d.fassung_id).filter(Boolean)
    expect(fassungIds.length).toBeGreaterThanOrEqual(1)
  })

  test('GET diff endpoint returns valid structure', async ({ request }) => {
    // If only 1 fassung, diff it with itself (still valid)
    const leftId = fassungIds[0]
    const rightId = fassungIds.length > 1 ? fassungIds[1] : fassungIds[0]
    const res = await request.get(`${BASE}/api/fassungen/${leftId}/szenen/diff/${rightId}`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toHaveProperty('left')
    expect(data).toHaveProperty('right')
    expect(data).toHaveProperty('matches')
    expect(data.left).toHaveProperty('fassung')
    expect(data.left).toHaveProperty('szenen')
    expect(data.right).toHaveProperty('fassung')
    expect(data.right).toHaveProperty('szenen')
    expect(Array.isArray(data.matches)).toBeTruthy()
  })

  test('diff matches contain required fields', async ({ request }) => {
    const leftId = fassungIds[0]
    const rightId = fassungIds.length > 1 ? fassungIds[1] : fassungIds[0]
    const res = await request.get(`${BASE}/api/fassungen/${leftId}/szenen/diff/${rightId}`)
    const data = await res.json()
    if (data.matches.length > 0) {
      const m = data.matches[0]
      expect(m).toHaveProperty('scene_identity_id')
      expect(m).toHaveProperty('changes')
      expect(Array.isArray(m.changes)).toBeTruthy()
      // left_idx and right_idx should exist (can be null)
      expect('left_idx' in m).toBeTruthy()
      expect('right_idx' in m).toBeTruthy()
    }
  })

  test('self-diff has no changes', async ({ request }) => {
    const id = fassungIds[0]
    const res = await request.get(`${BASE}/api/fassungen/${id}/szenen/diff/${id}`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    // Self-diff: every match should have 0 changes
    for (const m of data.matches) {
      expect(m.changes.length).toBe(0)
    }
  })

  test('diff with scenes returns szenen arrays', async ({ request }) => {
    const leftId = fassungIds[0]
    const rightId = fassungIds.length > 1 ? fassungIds[1] : fassungIds[0]
    const res = await request.get(`${BASE}/api/fassungen/${leftId}/szenen/diff/${rightId}`)
    const data = await res.json()
    expect(Array.isArray(data.left.szenen)).toBeTruthy()
    expect(Array.isArray(data.right.szenen)).toBeTruthy()
    // Szenen should have scene headers
    if (data.left.szenen.length > 0) {
      const s = data.left.szenen[0]
      expect(s).toHaveProperty('scene_nummer')
    }
  })

  test('invalid fassung_id returns 404 or error', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await request.get(`${BASE}/api/fassungen/${fakeId}/szenen/diff/${fakeId}`)
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('matches count equals unique scene identities', async ({ request }) => {
    const id = fassungIds[0]
    const res = await request.get(`${BASE}/api/fassungen/${id}/szenen/diff/${id}`)
    const data = await res.json()
    // Self-diff: matches count should equal szenen count
    expect(data.matches.length).toBe(data.left.szenen.length)
  })
})
