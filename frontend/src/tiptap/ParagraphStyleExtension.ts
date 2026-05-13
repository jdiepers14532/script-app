/**
 * Adds fontFamily and fontSize as paragraph-level attributes.
 * Unlike TextStyle marks (which don't apply to atom nodes like chips),
 * paragraph attributes affect the entire line — including placeholder chips.
 */
import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphStyle: {
      setParagraphFont: (fontFamily: string | null) => ReturnType
      setParagraphFontSize: (fontSize: string | null) => ReturnType
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
            renderHTML: attrs => attrs.fontFamily
              ? { style: `font-family:${attrs.fontFamily}` }
              : {},
          },
          fontSize: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.fontSize || null,
            renderHTML: attrs => attrs.fontSize
              ? { style: `font-size:${attrs.fontSize}` }
              : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setParagraphFont: (fontFamily: string | null) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { fontFamily: fontFamily || null }),
      setParagraphFontSize: (fontSize: string | null) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { fontSize: fontSize || null }),
    } as any
  },
})
