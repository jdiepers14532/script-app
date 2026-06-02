# Handoff 2 — Fassungs-Label als sicherer Natural Key (Option C)

**Für Claude Code** · Repo: `jdiepers14532/script-app` (branch `main`) · DB `script_db`

Zweck: `werkstufen.label` bleibt ein TEXT-String (bewusster Natural-Key-Ansatz, konsistent mit Doku-Abschnitt 11.5 „immer gegen `stage_labels.name` vergleichen, nie gegen `.id`"). Der einzige reale Schaden entsteht, wenn der Name mutiert (Rename) oder verschwindet (Delete) **ohne Propagation**, oder wenn ein Nicht-Label-String (Import-Dateiname) als Label gespeichert wird. Dieser Handoff schließt genau das — ohne Schema-Umbau und ohne die namensbasierte Vergleichslogik anzufassen.

Drei Teile: (A) geschützter Rename/Delete mit Propagation, (B) PDF-Import-Label-Fix, (C) Cleanup der bestehenden 12 verwaisten Labels.

Migrationen nach Handoff 1 vergeben und in `migrationFiles` (`backend/src/index.ts`) registrieren. Reine Option C braucht **keine** Schema-Migration; nur der Cleanup (Teil C) und ggf. ein Import-Quellfeld (Teil B) können eine kleine Migration erfordern.

---

## 1. Referenz-Landkarte — alle Stellen, die den Label-Namen tragen

| # | Ort | Speichert | Aktion bei Rename |
|---|-----|-----------|-------------------|
| R1 | `stage_labels.name` | den Namen selbst | umbenennen (Quelle der Wahrheit) |
| R2 | `werkstufen.label` (TEXT) | Kopie des Namens | UPDATE, **scoped per `folgen.produktion_id`** |
| R3 | `rollen_freigabe_konfiguration.lock_trigger_fassungslabel` (TEXT) | Gate-Trigger-Name | UPDATE per `production_id` |
| R4 | Lock-Gate-Logik (`currentPos >= triggerPos`) | vergleicht R2 ↔ Liste ↔ R3 | **kein Code-Change** — profitiert automatisch |
| R5 | `is_produktionsfassung`-Lookup (`werkstufen.ts`) | matcht R2 gegen `stage_labels.name` | **kein Change** — profitiert automatisch |
| R6 | DK-Settings Composite-Key `"label\|\|\|typ"` | baut sich aus R3 neu | **kein Datenfix** — Config neu laden |
| R7 | `werkstufen-labels`-Endpoint | liest live aus R1 | **kein Change** |

R4–R7 brauchen keinen eigenen Code-Change — sie sind korrekt, sobald R1+R3 (und alle via Discovery zusätzlich gefundenen TEXT-Referenzen) in **einer** Transaktion konsistent gehalten werden.

**Discovery zuerst (rein lesend):**
```bash
grep -rn "lock_trigger_fassungslabel" backend/src frontend/src
grep -rn "\.label" backend/src/routes/werkstufen.ts backend/src/routes/rollen-freigabe.ts
grep -rn "stage_labels" backend/src
grep -rn "UPDATE stage_labels\|stage-labels/:labelId" backend/src
grep -rn "Import:\|import.*\.pdf\|werkstufen.*label" backend/src   # die Import-Stelle (Teil B)
```
Jede zusätzlich gefundene TEXT-Referenz auf den Label-Namen in die Propagation aufnehmen.

---

## 2. Teil A — Geschützter Rename

Endpoint (bestehend): `PUT /api/produktionen/:id/stage-labels/:labelId` (über Discovery verifizieren).

**Verhalten:**
1. Wenn `name` nicht gesetzt oder == altem Namen → nur `sort_order`/`is_produktionsfassung` updaten, keine Propagation.
2. Rename-Pfad → **eine** Transaktion:
   - `pg_advisory_xact_lock(hashtext(produktionId))` (serialisiert Renames/Label-Zuweisungen pro Produktion)
   - `SELECT … FROM stage_labels WHERE id=$labelId AND produktion_id=$pid FOR UPDATE` (404 wenn weg)
   - Kollisionscheck: Name existiert schon in dieser Produktion → `409 label_name_collision`
   - R1 + R2 + R3 (+ Discovery-Funde) updaten:
   ```sql
   UPDATE stage_labels SET name = $newName WHERE id = $labelId AND produktion_id = $pid;

   UPDATE werkstufen w SET label = $newName
   FROM folgen f
   WHERE w.folge_id = f.id AND f.produktion_id = $pid AND w.label = $oldName;

   UPDATE rollen_freigabe_konfiguration SET lock_trigger_fassungslabel = $newName
   WHERE production_id = $pid AND lock_trigger_fassungslabel = $oldName;
   ```
3. Response: `{ renamed: true, affectedWerkstufen, triggerUpdated }`.

**Edge Cases:**
- **Gesperrte/eingefrorene/abgegebene Werkstufen werden mitgezogen.** Der Rename ist Metadaten-Propagation, kein Content-Edit — der `abgegeben`/`eingefroren`-Guard (403 bei Content-PUT) darf den Label-Rename NICHT blockieren. R2 läuft über alle betroffenen Werkstufen, unabhängig vom Status.
- **`is_produktionsfassung` bleibt unberührt** (Boolean auf derselben `stage_labels`-Zeile; Sperr-Semantik ändert sich nicht).
- **Cross-Typ:** R2 matcht ohne Typ-Filter → erfasst Storyline und Drehbuch.
- **Production-Isolation:** R2 zwingend über `folgen.produktion_id`, R3 über `production_id`. Niemals global ohne Scope.
- **Orphan-Race:** denselben Advisory-Lock-Key auch im Werkstufen-Label-Setter (`PUT /api/werkstufen/:id`) ziehen, damit eine parallel zugewiesene neue Werkstufe nicht verwaist.

---

## 3. Teil A — Geschützter Delete

Endpoint (bestehend): `DELETE /api/produktionen/:id/stage-labels/:labelId`.

Heutiges Risiko: hinterlässt verwaiste `werkstufen.label` und **deaktiviert lautlos das Gate**, falls das gelöschte Label der Trigger war (`currentPos = -1` → Gate inaktiv).

**Verhalten:**
1. Impact ermitteln (production-scoped): `affectedWerkstufen`, `isTrigger`, `isProduktionsfassung`, `lockedProduktionsfassungen`.
2. Wenn `(affectedWerkstufen > 0 OR isTrigger)` und kein `force` → `409 label_in_use` mit den Zahlen (Frontend zeigt Bestätigungsdialog).
3. `isProduktionsfassung` + gesperrte Werkstufen vorhanden → **Hard-Block** auch mit `force`: `422 cannot_delete_active_produktionsfassung` (sonst verlöre eine gesperrte Produktionsfassung ihre ableitbare Lock-Herkunft).
4. Mit `force` (kein Hard-Block) → eine Transaktion: Advisory-Lock; `werkstufen.label` = `$replacementName` (falls gesetzt) sonst `NULL`; wenn `isTrigger`: `lock_trigger_fassungslabel = NULL` **und das Deaktivieren des Gates loggen** (Produktion, User, vorher/nachher); `DELETE stage_labels`.
5. Response: `{ deleted, werkstufenUnlabeled, gateDisabled }`.

---

## 4. Teil B — PDF-Import-Label-Fix

Befund aus der Diagnose: der PDF-Import generiert `werkstufen.label`-Strings aus dem Dateinamen (z. B. `"Import: RR-SL-4487.pdf"`), die nie als `stage_labels` existieren. Folge: das Lock-Gate ist für diese Werkstufen dauerhaft inaktiv (`currentPos = -1`), und es entstehen Orphans.

**Fix:** Ein Dateiname ist kein Fassungslabel und darf nicht so tun.
- Die Import-Route (über Discovery finden) schreibt den Dateinamen **nicht** mehr nach `werkstufen.label`. `label` bleibt `NULL` (unlabeled = gate-inaktiv by design, bis ein echtes Label zugewiesen wird).
- Falls die Import-Herkunft erhalten bleiben soll: in ein dediziertes Feld schreiben (z. B. vorhandenes Notiz-/Quellfeld prüfen; nur falls keins existiert, eine kleine Spalte `werkstufen.import_quelle TEXT` ergänzen). Niemals in `label`.
- Damit erzeugt der Import keine neuen Orphans mehr.

---

## 5. Teil C — Orphan-Cleanup (konkrete Funde)

Diagnose ergab 12 verwaiste `werkstufen.label` (0 verwaiste Gate-Trigger — das Gate selbst ist sauber):
- Produktion `d26dff66`: 4× Label `"test"` (Test-Reste).
- Produktion `ec006e25`: 8× Label = PDF-Import-Dateiname (Storyline-Imports).

**Vorgehen (einmalig, Report zuerst):**
1. Report-Query rein lesend laufen lassen und bestätigen, dass es weiterhin genau diese Fälle sind:
   ```sql
   SELECT f.produktion_id, w.id AS werkstufe_id, w.typ, w.label AS orphan_label
   FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
   WHERE w.label IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM stage_labels sl
     WHERE sl.produktion_id = f.produktion_id AND sl.name = w.label)
   ORDER BY f.produktion_id, w.label;
   ```
2. Bereinigung als idempotentes Skript/Migration:
   - 8× Import (`ec006e25`): `label = NULL` setzen; Dateiname (falls gewünscht) ins Import-Quellfeld aus Teil B übernehmen.
   - 4× `"test"` (`d26dff66`): Test-Reste — `label = NULL` setzen, oder nach Rücksprache die Test-Werkstufen entfernen. Default: `NULL`, kein Hard-Delete ohne Freigabe.
3. Nachher: die Report-Query liefert 0 Zeilen.
4. Falls als Migration abgelegt: in `migrationFiles` eintragen.

---

## 6. Frontend — DK-Settings

- Rename ruft den (jetzt propagierenden) `PUT …/stage-labels/:labelId`. Bei `409 label_name_collision` saubere Meldung. Optionaler Vorab-Hinweis „N Werkstufen tragen dieses Label und werden mitumbenannt."
- Delete: bei `409 label_in_use` Bestätigungsmodal mit `affectedWerkstufen`/`isTrigger`/`isProduktionsfassung`, optionales Dropdown „Ersatz-Label" (→ `replacementName`). Bei `422` Delete verhindern + erklären.
- Composite-Key `"label|||typ"`: nach erfolgreichem Rename Config + `werkstufen-labels` neu laden → baut sich korrekt neu.
- Modal über das bestehende createPortal-Muster, Tooltips via `Tooltip.tsx`, Touch-Targets ≥ 44px.

---

## 7. Tests (Playwright gegen `https://script.serienwerft.studio`, nur `claude`-Account, Wegwerf-Test-Produktion, niemals Prod-Daten)

1. Rename propagiert auf alle Werkstufen **einer** Produktion; eine zweite Produktion mit gleichnamigem Label bleibt unberührt (Isolation).
2. Rename des Trigger-Labels → `lock_trigger_fassungslabel` folgt → Gate vorher/nachher identisch (`GET /lock-gate?werkstuf_id=…`).
3. Rename einer gesperrten/eingefrorenen Produktionsfassung → Label folgt, Status bleibt.
4. Rename auf existierenden Namen → 409, keine Teiländerung.
5. Delete benutzten Labels ohne `force` → 409 mit Impact-Zahlen.
6. Delete aktiver gesperrter Produktionsfassung mit `force` → 422.
7. Delete mit `replacementName` → Werkstufen tragen Ersatzlabel; Gate-Trigger ggf. genullt + geloggt.
8. PDF-Import einer Test-Datei → `werkstufen.label` bleibt `NULL`, kein neuer Orphan; Herkunft (falls gewünscht) im Import-Quellfeld.
9. Nach Cleanup: Orphan-Query liefert 0 Zeilen für die Test-Produktion.

---

## 8. Doku nachziehen
- `script_app_werkstufen_fassungen_system.md`: F3 entschärfen („propagiert transaktional über geschützten Endpoint"); Abschnitt 11.5 bleibt wörtlich gültig (Option C bestätigt die Regel, bricht sie nicht).
- `WerkstufenLabelsTab.tsx`: ergänzen, dass Rename/Delete sicher propagieren bzw. geschützt sind, und dass Import-Dateinamen keine Labels sind.

---

## 9. Definition of Done
- [ ] Rename aktualisiert R1+R2+R3 (+ Discovery-Funde) in einer Transaktion, production-scoped; funktioniert auch für gesperrte/eingefrorene/abgegebene Werkstufen.
- [ ] Namenskollision → 409, keine Teiländerung.
- [ ] Delete geschützt (409 mit Impact; 422 Hard-Block; force/replacement transaktional); Gate-Deaktivierung wird geloggt.
- [ ] Advisory-Lock pro Produktion in Rename **und** Werkstufen-Label-Setter.
- [ ] PDF-Import schreibt keinen Dateinamen mehr nach `label`; Herkunft ggf. in dediziertem Feld.
- [ ] Orphan-Cleanup gelaufen; Report-Query liefert 0 Zeilen.
- [ ] Tests 1–9 grün; Abschnitt 11.5 der Doku bleibt unverändert gültig.

---

## Bewusst NICHT Teil von Handoff 2
- Kein `werkstufen.label_id`-FK / Surrogatschlüssel (das wäre Option A).
- Keine Änderung an der namensbasierten Lock-Gate-Vergleichslogik.
- Bug 7 (sort_order vs. Index im Lock-Gate) und die Lock-Regel-Engine → Handoff 3.
- Block-Identität / Revisionen / NT / Fassungsvergleich → Handoff 1.
