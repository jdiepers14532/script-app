import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const WEBHOOK_SECRET = process.env.SCRIPT_WEBHOOK_SECRET || '183a79e92d0055740f29d7c39a8705d9633de8b704593728d8f541c58a23f8de'
const MESSENGER_BASE = process.env.MESSENGER_BASE_URL || 'https://messenger.serienwerft.studio'

// ── Test-Fixtures aufbauen ────────────────────────────────────────────────────
async function setupScene(request: any) {
  // stages direkt anlegen (kein Bloecke-Lookup nötig)
  const folgeNummer = Math.floor(Math.random() * 50000) + 200000
  const stage = await (await request.post(`${BASE}/api/stages`, {
    data: { staffel_id: 'rote-rosen', folge_nummer: folgeNummer, stage_type: 'draft' }
  })).json()

  const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: { scene_nummer: 1, ort_name: 'TEST ORT', content: [{ id: 'b1', type: 'action', text: 'Test' }] }
  })).json()

  return { stage, szene }
}

// ── C01: Webhook-Authentifizierung ────────────────────────────────────────────
test.describe('C01 — Webhook Authentifizierung', () => {
  test('C01-1: kein Secret -> 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      data: { annotation_id: 'test-uuid', scene_id: 1, event_type: 'created' }
    })
    expect(res.status()).toBe(401)
  })

  test('C01-2: falsches Secret -> 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': 'wrong-secret' },
      data: { annotation_id: 'test-uuid', scene_id: 1, event_type: 'created' }
    })
    expect(res.status()).toBe(401)
  })

  test('C01-3: korrektes Secret -> 200', async ({ request }) => {
    const { szene } = await setupScene(request)
    const res = await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: `auth-ok-${Date.now()}`, scene_id: szene.id, event_type: 'created' }
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test('C01-4: fehlendes Pflichtfeld (event_type) -> 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: 'test-uuid', scene_id: 1 }
    })
    expect(res.status()).toBe(400)
  })

  test('C01-5: ungueltiger event_type -> 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: 'test-uuid', scene_id: 1, event_type: 'updated' }
    })
    expect(res.status()).toBe(400)
  })
})

// ── C02: Comment-Counts ───────────────────────────────────────────────────────
test.describe('C02 — Szenen-Comment-Counts', () => {
  test('C02-1: GET szenen-comment-counts -> 200 mit Objekt', async ({ request }) => {
    const { stage } = await setupScene(request)
    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    expect(res.status()).toBe(200)
    const counts = await res.json()
    expect(typeof counts).toBe('object')
    expect(counts).not.toBeNull()
  })

  test('C02-2: neue Szene ohne Events -> Count 0', async ({ request }) => {
    const { stage, szene } = await setupScene(request)
    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    const counts = await res.json()
    expect(counts[szene.id] ?? 0).toBe(0)
  })

  test('C02-3: nach Webhook-Event steigt Count auf 1', async ({ request }) => {
    const { stage, szene } = await setupScene(request)
    const annotationId = `count-${Date.now()}`

    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'created' }
    })

    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    expect((await res.json())[szene.id]).toBe(1)
  })

  test('C02-4: mehrere Events akkumulieren', async ({ request }) => {
    const { stage, szene } = await setupScene(request)
    const ts = Date.now()

    for (let i = 0; i < 3; i++) {
      await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
        headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
        data: { annotation_id: `multi-${ts}-${i}`, scene_id: szene.id, event_type: 'created' }
      })
    }

    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    expect((await res.json())[szene.id]).toBeGreaterThanOrEqual(3)
  })

  test('C02-5: ungueltiger stageId -> 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/abc/szenen-comment-counts`)
    expect(res.status()).toBe(400)
  })
})

// ── C03: Mark-as-Read ─────────────────────────────────────────────────────────
test.describe('C03 — Mark-as-Read', () => {
  test('C03-1: POST mark-comments-read -> 200 { ok: true }', async ({ request }) => {
    const { szene } = await setupScene(request)
    const res = await request.post(`${BASE}/api/szenen/${szene.id}/mark-comments-read`)
    expect(res.status()).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test('C03-2: nach mark-read faellt Count auf 0', async ({ request }) => {
    const { stage, szene } = await setupScene(request)

    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: `markread-${Date.now()}`, scene_id: szene.id, event_type: 'created' }
    })

    const before = await (await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)).json()
    expect(before[szene.id]).toBe(1)

    await request.post(`${BASE}/api/szenen/${szene.id}/mark-comments-read`)

    const after = await (await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)).json()
    expect(after[szene.id] ?? 0).toBe(0)
  })

  test('C03-3: nach mark-read + neuem Event steigt Count wieder auf 1', async ({ request }) => {
    const { stage, szene } = await setupScene(request)
    const ts = Date.now()

    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: `reopen-${ts}-1`, scene_id: szene.id, event_type: 'created' }
    })
    await request.post(`${BASE}/api/szenen/${szene.id}/mark-comments-read`)
    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: `reopen-${ts}-2`, scene_id: szene.id, event_type: 'created' }
    })

    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    expect((await res.json())[szene.id]).toBe(1)
  })

  test('C03-4: wiederholtes mark-read ist idempotent', async ({ request }) => {
    const { szene } = await setupScene(request)
    const r1 = await request.post(`${BASE}/api/szenen/${szene.id}/mark-comments-read`)
    const r2 = await request.post(`${BASE}/api/szenen/${szene.id}/mark-comments-read`)
    expect(r1.status()).toBe(200)
    expect(r2.status()).toBe(200)
  })
})

