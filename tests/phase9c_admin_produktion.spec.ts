import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL = 'rote-rosen'

test.describe('Phase 9c — Admin: Stage-Labels, Revision-Colors, Char-Kategorien', () => {

  // ── Stage Labels ────────────────────────────────────────────────────────────

  test('stage_labels: Defaults vorhanden + CRUD + Reorder', async ({ request }) => {
    // Defaults
    const list0 = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`)).json()
    expect(Array.isArray(list0)).toBe(true)
    expect(list0.length).toBeGreaterThanOrEqual(1)
    const hasPF = list0.some((l: any) => l.is_produktionsfassung)
    expect(hasPF).toBe(true)

    // Create
    const created = await (await request.post(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`, {
      data: { name: 'TestLabel-Phase9c' },
    })).json()
    expect(created.id).toBeTruthy()
    expect(created.name).toBe('TestLabel-Phase9c')
    expect(created.is_produktionsfassung).toBe(false)

    // Update — toggle is_produktionsfassung
    const updated = await (await request.put(`${BASE}/api/staffeln/${STAFFEL}/stage-labels/${created.id}`, {
      data: { is_produktionsfassung: true },
    })).json()
    expect(updated.is_produktionsfassung).toBe(true)

    // Reorder
    const all = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`)).json()
    const order = [...all].reverse().map((l: any, i: number) => ({ id: l.id, sort_order: i + 1 }))
    const reordered = await (await request.patch(`${BASE}/api/staffeln/${STAFFEL}/stage-labels/reorder`, {
      data: { order },
    })).json()
    expect(Array.isArray(reordered)).toBe(true)

    // Delete
    const del = await request.delete(`${BASE}/api/staffeln/${STAFFEL}/stage-labels/${created.id}`)
    expect(del.status()).toBe(200)
    const afterDel = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`)).json()
    expect(afterDel.some((l: any) => l.id === created.id)).toBe(false)
  })

  test('stage_labels: Doppelter Name → 409', async ({ request }) => {
    const r1 = await (await request.post(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`, {
      data: { name: 'DupLabel-Phase9c' },
    })).json()
    const r2 = await request.post(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`, {
      data: { name: 'DupLabel-Phase9c' },
    })
    expect(r2.status()).toBe(409)
    await request.delete(`${BASE}/api/staffeln/${STAFFEL}/stage-labels/${r1.id}`)
  })

  // ── Revision Colors ─────────────────────────────────────────────────────────

  test('revision_colors: WGA-Defaults + CRUD + Reorder', async ({ request }) => {
    // Defaults
    const list0 = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/revision-colors`)).json()
    expect(list0.length).toBeGreaterThanOrEqual(5)
    expect(list0.some((c: any) => c.name === 'Blaue Seiten')).toBe(true)

    // Create
    const created = await (await request.post(`${BASE}/api/staffeln/${STAFFEL}/revision-colors`, {
      data: { name: 'TestRevColor-Phase9c', color: '#FF0099' },
    })).json()
    expect(created.id).toBeTruthy()
    expect(created.color).toBe('#FF0099')

    // Update color
    const updated = await (await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-colors/${created.id}`, {
      data: { color: '#00FF99' },
    })).json()
    expect(updated.color).toBe('#00FF99')

    // Reorder
    const all = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/revision-colors`)).json()
    const order = [...all].reverse().map((c: any, i: number) => ({ id: c.id, sort_order: i + 1 }))
    const reordered = await (await request.patch(`${BASE}/api/staffeln/${STAFFEL}/revision-colors/reorder`, {
      data: { order },
    })).json()
    expect(Array.isArray(reordered)).toBe(true)

    // Delete
    const del = await request.delete(`${BASE}/api/staffeln/${STAFFEL}/revision-colors/${created.id}`)
    expect(del.status()).toBe(200)
  })

  // ── Revision Einstellungen ──────────────────────────────────────────────────

  test('revision_einstellungen: GET + PUT + invalid', async ({ request }) => {
    const get = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`)).json()
    expect(typeof get.memo_schwellwert_zeichen).toBe('number')

    const put = await (await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`, {
      data: { memo_schwellwert_zeichen: 200 },
    })).json()
    expect(put.memo_schwellwert_zeichen).toBe(200)

    // Reset
    await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`, {
      data: { memo_schwellwert_zeichen: 100 },
    })

    // Invalid → 400
    const bad = await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`, {
      data: { memo_schwellwert_zeichen: -5 },
    })
    expect(bad.status()).toBe(400)
  })

  // ── Character Kategorien ────────────────────────────────────────────────────

  test('character_kategorien: CRUD + Reorder', async ({ request }) => {
    // Create
    const created = await (await request.post(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`, {
      data: { name: 'TestKat-Phase9c', typ: 'komparse' },
    })).json()
    expect(created.id).toBeTruthy()
    expect(created.typ).toBe('komparse')

    // Update
    const updated = await (await request.put(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien/${created.id}`, {
      data: { name: 'TestKat-Phase9c-Upd' },
    })).json()
    expect(updated.name).toBe('TestKat-Phase9c-Upd')

    // Reorder
    const all = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`)).json()
    const order = [...all].reverse().map((k: any, i: number) => ({ id: k.id, sort_order: i + 1 }))
    const reordered = await (await request.patch(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien/reorder`, {
      data: { order },
    })).json()
    expect(Array.isArray(reordered)).toBe(true)

    // Delete
    const del = await request.delete(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien/${created.id}`)
    expect(del.status()).toBe(200)
  })

  test('character_kategorien: ungültiger typ → 400', async ({ request }) => {
    const bad = await request.post(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`, {
      data: { name: 'BadTyp', typ: 'ungueltig' },
    })
    expect(bad.status()).toBe(400)
  })

})
