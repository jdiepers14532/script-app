export type EnvKey = 'd_i' | 'd_e' | 'd_ie' | 'evening_i' | 'n_i' | 'n_e' | 'n_ie';
export type DayTime = 'TAG' | 'ABEND' | 'NACHT';
export type IntExt = 'INT' | 'EXT' | 'INT/EXT';

export interface EnvColor {
  bg: string;
  stripe: string;
  textDark?: boolean;
}

// Industry-standard colors (Movie Magic Scheduling) — Light
export const DEFAULT_ENV_COLORS: Record<EnvKey, EnvColor> = {
  d_i:      { bg: '#FFFFFF',  stripe: '#9E9E9E' },                    // INT/Tag = Weiss
  d_e:      { bg: '#FFF9C4',  stripe: '#F9A825' },                    // EXT/Tag = Gelb
  d_ie:     { bg: '#FCE4EC',  stripe: '#E91E63' },                    // INT+EXT/Tag = Pink
  evening_i:{ bg: '#E8EAF6',  stripe: '#5C6BC0' },                    // INT/Abend = Lavendel
  n_i:      { bg: '#BBDEFB',  stripe: '#1976D2' },                    // INT/Nacht = Blau
  n_e:      { bg: '#C8E6C9',  stripe: '#388E3C' },                    // EXT/Nacht = Gruen
  n_ie:     { bg: '#FFE0B2',  stripe: '#F57C00' },                    // INT+EXT/Nacht = Orange
};

// Dark-mode equivalents — low-saturation, low-brightness
export const DEFAULT_ENV_COLORS_DARK: Record<EnvKey, EnvColor> = {
  d_i:      { bg: '#1A1A1A',  stripe: '#616161' },                    // INT/Tag = Neutral dunkel
  d_e:      { bg: '#2A2510',  stripe: '#C89100' },                    // EXT/Tag = Gelb dunkel
  d_ie:     { bg: '#2A1520',  stripe: '#C2185B' },                    // INT+EXT/Tag = Pink dunkel
  evening_i:{ bg: '#1A1A2E',  stripe: '#7986CB' },                    // INT/Abend = Lavendel dunkel
  n_i:      { bg: '#0D1B2A',  stripe: '#42A5F5' },                    // INT/Nacht = Blau dunkel
  n_e:      { bg: '#0D2818',  stripe: '#66BB6A' },                    // EXT/Nacht = Gruen dunkel
  n_ie:     { bg: '#2A1A0D',  stripe: '#FF9800' },                    // INT+EXT/Nacht = Orange dunkel
};

export let ENV_COLORS: Record<EnvKey, EnvColor> = { ...DEFAULT_ENV_COLORS };
export let ENV_COLORS_DARK: Record<EnvKey, EnvColor> = { ...DEFAULT_ENV_COLORS_DARK };

export function setEnvColors(custom: Partial<Record<EnvKey, Partial<EnvColor>>>) {
  const merged = { ...DEFAULT_ENV_COLORS }
  for (const key of Object.keys(custom) as EnvKey[]) {
    if (merged[key]) {
      merged[key] = { ...merged[key], ...custom[key] }
    }
  }
  ENV_COLORS = merged
}

export function setEnvColorsDark(custom: Partial<Record<EnvKey, Partial<EnvColor>>>) {
  const merged = { ...DEFAULT_ENV_COLORS_DARK }
  for (const key of Object.keys(custom) as EnvKey[]) {
    if (merged[key]) {
      merged[key] = { ...merged[key], ...custom[key] }
    }
  }
  ENV_COLORS_DARK = merged
}

export function resetEnvColors() {
  ENV_COLORS = { ...DEFAULT_ENV_COLORS }
  ENV_COLORS_DARK = { ...DEFAULT_ENV_COLORS_DARK }
}

export interface SceneComment {
  total: number;
  unread: number;
}

export interface Scene {
  id: number;
  nummer: string;
  intExt: IntExt;
  motiv: string;
  tageszeit: DayTime;
  env: EnvKey;
  stageNr: string;
  seiten: string;
  dauer: string;
  folge: number;
  locked?: boolean;
  contract?: boolean;
  comments?: SceneComment;
  synopsis?: string;
}

