// Shared constants used by AppShell + AnsichtsModal — in a separate file to avoid circular imports

export interface BgPalette {
  name: string
  preview: string
  bg: string
  surface: string
  subtle: string
  active: string
  hover: string
  border: string
  borderSubtle: string
}

export interface FontOption {
  name: string
  value: string
}

export const LIGHT_PALETTES: BgPalette[] = [
  { name: 'Standard',        preview: '#FFFFFF', bg: '#FFFFFF', surface: '#FFFFFF', subtle: '#F5F5F5', active: '#F5F5F5', hover: '#EDEDED', border: '#E0E0E0', borderSubtle: '#EEEEEE' },
  { name: 'Cold Steel 2',    preview: '#FFFAFA', bg: '#FFFAFA', surface: '#FFFAFA', subtle: '#F5F0F0', active: '#EDE9E9', hover: '#F2EEEE', border: '#DEDADA', borderSubtle: '#F0EBEB' },
  { name: 'Pearl',           preview: '#FCFCF7', bg: '#FCFCF7', surface: '#FCFCF7', subtle: '#F2F2ED', active: '#EAEAE6', hover: '#EFEFEB', border: '#DBDBD7', borderSubtle: '#EDEDE8' },
  { name: 'Naturweiß',       preview: '#FCFCFA', bg: '#FCFCFA', surface: '#FCFCFA', subtle: '#F4F4F2', active: '#EEEEED', hover: '#E8E8E6', border: '#DCDCDA', borderSubtle: '#EBEBEA' },
  { name: 'Warm-Weiß',       preview: '#FAFAF8', bg: '#FAFAF8', surface: '#FAFAF8', subtle: '#F2F1EF', active: '#ECEAE6', hover: '#E5E3DF', border: '#DDDBD7', borderSubtle: '#E9E7E3' },
  { name: 'Cold Steel',      preview: '#F8F7F4', bg: '#F8F7F4', surface: '#F8F7F4', subtle: '#EEEDEA', active: '#E7E6E3', hover: '#ECEBE8', border: '#D8D7D4', borderSubtle: '#E9E8E5' },
  { name: 'Marble',          preview: '#F2F8FC', bg: '#F2F8FC', surface: '#F2F8FC', subtle: '#E8EEF2', active: '#E1E7EA', hover: '#E6ECEF', border: '#D3D8DB', borderSubtle: '#E4E9ED' },
  { name: 'Lavender',        preview: '#F4F1F8', bg: '#F4F1F8', surface: '#F4F1F8', subtle: '#EAE7EE', active: '#E3E0E7', hover: '#E8E5EC', border: '#D4D2D8', borderSubtle: '#E5E3E9' },
  { name: 'Kreidefels-Weiß', preview: '#F2EFED', bg: '#F2EFED', surface: '#F2EFED', subtle: '#E8E5E4', active: '#E1DEDC', hover: '#E6E3E1', border: '#D3D0CE', borderSubtle: '#E4E1DF' },
  { name: 'Pergament',       preview: '#F5F0E8', bg: '#F5F0E8', surface: '#F5F0E8', subtle: '#ECE7DF', active: '#E0DAD0', hover: '#D5CFC5', border: '#C0BAAE', borderSubtle: '#E5E0D8' },
  { name: 'Warmes Beige',    preview: '#F0EBE0', bg: '#F0EBE0', surface: '#F0EBE0', subtle: '#E5E0D5', active: '#DAD4C8', hover: '#CFCABB', border: '#B8B2A5', borderSubtle: '#DDD8CC' },
]

export const DARK_PALETTES: BgPalette[] = [
  { name: 'Near-Black',      preview: '#0D0D0D', bg: '#0D0D0D', surface: '#141414', subtle: '#1A1A1A', active: '#1F1F1F', hover: '#262626', border: '#2A2A2A', borderSubtle: '#1F1F1F' },
  { name: 'VS Code',         preview: '#1E1E1E', bg: '#1E1E1E', surface: '#252526', subtle: '#2D2D2D', active: '#37373D', hover: '#3E3E3E', border: '#3F3F3F', borderSubtle: '#2D2D2D' },
  { name: 'Slides',          preview: '#222022', bg: '#222022', surface: '#2A282A', subtle: '#323032', active: '#383638', hover: '#3C3A3C', border: '#454345', borderSubtle: '#343234' },
  { name: 'Charcoal Stone',  preview: '#2F2F33', bg: '#2F2F33', surface: '#37373B', subtle: '#3F3F43', active: '#454549', hover: '#49494D', border: '#525256', borderSubtle: '#414145' },
  { name: 'Deep Charcoal',   preview: '#2D3436', bg: '#2D3436', surface: '#353C3E', subtle: '#3D4446', active: '#434A4C', hover: '#474E50', border: '#505759', borderSubtle: '#3F4648' },
  { name: 'Silbergrau',      preview: '#3C3C3C', bg: '#3C3C3C', surface: '#444444', subtle: '#4C4C4C', active: '#535353', hover: '#555555', border: '#626262', borderSubtle: '#4E4E4E' },
  { name: 'Slate Grey',      preview: '#4A4A4A', bg: '#4A4A4A', surface: '#525252', subtle: '#5A5A5A', active: '#606060', hover: '#646464', border: '#6D6D6D', borderSubtle: '#5C5C5C' },
]

