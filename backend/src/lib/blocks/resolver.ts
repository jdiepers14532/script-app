/**
 * Block-Resolver: produktion_id + block_nummer → Folgen-Range + folgen_ids in script_db
 *
 * Block-Zuordnung ist nicht in script_db persistiert — sie kommt live aus der
 * Produktionsdatenbank (productions.bloecke JSONB-Array).
 *
 * Wiederverwendbar für Live-Dispo, QuotenMeter etc.
 */

import { query, queryOne } from '../../db'
import { prodQueryOne } from '../../prodDb'

export interface ResolvedBlock {
  produktion_id: string
  block_nummer: number
  folge_von: number
  folge_bis: number
  /** Konkrete folgen.id-Werte in script_db (kann leer sein wenn noch kein Import) */
  folgen_ids: number[]
  dreh_von: string | null
  dreh_bis: string | null
}

export async function resolveBlock(
  produktion_id: string,
  block_nummer: number
): Promise<ResolvedBlock> {
  // 1. produktion_db_id aus script_db holen
  const produktion = await queryOne(
    'SELECT produktion_db_id FROM produktionen WHERE id = $1',
    [produktion_id]
  )
  if (!produktion?.produktion_db_id) {
    throw new Error(`Produktion "${produktion_id}" hat keine produktion_db_id — noch nicht mit Produktionsdatenbank verknüpft`)
  }

  // 2. Blöcke aus Produktionsdatenbank lesen
  const prod = await prodQueryOne(
    'SELECT erster_block, bloecke FROM productions WHERE id = $1',
    [produktion.produktion_db_id]
  )
  if (!prod?.bloecke?.length) {
    throw new Error(`Keine Blöcke für Produktion "${produktion_id}" in der Produktionsdatenbank gefunden`)
  }

  const blockIndex = block_nummer - (prod.erster_block ?? 1)
  if (blockIndex < 0 || blockIndex >= prod.bloecke.length) {
    throw new Error(
      `Block ${block_nummer} nicht gefunden (erster_block=${prod.erster_block}, ${prod.bloecke.length} Blöcke vorhanden)`
    )
  }

  const block = prod.bloecke[blockIndex]
  const folge_von: number = block.folge_von
  const folge_bis: number = block.folge_bis

  if (folge_von == null || folge_bis == null) {
    throw new Error(`Block ${block_nummer} hat keine Folgen-Range (folge_von/folge_bis fehlt)`)
  }

  // 3. folgen_ids in script_db ermitteln
  const folgen = await query(
    `SELECT id FROM folgen
     WHERE produktion_id = $1 AND folge_nummer BETWEEN $2 AND $3
     ORDER BY folge_nummer ASC`,
    [produktion_id, folge_von, folge_bis]
  )

  return {
    produktion_id,
    block_nummer,
    folge_von,
    folge_bis,
    folgen_ids: folgen.map((f: any) => f.id),
    dreh_von: block.dreh_von ?? null,
    dreh_bis: block.dreh_bis ?? null,
  }
}
