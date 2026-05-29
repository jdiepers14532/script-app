-- v133: Glossar OFF — Erklaerung erweitern (Details zu O.S. vs. VO vs. NT)
-- OFF war in v98 mit einer Kurzform eingetragen; hier vollständige recherchierte Fassung.

WITH updated AS (
  UPDATE dk_glossar_defaults
  SET erklaerung = 'Person ist physisch im Szenenbild präsent (gleicher Raum, gleiche Zeitebene), aber außerhalb des Kaderrahmens — ihre Stimme ist hörbar, sie selbst nicht sichtbar. Notation im Drehbuch: »(OFF)« nach dem Figurennamen (US-Format: »(O.S.)« = Off-Screen). Klanglich diegetisch: gleiche Raumakustik wie die sichtbaren Figuren, kein Hallraum-Unterschied. Typische Situationen: Gespräch durch eine Tür, Reaktionsschnitt auf Zuhörer während jemand anderes spricht, Figur tritt erst im nächsten Shot ins Bild. Abgrenzung zu VO (Voice Over): VO ist eine übergeordnete Erzählerstimme oder innerer Monolog — die Person ist physisch nicht im Szenenbild und oft nicht Teil der dramatischen Handlung. Abgrenzung zu NT (Nur Ton): bei NT wird die Szene gar nicht gedreht, nur der Ton aufgezeichnet (z. B. Telefonpartner, der nie im Bild erscheint).'
  WHERE kuerzel = 'OFF' AND name = 'Off'
  RETURNING erklaerung
)
UPDATE dk_glossar
SET erklaerung = (SELECT erklaerung FROM updated)
WHERE kuerzel = 'OFF' AND name = 'Off'
  AND erklaerung = 'Stimme einer Person, die hörbar, aber nicht im Bild sichtbar ist.';
