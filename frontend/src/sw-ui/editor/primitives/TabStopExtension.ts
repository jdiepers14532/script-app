/**
 * TabStopExtension — gemeinsame Tab-Stop-Typen + Tiptap Tab-Key-Handler
 * Genutzt von: SzenenKopfVorlagenEditor, KopfZeilenEditor
 */
import { Extension } from '@tiptap/core'

export type TabAlign = 'left' | 'center' | 'right'
export interface TabStop { pos: number; align: TabAlign }

export const TAB_ALIGN_NEXT: Record<TabAlign, TabAlign | null> = {
  left: 'center', center: 'right', right: null,
}
export const TAB_ALIGN_SYMBOL: Record<TabAlign, string> = { left: 'L', center: 'C', right: 'R' }
export const TAB_ALIGN_COLORS: Record<TabAlign, string> = {
  left: '#007AFF', center: '#FF9500', right: '#5856D6',
}

/** Fügt beim Tab-Druck 4 Leerzeichen ein (universeller Fallback). */
export const TabKeyExtension = Extension.create({
  name: 'tab_key',
  addKeyboardShortcuts() {
    return {
      Tab:       () => { this.editor.commands.insertContent('\u00A0\u00A0\u00A0\u00A0'); return true },
      'Shift-Tab': () => true,
    }
  },
})
