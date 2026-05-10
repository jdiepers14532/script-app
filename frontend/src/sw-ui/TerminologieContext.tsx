import React, { createContext, useContext, ReactNode } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TermKey = 'szene' | 'motiv' | 'staffel' | 'stab' | 'darsteller' | 'komparse' | 'episode';

export interface TermForms {
  /** Singular: "Szene", "Bild" */
  s: string;
  /** Plural: "Szenen", "Bilder" */
  p: string;
  /** Compound prefix: "Szenen" (fuer "Szenen-Kuerzel", "Szenenkopf") */
  c: string;
}

/** Speichert pro Key den gewaehlten Options-Namen (z.B. { szene: 'Szene', motiv: 'Set' }) */
export type TerminologieConfig = Record<TermKey, string>;

// ── Options ───────────────────────────────────────────────────────────────────

export const TERM_OPTIONS: Record<TermKey, Record<string, TermForms>> = {
  szene: {
    'Szene': { s: 'Szene', p: 'Szenen', c: 'Szenen' },
    'Bild':  { s: 'Bild',  p: 'Bilder', c: 'Bild' },
  },
  motiv: {
    'Motiv': { s: 'Motiv', p: 'Motive',  c: 'Motiv' },
    'Set':   { s: 'Set',   p: 'Sets',    c: 'Set' },
  },
  staffel: {
    'Staffel': { s: 'Staffel', p: 'Staffeln', c: 'Staffel' },
    'Season':  { s: 'Season',  p: 'Seasons',  c: 'Season' },
  },
  stab: {
    'Stab': { s: 'Stab', p: 'Stab', c: 'Stab' },
    'Team': { s: 'Team', p: 'Teams', c: 'Team' },
    'Crew': { s: 'Crew', p: 'Crews', c: 'Crew' },
  },
  darsteller: {
    'Darsteller':   { s: 'Darsteller',   p: 'Darsteller',   c: 'Darsteller' },
    'Schauspieler': { s: 'Schauspieler', p: 'Schauspieler', c: 'Schauspieler' },
    'Cast':         { s: 'Cast',         p: 'Cast',         c: 'Cast' },
  },
  komparse: {
    'Komparse': { s: 'Komparse', p: 'Komparsen', c: 'Komparsen' },
    'Statist':  { s: 'Statist',  p: 'Statisten', c: 'Statisten' },
  },
  episode: {
    'Folge':   { s: 'Folge',   p: 'Folgen',   c: 'Folgen' },
    'Episode': { s: 'Episode', p: 'Episoden', c: 'Episoden' },
  },
};

export const TERM_DEFAULTS: TerminologieConfig = {
  szene: 'Szene',
  motiv: 'Motiv',
  staffel: 'Staffel',
  stab: 'Stab',
  darsteller: 'Darsteller',
  komparse: 'Komparse',
  episode: 'Folge',
};

export const TERM_KEYS: TermKey[] = ['szene', 'motiv', 'staffel', 'stab', 'darsteller', 'komparse', 'episode'];

export const TERM_LABELS: Record<TermKey, string> = {
  szene: 'Szene / Bild',
  motiv: 'Motiv / Set',
  staffel: 'Staffel / Season',
  stab: 'Stab / Team / Crew',
  darsteller: 'Darsteller / Schauspieler / Cast',
  komparse: 'Komparse / Statist',
  episode: 'Episode / Folge',
};

// ── Resolver ──────────────────────────────────────────────────────────────────

function resolve(config: TerminologieConfig, key: TermKey, form: 's' | 'p' | 'c'): string {
  const selected = config[key];
  const options = TERM_OPTIONS[key];
  const forms = options[selected] ?? Object.values(options)[0];
  return forms[form];
}

// ── Context ───────────────────────────────────────────────────────────────────

interface TerminologieContextValue {
  config: TerminologieConfig;
  /** t('szene') → "Szene", t('szene', 'p') → "Szenen", t('szene', 'c') → "Szenen" */
  t: (key: TermKey, form?: 's' | 'p' | 'c') => string;
}

const TerminologieContext = createContext<TerminologieContextValue>({
  config: TERM_DEFAULTS,
  t: (key, form = 's') => resolve(TERM_DEFAULTS, key, form),
});

export function useTerminologie() {
  return useContext(TerminologieContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export interface TerminologieProviderProps {
  config: TerminologieConfig;
  children: ReactNode;
}

export function TerminologieProvider({ config, children }: TerminologieProviderProps) {
  const t = (key: TermKey, form: 's' | 'p' | 'c' = 's') => resolve(config, key, form);

  return (
    <TerminologieContext.Provider value={{ config, t }}>
      {children}
    </TerminologieContext.Provider>
  );
}
