import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const API = `${BASE}/api`

// Phase 3+6 Tests: Import writes to folgen+werkstufen, Export reads from werkstufen

test.describe('Phase 3: Import — Werkstufen dual-write', () => {
  const staffelId = 'd26dff66-57cf-4b32-9649-4009618fce4d'
  const folgeNummer = 8888

  test('Import schreibt in folgen + werkstufen Tabellen', async ({ request }) => {
    // Create a minimal Fountain file
    const fountainContent = `Title: Testfolge Phase 3
Author: Test

INT. CAFE - TAG

ANNA
Hallo Welt.

EXT. PARK - NACHT

BERND
Guten Abend.
`
    const res = await request.post(`${API}/import/commit`, {
      multipart: {
        file: {
          name: 'test_phase3.fountain',
          mimeType: 'text/plain',
          buffer: Buffer.from(fountainContent),
        },
        staffel_id: staffelId,
        folge_nummer: String(folgeNummer),
        stage_type: 'draft',
      }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()

    // Verify new fields in response
    expect(body.folge_id).toBeTruthy()
    expect(body.werkstufe_id).toBeTruthy()
    expect(body.scenes_imported).toBeGreaterThanOrEqual(2)

    // Verify folgen-Tabelle
    const folgenRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const folgen = await folgenRes.json()
    const testFolge = folgen.find((f: any) => f.folge_nummer === folgeNummer)
    expect(testFolge).toBeTruthy()
    expect(testFolge.id).toBe(body.folge_id)

    // Verify werkstufen-Tabelle
    const wsRes = await request.get(`${API}/v2/folgen/${testFolge.id}/werkstufen`)
    expect(wsRes.ok()).toBeTruthy()
    const werkstufen = await wsRes.json()
    expect(werkstufen.length).toBeGreaterThanOrEqual(1)
    const ws = werkstufen.find((w: any) => w.id === body.werkstufe_id)
    expect(ws).toBeTruthy()
    expect(ws.typ).toBe('drehbuch')

    // Verify dokument_szenen have werkstufe_id
    const szenenRes = await request.get(`${API}/werkstufen/${body.werkstufe_id}/szenen`)
    expect(szenenRes.ok()).toBeTruthy()
    const szenen = await szenenRes.json()
    expect(szenen.length).toBeGreaterThanOrEqual(2)
    expect(szenen[0].ort_name).toBeTruthy()
  })
})

test.describe('Phase 6: Export — Werkstufe-basiert', () => {
  const staffelId = 'd26dff66-57cf-4b32-9649-4009618fce4d'

  test('Export Fountain aus Werkstufe', async ({ request }) => {
    // Find a werkstufe with scenes
    const folgenRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const folgen = await folgenRes.json()
    let werkId: string | null = null

    for (const f of folgen) {
      const wsRes = await request.get(`${API}/v2/folgen/${f.id}/werkstufen`)
      const ws = await wsRes.json()
      const withScenes = ws.find((w: any) => w.szenen_count > 0)
      if (withScenes) { werkId = withScenes.id; break }
    }

    if (!werkId) return // Skip if no werkstufe with scenes

    const res = await request.get(`${API}/stages/werkstufe/${werkId}/export/fountain`)
    expect(res.ok()).toBeTruthy()
    const text = await res.text()
    expect(text).toContain('INT')
  })

  test('Export FDX aus Werkstufe', async ({ request }) => {
    const folgenRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const folgen = await folgenRes.json()
    let werkId: string | null = null

    for (const f of folgen) {
      const wsRes = await request.get(`${API}/v2/folgen/${f.id}/werkstufen`)
      const ws = await wsRes.json()
      const withScenes = ws.find((w: any) => w.szenen_count > 0)
      if (withScenes) { werkId = withScenes.id; break }
    }

    if (!werkId) return

    const res = await request.get(`${API}/stages/werkstufe/${werkId}/export/fdx`)
    expect(res.ok()).toBeTruthy()
    const text = await res.text()
    expect(text).toContain('FinalDraft')
  })

  test('Export PDF aus Werkstufe', async ({ request }) => {
    const folgenRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const folgen = await folgenRes.json()
    let werkId: string | null = null

    for (const f of folgen) {
      const wsRes = await request.get(`${API}/v2/folgen/${f.id}/werkstufen`)
      const ws = await wsRes.json()
      const withScenes = ws.find((w: any) => w.szenen_count > 0)
      if (withScenes) { werkId = withScenes.id; break }
    }

    if (!werkId) return

    const res = await request.get(`${API}/stages/werkstufe/${werkId}/export/pdf`)
    expect(res.ok()).toBeTruthy()
    const text = await res.text()
    expect(text).toContain('<html>')
    expect(text).toContain('scene-heading')
  })
})
