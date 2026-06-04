-- v191: Glossar — SL (Storyline/Treatment) und DB (Drehbuch/Dialogbuch) Abkürzungen
--
-- SL = Storyline (auch: Treatment, Outline) — Yamdu-Export-Format
-- DB = Drehbuch (auch: Dialogbuch) — Final-Draft-Format und Produktionsbezeichnung
--
-- Beide Abkürzungen werden in dk_glossar_defaults eingefügt und in vorhandene
-- Produktionskopien propagiert (nur wenn der Eintrag dort noch fehlt).

-- ── 1. SL (Storyline / Treatment / Outline) ──────────────────────────────────
INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, erklaerung_lang, quellen, term_en, kategorie, sort_order)
SELECT
  'SL',
  'Storyline',
  'Kurzbezeichnung für eine Storyline, Treatment oder Outline. Im Yamdu-Produktionsmanagement-System steht SL für den exportierten Storyline-Datensatz einer Folge — die narrative Grundlage vor dem ausformulierten Dialogbuch.',
  $LANG$## Kernbedeutung

SL ist die Abkürzung für **Storyline** und bezeichnet in der Serienwerft-Produktionspraxis das Yamdu-Exportformat für vorbereitende Dramaturgie-Dokumente. Es umfasst alle Dokumenttypen, die der eigentlichen Drehbuchfassung vorausgehen:

- **Storyline** — Szenen-für-Szenen-Handlungsübersicht mit Oneliner und Charakteren
- **Treatment** — Ausformulierte Szenenentwicklung (prosaisch, noch kein Dialog)
- **Outline** — Strukturierter Handlungsplan (meist Block- oder Folgenebene)

## Abgrenzung zu DB

| SL | DB |
|----|-----|
| Storyline / Treatment / Outline | Drehbuch / Dialogbuch |
| Yamdu-Export | Final Draft / PDF |
| Narrativ beschreibend | Szenenköpfe + vollständige Dialoge |
| Dramaturgische Vorstufe | Produktionsdokument |

## Dateiformat in der Script-App

PDF-Importe aus Yamdu tragen typischerweise den Dateinamen-Präfix `Treatment - Rote Rosen Staffel NN - Episode NNNN`. Die Script-App erkennt dieses Format automatisch und weist den Stage-Type **Treatment** zu.

## Block-SL

Ein Block-SL (z. B. `RR_SL_893 - Block 893`) enthält mehrere Folgen in einem Dokument. Die Script-App importiert jede Folge als separate Werkstufe.$LANG$,
  '',
  'Storyline / Treatment / Outline',
  'kuerzel',
  155
WHERE NOT EXISTS (
  SELECT 1 FROM dk_glossar_defaults WHERE kuerzel = 'SL' AND name = 'Storyline'
);

-- ── 2. DB (Drehbuch / Dialogbuch) ────────────────────────────────────────────
INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, erklaerung_lang, quellen, term_en, kategorie, sort_order)
SELECT
  'DB',
  'Drehbuch',
  'Kurzbezeichnung für Drehbuch oder Dialogbuch. Im Produktionskontext bezeichnet DB das ausformulierte Skript mit vollständigen Dialogen und Regieanweisungen — die endgültige Arbeitsgrundlage für Regie, Schauspieler und Crew.',
  $LANG$## Kernbedeutung

DB ist die Abkürzung für **Drehbuch** (auch: **Dialogbuch**) und bezeichnet in der Serienwerft-Produktionspraxis das ausformulierte Produktionsskript. Es folgt auf die Storyline-Phase (SL) und enthält:

- Szenenköpfe mit INT/EXT, Ort, Tageszeit
- Vollständige Dialoge aller Rollen
- Regieanweisungen und Spielhinweise
- Komparsenangaben und technische Hinweise

## Abgrenzung zu SL

| DB | SL |
|----|-----|
| Drehbuch / Dialogbuch | Storyline / Treatment / Outline |
| Final Draft / PDF | Yamdu-Export |
| Szenenköpfe + vollständige Dialoge | Narrativ beschreibend |
| Produktionsdokument | Dramaturgische Vorstufe |

## Versionen

In der Script-App hat ein Drehbuch mehrere Fassungen (Werkstufen):
- **Draft** — erste Drehbuchfassung nach dem Treatment
- **Final** — abgenommene Endfassung vor dem Dreh
- Zwischen Draft und Final können beliebig viele Zwischenfassungen entstehen.

## Dateiformat

Rote-Rosen-Drehbücher werden als Final-Draft-Datei (`.fdx`) oder PDF exportiert. Beide Formate werden von der Script-App importiert und einander zugewiesen.$LANG$,
  '',
  'Script / Screenplay',
  'kuerzel',
  156
WHERE NOT EXISTS (
  SELECT 1 FROM dk_glossar_defaults WHERE kuerzel = 'DB' AND name = 'Drehbuch'
);

-- ── 3. Propagation in bestehende Produktionskopien ───────────────────────────
-- SL: nur in Produktionen eintragen, in denen dieser Eintrag noch fehlt
INSERT INTO dk_glossar (production_id, kuerzel, name, erklaerung, erklaerung_lang, quellen, term_en, kategorie, sort_order)
SELECT DISTINCT
  g_existing.production_id,
  d.kuerzel, d.name, d.erklaerung, d.erklaerung_lang, d.quellen, d.term_en, d.kategorie, d.sort_order
FROM dk_glossar_defaults d
CROSS JOIN (SELECT DISTINCT production_id FROM dk_glossar) g_existing
WHERE d.kuerzel = 'SL' AND d.name = 'Storyline'
  AND NOT EXISTS (
    SELECT 1 FROM dk_glossar g
    WHERE g.production_id = g_existing.production_id
      AND g.kuerzel = 'SL' AND g.name = 'Storyline'
  );

-- DB: nur in Produktionen eintragen, in denen dieser Eintrag noch fehlt
INSERT INTO dk_glossar (production_id, kuerzel, name, erklaerung, erklaerung_lang, quellen, term_en, kategorie, sort_order)
SELECT DISTINCT
  g_existing.production_id,
  d.kuerzel, d.name, d.erklaerung, d.erklaerung_lang, d.quellen, d.term_en, d.kategorie, d.sort_order
FROM dk_glossar_defaults d
CROSS JOIN (SELECT DISTINCT production_id FROM dk_glossar) g_existing
WHERE d.kuerzel = 'DB' AND d.name = 'Drehbuch'
  AND NOT EXISTS (
    SELECT 1 FROM dk_glossar g
    WHERE g.production_id = g_existing.production_id
      AND g.kuerzel = 'DB' AND g.name = 'Drehbuch'
  );
