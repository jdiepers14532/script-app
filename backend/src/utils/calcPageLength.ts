/**
 * Calculate page_length in 1/8 page increments from ProseMirror content JSON.
 * A4:     59 lines/page (Courier 12pt, 25mm top + 20mm bottom margin)
 * Letter: 56 lines/page (Courier 12pt, 1in top + 0.5in bottom margin)
 * 1/8 page = LINES_PER_PAGE / 8 lines.
 *
 * Counts logical lines from screenplay elements:
 * - character: 1 line
 * - parenthetical: 1 line
 * - dialogue: wrapped at ~35 chars/line
 * - action/scene_heading: wrapped at ~60 chars/line
 * - transition: 1 line
 * - absatz nodes: wrapped at ~60 chars/line
 * Each element also adds 1 blank line between blocks.
 */

// A4 at Courier 12pt, 25mm top + 20mm bottom margins ≈ 59 usable lines
// US Letter at Courier 12pt, 1in top + 0.5in bottom ≈ 56 usable lines
const LINES_PER_PAGE_A4     = 59
const LINES_PER_PAGE_LETTER = 56
const EIGHTHS_PER_PAGE = 8

// Approximate characters per line for different element types.
// Dialogue column width: A4 210mm − 30mm left − 30mm right page margin
//   − 3.2cm absatzformat margin_left − 2.0cm margin_right = 98mm
//   Courier Prime 12pt at 10 cpi → 98mm / 2.54mm = 38.6 → floor = 38.
// Action column: 150mm / 2.54mm ≈ 59 → 60 (slight conservative rounding).
const CHARS_PER_LINE_DIALOGUE = 38
const CHARS_PER_LINE_ACTION = 60

function getTextFromNode(node: any): string {
  if (!node?.content || !Array.isArray(node.content)) return ''
  return node.content.map((c: any) => c.text ?? '').join('')
}

function wrapLines(text: string, charsPerLine: number): number {
  if (!text) return 1
  const lines = text.split('\n')
  let total = 0
  for (const line of lines) {
    total += Math.max(1, Math.ceil(line.length / charsPerLine))
  }
  return total
}

// Counts raw logical lines from content nodes — shared by calcPageLength and calcContentLinesRaw.
function countLines(content: any): number {
  const nodes: any[] = Array.isArray(content)
    ? content
    : (content?.content && Array.isArray(content.content) ? content.content : [])

  if (nodes.length === 0) return 0

  let totalLines = 0

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node) continue

    const text = getTextFromNode(node)
    const type = node.type
    // screenplay_element uses element_type; absatz uses format_name (normalised to lowercase)
    const elementType: string =
      node.attrs?.element_type ??
      (node.attrs?.format_name as string | undefined)?.toLowerCase() ??
      ''

    if (type === 'screenplay_element') {
      switch (elementType) {
        case 'character':
        case 'transition':
          totalLines += 1
          break
        case 'parenthetical':
          totalLines += 1
          break
        case 'dialogue':
          totalLines += wrapLines(text, CHARS_PER_LINE_DIALOGUE)
          break
        case 'action':
        case 'scene_heading':
        default:
          totalLines += wrapLines(text, CHARS_PER_LINE_ACTION)
          break
      }
    } else if (type === 'absatz') {
      // Use format-aware column width for absatz nodes
      if (elementType === 'dialogue') {
        totalLines += wrapLines(text, CHARS_PER_LINE_DIALOGUE)
      } else if (elementType === 'character' || elementType === 'parenthetical' || elementType === 'transition') {
        totalLines += 1
      } else {
        totalLines += wrapLines(text, CHARS_PER_LINE_ACTION)
      }
    } else if (type === 'paragraph' || type === 'heading') {
      totalLines += wrapLines(text, CHARS_PER_LINE_ACTION)
    } else {
      if (text) totalLines += wrapLines(text, CHARS_PER_LINE_ACTION)
      else totalLines += 1
    }

    // Spacing between elements (except after last)
    // Uses elementType (works for both screenplay_element and absatz via format_name fallback)
    if (i < nodes.length - 1) {
      const nextNode = nodes[i + 1]
      const nextType: string =
        nextNode?.attrs?.element_type ??
        (nextNode?.attrs?.format_name as string | undefined)?.toLowerCase() ??
        ''
      if (elementType === 'character' && (nextType === 'dialogue' || nextType === 'parenthetical')) {
        // no spacing
      } else if (elementType === 'parenthetical' && nextType === 'dialogue') {
        // no spacing
      } else if (elementType === 'dialogue' && nextType === 'character') {
        totalLines += 1
      } else {
        totalLines += 1
      }
    }
  }

  return totalLines
}

export function calcPageLength(content: any, seitenformat: 'a4' | 'letter' = 'a4'): number {
  if (!content) return 0
  const LINES_PER_PAGE = seitenformat === 'letter' ? LINES_PER_PAGE_LETTER : LINES_PER_PAGE_A4
  const LINES_PER_EIGHTH = LINES_PER_PAGE / EIGHTHS_PER_PAGE
  const total = countLines(content)
  if (total === 0) return 0
  return Math.max(1, Math.ceil(total / LINES_PER_EIGHTH))
}

/**
 * Returns the raw logical line count (float) without ceiling rounding.
 * Used by recalcPageNumbers for precise fractional page arithmetic.
 */
export function calcContentLinesRaw(content: any): number {
  if (!content) return 0
  return countLines(content)
}
