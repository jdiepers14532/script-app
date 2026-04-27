import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL = 'rote-rosen'

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getFirstSzene(request: any): Promise<number | null> {
  const stages = await request.get(`${BASE}/api/staffeln/${STAFFEL}/stages`)
  if (!stages.ok()) return null
  const stageList = await stages.json()
  if (!stageList.length) return null
  const szenen = await request.get(`${BASE}/api/stages/${stageList[0].id}/szenen`)
  if (!szenen.ok()) return null
  const list = await szenen.json()
  return list.length ? list[0].id : null
}

test.describe('Phase 9 — Charaktere, Vorstopp, Stage-Labels, Revision', () => {

  // ── seiten + spieltag ──────────────────────────────────────────────────────

  test('szene PATCH: seiten und spieltag speichern und lesen', async ({ request }) => {
    const szeneId = await getFirstSzene(request)
    if (!szeneId) test.skip()

    const res = await request.put(`${BASE}/api/szenen/${szeneId}`, {
      data: { seiten: '2 5/8', spieltag: 6 },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.seiten).toBe('2 5/8')
    expect(body.spieltag).toBe(6)

    // Read back
    const get = await request.get(`${BASE}/api/szenen/${szeneId}`)
    const read = await get.json()
    expect(read.seiten).toBe('2 5/8')
    expect(read.spieltag).toBe(6)

    // Clean up
    await request.put(`${BASE}/api/szenen/${szeneId}`, { data: { seiten: null, spieltag: null } })
  })

  // ── Character Kategorien ───────────────────────────────────────────────────

  test('character_kategorien: Defaults für rote-rosen vorhanden', async ({ request }) => {
    const res = await request.get(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`)
    expect(res.status()).toBe(200)
    const list = await res.json()
    expect(Array.isArray(list)).toBe(true)
    const names = list.map((k: any) => k.name)
    expect(names).toContain('Hauptrolle')
    expect(names).toContain('Komparse o.T.')
  })

  test('character_kategorien: CRUD', async ({ request }) => {
    // Create
    const create = await request.post(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`, {
      data: { name: 'Test-Kategorie', typ: 'rolle' },
    })
    expect(create.status()).toBe(201)
    const kat = await create.json()
    expect(kat.name).toBe('Test-Kategorie')
    expect(kat.typ).toBe('rolle')

    // Update
    const upd = await request.put(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien/${kat.id}`, {
      data: { name: 'Test-Kategorie-Renamed' },
    })
    expect(upd.status()).toBe(200)
    const updated = await upd.json()
    expect(updated.name).toBe('Test-Kategorie-Renamed')

    // Duplicate → 409
    const dup = await request.post(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`, {
      data: { name: 'Test-Kategorie-Renamed', typ: 'rolle' },
    })
    expect(dup.status()).toBe(409)

    // Delete
    const del = await request.delete(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien/${kat.id}`)
    expect(del.status()).toBe(200)
  })

  test('character_kategorien: Reorder', async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`)).json()
    if (list.length < 2) test.skip()
    const order = list.map((k: any, i: number) => ({ id: k.id, sort_order: list.length - i }))
    const res = await request.patch(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien/reorder`, {
      data: { order },
    })
    expect(res.status()).toBe(200)
  })

  // ── Characters ─────────────────────────────────────────────────────────────

  test('characters: Erstellen und mit Produktion verknüpfen', async ({ request }) => {
    // Get a kategorie id
    const katList = await (await request.get(`${BASE}/api/staffeln/${STAFFEL}/character-kategorien`)).json()
    const hauptrolleKat = katList.find((k: any) => k.name === 'Hauptrolle')

    // Create global character
    const create = await request.post(`${BASE}/api/characters`, {
      data: {
        name: 'Test-Charakter-Lou',
        staffel_id: STAFFEL,
        rollen_nummer: 9001,
        kategorie_id: hauptrolleKat?.id ?? null,
      },
    })
    expect(create.status()).toBe(201)
    const char = await create.json()
    expect(char.name).toBe('Test-Charakter-Lou')
    expect(char.id).toBeTruthy()
    const charId = char.id

    // List for staffel
    const list = await request.get(`${BASE}/api/characters?staffel_id=${STAFFEL}`)
    expect(list.status()).toBe(200)
    const chars = await list.json()
    const found = chars.find((c: any) => c.id === charId)
    expect(found).toBeTruthy()
    expect(found.rollen_nummer).toBe(9001)

    // Duplicate nummer → 409
    const dup = await request.post(`${BASE}/api/characters`, {
      data: { name: 'Anderer Char', staffel_id: STAFFEL, rollen_nummer: 9001 },
    })
    expect(dup.status()).toBe(409)

    // Update name
    const upd = await request.put(`${BASE}/api/characters/${charId}`, {
      data: { name: 'Test-Charakter-Lou-Updated' },
    })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).name).toBe('Test-Charakter-Lou-Updated')

    // Delete
    const del = await request.delete(`${BASE}/api/characters/${charId}`)
    expect(del.status()).toBe(200)
  })

  // ── Scene Characters ───────────────────────────────────────────────────────

  test('scene_characters: Charakter zu Szene zuordnen', async ({ request }) => {
    const szeneId = await getFirstSzene(request)
    if (!szeneId) test.skip()

    // Create temp character
    const char = await (await request.post(`${BASE}/api/characters`, {
      data: { name: 'Szenen-Test-Char', staffel_id: STAFFEL },
    })).json()

    // Add to scene
    const add = await request.post(`${BASE}/api/szenen/${szeneId}/characters`, {
      data: { character_id: char.id, anzahl: 3, ist_gruppe: true },
    })
    expect(add.status()).toBe(201)
    const sc = await add.json()
    expect(sc.anzahl).toBe(3)
    expect(sc.ist_gruppe).toBe(true)

    // List scene characters
    const list = await request.get(`${BASE}/api/szenen/${szeneId}/characters`)
    expect(list.status()).toBe(200)
    const chars = await list.json()
    const found = chars.find((c: any) => c.character_id === char.id)
    expect(found).toBeTruthy()

    // Update (anzahl)
    const upd = await request.put(`${BASE}/api/szenen/${szeneId}/characters/${char.id}`, {
      data: { anzahl: 5 },
    })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).anzahl).toBe(5)

    // Remove from scene
    const del = await request.delete(`${BASE}/api/szenen/${szeneId}/characters/${char.id}`)
    expect(del.status()).toBe(200)

    // Cleanup character
    await request.delete(`${BASE}/api/characters/${char.id}`)
  })

  // ── Vorstopp ───────────────────────────────────────────────────────────────

  test('vorstopp_einstellungen: Defaults und Speichern', async ({ request }) => {
    // GET returns defaults even if not configured
    const get = await request.get(`${BASE}/api/staffeln/${STAFFEL}/vorstopp-einstellungen`)
    expect(get.status()).toBe(200)
    const def = await get.json()
    expect(def.methode).toBeDefined()
    expect(typeof def.menge).toBe('number')
    expect(typeof def.dauer_sekunden).toBe('number')

    // PUT
    const put = await request.put(`${BASE}/api/staffeln/${STAFFEL}/vorstopp-einstellungen`, {
      data: { methode: 'seiten', menge: 0.125, dauer_sekunden: 60 },
    })
    expect(put.status()).toBe(200)
    const saved = await put.json()
    expect(saved.methode).toBe('seiten')
    expect(Number(saved.menge)).toBe(0.125)
    expect(saved.dauer_sekunden).toBe(60)
  })

  test('szenen_vorstopp: Einträge pro Stage', async ({ request }) => {
    const szeneId = await getFirstSzene(request)
    if (!szeneId) test.skip()

    // POST drehbuch stage
    const post1 = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp`, {
      data: { stage: 'drehbuch', dauer_sekunden: 90, methode: 'manuell', user_name: 'Testautor' },
    })
    expect(post1.status()).toBe(201)

    // POST second drehbuch entry (multiple allowed)
    const post2 = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp`, {
      data: { stage: 'drehbuch', dauer_sekunden: 75, methode: 'manuell', user_name: 'Testautor2' },
    })
    expect(post2.status()).toBe(201)

    // POST vorbereitung
    const post3 = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp`, {
      data: { stage: 'vorbereitung', dauer_sekunden: 85, methode: 'manuell', user_name: 'Regie' },
    })
    expect(post3.status()).toBe(201)

    // GET — all + latest_per_stage
    const get = await request.get(`${BASE}/api/szenen/${szeneId}/vorstopp`)
    expect(get.status()).toBe(200)
    const body = await get.json()
    expect(Array.isArray(body.all)).toBe(true)
    expect(body.all.length).toBeGreaterThanOrEqual(3)
    expect(body.latest_per_stage.drehbuch).toBeTruthy()
    expect(body.latest_per_stage.vorbereitung).toBeTruthy()
    // Latest drehbuch = most recently inserted = 75s (post2)
    expect(body.latest_per_stage.drehbuch.dauer_sekunden).toBe(75)

    // Invalid stage → 400
    const bad = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp`, {
      data: { stage: 'ungueltig', dauer_sekunden: 60 },
    })
    expect(bad.status()).toBe(400)

    // DELETE one entry
    const entry = body.all[0]
    const del = await request.delete(`${BASE}/api/szenen/${szeneId}/vorstopp/${entry.id}`)
    expect(del.status()).toBe(200)
  })

  test('vorstopp auto-berechnung: seiten-Methode', async ({ request }) => {
    const szeneId = await getFirstSzene(request)
    if (!szeneId) test.skip()

    // Set seiten on scene
    await request.put(`${BASE}/api/szenen/${szeneId}`, { data: { seiten: '2 0/8' } })

    // Set ratio: 1/8 Seite = 60s → 2 Seiten = 960s
    await request.put(`${BASE}/api/staffeln/${STAFFEL}/vorstopp-einstellungen`, {
      data: { methode: 'seiten', menge: 0.125, dauer_sekunden: 60 },
    })

    const res = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp/auto`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.dauer_sekunden).toBe(960) // 2 Seiten × (60s / 0.125) = 960s
    expect(body.methode).toBe('auto_seiten')

    // Cleanup
    await request.put(`${BASE}/api/szenen/${szeneId}`, { data: { seiten: null } })
  })

  // ── Stage Labels ───────────────────────────────────────────────────────────

  test('stage_labels: Defaults vorhanden', async ({ request }) => {
    const res = await request.get(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`)
    expect(res.status()).toBe(200)
    const list = await res.json()
    expect(Array.isArray(list)).toBe(true)
    const names = list.map((l: any) => l.name)
    expect(names).toContain('Endfassung')
    const endfassung = list.find((l: any) => l.name === 'Endfassung')
    expect(endfassung.is_produktionsfassung).toBe(true)
  })

  test('stage_labels: CRUD + Reorder', async ({ request }) => {
    // Create
    const create = await request.post(`${BASE}/api/staffeln/${STAFFEL}/stage-labels`, {
      data: { name: 'Test-Label', is_produktionsfassung: false },
    })
    expect(create.status()).toBe(201)
    const label = await create.json()
    expect(label.name).toBe('Test-Label')

    // Update → Produktionsfassung
    const upd = await request.put(`${BASE}/api/staffeln/${STAFFEL}/stage-labels/${label.id}`, {
      data: { is_produktionsfassung: true },
    })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).is_produktionsfassung).toBe(true)

    // Reorder (single item — just test API works)
    const reorder = await request.patch(`${BASE}/api/staffeln/${STAFFEL}/stage-labels/reorder`, {
      data: { order: [{ id: label.id, sort_order: 99 }] },
    })
    expect(reorder.status()).toBe(200)

    // Delete
    const del = await request.delete(`${BASE}/api/staffeln/${STAFFEL}/stage-labels/${label.id}`)
    expect(del.status()).toBe(200)
  })

  // ── Revision Colors ────────────────────────────────────────────────────────

  test('revision_colors: WGA-Defaults vorhanden', async ({ request }) => {
    const res = await request.get(`${BASE}/api/staffeln/${STAFFEL}/revision-colors`)
    expect(res.status()).toBe(200)
    const list = await res.json()
    expect(Array.isArray(list)).toBe(true)
    const names = list.map((r: any) => r.name)
    expect(names).toContain('Blaue Seiten')
    expect(names).toContain('Pinke Seiten')
    // Verify colors are hex values
    for (const r of list) {
      expect(r.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  test('revision_colors: CRUD', async ({ request }) => {
    const create = await request.post(`${BASE}/api/staffeln/${STAFFEL}/revision-colors`, {
      data: { name: 'Test-Revision-Farbe', color: '#123456' },
    })
    expect(create.status()).toBe(201)
    const rc = await create.json()
    expect(rc.color).toBe('#123456')

    const upd = await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-colors/${rc.id}`, {
      data: { color: '#654321' },
    })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).color).toBe('#654321')

    const del = await request.delete(`${BASE}/api/staffeln/${STAFFEL}/revision-colors/${rc.id}`)
    expect(del.status()).toBe(200)
  })

  // ── Revision Einstellungen ─────────────────────────────────────────────────

  test('revision_einstellungen: GET + PUT', async ({ request }) => {
    const get = await request.get(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`)
    expect(get.status()).toBe(200)
    const def = await get.json()
    expect(typeof def.memo_schwellwert_zeichen).toBe('number')

    const put = await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`, {
      data: { memo_schwellwert_zeichen: 150 },
    })
    expect(put.status()).toBe(200)
    expect((await put.json()).memo_schwellwert_zeichen).toBe(150)

    // Invalid → 400
    const bad = await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`, {
      data: { memo_schwellwert_zeichen: -1 },
    })
    expect(bad.status()).toBe(400)

    // Reset to default
    await request.put(`${BASE}/api/staffeln/${STAFFEL}/revision-einstellungen`, {
      data: { memo_schwellwert_zeichen: 100 },
    })
  })

  // ── Szenen Revisionen ──────────────────────────────────────────────────────

  test('szenen_revisionen: Delta aufzeichnen und lesen', async ({ request }) => {
    const szeneId = await getFirstSzene(request)
    if (!szeneId) test.skip()

    // Get a stage id for this scene
    const szene = await (await request.get(`${BASE}/api/szenen/${szeneId}`)).json()
    const stageId = szene.stage_id

    // Record a header revision
    const post = await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId,
        field_type: 'header',
        field_name: 'ort_name',
        old_value: 'Gartenhaus / Küche',
        new_value: 'Gartenhaus / Wohnzimmer',
      },
    })
    expect(post.status()).toBe(201)
    const rev = await post.json()
    expect(rev.field_name).toBe('ort_name')

    // Record a content block revision
    const post2 = await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId,
        field_type: 'content_block',
        block_index: 0,
        block_type: 'dialog',
        speaker: 'LOU',
        old_value: 'Das stimmt nicht.',
        new_value: 'Das kann nicht sein.',
      },
    })
    expect(post2.status()).toBe(201)

    // GET all revisionen for szene
    const get = await request.get(`${BASE}/api/szenen/${szeneId}/revisionen`)
    expect(get.status()).toBe(200)
    const list = await get.json()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThanOrEqual(2)

    // GET filtered by stage
    const filtered = await request.get(`${BASE}/api/szenen/${szeneId}/revisionen?stage_id=${stageId}`)
    expect(filtered.status()).toBe(200)
  })

})
