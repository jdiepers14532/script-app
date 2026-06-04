# Handoff 3 — Lock-Regel-Engine (Pre-Lock-Checks)

**Für Claude Code** · Repo: `jdiepers14532/script-app` (branch `main`) · DB `script_db`

Voraussetzung: Handoff 1 (Block-Identität, Freeze, NT-Konsistenz) und Handoff 2 (Label-Safety) sind deployed. Dieser Handoff baut darauf auf.

Ziel: Wenn eine Werkstufe an einem konfigurierten Fassungslabel gesperrt/abgegeben werden soll, läuft vorher eine konfigurierbare Validierung. **Blocker** verhindern den Lock, **Warnungen** sind übersteuerbar („mit offenen Punkten fortfahren"). Die Engine ist ein **dünner Aufrufer über die bestehende Check-Engine** (`backend/src/routes/checks.ts`) — kein zweites Prüfsystem.

---

## 0. Voraussetzungen & Discovery (rein lesend, STOPP danach mit Bericht)

```bash
grep -rn "runChecks\|DEFAULT_CONFIG\|check_typ\|persistResults" backend/src/routes/checks.ts
grep -rn "lock-gate\|lock_trigger_fassungslabel\|currentPos\|sort_order" backend/src
grep -rn "applyPromptTemplate\|effectivePrompt\|callProvider\|getKiSetting" backend/src
grep -rn "ki_settings\|ki_prompt_overrides\|production_app_settings" backend/src
grep -rn "req-leave-check\|CustomEvent\|Checklist\|BatchCheckModal" frontend/src
grep -rn "autofix\|applyNtVerweisFix\|nt_verweis" backend/src
grep -rn "sondertyp\|wechselschnitt\|stockshot\|etablierung" backend/src frontend/src
grep -rn "tools/konsistenz\|tools/drift-check" backend/src   # aus Handoff 1
```

Bericht zurückgeben: aktuelle `DEFAULT_CONFIG`-Struktur, wie `runChecks()` Findings erzeugt (`{ check_typ, schwere, meldung, ... }`), wie das Lock-Gate heute die Position vergleicht (Bug 7), wo das Checklisten-/Batch-Modal sitzt, und die tatsächlich nächste Migrationsnummer (MEMORY.md sagt v184 — verifizieren). Erst nach Freigabe Code.

---

## 1. Architekturprinzip

- **Ein Prüfsystem.** Die Lock-Validierung ruft `runChecks()` auf und interpretiert dessen Findings — sie dupliziert keine Prüflogik. Neue Checks werden in `checks.ts` ergänzt, nicht in einer separaten Engine.
- **Drei orthogonale Konfig-Achsen pro Check** (production-scoped, in DK einstellbar):
  - `enabled` — Check aktiv oder nicht.
  - `auto` — läuft automatisch (beim Speichern / Batch) oder nur on-demand/zum Lock-Zeitpunkt.
  - `lock_gating` — `blocker` (verhindert Lock) | `warnung` (zeigt an, übersteuerbar) | `off` (rein informativ, kein Lock-Einfluss).
- **`autofix_mode` pro Check** (nur für Checks mit Autofix): `silent` (automatisch angewandt) | `1klick` (Ein-Klick-Übernahme) | `diff_bestaetigen` (Diff zeigen, bestätigen). **KI-generative Fixes nie `silent`.**
- Severity (`blocker`/`warnung`/`hinweis`) ist eine **Check-Eigenschaft**; `lock_gating` ist die **produktionsspezifische Politik**, was ein Finding für den Lock bedeutet. Beide getrennt halten.

---

## 2. Bug 7 — Lock-Gate vergleicht sort_order, nicht Listen-Index

Heutiges Gate bestimmt die „Position" eines Fassungslabels über den Index in einer Liste → nicht-deterministisch, wenn die Liste anders sortiert geladen wird. Fix: direkt `stage_labels.sort_order` von aktueller Werkstufe und Trigger-Label vergleichen (`currentSortOrder >= triggerSortOrder`), statt Array-Index. Discovery zeigt die genaue Stelle. Klein, aber Voraussetzung für verlässliches Gating.

---

## 3. Konfig-Modell

Neue Tabelle (v184), production-scoped, überschreibt die Code-`DEFAULT_CONFIG`:
```sql
CREATE TABLE IF NOT EXISTS check_konfiguration (
  production_id TEXT NOT NULL,
  check_typ     TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  auto          BOOLEAN NOT NULL DEFAULT TRUE,
  lock_gating   TEXT NOT NULL DEFAULT 'warnung',  -- blocker | warnung | off
  autofix_mode  TEXT,                              -- silent | 1klick | diff_bestaetigen | NULL
  PRIMARY KEY (production_id, check_typ)
);
```
Effektive Konfig = `check_konfiguration`-Zeile, sonst `DEFAULT_CONFIG` aus `checks.ts`. Ein Loader (`getEffectiveCheckConfig(productionId)`) liefert die gemergte Konfig; `runChecks()` und das Lock-Gate lesen daraus. Migration registrieren (`backend/src/index.ts`).

---

## 4. Regelkatalog (abgenommen)

Severity = Vorschlag; `lock_gating` ist per Produktion übersteuerbar. „Autofix" = Check hat eine Korrektur (Modus per `autofix_mode`).

| check_typ | Severity (default) | Autofix | Bemerkung |
|---|---|---|---|
| `szenenkopf.pflichtfelder` | I/E, Stimmung, Szenennr., Motive = **Blocker**; übrige Felder = Warnung | – | Pro Feld differenziert |
| `scene.unique_szenennummer` | Blocker | – | Doppelte Szenennummer in der Folge |
| `scene.empty` | Warnung | – | **Ausschluss:** `sondertyp IN ('wechselschnitt','stockshot')` — diese sind by design inhaltsleer (inkl. Etablierungs-/Stockshots) |
| `rollen_konsistenz` | Warnung | ✅ bidirektional | Figur im Kopf ↔ Figur im Dialog; Autofix in beide Richtungen |
| `motiv.einheitliche_schreibweise` | Warnung | ✅ | Schreibweisen-Vereinheitlichung |
| `rolle.einheitliche_schreibweise` | Warnung | ✅ | dito |
| `dialog.endet_satzzeichen` | Hinweis | ✅ | formal |
| `text.kein_leerzeichen_start` | Hinweis | ✅ | formal |
| `leere_bloecke` | Hinweis | ✅ | formal |
| `doppelter_sprecher` | Warnung | ✅ | zwei CHARACTER-Blöcke hintereinander → zusammenführen |
| `seitenzahl_im_bereich` | Warnung | – | gegen DK-Zielwerte |
| `stoppzeit` | Warnung | – | gegen DK-Zielwerte |
| `tageszeit_sequenz` | Warnung | – | deterministisch aus der DK-Stimmungs-Reihenfolge |
| `spielzeit_uhrzeit` | Warnung | (KI-Vorschlag, `1klick`/`diff_bestaetigen`) | **KI, szenenübergreifend pro dramaturgischem Tag** — siehe §5 |
| `nt_replik_konsistenz` | Blocker-Kandidat | – | ruft den `/tools/konsistenz`-Endpoint aus Handoff 1 |
| `dramaturgischer_tag_chronologie` | Warnung | – | Chronologie der dramaturgischen Tage |
| `etablierungsshot_*` / `stockshot` | Hinweis, **off by default** | – | produktionsspezifisch; hängt an den Stockshot-Templates in DK „Format-Formatierungen" |
| `oneliner_vorhanden` | Hinweis | (KI-Vorschlag, nie `silent`) | siehe §5 |

**Wichtig zu `scene.empty` und Sonderszenen:** inhaltsleere Sonderszenen (`wechselschnitt`, `stockshot`/Etablierer) dürfen den Inhalts-Check NICHT auslösen — gleicher Ausschluss wie bei Wechselschnitten. Die `etablierungsshot_*`-Checks prüfen umgekehrt die *Anwesenheit* solcher Szenen und sind ein getrenntes, optionales Thema.

---

## 5. Neue KI-Checks

KI-Infrastruktur existiert: `ki_settings` (DB, `funktion`/`provider`/`model_name`/`enabled`/`prompt`/`default_prompt`), `callProvider`, `applyPromptTemplate` (`{{var}}`), `effectivePrompt`. `oneliner_qualitaet` ist nur ein deaktivierter Stub. Muster für neue Checks (4 Schritte): ki_settings-Eintrag per Migration → `DEFAULT_CONFIG`-Eintrag → `runChecks()`-Block → Frontend-Label.

### 5.1 `oneliner_vorhanden` / `oneliner_qualitaet`
Vorschlag, ob ein Oneliner fehlt bzw. den Kern der Szene trifft. KI-Vorschlag, `autofix_mode` nie `silent`.

### 5.2 `spielzeit_uhrzeit` — szenenübergreifend
Bezieht **alle Szenen eines dramaturgischen Tages** ein (nicht eine Szene), plus Übergang aus Vor- und Folgeepisode in der jeweils letzten verfügbaren Fassung. Der `runChecks()`-Block muss also die Szenenmenge des dramaturgischen Tages laden, nicht nur die aktuelle Szene. Ausgabe ist JSON pro Szene; bereits gesetzte Uhrzeiten sind Anker, unplausible Anker werden als Konflikt markiert. Default-Prompt (in der ki_settings-Migration):

```
Du bist ein Continuity-Assistent für die fiktionale Serie {{serie_name}}.
Schätze für die Szenen EINES dramaturgischen Tages plausible Uhrzeiten (HH:MM),
damit Requisite/Ausstattung Uhren und Tageslicht korrekt einstellen können.
Du schlägst nur vor — du entscheidest nichts und überschreibst keine bereits
gesetzten Uhrzeiten (Anker).

KONTEXT
- Dramaturgischer Tag: {{spieltag}}
- Szenen dieses Tages (in Reihenfolge): {{szenen_des_tages}}
  (je Szene: Szenennr., Motiv, I/E, Tageszeit/Stimmung, Figuren, bereits
   gesetzte Spielzeit = ANKER falls vorhanden, Inhalt-Auszug/Oneliner)
- Übergang aus der vorherigen Folge (letzte verfügbare Fassung), soweit
  vorhanden: {{kontext_vorherige_folge}}
- Übergang in die nächste Folge (letzte verfügbare Fassung), soweit vorhanden:
  {{kontext_naechste_folge}}

VORGEHEN
1. Betrachte ALLE Szenen des Tages gemeinsam — eine realistische Uhrzeit ergibt
   sich nur aus dem Verhältnis der Szenen zueinander, nicht aus einer allein.
2. Nutze Anker als Fixpunkte; Vorschläge müssen mit ihnen und der Szenenfolge
   konsistent sein.
3. Berücksichtige Hinweise im Text (Mahlzeiten, Licht, Aktivitäten, explizite
   Zeitangaben), Wege-/Reisezeiten zwischen Motiven und parallele Stränge.
4. Beziehe den Übergang aus Vor-/Folgeepisode ein, soweit gegeben.
5. Bei dünnen Hinweisen niedrige confidence. Erfinde keine Präzision. Markiere
   Anker, die mit den übrigen Szenen NICHT plausibel sind, als Konflikt.

AUSGABE — ausschließlich JSON, kein Fließtext:
{
  "tag": "{{spieltag}}",
  "szenen": [
    { "szenennummer": "…", "ist_anker": true|false,
      "vorschlag_uhrzeit": "HH:MM"|null, "confidence": "hoch"|"mittel"|"niedrig",
      "begruendung": "1 Satz", "konflikt_mit_ankern": true|false }
  ],
  "verwendete_signale": ["…"]
}
```

---

## 6. KI-Prompt-Governance

Entscheidung: **Sichtbarkeit und Editierrecht trennen.**
- **Sichtbar (read-only)** beim jeweiligen Check in den DK-Settings — jede Rolle sieht den effektiven Prompt.
- Daneben für Admin-Rollen (superadmin / herstellungsleitung) ein **„In Admin-Einstellungen bearbeiten"-Hyperlink**, der per Deep-Link/Anker direkt auf den `funktion`-Key in der ki-settings-Seite springt. Für Nicht-Admins ausgeblendet oder deaktiviert mit Tooltip.
- **Editieren admin-gated**, mit **Vorschau („an einer Szene testen")**, **Diff gegen `default_prompt`** und **Ein-Klick-Reset** (`DELETE /api/admin/ki-settings/:funktion/prompt`).
- **Produktions-Override (Option A):** `production_app_settings` key `ki_prompt_overrides` = `{ funktion: prompt }`. Auflösungsreihenfolge: DK-Override → `ki_settings.prompt` → `default_prompt`. Reicht für 2–3 Checks; bei mehr später auf eine Tabelle heben.

---

## 7. Checklisten-Modal

- Schwebendes Modal (createPortal, sw-ui-Muster), das beim Lock-Versuch — und optional on-demand — die Findings zeigt, gruppiert nach `blocker` / `warnung` / `hinweis`.
- Findings sind **Hyperlinks**: Klick springt zur betroffenen Szene/Block. Navigation über das bestehende `req-leave-check`-CustomEvent-Muster (Discovery zeigt die genaue Mechanik), damit ungespeicherte Änderungen sauber behandelt werden.
- Modal **bleibt offen** beim Navigieren (man arbeitet die Liste ab).
- **Blocker** → Lock-Button deaktiviert, solange welche offen sind.
- **Warnungen** → „Mit offenen Punkten fortfahren" als expliziter Override (geloggt: wer, wann, welche Warnungen übersteuert).
- Autofix-Buttons je nach `autofix_mode`: `silent` läuft ohne UI, `1klick` zeigt einen Übernehmen-Button, `diff_bestaetigen` öffnet einen Diff zur Bestätigung. KI-Fixes nie `silent`.
- Tooltips via `src/components/Tooltip.tsx`, Touch-Targets ≥ 44px.

---

## 8. Lock-Gate-Integration

- Beim Lock-Versuch an einer Werkstufe, deren `stage_labels.sort_order >= triggerSortOrder` (Bug-7-Fix): `runChecks()` mit der effektiven Konfig laufen lassen, Findings nach `lock_gating` einsortieren.
- Mindestens ein `blocker`-Finding (Check mit `lock_gating='blocker'`) → Lock wird verweigert (`409 lock_blocked` mit Findings).
- Nur `warnung`/`hinweis` → Lock erlaubt, Modal bietet Override.
- `off`-Checks beeinflussen den Lock nie, erscheinen höchstens informativ.
- `nt_replik_konsistenz` ruft den `/tools/konsistenz`-Endpoint aus Handoff 1 und wird (Default Blocker-Kandidat) per `lock_gating` scharf/weich gestellt.

---

## 9. /hilfe — Regelkatalog-Seite
Admin-/Hilfe-Seite aus der Komponenten-Registry, die den Katalog (§4) erklärt: pro Check Zweck, Default-Severity, ob Autofix, Ausschlüsse (z. B. Sonderszenen bei `scene.empty`), und die drei Konfig-Achsen. Bei KI-Checks der read-only Prompt + Admin-Hyperlink (§6).

---

## 10. Tests (Playwright gegen `https://script.serienwerft.studio`, nur `claude`-Account, Wegwerf-Test-Produktion, niemals Prod-Daten)

1. Bug 7: Lock-Gate verhält sich identisch unabhängig von der Sortierreihenfolge der Label-Liste (sort_order-basiert).
2. Konfig-Achsen: ein Check `enabled=false` läuft nie; `auto=false` läuft nur zum Lock; `lock_gating=off` blockt nie.
3. Blocker verhindert Lock (409); nach Behebung Lock möglich.
4. Warnung: Lock per „mit offenen Punkten fortfahren" möglich, Override geloggt.
5. `scene.empty` schlägt NICHT an bei `sondertyp IN ('wechselschnitt','stockshot')`.
6. `rollen_konsistenz`-Autofix in beide Richtungen; `autofix_mode='diff_bestaetigen'` zeigt Diff vor Übernahme.
7. `spielzeit_uhrzeit`: Check lädt alle Szenen des dramaturgischen Tages (+ Nachbarfolgen) und liefert pro Szene einen Vorschlag; gesetzte Anker bleiben unangetastet, unplausibler Anker → Konflikt-Flag.
8. `nt_replik_konsistenz`: verschobener/gelöschter Replik-Block in Arbeitsfassung vs. eingefrorener Basis → Blocker-Finding (über `/tools/konsistenz`).
9. KI-Prompt: DK sieht Prompt read-only; Admin-Hyperlink springt korrekt; Edit nur als Admin, Reset stellt `default_prompt` wieder her; Produktions-Override greift vor `ki_settings.prompt`.
10. Checklisten-Modal: Finding-Hyperlink springt zur Szene, Modal bleibt offen.

---

## 11. Definition of Done
- [ ] Bug 7 gefixt (sort_order statt Index), Test 1 grün.
- [ ] `check_konfiguration` (v184) + effektiver Konfig-Loader; `runChecks()` und Lock-Gate lesen daraus.
- [ ] Voller Katalog (§4) in `checks.ts` verdrahtet inkl. `scene.empty`-Ausschluss für Sonderszenen.
- [ ] Neue KI-Checks `oneliner_vorhanden` und `spielzeit_uhrzeit` nach dem 4-Schritt-Muster; spielzeit lädt den ganzen dramaturgischen Tag + Nachbarfolgen.
- [ ] KI-Prompt-Governance: read-only in DK + Admin-Hyperlink, admin-gated Edit mit Vorschau/Diff/Reset, Produktions-Override (Option A).
- [ ] Checklisten-Modal mit Finding-Hyperlinks (req-leave-check), Blocker-Sperre, Warnungs-Override (geloggt), Autofix nach `autofix_mode` (KI nie silent).
- [ ] Lock-Gate-Integration: Blocker → 409, Warnung übersteuerbar, off ohne Einfluss; `nt_replik_konsistenz` über `/tools/konsistenz`.
- [ ] /hilfe-Katalogseite.
- [ ] Tests 1–10 grün.

---

## Bewusst NICHT Teil von Handoff 3
- Kein zweites Prüfsystem neben `checks.ts`.
- Keine neuen Autofix-Engines für bereits existierende Checks — nur Modus-Steuerung (`autofix_mode`).
- Fassungsvergleich Phase B (Annehmen/Ablehnen) bleibt Code-Stub aus Handoff 1.
- `oneliner_qualitaet` als ausgebauter Qualitäts-Check (über bloßes Vorhandensein hinaus) optional später.
