// Tier-2: KI-Strukturerkennung (ein Call, kurzer Textauszug)
// Wird nur aufgerufen wenn Tier-1 unzureichend war (zu wenige Blöcke)

export interface Tier2Result {
  erkannt: boolean
  typ: 'future' | 'anderes'
  block_pattern: string | null
  strang_pattern: string | null
  notiz: string
}

/** Wählt einen repräsentativen Auszug aus dem Dokumenttext */
export function buildTextSample(text: string, maxChars = 6000): string {
  if (text.length <= maxChars) return text
  // Nimm die ersten 3000 Zeichen + Mittelteil 1500 + letzten 1500
  const start = text.slice(0, 3000)
  const mid = text.slice(Math.floor(text.length / 2) - 750, Math.floor(text.length / 2) + 750)
  const end = text.slice(-1500)
  return `${start}\n[…]\n${mid}\n[…]\n${end}`
}

/** Parst die KI-Antwort auf den Detect-Prompt */
export function parseTier2Response(raw: string): Tier2Result {
  // JSON aus der Antwort extrahieren
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { erkannt: false, typ: 'anderes', block_pattern: null, strang_pattern: null, notiz: 'KI-Antwort enthielt kein JSON.' }
  }
  try {
    const obj = JSON.parse(jsonMatch[0])
    return {
      erkannt: !!obj.erkannt,
      typ: obj.typ === 'future' ? 'future' : 'anderes',
      block_pattern: obj.block_pattern || null,
      strang_pattern: obj.strang_pattern || null,
      notiz: String(obj.notiz || '').slice(0, 300),
    }
  } catch {
    return { erkannt: false, typ: 'anderes', block_pattern: null, strang_pattern: null, notiz: 'JSON-Parsing fehlgeschlagen.' }
  }
}
