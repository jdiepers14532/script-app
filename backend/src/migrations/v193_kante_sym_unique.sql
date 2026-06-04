-- v193: charakter_beziehungen — normalisierter Unique-Index für symmetrische Typen
-- Verhindert A→B / B→A Dubletten für Typen mit gerichtet=false.
-- Gerichtete Typen (familie_eltern_kind, antagonismus, einseitige_liebe) sind
-- vom WHERE ausgenommen und bleiben richtungsabhängig.

CREATE UNIQUE INDEX IF NOT EXISTS uq_kante_sym ON charakter_beziehungen (
  LEAST(character_id::text, related_character_id::text),
  GREATEST(character_id::text, related_character_id::text),
  beziehungstyp,
  gueltig_ab_staffel
) WHERE beziehungstyp IN (
  'beruflich', 'familie_geschwister', 'familie_sonstige',
  'affaere', 'ehe', 'ex', 'liebe', 'bekanntschaft', 'freundschaft'
);
