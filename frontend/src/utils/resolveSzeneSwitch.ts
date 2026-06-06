// Bestimmt, welche Szene nach einem Fassungs-/Werkstufen-Wechsel ausgewählt werden soll,
// damit man im selben Inhalt bleibt.
//
// Strategie:
//   1. UUID-Treffer (Primär): dieselbe scene_identity_id in der neuen Fassung.
//      Gelöschte Szenen sind serverseitig bereits ausgefiltert (getWerkstufenSzenen).
//   2. Non-Scene (Titelseite/Notiz, keine Szenennummer): nur UUID; bei Miss aktuelle
//      Index-Position halten (geclamped).
//   3. Nummern-Fallback (echte Szene, UUID fehlt — z.B. nach Umnummerierung oder
//      Import ohne Match): nächstniedrigere Szenennummer (größte Nummer <= prev).
//   4. Untergrenze (prev-Nummer kleiner als alle): erste echte Szene.
//   5. Liste leer → null.

export interface SwitchSzene {
  id: number | string
  scene_identity_id?: string | null
  scene_nummer?: number | null
  format?: string | null
}

function isEchteSzene(s: SwitchSzene): boolean {
  return s.format !== 'notiz' && s.scene_nummer != null
}

/**
 * @param prev      Die vor dem Wechsel ausgewählte Szene (aus der alten Fassung), oder null.
 * @param prevIndex Position von prev in der alten Szenenliste (für Non-Scene-Fallback).
 * @param scenes    Szenen der neu gewählten Fassung (sortiert nach sort_order).
 * @returns         id der Zielszene oder null.
 */
export function resolveSzeneSwitch(
  prev: SwitchSzene | null,
  prevIndex: number,
  scenes: SwitchSzene[],
): number | string | null {
  if (scenes.length === 0) return null
  if (!prev) return scenes[0].id

  // 1. UUID-Treffer
  if (prev.scene_identity_id) {
    const byUuid = scenes.find(s => s.scene_identity_id === prev.scene_identity_id)
    if (byUuid) return byUuid.id
  }

  // 2. Non-Scene → Index halten (geclamped)
  if (!isEchteSzene(prev)) {
    const clamped = Math.max(0, Math.min(prevIndex, scenes.length - 1))
    return scenes[clamped].id
  }

  // 3. Nummern-Fallback: nächstniedrigere Szenennummer
  const prevNr = prev.scene_nummer as number
  let best: SwitchSzene | null = null
  for (const s of scenes) {
    if (!isEchteSzene(s)) continue
    const nr = s.scene_nummer as number
    if (nr <= prevNr && (best == null || nr > (best.scene_nummer as number))) {
      best = s
    }
  }
  if (best) return best.id

  // 4. Untergrenze: erste echte Szene (sonst erstes Element)
  const ersteEchte = scenes.find(isEchteSzene)
  return (ersteEchte ?? scenes[0]).id
}
