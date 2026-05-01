-- v42: Mark legacy tables as deprecated + create status view
-- The old stages/szenen system is superseded by folgen_dokumente/folgen_dokument_fassungen/dokument_szenen.
-- Old tables are kept for backward compatibility until all episodes are migrated.

COMMENT ON TABLE stages IS 'DEPRECATED: Use folgen_dokument_fassungen instead. Kept for backward compat.';
COMMENT ON TABLE szenen IS 'DEPRECATED: Use dokument_szenen instead. Kept for backward compat.';

-- View: which episodes have old-only data vs. new (dokument_szenen) data vs. both (dual-write)
CREATE OR REPLACE VIEW v_legacy_data_status AS
SELECT
  st.id AS staffel_id,
  st.titel AS staffel,
  e.folge_nummer,
  CASE
    WHEN ds_cnt > 0 AND sz_cnt > 0 THEN 'dual'
    WHEN ds_cnt > 0 THEN 'new_only'
    WHEN sz_cnt > 0 THEN 'legacy_only'
    ELSE 'empty'
  END AS data_status,
  sz_cnt AS legacy_szenen_count,
  ds_cnt AS new_szenen_count,
  stage_cnt AS legacy_stages_count,
  fass_cnt AS new_fassungen_count
FROM staffeln st
CROSS JOIN LATERAL (
  SELECT DISTINCT s.folge_nummer
  FROM stages s WHERE s.staffel_id = st.id
  UNION
  SELECT DISTINCT fd.folge_nummer
  FROM folgen_dokumente fd WHERE fd.staffel_id = st.id
) e
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS sz_cnt
  FROM szenen sz JOIN stages sg ON sg.id = sz.stage_id
  WHERE sg.staffel_id = st.id AND sg.folge_nummer = e.folge_nummer
) sz ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS ds_cnt
  FROM dokument_szenen ds
  JOIN folgen_dokument_fassungen f ON f.id = ds.fassung_id
  JOIN folgen_dokumente d ON d.id = f.dokument_id
  WHERE d.staffel_id = st.id AND d.folge_nummer = e.folge_nummer
) ds ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS stage_cnt
  FROM stages sg WHERE sg.staffel_id = st.id AND sg.folge_nummer = e.folge_nummer
) stg ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS fass_cnt
  FROM folgen_dokument_fassungen f
  JOIN folgen_dokumente d ON d.id = f.dokument_id
  WHERE d.staffel_id = st.id AND d.folge_nummer = e.folge_nummer
) fas ON true
ORDER BY st.id, e.folge_nummer;

-- API endpoint for migration status
-- (consumed by admin panel, no table needed — view is sufficient)
