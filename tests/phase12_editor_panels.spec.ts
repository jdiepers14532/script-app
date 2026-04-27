import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL = 'rote-rosen'
const FOLGE = 9992

test.describe('Phase 12 — Side-by-Side Panel System', () => {

  let drehbuchId: string
  let drehbuchFassungId: string
  let storylineId: string
  let storylineFassungId: string

  test.beforeAll(async ({ request }) => {
    // Setup: create two documents
    for (const typ of ['drehbuch', 'storyline']) {
      await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, { data: { typ } })
    }
    const list = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`)
    const docs = await list.json()

    const db = docs.find((d: any) => d.typ === 'drehbuch')
    drehbuchId = db.id
    const dbF = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen`)
    drehbuchFassungId = (await dbF.json())[0].id

    const sl = docs.find((d: any) => d.typ === 'storyline')
    storylineId = sl.id
    const slF = await request.get(`${BASE}/api/dokumente/${storylineId}/fassungen`)
    storylineFassungId = (await slF.json())[0].id
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${drehbuchId}`)
    await request.delete(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${storylineId}`)
  })

  // ── Dokument-Liste für Folge ──────────────────────────────────────────────

  test('Dokumente einer Folge listen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`)
    expect(res.status()).toBe(200)
    const docs = await res.json()
    const typen = docs.map((d: any) => d.typ)
    expect(typen).toContain('drehbuch')
    expect(typen).toContain('storyline')
    // Latest fassung meta included
    const db = docs.find((d: any) => d.typ === 'drehbuch')
    expect(db.fassung_id).toBeTruthy()
    expect(db.sichtbarkeit).toBe('privat')
  })

  // ── Fassung CRUD ──────────────────────────────────────────────────────────

  test('Zweite Fassung erstellen — Inhalt wird kopiert', async ({ request }) => {
    // Save some content in F1
    const content = { type: 'doc', content: [{ type: 'screenplay_element', attrs: { element_type: 'action', szene_uuid: null }, content: [{ type: 'text', text: 'Erster Entwurf' }] }] }
    await request.put(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${drehbuchFassungId}`, { data: { inhalt: content, fassung_label: 'Erster Entwurf' } })

    // Create F2
    const res = await request.post(`${BASE}/api/dokumente/${drehbuchId}/fassungen`, { data: { fassung_label: 'Zweite Fassung' } })
    expect(res.status()).toBe(201)
    const f2 = await res.json()
    expect(f2.fassung_nummer).toBe(2)
    expect(f2.fassung_label).toBe('Zweite Fassung')

    // Verify content was copied
    const loaded = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${f2.id}`)
    const f2data = await loaded.json()
    expect(f2data.inhalt?.content?.[0]?.content?.[0]?.text).toBe('Erster Entwurf')
  })

  test('Fassungs-Liste enthält beide Fassungen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen`)
    const fassungen = await res.json()
    expect(fassungen.length).toBeGreaterThanOrEqual(2)
    // inhalt wird in der Liste nicht returned
    expect(fassungen[0].inhalt).toBeUndefined()
  })

  // ── Abgabe-Flow ───────────────────────────────────────────────────────────

  test('Abgabe-Flow: F1 einfrieren → F3 erstellt', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${drehbuchFassungId}/abgabe`, {
      data: { erstelle_naechste: true },
    })
    expect(res.status()).toBe(200)
    const result = await res.json()
    expect(result.frozen.abgegeben).toBe(true)
    expect(result.naechste.fassung_nummer).toBeGreaterThan(result.frozen.fassung_nummer)
  })

  test('Abgegebene Fassung: Schreiben wird blockiert', async ({ request }) => {
    const res = await request.put(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${drehbuchFassungId}`, {
      data: { fassung_label: 'Test nach Abgabe' },
    })
    expect(res.status()).toBe(409)
  })

  // ── Status-Wechsel ────────────────────────────────────────────────────────

  test('Sichtbarkeit auf "review" setzen', async ({ request }) => {
    const fassungenRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen`)
    const fassungen = await fassungenRes.json()
    const active = fassungen.find((f: any) => !f.abgegeben)

    const res = await request.put(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${active.id}/sichtbarkeit`, {
      data: { sichtbarkeit: 'review' },
    })
    expect(res.status()).toBe(200)
    const updated = await res.json()
    expect(updated.sichtbarkeit).toBe('review')
  })

  test('Sichtbarkeit auf "alle" setzen', async ({ request }) => {
    const fassungenRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen`)
    const fassungen = await fassungenRes.json()
    const active = fassungen.find((f: any) => !f.abgegeben)

    const res = await request.put(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${active.id}/sichtbarkeit`, {
      data: { sichtbarkeit: 'alle' },
    })
    expect(res.status()).toBe(200)
    const updated = await res.json()
    expect(updated.sichtbarkeit).toBe('alle')
    // Audit log should reflect this
    const auditRes = await request.get(`${BASE}/api/dokumente/${drehbuchId}/fassungen/${active.id}/audit`)
    const audit = await auditRes.json()
    const statusChange = audit.find((e: any) => e.ereignis === 'status_geaendert')
    expect(statusChange).toBeTruthy()
    expect(statusChange.details.nach).toBe('alle')
  })

  // ── Autoren-Verwaltung ────────────────────────────────────────────────────

  test('Reviewer hinzufügen und listen', async ({ request }) => {
    const fassungenRes = await request.get(`${BASE}/api/dokumente/${storylineId}/fassungen`)
    const fassungen = await fassungenRes.json()
    const fassungId = fassungen[0].id

    await request.post(`${BASE}/api/dokumente/${storylineId}/fassungen/${fassungId}/autoren`, {
      data: { user_id: 'reviewer-1', user_name: 'Review User', rolle: 'reviewer' },
    })

    const autoren = await request.get(`${BASE}/api/dokumente/${storylineId}/fassungen/${fassungId}/autoren`)
    const list = await autoren.json()
    expect(list.some((a: any) => a.user_id === 'reviewer-1')).toBe(true)
  })

  test('Autor entfernen', async ({ request }) => {
    const fassungenRes = await request.get(`${BASE}/api/dokumente/${storylineId}/fassungen`)
    const fassungen = await fassungenRes.json()
    const fassungId = fassungen[0].id

    const del = await request.delete(`${BASE}/api/dokumente/${storylineId}/fassungen/${fassungId}/autoren/reviewer-1`)
    expect(del.status()).toBe(200)
  })

  // ── Admin: Custom-Typ ─────────────────────────────────────────────────────

  test('Admin: Custom-Typ erstellen und Dokument damit anlegen', async ({ request }) => {
    // Create custom type
    const typ = await request.post(`${BASE}/api/admin/dokument-typen/${STAFFEL}`, {
      data: { name: 'Testformat', editor_modus: 'richtext' },
    })
    // 201 or 409 (already exists)
    expect([201, 409]).toContain(typ.status())

    // Create document of that type
    const dok = await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, {
      data: { typ: 'Testformat' },
    })
    if (dok.status() === 201) {
      const body = await dok.json()
      // Cleanup
      await request.delete(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${body.id}`)
    }
  })

  // ── Colab-Gruppen ─────────────────────────────────────────────────────────

  test('Colab-Gruppe erstellen und Fassung zuweisen', async ({ request }) => {
    const gruppe = await request.post(`${BASE}/api/admin/colab-gruppen/${STAFFEL}`, {
      data: { name: 'Autoren Testgruppe', typ: 'colab' },
    })
    const gruppeBody = await gruppe.json()
    const gruppeId = gruppeBody.id

    // Add member
    await request.post(`${BASE}/api/admin/colab-gruppen/${gruppeId}/mitglieder`, {
      data: { user_id: 'test-user', user_name: 'Test User' },
    })

    // Assign to fassung
    const fassungenRes = await request.get(`${BASE}/api/dokumente/${storylineId}/fassungen`)
    const fassungen = await fassungenRes.json()
    const fassungId = fassungen[0].id

    const res = await request.put(`${BASE}/api/dokumente/${storylineId}/fassungen/${fassungId}/sichtbarkeit`, {
      data: { sichtbarkeit: 'colab', colab_gruppe_id: gruppeId },
    })
    expect(res.status()).toBe(200)
    const updated = await res.json()
    expect(updated.colab_gruppe_id).toBe(gruppeId)

    // Cleanup
    await request.delete(`${BASE}/api/admin/colab-gruppen/${STAFFEL}/${gruppeId}`)
  })

  // ── Storyline Rich Text ───────────────────────────────────────────────────

  test('Storyline: Rich Text speichern', async ({ request }) => {
    const richText = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Akt 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Katrin entdeckt das Geheimnis.' }] },
      ],
    }
    const res = await request.put(`${BASE}/api/dokumente/${storylineId}/fassungen/${storylineFassungId}`, {
      data: { inhalt: richText },
    })
    expect(res.status()).toBe(200)
    const saved = await res.json()
    expect(saved.inhalt.content[0].type).toBe('heading')
    expect(saved.plaintext_index).toContain('Akt 1')
  })
})
