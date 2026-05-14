import { Extension } from '@tiptap/core'
import '@tiptap/extension-text-style'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize:   (size: string) => ReturnType
      unsetFontSize: ()             => ReturnType
    }
  }
}

export const FontSizeExtension = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.fontSize || null,
            renderHTML: attrs => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontSize:   (size: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: ()             => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any
  },
})
