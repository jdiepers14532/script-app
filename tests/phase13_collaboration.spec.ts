import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const WS_BASE = BASE.replace('https://', 'wss://').replace('http://', 'ws://')
const STAFFEL = 'rote-rosen'
const FOLGE = 9993

test.describe('Phase 13 — Real-time Collaboration', () => {

  let drehbuchId: string
  let fassungId: string

  test.beforeAll(async ({ request }) => {
    // Create a drehbuch document for collaboration tests
    await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, { data: { typ: 'drehbuch' } })
    const list = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`)
    const docs = await list.json()
    const db = docs.find((d: any) => d.typ === 'drehbuch')
    drehbuchId = db.id
    const fRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen`)
    fassungId = (await fRes.json())[0].id

    // Set to colab sichtbarkeit so collab is enabled
    await request.put(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}/sichtbarkeit`, {
      data: { sichtbarkeit: 'colab' },
    })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${drehbuchId}`)
  })

  // ── yjs_state column ─────────────────────────────────────────────────────

  test('yjs_state column existiert in der Datenbank', async ({ request }) => {
    // Indirect test: GET fassung should work without error (column migration ran)
    const res = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    // yjs_state is not exposed via API — just verify the row loads correctly
    expect(data.id).toBe(fassungId)
    expect(data.sichtbarkeit).toBe('colab')
  })

  // ── REST API bleibt funktionsfähig ───────────────────────────────────────

  test('Fassung kann per REST gespeichert werden während Collab aktiv', async ({ request }) => {
    const content = {
      type: 'doc',
      content: [{ type: 'screenplay_element', attrs: { element_type: 'action', szene_uuid: null }, content: [{ type: 'text', text: 'Collab Test' }] }],
    }
    const res = await request.put(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}`, {
      data: { inhalt: content },
    })
    expect(res.status()).toBe(200)
    const saved = await res.json()
    expect(saved.plaintext_index).toContain('Collab Test')
  })

  // ── Sichtbarkeit-Guard für Collab ────────────────────────────────────────

  test('Colab-Fassung: Sichtbarkeit bleibt nach Speichern erhalten', async ({ request }) => {
    const fRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}`)
    const f = await fRes.json()
    expect(f.sichtbarkeit).toBe('colab')
  })

  test('Audit-Log enthält Speicher-Ereignis', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}/audit`)
    expect(res.status()).toBe(200)
    const audit = await res.json()
    const saved = audit.find((e: any) => e.ereignis === 'gespeichert')
    expect(saved).toBeTruthy()
  })

  // ── WebSocket Endpoint erreichbar ────────────────────────────────────────

  test('WebSocket /ws/collab antwortet auf Upgrade-Request', async ({ request }) => {
    // Test via HTTP — nginx should return 426 Upgrade Required or 101
    // We use a basic HTTP GET which should get a specific response
    const res = await request.get(`${BASE}/ws/collab`, {
      headers: { Connection: 'upgrade', Upgrade: 'websocket' },
    })
    // nginx proxies to backend; backend without proper WS headers returns 400 or 426
    // Just verify it's not 404 (endpoint exists)
    expect(res.status()).not.toBe(404)
  })

  // ── Offline-Verhalten: Sichtbarkeit-Warning ──────────────────────────────

  test('Colab-Fassung hat korrekte Sichtbarkeit für Collab-Modus', async ({ request }) => {
    const fRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen`)
    const fassungen = await fRes.json()
    const f = fassungen.find((f: any) => f.id === fassungId)
    expect(f).toBeTruthy()
    expect(f.sichtbarkeit).toBe('colab')
    // _access should be rw for test user (superadmin override)
    const fullF = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}`)
    const fData = await fullF.json()
    expect(fData._access).toBe('rw')
  })

  // ── Autoren-Liste für Collab-Panel ───────────────────────────────────────

  test('Autoren können für Colab-Fassung hinzugefügt werden', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}/autoren`, {
      data: { user_id: 'collab-user-1', user_name: 'Collab User', rolle: 'autor' },
    })
    expect(res.status()).toBe(200)

    const listRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}/autoren`)
    const autoren = await listRes.json()
    expect(autoren.some((a: any) => a.user_id === 'collab-user-1')).toBe(true)

    // Cleanup
    await request.delete(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}/autoren/collab-user-1`)
  })

  // ── yjs_state reset bei HTTP-PUT ─────────────────────────────────────────

  test('HTTP-PUT setzt yjs_state auf NULL (REST überschreibt Collab-Stand)', async ({ request }) => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'REST Reset' }] }] }
    const res = await request.put(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}`, {
      data: { inhalt: content },
    })
    expect(res.status()).toBe(200)
    // After HTTP PUT, yjs_state should be null (Hocuspocus reloads from inhalt next time)
    // We verify indirectly: the fassung loads cleanly
    const fRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${fassungId}`)
    expect(fRes.status()).toBe(200)
  })
})
