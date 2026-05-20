-- v108: Glossar-Einträge Linear und Non-Linear
INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, sort_order) VALUES
  ('Linear',     'Lineares Fernsehen',  'Ausstrahlung zu einem festen Zeitpunkt auf einem Sender. Der Zuschauer hat keine Kontrolle darüber, wann er schaut. Datum + Uhrzeit + Sender = vollständige Definition. Beispiel: ARD 14:10 Uhr. Typen: EA (Erstausstrahlung), ZA (Zweitausstrahlung), WH (Wiederholung).', 23),
  ('Non-Linear', 'Non-Lineares Fernsehen / On-Demand', 'Der Zuschauer wählt selbst, wann er schaut. Kein fester Sendetermin, sondern ein Verfügbarkeitsfenster. Mediatheken, Netflix, Amazon Prime = non-linear. Das "Datum" bezeichnet die Fenster-Startzeit, nicht einen Sendetermin.', 24)
ON CONFLICT DO NOTHING;
