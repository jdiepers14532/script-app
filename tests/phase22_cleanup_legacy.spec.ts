import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 9: Cleanup — Legacy Deprecation & Status', () => {

  test('legacy-status endpoint returns summary', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokument-szenen/admin/legacy-status`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toHaveProperty('summary')
    expect(data).toHaveProperty('episodes')
    expect(data.summary).toHaveProperty('total')
    expect(data.summary).toHaveProperty('legacy_only')
    expect(data.summary).toHaveProperty('dual')
    expect(data.summary).toHaveProperty('new_only')
    expect(data.summary).toHaveProperty('empty')
    expect(typeof data.summary.total).toBe('number')
  })

  test('legacy-status episodes have required fields', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokument-szenen/admin/legacy-status`)
    const data = await res.json()
    if (data.episodes.length > 0) {
      const ep = data.episodes[0]
      expect(ep).toHaveProperty('staffel_id')
      expect(ep).toHaveProperty('folge_nummer')
      expect(ep).toHaveProperty('data_status')
      expect(['legacy_only', 'dual', 'new_only', 'empty']).toContain(ep.data_status)
    }
  })

  test('folge 8888 has dual status (dual-write active)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokument-szenen/admin/legacy-status`)
    const data = await res.json()
    const ep8888 = data.episodes.find((e: any) => e.folge_nummer === 8888)
    expect(ep8888).toBeTruthy()
    expect(ep8888.data_status).toBe('dual')
    expect(ep8888.legacy_szenen_count).toBeGreaterThan(0)
    expect(ep8888.new_szenen_count).toBeGreaterThan(0)
  })

  test('old stages API returns X-Deprecated header', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages?staffel_id=rote-rosen&folge_nummer=8888`)
    expect(res.ok()).toBeTruthy()
    const deprecated = res.headers()['x-deprecated']
    expect(deprecated).toBeTruthy()
    expect(deprecated).toContain('fassungen')
  })

  test('old szenen API returns X-Deprecated header', async ({ request }) => {
    // First get a stage_id
    const stagesRes = await request.get(`${BASE}/api/stages?staffel_id=rote-rosen&folge_nummer=8888`)
    const stages = await stagesRes.json()
    expect(stages.length).toBeGreaterThan(0)
    const stageId = stages[0].id

    const res = await request.get(`${BASE}/api/stages/${stageId}/szenen`)
    expect(res.ok()).toBeTruthy()
    const deprecated = res.headers()['x-deprecated']
    expect(deprecated).toBeTruthy()
    expect(deprecated).toContain('dokument-szenen')
  })

  test('new dokument-szenen API does NOT have deprecation header', async ({ request }) => {
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    const docs = await dokRes.json()
    const fassungId = docs[0].fassung_id

    const res = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    expect(res.ok()).toBeTruthy()
    const deprecated = res.headers()['x-deprecated']
    expect(deprecated).toBeFalsy()
  })

  test('dual-write consistency: same scene count in old and new system', async ({ request }) => {
    // Old system
    const stagesRes = await request.get(`${BASE}/api/stages?staffel_id=rote-rosen&folge_nummer=8888`)
    const stages = await stagesRes.json()
    const stageId = stages[0].id
    const oldSzenen = await (await request.get(`${BASE}/api/stages/${stageId}/szenen`)).json()

    // New system
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    const docs = await dokRes.json()
    const fassungId = docs[0].fassung_id
    const newSzenen = await (await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)).json()

    // Dual-write should produce same count
    expect(newSzenen.length).toBe(oldSzenen.length)
  })

  test('dual-write consistency: scene headers match', async ({ request }) => {
    // Old system
    const stagesRes = await request.get(`${BASE}/api/stages?staffel_id=rote-rosen&folge_nummer=8888`)
    const stages = await stagesRes.json()
    const stageId = stages[0].id
    const oldSzenen = await (await request.get(`${BASE}/api/stages/${stageId}/szenen`)).json()

    // New system
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    const docs = await dokRes.json()
    const fassungId = docs[0].fassung_id
    const newSzenen = await (await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)).json()

    // Compare scene headers (sorted by scene_nummer)
    const sortByNum = (a: any, b: any) => a.scene_nummer - b.scene_nummer
    const oldSorted = [...oldSzenen].sort(sortByNum)
    const newSorted = [...newSzenen].sort(sortByNum)

    for (let i = 0; i < Math.min(oldSorted.length, newSorted.length); i++) {
      expect(newSorted[i].scene_nummer).toBe(oldSorted[i].scene_nummer)
      expect(newSorted[i].ort_name).toBe(oldSorted[i].ort_name)
      expect(newSorted[i].int_ext).toBe(oldSorted[i].int_ext)
      expect(newSorted[i].tageszeit).toBe(oldSorted[i].tageszeit)
    }
  })
})
