/**
 * Paritäts-Check der Anker-Kernlogik (resolveInScene).
 * Prüft das gemeinsame Fixture (frontend/src/utils/anchorParity.fixture.json) gegen:
 *   - reanchor.ts (Backend)
 *   - anchorCore.ts (Frontend, framework-agnostisch) — sobald vorhanden (Schritt-2-Editor)
 * Drift zwischen beiden Implementierungen ⇒ exit 1. Lauf: `npm run test:anchor` (via tsx).
 */
import * as fs from 'fs'
import * as path from 'path'
import { resolveInScene as beResolve } from '../src/utils/reanchor'

const FIXTURE = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'anchorParity.fixture.json')

interface Fall {
  name: string
  blocks: { text: string; block_index: number; node_id?: string | null }[]
  selektor: any
  node_id?: string | null
  erwartet: { anker_status: string; konfidenz: number | null; block_index: number | null; start: number | null; end: number | null }
}

function vergleiche(name: string, impl: string, got: any, erw: Fall['erwartet']): string[] {
  const fehler: string[] = []
  const gotStart = got.position?.start ?? null
  const gotEnd = got.position?.end ?? null
  if (got.anker_status !== erw.anker_status) fehler.push(`${impl}/${name}: anker_status ${got.anker_status} ≠ ${erw.anker_status}`)
  if ((got.konfidenz ?? null) !== erw.konfidenz) fehler.push(`${impl}/${name}: konfidenz ${got.konfidenz} ≠ ${erw.konfidenz}`)
  if ((got.block_index ?? null) !== erw.block_index) fehler.push(`${impl}/${name}: block_index ${got.block_index} ≠ ${erw.block_index}`)
  if (gotStart !== erw.start) fehler.push(`${impl}/${name}: start ${gotStart} ≠ ${erw.start}`)
  if (gotEnd !== erw.end) fehler.push(`${impl}/${name}: end ${gotEnd} ≠ ${erw.end}`)
  return fehler
}

async function ladeFeResolve(): Promise<((b: any, s: any, n?: any) => any) | null> {
  const fe = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'anchorCore.ts')
  if (!fs.existsSync(fe)) return null
  try {
    const mod = await import(fe)
    return mod.resolveInScene ?? null
  } catch (e) {
    console.warn('[parity] anchorCore.ts vorhanden, aber nicht ladbar:', (e as Error).message)
    return null
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'))
  const faelle: Fall[] = data.faelle
  const feResolve = await ladeFeResolve()
  const alleFehler: string[] = []

  for (const f of faelle) {
    const beGot = beResolve(f.blocks, f.selektor, f.node_id ?? null)
    alleFehler.push(...vergleiche(f.name, 'BE', beGot, f.erwartet))
    if (feResolve) {
      const feGot = feResolve(f.blocks, f.selektor, f.node_id ?? null)
      alleFehler.push(...vergleiche(f.name, 'FE', feGot, f.erwartet))
    }
  }

  const implHinweis = feResolve ? 'BE + FE' : 'BE (FE anchorCore.ts noch nicht vorhanden)'
  if (alleFehler.length) {
    console.error(`✗ Anker-Parität fehlgeschlagen (${implHinweis}):`)
    alleFehler.forEach(e => console.error('  - ' + e))
    process.exit(1)
  }
  console.log(`✓ Anker-Parität OK — ${faelle.length} Fälle, ${implHinweis}`)
}

main().catch(e => { console.error(e); process.exit(1) })
