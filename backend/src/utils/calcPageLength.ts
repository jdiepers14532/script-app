/**
 * Calculate page_length in 1/8 page increments from ProseMirror content JSON.
 * 1 page = 56 lines (Courier 12pt industry standard).
 * 1/8 page = 7 lines.
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

const LINES_PER_PAGE = 56
const EIGHTHS_PER_PAGE = 8
const LINES_PER_EIGHTH = LINES_PER_PAGE / EIGHTHS_PER_PAGE // 7

// Approximate characters per line for different element types
const CHARS_PER_LINE_DIALOGUE = 35
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

export function calcPageLength(content: any): number {
  if (!content) return 0

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
    const elementType = node.attrs?.element_type

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
      totalLines += wrapLines(text, CHARS_PER_LINE_ACTION)
    } else if (type === 'paragraph' || type === 'heading') {
      totalLines += wrapLines(text, CHARS_PER_LINE_ACTION)
    } else {
      // Unknown node type — count as at least 1 line
      if (text) totalLines += wrapLines(text, CHARS_PER_LINE_ACTION)
      else totalLines += 1
    }

    // Add spacing between elements (except after last)
    if (i < nodes.length - 1) {
      // Dialogue/parenthetical after character: no extra blank line
      const nextType = nodes[i + 1]?.attrs?.element_type
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

  // Convert to eighths (round up to nearest eighth)
  return Math.max(1, Math.ceil(totalLines / LINES_PER_EIGHTH))
}
