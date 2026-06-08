# Script-App — Roadmap (offene Punkte)

Geplante, noch nicht umgesetzte Vorhaben. Erledigtes wandert raus (Git-Historie genügt).

## Rollen-/Komparsennummern

- **Lock der ID-Nummern zum ersten Drehplan-Export.**
  Innerhalb einer Staffel werden Rollen-/Komparsennummern bewusst **live** aufgelöst
  (Änderungen wirken sofort überall) — das ist gewollt, solange noch kein Drehplan
  herausgegangen ist. Drehbücher exportieren keine ID-Nummern, deshalb ist dort kein
  Lock nötig.
  **Sobald der erste Drehplan einer Staffel exportiert wird, müssen die ID-Nummern
  dieser Staffel eingefroren (gelockt) sein** — danach dürfen sie sich nicht mehr
  rückwirkend ändern, weil Drehpläne / Dispos / Tagesberichte darauf referenzieren.
  Umsetzung offen (z. B. `produktionen.nummern_gelockt_am` + Sperre in der
  Nummern-Vergabe/-Änderung ab Lock; Drehplan-Export setzt den Lock).
