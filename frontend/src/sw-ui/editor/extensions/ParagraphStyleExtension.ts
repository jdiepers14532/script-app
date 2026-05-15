/**
 * Adds font and text-style attributes at paragraph level.
 * Unlike TextStyle marks (which don't apply to atom nodes like chips),
 * paragraph attributes affect the entire line — including placeholder chips.
 * B/I/U toolbar buttons set both the text mark (for selected text) AND the
 * paragraph attribute (so chips in the same line also inherit the style).
 */
import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphStyle: {
      setParagraphFont:       (fontFamily: string | null)   => ReturnType
      setParagraphFontSize:   (fontSize: string | null)     => ReturnType
      setParagraphBold:       (bold: boolean)               => ReturnType
      setParagraphItalic:     (italic: boolean)             => ReturnType
      setParagraphUnderline:  (underline: boolean)          => ReturnType
      setParagraphLineHeight: (lineHeight: string | null)   => ReturnType
      setParagraphSpaceAfter: (spaceAfter: string | null)   => ReturnType
    }
  }
}

export const ParagraphStyleExtension = Extension.create({
  name: 'paragraphStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.fontFamily || null,
            renderHTML: attrs => attrs.fontFamily ? { style: `font-family:${attrs.fontFamily}` } : {},
          },
          fontSize: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.fontSize || null,
            renderHTML: attrs => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
          },
          fontWeight: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.fontWeight || null,
            renderHTML: attrs => attrs.fontWeight ? { style: `font-weight:${attrs.fontWeight}` } : {},
          },
          fontStyle: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.fontStyle || null,
            renderHTML: attrs => attrs.fontStyle ? { style: `font-style:${attrs.fontStyle}` } : {},
          },
          textDecoration: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.textDecoration || null,
            renderHTML: attrs => attrs.textDecoration ? { style: `text-decoration:${attrs.textDecoration}` } : {},
          },
          lineHeight: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.lineHeight || null,
            renderHTML: attrs => attrs.lineHeight ? { style: `line-height:${attrs.lineHeight}` } : {},
          },
          spaceAfter: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.marginBottom || null,
            renderHTML: attrs => attrs.spaceAfter ? { style: `margin-bottom:${attrs.spaceAfter}` } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setParagraphFont:      (fontFamily: string | null) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { fontFamily: fontFamily || null }),
      setParagraphFontSize:  (fontSize: string | null)   => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { fontSize: fontSize || null }),
      setParagraphBold:      (bold: boolean)             => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { fontWeight: bold ? 'bold' : null }),
      setParagraphItalic:    (italic: boolean)           => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { fontStyle: italic ? 'italic' : null }),
      setParagraphUnderline: (underline: boolean)        => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { textDecoration: underline ? 'underline' : null }),
      setParagraphLineHeight: (lineHeight: string | null) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { lineHeight: lineHeight || null }),
      setParagraphSpaceAfter: (spaceAfter: string | null) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { spaceAfter: spaceAfter || null }),
    } as any
  },
})
