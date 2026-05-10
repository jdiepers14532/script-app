// ── Tiptap JSON → Plain Text Extraktion + Content-Manipulation ─────────────

/**
 * Extrahiert reinen Text aus Tiptap/ProseMirror JSON-Content.
 * Traversiert rekursiv alle Nodes und sammelt text-Werte.
 */
export function extractText(content: any): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (content.text) return content.text
  if (Array.isArray(content)) return content.map(extractText).join('')
  if (content.content) return content.content.map(extractText).join('\n')
  return ''
}

/**
 * Erstellt eine Regex aus den Suchoptionen.
 */
export function buildSearchRegex(
  query: string,
  opts: { case_sensitive?: boolean; whole_words?: boolean; regex?: boolean }
): RegExp {
  let pattern = query
  if (!opts.regex) {
    // Escape regex special chars for literal search
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  if (opts.whole_words) {
    pattern = `\\b${pattern}\\b`
  }
  const flags = opts.case_sensitive ? 'g' : 'gi'
  return new RegExp(pattern, flags)
}

/**
 * Findet alle Treffer im Plaintext und gibt Positionen + Snippets zurück.
 */
export function findMatches(
  text: string,
  regex: RegExp,
  maxSnippetLen = 120
): { position: number; length: number; snippet: string }[] {
  const results: { position: number; length: number; snippet: string }[] = []
  let match: RegExpExecArray | null
  // Reset lastIndex
  regex.lastIndex = 0
  while ((match = regex.exec(text)) !== null) {
    const pos = match.index
    const len = match[0].length
    // Build context snippet
    const snippetStart = Math.max(0, pos - 40)
    const snippetEnd = Math.min(text.length, pos + len + 40)
    let snippet = ''
    if (snippetStart > 0) snippet += '...'
    snippet += text.substring(snippetStart, snippetEnd)
    if (snippetEnd < text.length) snippet += '...'
    // Truncate if too long
    if (snippet.length > maxSnippetLen) {
      snippet = snippet.substring(0, maxSnippetLen - 3) + '...'
    }
    results.push({ position: pos, length: len, snippet })
    // Prevent infinite loop on zero-length matches
    if (len === 0) regex.lastIndex++
  }
  return results
}

/**
 * Ersetzt alle Treffer im Tiptap JSON-Content (in-place Modifikation).
 * Gibt die Anzahl der Ersetzungen zurück.
 * Marks bleiben erhalten. Nur text-Nodes werden modifiziert.
 */
export function replaceInContent(
  content: any,
  regex: RegExp,
  replacement: string
): { content: any; count: number } {
  if (!content) return { content, count: 0 }

  let totalCount = 0

  function traverse(node: any): any {
    if (!node) return node

    // Text node
    if (node.type === 'text' && typeof node.text === 'string') {
      regex.lastIndex = 0
      const matches = node.text.match(regex)
      if (matches) {
        totalCount += matches.length
        regex.lastIndex = 0
        node.text = node.text.replace(regex, replacement)
      }
      return node
    }

    // Recurse into content array
    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map((child: any) => traverse(child))
      // Merge adjacent text nodes with identical marks
      node.content = mergeAdjacentTextNodes(node.content)
    }

    // Handle array directly (top-level content)
    if (Array.isArray(node)) {
      return node.map((child: any) => traverse(child))
    }

    return node
  }

  // Deep-clone to avoid mutation of original
  const cloned = JSON.parse(JSON.stringify(content))
  const result = traverse(cloned)
  return { content: result, count: totalCount }
}

/**
 * Mergt benachbarte Text-Nodes mit identischen Marks.
 */
function mergeAdjacentTextNodes(nodes: any[]): any[] {
  if (!nodes || nodes.length <= 1) return nodes
  const merged: any[] = []
  for (const node of nodes) {
    const prev = merged[merged.length - 1]
    if (
      prev &&
      prev.type === 'text' &&
      node.type === 'text' &&
      marksEqual(prev.marks, node.marks)
    ) {
      prev.text += node.text
    } else {
      merged.push(node)
    }
  }
  return merged
}

function marksEqual(a: any[] | undefined, b: any[] | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
