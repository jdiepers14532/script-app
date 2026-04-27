import { Mark, mergeAttributes } from '@tiptap/core'

export type AnnotationTyp = 'kommentar' | 'frage' | 'vorschlag'

const TYP_COLORS: Record<AnnotationTyp, string> = {
  kommentar: '#FFCC00',
  frage:     '#007AFF',
  vorschlag: '#00C853',
}

export const AnnotationMark = Mark.create({
  name: 'annotation',

  addAttributes() {
    return {
      annotationId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-annotation-id'),
        renderHTML: (attrs) => ({ 'data-annotation-id': attrs.annotationId }),
      },
      typ: {
        default: 'kommentar',
        parseHTML: (el) => el.getAttribute('data-annotation-typ') as AnnotationTyp,
        renderHTML: (attrs) => ({ 'data-annotation-typ': attrs.typ }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'mark[data-annotation-id]' }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    const typ = (mark.attrs.typ as AnnotationTyp) || 'kommentar'
    const color = TYP_COLORS[typ] || TYP_COLORS.kommentar
    return [
      'mark',
      mergeAttributes(HTMLAttributes, {
        class: `sp-annotation sp-annotation--${typ}`,
        style: `background: ${color}33; border-bottom: 2px solid ${color};`,
      }),
      0,
    ]
  },
})
