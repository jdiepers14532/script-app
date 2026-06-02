-- v169: Glossar — Wechselschnitt erweitert + verwandte Schnitttermini
--
-- 1. WS-Erklaerung in dk_glossar_defaults erweitern (Einsatzfaelle, Notation, Abgrenzung)
-- 2. Erweiterung in bestehende Produktionskopien propagieren (nur wenn unveraendert)
-- 3. Neue Eintraege: Parallelmontage, Rueckblende (RB), Traumszene/Vision, Insert
--    — alle idempotent via WHERE NOT EXISTS

-- ── 1. WS-Default aktualisieren ─────────────────────────────────────────────
UPDATE dk_glossar_defaults
SET erklaerung = 'Zwei parallele Handlungslinien an verschiedenen Orten werden abwechselnd gegeneinander geschnitten; die Zeit laeuft fuer beide Linien simultan ab. Typische Einsatzfaelle in Daily Soaps: Telefongespraech (beide Gespraechspartner sichtbar → 2W), Verfolgungsjagd (Verfolger ↔ Verfolgter), Spannungsaufbau (Taeter naehert sich ↔ Opfer ahnt nichts), parallele Beziehungsdynamiken (zwei Paare in derselben Nacht), zeitraffende Montage (zwei Parteien bereiten sich auf dasselbe Ereignis vor). Notation im Skript: »WECHSELSCHNITT:« am Beginn, »ENDE WECHSELSCHNITT« am Schluss des Blocks. Unterformen: 2W-Telefonat, Split-Screen (beide Bilder gleichzeitig sichtbar). Abgrenzung: 1W = nur eine Seite sichtbar; Split-Screen = kein Schnitt, Bildteilung; Rueckblende (RB) = zeitversetzt (Vergangenheit), nicht simultan; Insert = kurzer Detailschnitt ohne eigene Handlungslinie. Filmwiss. Oberbegriff: Parallelmontage.'
WHERE kuerzel = 'WS'
  AND name = 'Wechselschnitt';

-- ── 2. Propagierung in Produktionskopien (nur unveraenderter Altstand) ───────
UPDATE dk_glossar g
SET erklaerung = d.erklaerung
FROM dk_glossar_defaults d
WHERE g.kuerzel = 'WS'
  AND g.name    = 'Wechselschnitt'
  AND g.erklaerung = 'Zwei parallele Szenen werden abwechselnd gegeneinander geschnitten.'
  AND d.kuerzel = 'WS'
  AND d.name    = 'Wechselschnitt';

-- ── 3. Neue Eintraege (idempotent) ───────────────────────────────────────────
INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, term_en, kategorie, sort_order)
SELECT v.kuerzel, v.name, v.erklaerung, v.term_en, v.kategorie, v.sort_order
FROM (VALUES

  -- Parallelmontage — filmwissenschaftlicher Oberbegriff fuer WS
  ('', 'Parallelmontage',
   'Filmwissenschaftlicher Oberbegriff fuer die Technik, zwei oder mehr gleichzeitige Handlungslinien abwechselnd zu zeigen. Im deutschen Produktionsalltag als Wechselschnitt (WS) bekannt; Parallelmontage ist der akademisch-theoretische Terminus (Montage-Theorie, Eisenstein/Griffith). Abgrenzung: Im Drehbuch wird stets WS notiert, nie Parallelmontage — dieser Begriff erscheint nur in Dramaturgie-Gespraechen und Exposees.',
   'Cross-cutting / Parallel editing', 'format_produktion', 430),

  -- Rueckblende (RB) — zeitversetzt, kein WS
  ('RB', 'Rueckblende',
   'Szene, die zeitlich vor der aktuellen Handlung spielt (Vergangenheit). Abgrenzung zum Wechselschnitt (WS): WS = zwei raeumlich getrennte Linien, aber zeitlich simultan; RB = eine Linie, zeitlich versetzt in die Vergangenheit. Notation: »RUECKBLENDE:« / »ENDE RUECKBLENDE«. Varianten: Kurz-Rueckblende (1-2 Szenen), Extended Flashback (ganzer Akt). Erkennungsmuster im Skript: Sonderkennzeichnung am Szenenende der vorangehenden Szene oder Slugline-Zusatz (FRUEHERER ZEITPUNKT). In der Script-App als Sondertyp »rueckblende« auf dokument_szenen ausgewiesen.',
   'Flashback', 'kuerzel', 50),

  -- Traumszene / Vision — subjektiv, kein WS
  ('', 'Traumszene / Vision',
   'Szene, die nicht die objektive Realitaet der Handlung zeigt, sondern die subjektive Innenwelt einer Figur (Traum, Halluzination, Fantasie, Vision, Erinnerungsbild). Abgrenzung zum WS: WS zeigt zwei gleichzeitige, reale Handlungslinen; Traumszene ist subjektiv gefaerbt und ausserhalb des Erzaehl-Jetzt. Haeufige Erkennungsmerkmale im Skript: »TRAUM:« / »ENDE TRAUM«, Regieanweisung »verschwommen«, »zeitlupenhaft« oder expliziter Bewusstseinsuebergang. In der Script-App als Sondertyp »vision« auf dokument_szenen ausgewiesen.',
   'Dream sequence / Vision', 'format_produktion', 431),

  -- Insert — kurzer Detailschnitt, kein WS
  ('', 'Insert / Reaktionsschnitt',
   'Kurzer Schnitt auf ein Detail, Objekt, Dokument oder die Reaktion einer Person — ohne eigenstaendige Handlungslinie. Dauer typischerweise 1-5 Sekunden; er unterbricht die laufende Szene momentan. Abgrenzung zum WS: WS = zwei vollstaendige, gleichberechtigte Handlungslinien wechseln sich ueber mehrere Szenen hinweg ab; Insert = einmaliger Detailblick innerhalb einer Szene ohne eigenen Strang. Verwandte Begriffe: Cutaway (kurze Unterbrechung mit Fremdmotiv/anderem Ort), Reaction Shot (Schnitt auf das Gesicht einer zuhoerenden Person).',
   'Insert / Reaction shot', 'format_produktion', 432)

) AS v(kuerzel, name, erklaerung, term_en, kategorie, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM dk_glossar_defaults d
  WHERE d.name = v.name
    AND d.kategorie = v.kategorie
);
