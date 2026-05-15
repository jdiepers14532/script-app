import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'
const API = `${BASE}/api`
const PRODUKTION_ID = 'd26dff66-57cf-4b32-9649-4009618fce4d'

let authCookie: string
let testFolgeId: number
let testWerkId: string
let testSzeneId: string
let testSceneIdentityId: string

// ── Auth + Fixtures ────────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  // Login
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok(), 'Login ok').toBeTruthy()
  const match = loginRes.headers()['set-cookie']?.match(/access_token=([^;]+)/)
  expect(match, 'access_token Cookie').toBeTruthy()
  authCookie = `access_token=${match![1]}`

  // Ensure test folge 9998 exists
  const folgeRes = await request.post(`${API}/v2/folgen`, {
    headers: { Cookie: authCookie },
    data: { produktion_id: PRODUKTION_ID, folge_nummer: 9998, folgen_titel: '4-Features-Test' },
  })
  if (folgeRes.ok()) {
    testFolgeId = (await folgeRes.json()).id
  } else {
    const list = await (await request.get(`${API}/v2/folgen?produktion_id=${PRODUKTION_ID}`, {
      headers: { Cookie: authCookie },
    })).json()
    const rows: any[] = Array.isArray(list) ? list : (list.folgen ?? list.rows ?? [])
    const existing = rows.find((f: any) => f.folge_nummer === 9998)
    expect(existing, 'Folge 9998 muss vorhanden sein').toBeTruthy()
    testFolgeId = existing.id
  }

  // Create test werkstufe
  const werkRes = await request.post(`${API}/v2/folgen/${testFolgeId}/werkstufen`, {
    headers: { Cookie: authCookie },
    data: { typ: 'drehbuch', label: '4-Features-Test' },
  })
  expect(werkRes.status(), 'Werkstufe erstellen → 201').toBe(201)
  const werk = await werkRes.json()
  testWerkId = werk.id

  // Create test scene in that werkstufe
  const szeneRes = await request.post(`${API}/werkstufen/${testWerkId}/szenen`, {
    headers: { Cookie: authCookie },
    data: {
      scene_nummer: 1, ort_name: '4Features-Motiv',
      int_ext: 'INT', tageszeit: 'TAG',
      content: [
        { type: 'action', content: 'Ursprünglicher Block.' },
        { type: 'dialogue', content: 'Ursprünglicher Dialog.' },
      ],
    },
  })
  expect(szeneRes.status(), 'Szene erstellen').toBeLessThan(300)
  const szene = await szeneRes.json()
  testSzeneId = szene.id ?? szene.dokument_szene_id ?? szene[0]?.id
  testSceneIdentityId = szene.scene_identity_id ?? szene[0]?.scene_identity_id
})

function h() { return { headers: { Cookie: authCookie } } }
function hd(data: any) { return { headers: { Cookie: authCookie }, data } }

