/**
 * Zero-Width Character (ZWC) steganographic watermarking.
 *
 * Encoding:
 *   U+200C ZWNJ = bit 0
 *   U+200D ZWJ  = bit 1
 *   U+200B ZWSP = byte separator (between 8-bit groups)
 *
 * Payload format: "wm1:{userId}:{exportId}"
 *
 * Security note: ZWC watermarks protect against accidental/negligent leaks.
 * A technically aware actor can strip them with one regex. The export_logs
 * table is the durable forensic record; the ZWC is the document-embedded hint.
 */

const B0  = '\u200C'  // ZWNJ — bit 0
const B1  = '\u200D'  // ZWJ  — bit 1
const SEP = '\u200B'  // ZWSP — byte separator

export function encodeWatermark(payload: string): string {
  const bytes = Buffer.from(payload, 'utf8')
  return Array.from(bytes)
    .map(byte => {
      let bits = ''
      for (let i = 7; i >= 0; i--) bits += (byte >> i) & 1 ? B1 : B0
      return bits
    })
    .join(SEP)
}

/**
 * Extract and decode the first valid watermark payload found anywhere in text.
 * Returns decoded string (e.g. "wm1:user123:uuid") or null if not found.
 */
export function decodeWatermarkFromText(text: string): string | null {
  let seq = ''
  for (const ch of text) {
    if (ch === B0 || ch === B1 || ch === SEP) seq += ch
  }
  if (!seq) return null

  const groups = seq.split(SEP).filter(g => g.length === 8 && /^[\u200C\u200D]+$/.test(g))
  if (groups.length === 0) return null

  try {
    const bytes = groups.map(bits => {
      let b = 0
      for (const ch of bits) b = (b << 1) | (ch === B1 ? 1 : 0)
      return b
    })
    const decoded = Buffer.from(bytes).toString('utf8')
    return decoded.startsWith('wm1:') ? decoded : null
  } catch {
    return null
  }
}

export function buildPayload(userId: string, exportId: string): string {
  return `wm1:${userId}:${exportId}`
}

export function parsePayload(payload: string): { userId: string; exportId: string } | null {
  if (!payload.startsWith('wm1:')) return null
  const rest = payload.slice(4)
  const colon = rest.indexOf(':')
  if (colon < 0) return null
  return { userId: rest.slice(0, colon), exportId: rest.slice(colon + 1) }
}

/** Remove all ZWC characters from a string (use before parsing imported files) */
export function stripWatermark(text: string): string {
  return text.replace(/[\u200B-\u200D\uFEFF]/g, '')
}

/**
 * Inject watermark ZWC block after the first newline of the text.
 * Safe for Fountain plain-text; also used for FDX/HTML text nodes.
 */
export function injectIntoText(text: string, payload: string): string {
  const wm = encodeWatermark(payload)
  const nlIdx = text.indexOf('\n')
  if (nlIdx < 0) return wm + text
  return text.slice(0, nlIdx + 1) + wm + text.slice(nlIdx + 1)
}