// ── C04: Webhook event_type=deleted ──────────────────────────────────────────
test.describe('C04 — Webhook event_type=deleted', () => {
  test('C04-1: deleted-Event setzt Count zurueck', async ({ request }) => {
    const { stage, szene } = await setupScene(request)
    const annotationId = `del-${Date.now()}`

    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'created' }
    })
    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'deleted' }
    })

    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    expect((await res.json())[szene.id] ?? 0).toBe(0)
  })

  test('C04-2: doppeltes deleted-Event ist idempotent', async ({ request }) => {
    const { szene } = await setupScene(request)
    const annotationId = `del-idem-${Date.now()}`

    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'created' }
    })
    const d1 = await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'deleted' }
    })
    const d2 = await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'deleted' }
    })
    expect(d1.status()).toBe(200)
    expect(d2.status()).toBe(200)
  })

  test('C04-3: doppelter created-Webhook (ON CONFLICT) wird dedupliziert -> Count 1', async ({ request }) => {
    const { stage, szene } = await setupScene(request)
    const annotationId = `dedup-${Date.now()}`

    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'created' }
    })
    await request.post(`${BASE}/api/internal/scene-comment-webhook`, {
      headers: { 'x-script-webhook-secret': WEBHOOK_SECRET },
      data: { annotation_id: annotationId, scene_id: szene.id, event_type: 'created' }
    })

    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    expect((await res.json())[szene.id]).toBe(1)
  })
})

// ── C05: Deep-Link API-Voraussetzungen ────────────────────────────────────────
test.describe('C05 — Deep-Link API-Voraussetzungen', () => {
  test('C05-1: GET /api/szenen/:id gibt stage_id zurueck', async ({ request }) => {
    const { szene } = await setupScene(request)
    const res = await request.get(`${BASE}/api/szenen/${szene.id}`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.stage_id).toBeTruthy()
    expect(typeof data.stage_id).toBe('number')
  })

  test('C05-2: GET /api/stages/:id gibt staffel_id und folge_nummer zurueck', async ({ request }) => {
    const { stage } = await setupScene(request)
    const res = await request.get(`${BASE}/api/stages/${stage.id}`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.staffel_id).toBeTruthy()
    expect(data.folge_nummer).toBeTruthy()
  })

  test('C05-3: scene_id -> stage_id -> staffel_id vollstaendig aufloesbar', async ({ request }) => {
    const { szene } = await setupScene(request)

    const szeneData = await (await request.get(`${BASE}/api/szenen/${szene.id}`)).json()
    expect(szeneData.stage_id).toBeTruthy()

    const stageData = await (await request.get(`${BASE}/api/stages/${szeneData.stage_id}`)).json()
    expect(stageData.staffel_id).toBeTruthy()
    expect(stageData.folge_nummer).toBeTruthy()

    // Deep-link URL konstruierbar
    const deepLink = `${BASE}?staffel=${stageData.staffel_id}&folge=${stageData.folge_nummer}&stage=${szeneData.stage_id}&scene=${szene.id}`
    expect(deepLink).toContain('staffel=')
    expect(deepLink).toContain('scene=')
    expect(deepLink).toContain('stage=')
    expect(deepLink).toContain('folge=')
  })
})

// ── C06: System-Health ────────────────────────────────────────────────────────
test.describe('C06 — System-Health', () => {
  test('C06-1: Script-Backend erreichbar', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`)
    expect(res.status()).toBe(200)
  })

  test('C06-2: Messenger-Backend erreichbar', async ({ request }) => {
    const res = await request.get(`${MESSENGER_BASE}/api/health`)
    expect(res.status()).toBe(200)
  })

  test('C06-3: GET annotations/count fuer anchor_app=script erreichbar', async ({ request }) => {
    const res = await request.get(`${MESSENGER_BASE}/api/annotations/count?app=script&record_id=999999`)
    // 200 (eingeloggt) oder 401 (nicht eingeloggt) — beides valide
    expect([200, 401]).toContain(res.status())
  })

  test('C06-4: szenen-comment-counts Antwortzeit < 400ms', async ({ request }) => {
    const { stage } = await setupScene(request)
    const start = Date.now()
    const res = await request.get(`${BASE}/api/stages/${stage.id}/szenen-comment-counts`)
    expect(res.status()).toBe(200)
    expect(Date.now() - start).toBeLessThan(400)
  })
})
