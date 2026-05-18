/**
 * mergeVorlage — WYSIWYG-Merge einer Dokument-Vorlage mit Szenen-Inhalt
 *
 * Semantik:
 * - body_content der Vorlage ist ein Tiptap-Dokument mit placeholder_chip-Nodes
 * - {{notiz_inhalt}}-Chip: wird durch currentContentNodes ersetzt (Szenen-Inhalt)
 * - Alle anderen Chips ({{produktion}}, {{folge}} etc.) bleiben als Chip-Nodes erhalten
 *   und werden erst beim PDF-Export aufgelöst. Im Editor sind sie als farbige Pills sichtbar.
 * - {{notiz_inhalt}} als einziger Inline-Inhalt eines Paragraphen:
 *   → wird durch die content-Nodes als Block-Ersatz expandiert
 *   → Formatierung (fontFamily, fontSize, textAlign, lineSpacing) des Vorlage-Paragraphen
 *     wird auf Inhalt-Paragraphen ohne eigene Formatierung übertragen
 *   → wenn contentNodes leer: leerer Paragraph (Tiptap-Placeholder zeigt Ghost-Text)
 */

export type TiptapDoc = { type: 'doc'; content: any[] }

export function mergeVorlageWithContent(
  vorlageBodyContent: TiptapDoc | null | undefined,
  currentContentNodes: any[],
): TiptapDoc {
  if (!vorlageBodyContent?.content?.length) {
    return {
      type: 'doc',
      content: currentContentNodes.length > 0
        ? currentContentNodes
        : [{ type: 'paragraph' }],
    }
  }

  const result: any[] = []

  for (const node of vorlageBodyContent.content) {
    const processed = processBlock(node, currentContentNodes)
    if (Array.isArray(processed)) {
      result.push(...processed)
    } else {
      result.push(processed)
    }
  }

  return { type: 'doc', content: result.length > 0 ? result : [{ type: 'paragraph' }] }
}

/** Verarbeitet einen einzelnen Block-Node der Vorlage. */
function processBlock(node: any, contentNodes: any[]): any | any[] {
  // Paragraph dessen einziger Inline-Inhalt {{notiz_inhalt}} ist → expandieren
  if (
    node.type === 'paragraph' &&
    node.content?.length === 1 &&
    node.content[0].type === 'placeholder_chip' &&
    node.content[0].attrs?.key === '{{notiz_inhalt}}'
  ) {
    if (contentNodes.length > 0) {
      // Formatierungs-Attrs aus dem Vorlage-Paragraphen extrahieren
      const paraAttrs = node.attrs ?? {}
      const fmtAttrs = extractFmtAttrs(paraAttrs)
      if (Object.keys(fmtAttrs).length > 0) {
        return contentNodes.map(n => applyFmtIfMissing(n, fmtAttrs))
      }
      return contentNodes
    }
    // Kein Inhalt → leerer Paragraph mit Vorlage-Formatierung (Placeholder zeigt Ghost-Text)
    return { type: 'paragraph', attrs: node.attrs ?? {} }
  }

  // Alle anderen Nodes unverändert übernehmen
  // (Chips wie {{produktion}} bleiben als placeholder_chip-Nodes erhalten)
  return node
}

/** Extrahiert nur explizit gesetzte Formatierungs-Attrs (keine null-Werte). */
function extractFmtAttrs(attrs: any): Record<string, any> {
  const fmt: Record<string, any> = {}
  const keys = ['fontFamily', 'fontSize', 'textAlign', 'lineSpacing']
  for (const k of keys) {
    if (attrs[k] != null) fmt[k] = attrs[k]
  }
  return fmt
}

/**
 * Überträgt Vorlage-Formatierung auf einen Paragraphen-Node,
 * wenn dieser kein eigenes Äquivalent hat (Vorlage = Fallback, nicht Override).
 */
function applyFmtIfMissing(node: any, fmtAttrs: Record<string, any>): any {
  if (node.type !== 'paragraph' && node.type !== 'absatz') return node
  const existing = node.attrs ?? {}
  const merged: Record<string, any> = { ...fmtAttrs }
  // Bestehende nicht-null-Attrs haben Vorrang
  for (const [k, v] of Object.entries(existing)) {
    if (v != null) merged[k] = v
  }
  return { ...node, attrs: merged }
}