// ─────────────────────────────────────────────────────────────────────────────
// Feature 1: Deep-Link Handler
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Feature 1 — Deep-Link Handler', () => {
  test('GET /dokument-szenen/:id → 200 mit scene_identity_id', async ({ request }) => {
    if (!testSzeneId) test.skip()
    const res = await request.get(`${API}/dokument-szenen/${testSzeneId}`, h())
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(testSzeneId)
    expect(body.scene_identity_id).toBeTruthy()
  })

  test('GET /dokument-szenen/resolve?werkstufe_id=&scene_identity_id= → 200', async ({ request }) => {
    if (!testSzeneId || !testSceneIdentityId) test.skip()
    const res = await request.get(
      `${API}/dokument-szenen/resolve?werkstufe_id=${testWerkId}&scene_identity_id=${testSceneIdentityId}`,
      h()
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.scene_identity_id).toBe(testSceneIdentityId)
  })

  test('GET /dokument-szenen/resolve mit falschem werkstufe_id → 404', async ({ request }) => {
    if (!testSceneIdentityId) test.skip()
    const res = await request.get(
      `${API}/dokument-szenen/resolve?werkstufe_id=00000000-0000-0000-0000-000000000000&scene_identity_id=${testSceneIdentityId}`,
      h()
    )
    expect(res.status()).toBe(404)
  })

  test('GET /dokument-szenen/resolve ohne Parameter → 400', async ({ request }) => {
    const res = await request.get(`${API}/dokument-szenen/resolve`, h())
    expect(res.status()).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Feature 2: Charaktere UI
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Feature 2 — Charaktere UI', () => {
  let characterId: string

  test.beforeAll(async ({ request }) => {
    // Create a test character for the production
    const charRes = await request.post(`${API}/characters`, {
      ...hd({ produktion_id: PRODUKTION_ID, name: '4Features-Charakter', typ: 'rolle' }),
    })
    if (charRes.ok()) {
      characterId = (await charRes.json()).id
    }
  })

  test.afterAll(async ({ request }) => {
    if (characterId) {
      await request.delete(`${API}/characters/${characterId}`, h())
    }
  })

  test('GET /scene-identities/:id/characters → 200 Array', async ({ request }) => {
    if (!testSceneIdentityId) test.skip()
    const res = await request.get(`${API}/scene-identities/${testSceneIdentityId}/characters`, h())
    expect(res.status()).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  test('POST /scene-identities/:id/characters → Charakter zuweisen', async ({ request }) => {
    if (!testSceneIdentityId || !characterId) test.skip()
    const res = await request.post(
      `${API}/scene-identities/${testSceneIdentityId}/characters`,
      hd({ character_id: characterId })
    )
    expect(res.status()).toBeLessThan(300)
  })

  test('Charakter erscheint in Liste nach Zuweisung', async ({ request }) => {
    if (!testSceneIdentityId || !characterId) test.skip()
    const res = await request.get(`${API}/scene-identities/${testSceneIdentityId}/characters`, h())
    expect(res.status()).toBe(200)
    const list = await res.json()
    const found = list.some((c: any) => c.character_id === characterId || c.id === characterId)
    expect(found, 'Zugewiesener Charakter muss in Liste erscheinen').toBe(true)
  })

  test('DELETE /scene-identities/:id/characters/:characterId → Charakter entfernen', async ({ request }) => {
    if (!testSceneIdentityId || !characterId) test.skip()
    const res = await request.delete(
      `${API}/scene-identities/${testSceneIdentityId}/characters/${characterId}`,
      h()
    )
    expect(res.status()).toBeLessThan(300)
  })

  test('Charakter nicht mehr in Liste nach Entfernung', async ({ request }) => {
    if (!testSceneIdentityId || !characterId) test.skip()
    const res = await request.get(`${API}/scene-identities/${testSceneIdentityId}/characters`, h())
    const list = await res.json()
    const found = list.some((c: any) => c.character_id === characterId || c.id === characterId)
    expect(found, 'Entfernter Charakter darf nicht mehr in Liste sein').toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Feature 3: Revision Tracking
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Feature 3 — Revision Tracking', () => {
  let revisionColorId: number

  test.beforeAll(async ({ request }) => {
    // Create a revision color
    const colorRes = await request.post(`${API}/produktionen/${PRODUKTION_ID}/revision-colors`, {
      ...hd({ name: '4Features-Farbe', color: '#AA00FF' }),
    })
    if (colorRes.ok()) {
      revisionColorId = (await colorRes.json()).id
    }
  })

  test.afterAll(async ({ request }) => {
    if (revisionColorId) {
      await request.delete(`${API}/produktionen/${PRODUKTION_ID}/revision-colors/${revisionColorId}`, h())
    }
  })

  test('POST /werkstufen/:id/start-revision → 200', async ({ request }) => {
    if (!revisionColorId) test.skip()
    const res = await request.post(
      `${API}/werkstufen/${testWerkId}/start-revision`,
      hd({ revision_color_id: revisionColorId })
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.revision_color_id).toBe(revisionColorId)
  })

  test('werkstufe hat revision_color_id nach Start', async ({ request }) => {
    const res = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`, h())
    expect(res.status()).toBe(200)
    const list = await res.json()
    const werk = list.find((w: any) => w.id === testWerkId)
    expect(werk?.revision_color_id).toBe(revisionColorId)
  })

  test('PUT /dokument-szenen/:id mit neuem Content → erzeugt Revisionsdelta', async ({ request }) => {
    if (!testSzeneId) test.skip()
    const newContent = [
      { type: 'action', content: 'GEÄNDERTER Block.' },
      { type: 'dialogue', content: 'Ursprünglicher Dialog.' },
    ]
    const putRes = await request.put(`${API}/dokument-szenen/${testSzeneId}`, hd({ content: newContent }))
    expect(putRes.status()).toBeLessThan(300)

    // Give server a moment for async delta recording
    await new Promise(r => setTimeout(r, 300))

    const revRes = await request.get(`${API}/dokument-szenen/${testSzeneId}/revisionen`, h())
    expect(revRes.status()).toBe(200)
    const revs = await revRes.json()
    expect(revs.length, 'Mindestens 1 Revision für geänderten Block').toBeGreaterThanOrEqual(1)
    // Block 0 changed → new_value ≠ old_value
    const changed = revs.find((r: any) => r.block_index === 0)
    expect(changed, 'Block 0 muss als geändert markiert sein').toBeTruthy()
    expect(changed.new_value).not.toBe(changed.old_value)
  })

  test('PUT /dokument-szenen/:id mit Revert → löscht Revisionsdelta', async ({ request }) => {
    if (!testSzeneId) test.skip()
    // Revert block 0 back to original
    const revertContent = [
      { type: 'action', content: 'Ursprünglicher Block.' },
      { type: 'dialogue', content: 'Ursprünglicher Dialog.' },
    ]
    await request.put(`${API}/dokument-szenen/${testSzeneId}`, hd({ content: revertContent }))
    await new Promise(r => setTimeout(r, 300))

    const revRes = await request.get(`${API}/dokument-szenen/${testSzeneId}/revisionen`, h())
    const revs = await revRes.json()
    // Block 0 reverted → no longer in revisionen
    const block0 = revs.find((r: any) => r.block_index === 0)
    expect(block0, 'Revert-Block darf keine Revision mehr haben').toBeFalsy()
  })

  test('DELETE /werkstufen/:id/start-revision → löscht Revisionen + leert revision_color_id', async ({ request }) => {
    // First add a change so there's something to delete
    await request.put(`${API}/dokument-szenen/${testSzeneId}`, hd({
      content: [{ type: 'action', content: 'Neue Änderung.' }],
    }))
    await new Promise(r => setTimeout(r, 300))

    const stopRes = await request.delete(`${API}/werkstufen/${testWerkId}/start-revision`, h())
    expect(stopRes.status()).toBe(200)

    // revision_color_id cleared
    const werkRes = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`, h())
    const list = await werkRes.json()
    const werk = list.find((w: any) => w.id === testWerkId)
    expect(werk?.revision_color_id ?? null).toBeNull()

    // revisionen deleted
    await new Promise(r => setTimeout(r, 300))
    const revRes = await request.get(`${API}/dokument-szenen/${testSzeneId}/revisionen`, h())
    const revs = await revRes.json()
    expect(revs.length, 'Nach Stop keine Revisionen mehr').toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Feature 4: Stage Labels + Revision Colors Admin-UI
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Feature 4 — Stage Labels & Revision Colors Admin', () => {
  let labelId: number
  let colorId: number

  test('GET /produktionen/:id/stage-labels → Array', async ({ request }) => {
    const res = await request.get(`${API}/produktionen/${PRODUKTION_ID}/stage-labels`, h())
    expect(res.status()).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  test('POST /produktionen/:id/stage-labels → erstellt Label', async ({ request }) => {
    const res = await request.post(`${API}/produktionen/${PRODUKTION_ID}/stage-labels`, {
      ...hd({ name: '4Features-Label', is_produktionsfassung: false }),
    })
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('4Features-Label')
    labelId = body.id
  })

  test('Label erscheint in Liste', async ({ request }) => {
    const res = await request.get(`${API}/produktionen/${PRODUKTION_ID}/stage-labels`, h())
    const list = await res.json()
    expect(list.some((l: any) => l.id === labelId)).toBe(true)
  })

  test('DELETE /produktionen/:id/stage-labels/:labelId → löscht Label', async ({ request }) => {
    if (!labelId) test.skip()
    const res = await request.delete(`${API}/produktionen/${PRODUKTION_ID}/stage-labels/${labelId}`, h())
    expect(res.status()).toBeLessThan(300)
  })

  test('GET /produktionen/:id/revision-colors → Array', async ({ request }) => {
    const res = await request.get(`${API}/produktionen/${PRODUKTION_ID}/revision-colors`, h())
    expect(res.status()).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  test('POST /produktionen/:id/revision-colors → erstellt Farbe', async ({ request }) => {
    const res = await request.post(`${API}/produktionen/${PRODUKTION_ID}/revision-colors`, {
      ...hd({ name: '4Features-RevFarbe', color: '#FF0099' }),
    })
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.color).toBe('#FF0099')
    colorId = body.id
  })

  test('Revisionsfarbe erscheint in Liste', async ({ request }) => {
    const res = await request.get(`${API}/produktionen/${PRODUKTION_ID}/revision-colors`, h())
    const list = await res.json()
    expect(list.some((c: any) => c.id === colorId)).toBe(true)
  })

  test('DELETE /produktionen/:id/revision-colors/:colorId → löscht Farbe', async ({ request }) => {
    if (!colorId) test.skip()
    const res = await request.delete(`${API}/produktionen/${PRODUKTION_ID}/revision-colors/${colorId}`, h())
    expect(res.status()).toBeLessThan(300)
  })

  test('Admin-Page liefert 200', async ({ request }) => {
    const res = await request.get(`${BASE}/admin`, h())
    expect(res.status()).toBe(200)
  })
})
