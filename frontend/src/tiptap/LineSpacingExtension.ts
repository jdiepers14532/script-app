import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineSpacing: {
      setLineSpacing: (spacing: string) => ReturnType
      unsetLineSpacing: () => ReturnType
    }
  }
}

export const LineSpacingExtension = Extension.create({
  name: 'lineSpacing',

  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'absatz', 'screenplay_element'],
      attributes: {
        lineSpacing: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (attrs) => {
            if (!attrs.lineSpacing) return {}
            return { style: `line-height: ${attrs.lineSpacing}` }
          },
        },
      },
    }]
  },

  addCommands() {
    return {
      setLineSpacing: (spacing: string) => ({ commands }) =>
        commands.updateAttributes('paragraph', { lineSpacing: spacing }) ||
        commands.updateAttributes('heading', { lineSpacing: spacing }) ||
        commands.updateAttributes('absatz', { lineSpacing: spacing }),
      unsetLineSpacing: () => ({ commands }) =>
        commands.updateAttributes('paragraph', { lineSpacing: null }) ||
        commands.updateAttributes('heading', { lineSpacing: null }) ||
        commands.updateAttributes('absatz', { lineSpacing: null }),
    }
  },
})
