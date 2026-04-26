import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
// Use a known staffel UUID from the DB
const STAFFEL_ID = 'd26dff66-57cf-4b32-9649-4009618fce4d'
const STAFFEL = 'rote-rosen'

// Create a temporary stage + szene for tests that need them
async function createTestCtx(request: any) {
  const folge = 90000 + Math.floor(Math.random() * 9999)
  const stage = await (await request.post(`${BASE}/api/stages`, {
    data: { staffel_id: STAFFEL_ID, folge_nummer: folge, stage_type: 'draft' },
  })).json()
  if (!stage.id) return null
  const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: { scene_nummer: 1, ort_name: 'Test-Motiv', content: [] },
  })).json()
  if (!szene.id) return null
  return { stageId: stage.id, szeneId: szene.id, staffelId: STAFFEL_ID }
}

async function cleanupCtx(request: any, _stageId: number, szeneId: number) {
  await request.delete(`${BASE}/api/szenen/${szeneId}`)
  // No DELETE /api/stages endpoint — stage stays as empty shell
}

test.describe('Phase 9b — Character Panel + Seiten/Spieltag UI', () => {

  // ── Frontend smoke ─────────────────────────────────────────────────────────

  test('Frontend: App liefert 200', async ({ request }) => {
    const res = await request.get(`${BASE}/`)
    expect(res.status()).toBe(200)
    const html = await res.text()
    expect(html).toContain('<div id="root">')
  })

  // ── Seiten + Spieltag API flow ─────────────────────────────────────────────

  test('seiten/spieltag: roundtrip über API', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    const put = await request.put(`${BASE}/api/szenen/${szeneId}`, {
      data: { seiten: '1 3/8', spieltag: 7 },
    })
    expect(put.status()).toBe(200)
    const row = await put.json()
    expect(row.seiten).toBe('1 3/8')
    expect(row.spieltag).toBe(7)

    // Read back
    const get = await request.get(`${BASE}/api/szenen/${szeneId}`)
    expect(get.status()).toBe(200)
    const back = await get.json()
    expect(back.seiten).toBe('1 3/8')
    expect(back.spieltag).toBe(7)

    await cleanupCtx(request, stageId, szeneId)
  })

  // ── Character API flow (mirrors what client.ts calls) ─────────────────────

  test('characters: GET ?staffel_id liefert Array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/characters?staffel_id=${STAFFEL}`)
    expect(res.status()).toBe(200)
    const list = await res.json()
    expect(Array.isArray(list)).toBe(true)
  })

  test('character_kategorien: GET liefert Defaults', async ({ request }) => {
    const res = await request.get(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`)
    expect(res.status()).toBe(200)
    const list = await res.json()
    const names = list.map((k: any) => k.name)
    expect(names).toContain('Hauptrolle')
    expect(names).toContain('Komparse o.T.')
  })

  test('scene_characters: add + read + remove', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId, staffelId } = ctx!

    // Create character
    const char = await (await request.post(`${BASE}/api/characters`, {
      data: { name: 'Phase9b-Test', staffel_id: staffelId },
    })).json()
    expect(char.id).toBeTruthy()

    // Add to scene
    const add = await request.post(`${BASE}/api/szenen/${szeneId}/characters`, {
      data: { character_id: char.id },
    })
    expect(add.status()).toBe(201)

    // Read scene characters
    const get = await request.get(`${BASE}/api/szenen/${szeneId}/characters`)
    expect(get.status()).toBe(200)
    const list = await get.json()
    expect(list.some((c: any) => c.character_id === char.id)).toBe(true)

    // Remove from scene
    const del = await request.delete(`${BASE}/api/szenen/${szeneId}/characters/${char.id}`)
    expect(del.status()).toBe(200)

    await request.delete(`${BASE}/api/characters/${char.id}`)
    await cleanupCtx(request, stageId, szeneId)
  })

  test('characters: Nummern-Konflikt → 409', async ({ request }) => {
    // Zwei Charaktere mit gleicher rollen_nummer → 409
    const c1 = await (await request.post(`${BASE}/api/characters`, {
      data: { name: 'Konflikt-A', staffel_id: STAFFEL_ID, rollen_nummer: 9901 },
    })).json()
    const r2 = await request.post(`${BASE}/api/characters`, {
      data: { name: 'Konflikt-B', staffel_id: STAFFEL_ID, rollen_nummer: 9901 },
    })
    expect(r2.status()).toBe(409)
    await request.delete(`${BASE}/api/characters/${c1.id}`)
  })

  test('characters: update name', async ({ request }) => {
    const char = await (await request.post(`${BASE}/api/characters`, {
      data: { name: 'UpdateMe', staffel_id: STAFFEL_ID },
    })).json()

    const upd = await request.put(`${BASE}/api/characters/${char.id}`, {
      data: { name: 'Updated Name' },
    })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).name).toBe('Updated Name')

    await request.delete(`${BASE}/api/characters/${char.id}`)
  })

})
