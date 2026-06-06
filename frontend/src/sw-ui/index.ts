export { CompanyInfoModal } from './CompanyInfoModal';
export type { CompanyInfoModalProps } from './CompanyInfoModal';
export { AnnotationBadge } from './AnnotationBadge';
export type { AnnotationBadgeProps } from './AnnotationBadge';
export { TerminologieProvider, useTerminologie, TERM_OPTIONS, TERM_DEFAULTS, TERM_KEYS, TERM_LABELS } from './TerminologieContext';
export type { TermKey, TermForms, TerminologieConfig, TerminologieProviderProps } from './TerminologieContext';
export { default as DokumentVorlagenEditor, emptyVorlagenEditorValue } from './editor/DokumentVorlagenEditor';
export type { DokumentVorlagenEditorValue, SeitenLayout, ZeilenContent, PreviewContext } from './editor/DokumentVorlagenEditor';
export { PlaceholderChipExtension, PLACEHOLDER_CHIP_CSS, getPlaceholdersForZone, getPlaceholderLabel, getPlaceholderColor, PLACEHOLDER_DEFS } from './editor/extensions/PlaceholderChipExtension';
export type { PlaceholderDef, PlaceholderZone } from './editor/extensions/PlaceholderChipExtension';
export { FontSizeExtension } from './editor/extensions/FontSizeExtension';
export { ParagraphStyleExtension } from './editor/extensions/ParagraphStyleExtension';
export { ResizableImageExtension } from './editor/extensions/ResizableImageExtension';
export { useOfflineQueue } from './useOfflineQueue';
export type { QueuedRequest, SyncConflict, ReconnectResult, UseOfflineQueueOptions } from './useOfflineQueue';
export { OfflineQueueProvider, useOfflineQueueContext } from './OfflineQueueContext';
export type { OfflineQueueProviderProps } from './OfflineQueueContext';

export { default as SzenenKopfVorlagenEditor } from './SzenenKopfVorlagenEditor';
export type { SKChipDef } from './SzenenKopfVorlagenEditor';
export { SK_CHIPS } from './SzenenKopfVorlagenEditor';

export { RulerBar } from './editor/primitives/RulerBar';
export type { RulerBarProps } from './editor/primitives/RulerBar';
export { TabKeyExtension, TAB_ALIGN_NEXT, TAB_ALIGN_SYMBOL, TAB_ALIGN_COLORS } from './editor/primitives/TabStopExtension';
export type { TabAlign, TabStop } from './editor/primitives/TabStopExtension';
export { default as KopfZeilenEditor, emptyKopfZeilenEditorValue } from './editor/KopfZeilenEditor';
export type { KopfZeilenEditorValue, KZPreviewContext } from './editor/KopfZeilenEditor';

export { WuenscheModal } from './WuenscheModal';
export type { WuenscheModalProps } from './WuenscheModal';
export { MagicModal } from './MagicModal';
export type { MagicModalProps } from './MagicModal';
export { useWuensche } from './useWuensche';
export type { Wunsch, WunschNotification, WunschDialoge, MistralVorschlag } from './useWuensche';
export { injectMagicCSS, fireMagicConfetti, fireSparkles, MAGIC_COLORS, MAGIC_CSS, STAR_CLIP_PATH } from './MagicWandTheme';

// ── Keymap (Befehlspalette, Kürzel-Übersicht, globale Hotkeys) ───────────────
export { CommandPalette } from './keymap/CommandPalette';
export type { Command } from './keymap/CommandPalette';
export { ShortcutCheatSheet } from './keymap/ShortcutCheatSheet';
export type { ShortcutGroup, ShortcutRow } from './keymap/ShortcutCheatSheet';
export { useKeymapHotkeys } from './keymap/useKeymapHotkeys';
export type { KeymapHotkeyHandlers } from './keymap/useKeymapHotkeys';
