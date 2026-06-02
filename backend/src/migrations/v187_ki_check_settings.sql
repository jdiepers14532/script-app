-- v186: ki_settings für Check-Engine KI-Checks (Handoff 3)
-- oneliner_vorhanden: prüft ob Oneliner gesetzt, KI-Vorschlag bei Fehlen
-- spielzeit_uhrzeit:  szenenübergreifend pro dramaturgischem Tag

INSERT INTO ki_settings (funktion, provider, model_name, enabled, default_prompt)
VALUES
  ('oneliner_vorhanden', 'mistral', 'mistral-small-latest', FALSE,
   E'Prüfe für die folgende Szene, ob ein Oneliner vorhanden ist und ob er den emotionalen Kern trifft.\n\nSZENENINFO\n- Motiv: {{motiv}}\n- I/A: {{int_ext}}\n- Tageszeit: {{tageszeit}}\n- Rollen: {{rollen}}\n- Oneliner (Zusammenfassung): {{oneliner}}\n- Text-Auszug: {{text_auszug}}\n\nAntworte ausschließlich als JSON:\n{"vorhanden": true, "trifft_kern": true, "hinweis": "max. 1 Satz oder null"}'),

  ('spielzeit_uhrzeit', 'mistral', 'mistral-small-latest', FALSE,
   E'Du bist ein Continuity-Assistent für die fiktionale Serie {{serie_name}}.\nSchätze für die Szenen EINES dramaturgischen Tages plausible Uhrzeiten (HH:MM),\ndamit Requisite/Ausstattung Uhren und Tageslicht korrekt einstellen können.\nDu schlägst nur vor — du entscheidest nichts und überschreibst keine bereits\ngesetzten Uhrzeiten (Anker).\n\nKONTEXT\n- Dramaturgischer Tag: {{spieltag}}\n- Szenen dieses Tages (in Reihenfolge): {{szenen_des_tages}}\n  (je Szene: Szenennr., Motiv, I/E, Tageszeit/Stimmung, bereits\n   gesetzte Spielzeit = ANKER falls vorhanden, Inhalt-Auszug/Oneliner)\n- Übergang aus der vorherigen Folge (letzte verfügbare Fassung), soweit\n  vorhanden: {{kontext_vorherige_folge}}\n- Übergang in die nächste Folge (letzte verfügbare Fassung), soweit vorhanden:\n  {{kontext_naechste_folge}}\n\nVORGEHEN\n1. Betrachte ALLE Szenen des Tages gemeinsam — eine realistische Uhrzeit ergibt\n   sich nur aus dem Verhältnis der Szenen zueinander, nicht aus einer allein.\n2. Nutze Anker als Fixpunkte; Vorschläge müssen mit ihnen und der Szenenfolge\n   konsistent sein.\n3. Berücksichtige Hinweise im Text (Mahlzeiten, Licht, Aktivitäten, explizite\n   Zeitangaben), Wege-/Reisezeiten zwischen Motiven und parallele Stränge.\n4. Beziehe den Übergang aus Vor-/Folgeepisode ein, soweit gegeben.\n5. Bei dünnen Hinweisen niedrige confidence. Erfinde keine Präzision. Markiere\n   Anker, die mit den übrigen Szenen NICHT plausibel sind, als Konflikt.\n\nAUSGABE — ausschließlich JSON, kein Fließtext:\n{"tag":"{{spieltag}}","szenen":[{"szenennummer":"...","ist_anker":true,"vorschlag_uhrzeit":"HH:MM","confidence":"hoch","begruendung":"1 Satz","konflikt_mit_ankern":false}],"verwendete_signale":["..."]}')

ON CONFLICT (funktion) DO NOTHING;