export const SCENES: Scene[] = [
  {
    id: 1,
    nummer: '1',
    intExt: 'INT',
    motiv: 'CAFÉ ROSA – THEKE',
    tageszeit: 'TAG',
    env: 'd_i',
    stageNr: 'ST 2',
    seiten: '1 2/8',
    dauer: '1:10',
    folge: 4512,
    comments: { total: 2, unread: 0 },
  },
  {
    id: 2,
    nummer: '2',
    intExt: 'EXT',
    motiv: 'RATHAUSPLATZ',
    tageszeit: 'TAG',
    env: 'd_e',
    stageNr: 'ST 1',
    seiten: '0 4/8',
    dauer: '0:30',
    folge: 4512,
    locked: true,
    contract: true,
    comments: { total: 1, unread: 0 },
  },
  {
    id: 3,
    nummer: '3',
    intExt: 'INT',
    motiv: 'BÜRO WOLFSBERG',
    tageszeit: 'TAG',
    env: 'd_i',
    stageNr: 'ST 4',
    seiten: '2 0/8',
    dauer: '1:35',
    folge: 4512,
    locked: true,
    contract: false,
    comments: { total: 4, unread: 2 },
  },
  {
    id: 4,
    nummer: '4',
    intExt: 'EXT',
    motiv: 'SCHLOSSPARK',
    tageszeit: 'TAG',
    env: 'd_e',
    stageNr: 'ST 1',
    seiten: '1 0/8',
    dauer: '0:50',
    folge: 4512,
    comments: { total: 0, unread: 0 },
  },
  {
    id: 5,
    nummer: '5',
    intExt: 'INT',
    motiv: 'KÜCHE ROSEN',
    tageszeit: 'ABEND',
    env: 'evening_i',
    stageNr: 'ST 2',
    seiten: '0 6/8',
    dauer: '0:45',
    folge: 4512,
    comments: { total: 1, unread: 1 },
  },
  {
    id: 6,
    nummer: '6',
    intExt: 'INT',
    motiv: 'WOHNZIMMER WOLFSBERG',
    tageszeit: 'NACHT',
    env: 'n_i',
    stageNr: 'ST 3',
    seiten: '1 4/8',
    dauer: '1:15',
    folge: 4512,
    comments: { total: 3, unread: 0 },
  },
  {
    id: 7,
    nummer: '7',
    intExt: 'INT',
    motiv: 'SCHLAFZIMMER – DIE LANGE NACHT',
    tageszeit: 'NACHT',
    env: 'n_i',
    stageNr: 'ST 3',
    seiten: '0 6/8',
    dauer: '0:35',
    folge: 4512,
    locked: true,
    contract: false,
    comments: { total: 3, unread: 1 },
    synopsis: 'Eva kann nicht schlafen. Sie steht auf, schleicht in die Küche. Jonas folgt ihr. Ein Gespräch, das alles verändern wird.',
  },
  {
    id: 8,
    nummer: '8',
    intExt: 'EXT',
    motiv: 'GARTENTEICH – NACHT',
    tageszeit: 'NACHT',
    env: 'n_e',
    stageNr: 'ST 1',
    seiten: '1 2/8',
    dauer: '1:00',
    folge: 4512,
    comments: { total: 0, unread: 0 },
  },
  {
    id: 9,
    nummer: '9',
    intExt: 'INT/EXT',
    motiv: 'AUTO – FAHRT',
    tageszeit: 'NACHT',
    env: 'n_ie',
    stageNr: 'ST 5',
    seiten: '0 4/8',
    dauer: '0:25',
    folge: 4512,
    comments: { total: 2, unread: 0 },
  },
  {
    id: 10,
    nummer: '10',
    intExt: 'EXT',
    motiv: 'HAFEN',
    tageszeit: 'TAG',
    env: 'd_e',
    stageNr: 'ST 1',
    seiten: '1 6/8',
    dauer: '1:25',
    folge: 4512,
    comments: { total: 0, unread: 0 },
  },
  {
    id: 11,
    nummer: '11',
    intExt: 'INT/EXT',
    motiv: 'TERASSE CAFÉ ROSA',
    tageszeit: 'TAG',
    env: 'd_ie',
    stageNr: 'ST 2',
    seiten: '0 5/8',
    dauer: '0:40',
    folge: 4512,
    comments: { total: 1, unread: 0 },
  },
  {
    id: 12,
    nummer: '12',
    intExt: 'INT',
    motiv: 'KRANKENHAUS – FLUR',
    tageszeit: 'TAG',
    env: 'd_i',
    stageNr: 'ST 6',
    seiten: '2 2/8',
    dauer: '1:50',
    folge: 4512,
    locked: true,
    contract: true,
    comments: { total: 5, unread: 3 },
  },
];

export interface BreakdownCategory {
  id: string;
  name: string;
  color: string;
  count: number;
}

export const BREAKDOWN_CATEGORIES: BreakdownCategory[] = [
  { id: 'rollen',      name: 'Rollen',           color: '#007AFF', count: 8  },
  { id: 'komparsen',   name: 'Komparsen',         color: '#5856D6', count: 12 },
  { id: 'kostuem',     name: 'Kostüm',            color: '#FF2D55', count: 6  },
  { id: 'maske',       name: 'Maskenbild',        color: '#FF6B6B', count: 3  },
  { id: 'bauten',      name: 'Bauten',            color: '#34C759', count: 2  },
  { id: 'ausstattung', name: 'Ausstattung',       color: '#30B950', count: 14 },
  { id: 'requisiten',  name: 'Kleinrequisiten',   color: '#FF9500', count: 23 },
  { id: 'grafiken',    name: 'Grafiken',          color: '#FFCC00', count: 4  },
  { id: 'fahrzeuge',   name: 'Fahrzeuge',         color: '#8B7355', count: 2  },
  { id: 'tiere',       name: 'Tiere',             color: '#4CAF50', count: 1  },
  { id: 'vfx',         name: 'Visuelle Effekte',  color: '#00BCD4', count: 0  },
  { id: 'sfx',         name: 'Spezialeffekte',    color: '#9C27B0', count: 1  },
  { id: 'ton',         name: 'Ton',               color: '#607D8B', count: 3  },
  { id: 'kamera',      name: 'Kamera & Licht',    color: '#455A64', count: 5  },
  { id: 'stunts',      name: 'Stunts',            color: '#FF3B30', count: 0  },
  { id: 'sonstiges',   name: 'Sonstiges',         color: '#9E9E9E', count: 7  },
];
