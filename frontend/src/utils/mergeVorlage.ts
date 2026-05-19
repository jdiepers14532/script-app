/**
 * mergeVorlage — WYSIWYG-Merge einer Dokument-Vorlage mit Szenen-Inhalt
 *
 * Semantik:
 * - body_content der Vorlage ist ein Tiptap-Dokument mit placeholder_chip-Nodes
 * - {{notiz_inhalt}}-Chip: wird durch currentContentNodes ersetzt (Szenen-Inhalt)
 * - Alle anderen Chips: werden durch ihren Wert aus chipValues aufgelöst → reiner Text
 *   → nach dem Merge gibt es keine Chips mehr, nur editierbaren Text
 * - Chips ohne Wert in chipValues werden mit leerem String aufgelöst (unsichtbar)
 */

export type TiptapDoc = { type: 'doc'; content: any[] }

export function mergeVorlageWithContent(
  vorlageBodyContent: TiptapDoc | null | undefined,
  currentContentNodes: any[],
  chipValues: Record<string, string> = {},
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
    const processed = resolveNode(node, currentContentNodes, chipValues)
    if (Array.isArray(processed)) {
      result.push(...processed)
    } else {
      result.push(processed)
    }
  }

  return { type: 'doc', content: result.length > 0 ? result : [{ type: 'paragraph' }] }
}

/**
 * Verarbeitet einen beliebigen Node rekursiv:
 * - Paragraph dessen einziger Inhalt {{notiz_inhalt}} ist → Szenentext expandieren
 * - placeholder_chip-Nodes (inline) → durch Text ersetzen
 * - Block-Nodes mit children → rekursiv verarbeiten (für Tabellen, Listen etc.)
 */
function resolveNode(node: any, contentNodes: any[], chipValues: Record<string, string>): any | any[] {
  // Sonderfall: Paragraph dessen einziger Inline-Inhalt {{notiz_inhalt}} ist → expandieren
  if (
    node.type === 'paragraph' &&
    node.content?.length === 1 &&
    node.content[0].type === 'placeholder_chip' &&
    node.content[0].attrs?.key === '{{notiz_inhalt}}'
  ) {
    if (contentNodes.length > 0) {
      const fmtAttrs = extractFmtAttrs(node.attrs ?? {})
      if (Object.keys(fmtAttrs).length > 0) {
        return contentNodes.map(n => applyFmtIfMissing(n, fmtAttrs))
      }
      return contentNodes
    }
    return { type: 'paragraph', attrs: node.attrs ?? {} }
  }

  // Nodes mit Kinder-Array: rekursiv verarbeiten
  if (node.content && Array.isArray(node.content)) {
    const resolvedChildren: any[] = []
    for (const child of node.content) {
      if (child.type === 'placeholder_chip') {
        // Chip → Text auflösen
        const key: string = child.attrs?.key ?? ''
        const value = chipValues[key] ?? ''
        if (value) {
          // Chip-Formatierung (fontFamily, fontSize etc.) als TextStyle-Mark übertragen
          const marks = buildTextMarksFromChipAttrs(child.attrs)
          const textNode: any = { type: 'text', text: value }
          if (marks.length > 0) textNode.marks = marks
          resolvedChildren.push(textNode)
        }
        // Kein Wert → Chip verschwindet (leerer String → nicht einfügen)
      } else {
        const processed = resolveNode(child, contentNodes, chipValues)
        if (Array.isArray(processed)) {
          resolvedChildren.push(...processed)
        } else {
          resolvedChildren.push(processed)
        }
      }
    }
    // Paragraph ohne Inhalt → leeren Paragraph behalten (für Abstände)
    if (resolvedChildren.length === 0 && isParagraphLike(node.type)) {
      return { ...node, content: [] }
    }
    return { ...node, content: resolvedChildren }
  }

  return node
}

function isParagraphLike(type: string): boolean {
  return type === 'paragraph' || type === 'absatz' || type === 'heading'
}

/** Extrahiert Formatierungs-Attrs eines Chips für TextStyle-Marks. */
function buildTextMarksFromChipAttrs(attrs: any): any[] {
  if (!attrs) return []
  const styleAttrs: Record<string, string> = {}
  if (attrs.fontFamily) styleAttrs.fontFamily = attrs.fontFamily
  if (attrs.fontSize)   styleAttrs.fontSize   = attrs.fontSize
  if (Object.keys(styleAttrs).length === 0) return []
  return [{ type: 'textStyle', attrs: styleAttrs }]
}

/** Extrahiert nur explizit gesetzte Paragraph-Formatierungs-Attrs. */
function extractFmtAttrs(attrs: any): Record<string, any> {
  const fmt: Record<string, any> = {}
  for (const k of ['fontFamily', 'fontSize', 'textAlign', 'lineSpacing']) {
    if (attrs[k] != null) fmt[k] = attrs[k]
  }
  return fmt
}

/**
 * Überträgt Vorlage-Formatierung auf einen Paragraphen-Node
 * als Fallback (bestehende Attrs haben Vorrang).
 */
function applyFmtIfMissing(node: any, fmtAttrs: Record<string, any>): any {
  if (node.type !== 'paragraph' && node.type !== 'absatz') return node
  const existing = node.attrs ?? {}
  const merged: Record<string, any> = { ...fmtAttrs }
  for (const [k, v] of Object.entries(existing)) {
    if (v != null) merged[k] = v
  }
  return { ...node, attrs: merged }
}