export const INTERFACE_FONTS: FontOption[] = [
  { name: 'Inter (Standard)',      value: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { name: 'System UI',             value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { name: 'Atkinson Hyperlegible', value: "'Atkinson Hyperlegible', sans-serif" },
  { name: 'Nunito',                value: "'Nunito', sans-serif" },
]

export const SCRIPT_FONTS: FontOption[] = [
  { name: 'Courier Prime (Standard)', value: "'Courier Prime', 'Courier New', Courier, monospace" },
  { name: 'Source Code Pro',          value: "'Source Code Pro', 'Courier New', monospace" },
  { name: 'Inconsolata',              value: "'Inconsolata', 'Courier New', monospace" },
  { name: 'JetBrains Mono',           value: "'JetBrains Mono', 'Courier New', monospace" },
]

export const FONT_SIZES = [11, 12, 13, 14, 15, 16]
export const INTERFACE_FONT_SIZES = [11, 12, 13, 14, 15, 16]
export const CUSTOM_IDX = 99  // sentinel: eigene Farbe gewählt

// ── Farbschemata ─────────────────────────────────────────────────────────────
// Steuern nur die 5 Brand-Akzentfarben (--sw-*).
// Unabhängig von Theme (hell/dunkel) und Hintergrundfarbe.

export interface ColorScheme {
  id: string
  name: string
  colors: {
    green: string      // --sw-green  (Aktion / Erfolg)
    info: string       // --sw-info   (Info / Link)
    danger: string     // --sw-danger (Fehler)
    warning: string    // --sw-warning (Warnung)
    warningAlt: string // --sw-warning-alt (Orange)
  }
  isBuiltin?: true
}

export const BUILTIN_COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'default',
    name: 'Serienwerft Standard',
    isBuiltin: true,
    colors: { green: '#00C853', info: '#007AFF', danger: '#FF3B30', warning: '#FFCC00', warningAlt: '#FF9500' },
  },
  {
    id: 'ozean',
    name: 'Ozean',
    isBuiltin: true,
    colors: { green: '#00BCD4', info: '#1565C0', danger: '#E53935', warning: '#FFA726', warningAlt: '#FF7043' },
  },
  {
    id: 'violett',
    name: 'Violett & Türkis',
    isBuiltin: true,
    colors: { green: '#00E5CC', info: '#7C4DFF', danger: '#FF1744', warning: '#FFD740', warningAlt: '#FF6D00' },
  },
  {
    id: 'bernstein',
    name: 'Bernstein',
    isBuiltin: true,
    colors: { green: '#FFB300', info: '#546E7A', danger: '#D32F2F', warning: '#FFF176', warningAlt: '#FF6F00' },
  },
  {
    id: 'nacht',
    name: 'Nacht-Grün',
    isBuiltin: true,
    colors: { green: '#69F0AE', info: '#82B1FF', danger: '#FF5252', warning: '#FFD740', warningAlt: '#FF6D00' },
  },
]

/** localStorage-Key für benutzerdefinierte Farbschemata */
export const CUSTOM_SCHEMES_KEY = 'script-color-schemes-v1'

export function loadCustomSchemes(): ColorScheme[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_SCHEMES_KEY) || '[]') }
  catch { return [] }
}

export function saveCustomSchemes(schemes: ColorScheme[]): void {
  localStorage.setItem(CUSTOM_SCHEMES_KEY, JSON.stringify(schemes))
}

export function resolveColorScheme(id: string): ColorScheme {
  const all = [...BUILTIN_COLOR_SCHEMES, ...loadCustomSchemes()]
  return all.find(s => s.id === id) ?? BUILTIN_COLOR_SCHEMES[0]
}
