-- v98: Globale Glossar-Standardeinträge (einmalig befüllt, production-unabhängig)
CREATE TABLE IF NOT EXISTS dk_glossar_defaults (
  id         SERIAL PRIMARY KEY,
  kuerzel    TEXT NOT NULL,
  name       TEXT NOT NULL,
  erklaerung TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, sort_order) VALUES
  ('PU',              'Pick-Up',                             'Wiederaufnahme eines Strangs nach einer bewussten Pause. Oberbegriff für DPU und IPU.',                                                                                              1),
  ('DPU',             'Direkter Pick-Up',                    'Wiederaufnahme ohne Zeitsprung – Continuous Action (CA). Die Zeit zwischen den Szenen vergeht nicht.',                                                                              2),
  ('CA',              'Continuous Action',                   'Synonym für / Bestandteil von DPU: keine Zeitlücke zwischen aufeinanderfolgenden Szenen.',                                                                                          3),
  ('IPU',             'Indirekter Pick-Up',                  'Wiederaufnahme eines Strangs mit Zeitsprung.',                                                                                                                                      4),
  ('DPU.',            'Direkter Pick-Up (Eröffnungs-Marker)', 'Eröffnungs-Marker: erste Szene einer Folge knüpft direkt (Continuous Action) an den Cliffhanger der Vorfolge an.',                                                               5),
  ('IPU.',            'Indirekter Pick-Up (Eröffnungs-Marker)', 'Eröffnungs-Marker: erste Szene einer Folge nimmt einen Strang der Vorfolge wieder auf, aber mit Zeitsprung – kein direkter Anschluss.',                                       6),
  ('Parken',          'Strang parken',                       'Bewusste Pause eines Erzählstrangs – kein Fehler, sondern dramaturgisches Mittel. Der Strang wird später per Pick-Up wieder aufgenommen.',                                         7),
  ('PEN',             'Penultimate',                         'Vorletzte Szene einer Folge – der Vor-Cliff, der die Spannung unmittelbar vor dem Cliffhanger aufbaut.',                                                                           8),
  ('CLIFF',           'Cliffhanger',                         'Letzte Szene einer Folge: offen-eskalierend, spannungsgeladen – animiert zum Weiterschauen.',                                                                                      9),
  ('SOLO',            'Solo',                                'Szene mit einer einzelnen Figur allein.',                                                                                                                                          10),
  ('WS',              'Wechselschnitt',                      'Zwei parallele Szenen werden abwechselnd gegeneinander geschnitten.',                                                                                                              11),
  ('Split-Screen',    'Split-Screen',                        'Wie Wechselschnitt, aber als Bildteilung: beide Szenen gleichzeitig nebeneinander sichtbar statt alternierend geschnitten.',                                                      12),
  ('1W',              'One-Way-Telefonat',                   'Telefonszene, bei der nur eine Seite des Gesprächs im Bild zu sehen ist.',                                                                                                        13),
  ('2W',              'Two-Way-Telefonat',                   'Telefonszene, bei der beide Gesprächspartner gezeigt werden – eine Variante des Wechselschnitts.',                                                                                14),
  ('VO',              'Voice Over',                          'Gedankenstimme oder innerer Monolog einer Figur; die Person ist nicht im Bild zu sehen.',                                                                                          15),
  ('OFF',             'Off',                                 'Stimme einer Person, die hörbar, aber nicht im Bild sichtbar ist.',                                                                                                               16),
  ('NT',              'Nur Ton',                             'Dialog, der ausschließlich akustisch aufgenommen wird, ohne Bild.',                                                                                                               17),
  ('Einspieler',      'Einspieler',                          'Musik, die beim Dreh live eingespielt wird, oder eine Videoeinspielung innerhalb der Szene.',                                                                                     18),
  ('NMDP',            'Nach Möglichkeit der Produktion',     'Beispielhafte Setzung im Treatment – 1:1-Umsetzung nicht erforderlich. Die Produktion entscheidet in der Vorbereitung, was realisiert wird.',                                    19),
  ('NMDP-Komparsen',  'NMDP für Komparsen',                  'Komparsen erscheinen in dieser Szene nur, wenn das Produktionsbudget es erlaubt.',                                                                                               20),
  ('o.T.',            'Ohne Text',                           'Komparsen oder Nebenfiguren ohne Sprechrolle.',                                                                                                                                   21),
  ('SBSA',            'Sex bahnt sich an',                   'Zwei Figuren sind kurz davor, Sex zu haben. Die Szene endet oder blendet aus, bevor es jugendschutzrelevant wird (Pre-Coitus, jugendschutzkonform ausgeblendet).',               22)
ON CONFLICT DO NOTHING;
