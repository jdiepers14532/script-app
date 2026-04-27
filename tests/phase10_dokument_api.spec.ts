import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL = 'rote-rosen'
const FOLGE = 9990  // test folge nummer (will be auto-created)

// All requests run in PLAYWRIGHT_TEST_MODE=true → superadmin bypass
test.describe('Phase 10 — Dokumenten-Editor API', () => {

  let dokumentId: string
  let fassungId: string
  let annotationId: string

  // ── Dokument erstellen ────────────────────────────────────────────────────

  test('Dokument erstellen', async ({ request }) => {
    // Ensure clean state
    const listBefore = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`)
    expect(listBefore.status()).toBe(200)

    const res = await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, {
      data: { typ: 'drehbuch' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.typ).toBe('drehbuch')
    expect(body.fassung).toBeTruthy()
    expect(body.fassung.fassung_nummer).toBeGreaterThanOrEqual(1)
    dokumentId = body.id
    fassungId = body.fassung.id
  })

  test('Dokument abrufen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${dokumentId}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(dokumentId)
    expect(body.typ).toBe('drehbuch')
  })

  test('Duplikat erstellen → 409', async ({ request }) => {
    const res = await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, {
      data: { typ: 'drehbuch' },
    })
    expect(res.status()).toBe(409)
  })

  test('Zweites Dokument anderen Typs erstellen', async ({ request }) => {
    const res = await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, {
      data: { typ: 'notiz' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.typ).toBe('notiz')
  })

  test('Alle Dokumente der Folge listen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(2)
    const typen = body.map((d: any) => d.typ)
    expect(typen).toContain('drehbuch')
    expect(typen).toContain('notiz')
  })

  // ── Fassungen CRUD ────────────────────────────────────────────────────────

  test('Fassung abrufen (inkl. inhalt)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(fassungId)
    expect(body.sichtbarkeit).toBe('privat')
    expect(body._access).toBe('rw')  // superadmin
  })

  test('Fassung inhalt speichern', async ({ request }) => {
    const proseMirrorDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'INT. BÜRO - TAG' }] }],
    }
    const res = await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`, {
      data: { inhalt: proseMirrorDoc, fassung_label: 'Erster Entwurf' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.fassung_label).toBe('Erster Entwurf')
    expect(body.zuletzt_geaendert_von).toBe('test-user')
  })

  test('Fassungen listen (meta)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
    // inhalt soll nicht in der Liste sein
    expect(body[0].inhalt).toBeUndefined()
  })

  test('Neue Fassung erstellen', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokumente/${dokumentId}/fassungen`, {
      data: { fassung_label: 'Zweite Fassung' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.fassung_nummer).toBeGreaterThan(1)
    expect(body.fassung_label).toBe('Zweite Fassung')
  })

  // ── Abgabe ────────────────────────────────────────────────────────────────

  test('Abgabe — Fassung einfrieren + nächste erstellen', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}/abgabe`, {
      data: { erstelle_naechste: true },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.frozen.abgegeben).toBe(true)
    expect(body.frozen.abgegeben_von).toBe('test-user')
    expect(body.naechste).toBeTruthy()
    expect(body.naechste.fassung_nummer).toBeGreaterThan(body.frozen.fassung_nummer)
  })

  test('Abgegebene Fassung kann nicht bearbeitet werden', async ({ request }) => {
    const res = await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`, {
      data: { fassung_label: 'Versuch nach Abgabe' },
    })
    expect(res.status()).toBe(409)
  })

  test('Abgabe nochmals → 409', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}/abgabe`, {
      data: {},
    })
    expect(res.status()).toBe(409)
  })

  // ── Sichtbarkeit ──────────────────────────────────────────────────────────

  test('Sichtbarkeit ändern', async ({ request }) => {
    // Get latest non-abgegebene fassung
    const list = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    const fassungen = await list.json()
    const latest = fassungen.find((f: any) => !f.abgegeben)
    const latestId = latest.id

    const res = await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${latestId}/sichtbarkeit`, {
      data: { sichtbarkeit: 'alle' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.sichtbarkeit).toBe('alle')
  })

  test('Ungültige Sichtbarkeit → 400', async ({ request }) => {
    const list = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    const fassungen = await list.json()
    const latest = fassungen[0]

    const res = await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${latest.id}/sichtbarkeit`, {
      data: { sichtbarkeit: 'ungueltig' },
    })
    expect(res.status()).toBe(400)
  })

  // ── Autoren ───────────────────────────────────────────────────────────────

  test('Autor hinzufügen', async ({ request }) => {
    const list = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    const fassungen = await list.json()
    const latest = fassungen.find((f: any) => !f.abgegeben)

    const res = await request.post(`${BASE}/api/dokumente/${dokumentId}/fassungen/${latest.id}/autoren`, {
      data: { user_id: 'user-2', user_name: 'Jane Doe', rolle: 'reviewer' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.user_id).toBe('user-2')
    expect(body.rolle).toBe('reviewer')
  })

  test('Autoren listen', async ({ request }) => {
    const list = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    const fassungen = await list.json()
    const latest = fassungen.find((f: any) => !f.abgegeben)

    const res = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${latest.id}/autoren`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  // ── Annotationen ──────────────────────────────────────────────────────────

  test('Annotation erstellen', async ({ request }) => {
    const list = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    const fassungen = await list.json()
    const latest = fassungen.find((f: any) => !f.abgegeben)

    const res = await request.post(`${BASE}/api/dokumente/${dokumentId}/fassungen/${latest.id}/annotationen`, {
      data: { von_pos: 10, bis_pos: 25, text: 'Bitte überarbeiten', typ: 'kommentar' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.typ).toBe('kommentar')
    annotationId = body.id
  })

  test('Annotationen abrufen', async ({ request }) => {
    const list = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    const fassungen = await list.json()
    const latest = fassungen.find((f: any) => !f.abgegeben)

    const res = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${latest.id}/annotationen`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.some((a: any) => a.id === annotationId)).toBe(true)
  })

  test('Annotation archivieren', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokumente/${dokumentId}/annotationen/${annotationId}/archivieren`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.archiviert_am).toBeTruthy()
  })

  // ── Audit-Log ─────────────────────────────────────────────────────────────

  test('Audit-Log — Ereignisse werden erfasst', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}/audit`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    const ereignisse = body.map((e: any) => e.ereignis)
    expect(ereignisse).toContain('erstellt')
    expect(ereignisse).toContain('abgegeben')
    expect(ereignisse).toContain('gespeichert')
  })

  // ── Admin ─────────────────────────────────────────────────────────────────

  test('Admin — Override-Rollen abrufen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/dokument-override-rollen`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.rollen)).toBe(true)
    expect(body.rollen).toContain('superadmin')
  })

  test('Admin — Fassungs-Nummerierung abrufen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/fassungs-nummerierung`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(['global', 'per_typ']).toContain(body.modus)
  })

  test('Admin — Format-Templates abrufen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/format-templates`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    const standard = body.find((t: any) => t.ist_standard)
    expect(standard).toBeTruthy()
    expect(standard.name).toBe('Final Draft Standard')
    expect(standard.elemente.length).toBe(7)
  })

  test('Admin — Colab-Gruppe erstellen', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/colab-gruppen/${STAFFEL}`, {
      data: { name: 'Test Autorengruppe', typ: 'colab' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Test Autorengruppe')
  })

  test('Admin — Dokument-Typ erstellen', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/dokument-typen/${STAFFEL}`, {
      data: { name: 'Kurzexpose', editor_modus: 'richtext' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Kurzexpose')
    expect(body.editor_modus).toBe('richtext')
  })

  // ── Autocomplete ──────────────────────────────────────────────────────────

  test('Autocomplete — Charaktersuche', async ({ request }) => {
    const res = await request.get(`${BASE}/api/autocomplete/characters?staffel_id=${STAFFEL}&q=`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.own)).toBe(true)
    expect(Array.isArray(body.cross)).toBe(true)
  })

  test('Autocomplete — Locations-Suche', async ({ request }) => {
    const res = await request.get(`${BASE}/api/autocomplete/locations?staffel_id=${STAFFEL}&q=`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.own)).toBe(true)
    expect(Array.isArray(body.cross)).toBe(true)
  })

  test('Autocomplete — fehlende staffel_id → 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/autocomplete/characters?q=test`)
    expect(res.status()).toBe(400)
  })

  // ── Cleanup ───────────────────────────────────────────────────────────────

  test('Dokument löschen (Admin)', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${dokumentId}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('Gelöschtes Dokument → 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${dokumentId}`)
    expect(res.status()).toBe(404)
  })
})
