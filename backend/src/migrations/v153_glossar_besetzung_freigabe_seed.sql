-- v153: Glossar — Besetzungs- und Freigabe-Begriffe aus Konzept (Abschnitt 12)
--
-- Neue Kategorie 'besetzung' für Komparsen-Tarif-Stufen, Freigabe-Scopes,
-- interne Begriffe (Fall A/B, DK, Rote Seiten) und Motivbegriff.
--
-- Seeded mit WHERE NOT EXISTS (idempotent): kein Überschreiben bestehender Einträge.

INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, term_en, kategorie, sort_order)
SELECT v.kuerzel, v.name, v.erklaerung, v.term_en, v.kategorie, v.sort_order
FROM (VALUES
  ('SOC',    'SOC (Silent On Camera)',
   'Erscheint im Bild, spricht nicht, kann agieren/reagieren. Entspricht einem Komparsen mit Spiel; eigener Tarifzuschlag (Silent Bit/SOC-Zuschlag). Abgrenzung zu o.T.: SOC hat eine handlungsrelevante Aktion (übergeben, anrempeln, auf Ansprache reagieren), o.T. ist reine Atmosphäre.',
   'SOC – Silent On Camera', 'besetzung', 600),

  ('',       'Silent Bit',
   'Hintergrunddarsteller mit handlungsrelevanter Aktion ohne Sprechtext; Synonym für Komparse mit Spiel / SOC. Eigener Tarifzuschlag.',
   'Silent Bit', 'besetzung', 601),

  ('o.T.',   'Komparse o.T. (ohne Text)',
   'Komparse ohne Sprechtext und ohne handlungsrelevante Aktion — reine Atmosphäre (Passanten, Gäste im Hintergrund). Keine Einzelfreigabe erforderlich; nur Mengenkontrolle (Einsätze pro Motiv pro Block). Tarif: Statist/Komparse-Grundtarif.',
   'Extra / Background actor (no lines)', 'besetzung', 602),

  ('',       'Komparse mit Text',
   'Komparse mit Sprechtext (Dialogue-Node im Drehbuch). Tarif: Kleindarsteller / Edelkomparserie. Freigabepflichtig wie eine Hauptrolle.',
   'Day player / Day performer', 'besetzung', 603),

  ('',       'Komparse mit Spiel',
   'Komparse ohne Sprechtext, aber mit handlungsrelevanter Aktion (Interaktion mit Hauptfigur, gezielte Handlung, die die Szene voranbringt). Tarif: Silent Bit/SOC-Zuschlag. Freigabepflichtig wie eine Rolle.',
   'Silent bit / SOC performer', 'besetzung', 604),

  ('',       'Kleindarsteller / Edelkomparserie',
   'Tarifbezeichnung für Komparse mit Text; gestaffelte Tarifstufen abhängig von Replikenzahl und Produktionstyp (gemäß Allianz Deutscher Produzenten / Gewerkschaftstarifverträgen).',
   'Day player (tariff tier)', 'besetzung', 605),

  ('',       'Statist',
   'Reiner Hintergrunddarsteller ohne Handlungsbezug zur Haupthandlung. Geringere Tarifstufe als Komparse. Abgrenzung: Statist sitzt/steht/läuft ohne Interaktion; Komparse hat Bezug zum Handlungstiming.',
   'Background extra / Atmosphere', 'besetzung', 606),

  ('',       'Einsätze pro Motiv',
   'Zähleinheit für die o.T.-Mengenkontrolle: eine Komparsen-Gruppe zählt als ein Einsatz pro Motiv. Basis für die DK-konfigurierbare Blockobergrenze.',
   'Extras per location', 'besetzung', 607),

  ('Fall A',  'Fall A (Dispo-Freigabe)',
   'Intern: Freigabe-Scope für Cast-Änderungen und neue Szenen nach dem Lock (Dispo/Logistik). Granularität: pro Szene (scene_identity_id). Genehmiger: Drehplanung/Aufnahmeleitung.',
   'Case A – Scheduling approval', 'besetzung', 608),

  ('Fall B',  'Fall B (Budget-Freigabe)',
   'Intern: Freigabe-Scope für neue Rollen/Motive, die noch nicht in der Datenbank existieren (Budget/Inhalt). Granularität: pro Rolle/Motiv und Produktion. Genehmiger: Herstellungs-/Produktionsleitung.',
   'Case B – Budget approval', 'besetzung', 609),

  ('DK',     'DK (Drehbuchkoordination)',
   'Konfigurierende Genehmiger-Rolle in der Script-App mit Zugriff auf DK-Settings: Genehmiger-Konfiguration, Glossar, Lock-Trigger, Berechtigung für Rollen-/Motivanlage. Ausgeschriebene Bezeichnung gemäß Hauskonvention eintragen.',
   'Script coordination', 'besetzung', 610),

  ('',       'Rote Seiten',
   'Hauseigener Begriff für veröffentlichte Revision nach dem Lock — Drehbuchseiten, die sich gegenüber dem gesperrten Stand geändert haben. Farbcode und Sequenz in DK-Settings konfigurierbar. Hinweis: »Rot« hat drei Bedeutungen — Editor-Statusfarbe (abgelehnt), Rote Seite (Revision) und kein WGA-Standard-Revisionsfarbcode.',
   'Revised pages (in-house term)', 'besetzung', 611),

  ('',       'Fassungslabel',
   'Benannte Drehbuch-Fassung (z. B. »Erstfassung«, »Abgabefassung«), die in den DK-Settings als Lock-Trigger konfiguriert werden kann.',
   'Draft label / Script version label', 'besetzung', 612),

  ('',       'Motiv (Drehort)',
   'Eigenständige Entität in der Script-App: ein Drehort, der als Kostenfaktor relevant ist (Motivvertrag = Sachnutzung §535 BGB). Neue Motive sind — wenn in DK-Settings aktiviert — freigabepflichtig wie neue Rollen (Budget-Scope).',
   'Location / Set', 'besetzung', 613)
) AS v(kuerzel, name, erklaerung, term_en, kategorie, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM dk_glossar_defaults d
  WHERE d.name = v.name AND d.kategorie = v.kategorie
);
