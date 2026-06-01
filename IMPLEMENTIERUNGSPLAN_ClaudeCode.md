# Implementierungsplan für Claude Code — Figuren-/Motiv-Freigabe, Komparsen-Klassifizierung, NT-Flagging

> Ziel: Umsetzung des Konzepts `KONZEPT_Figuren_Motiv_Freigabe_FINAL.md` in der Script-App.
> Lies dieses Konzept zuerst vollständig. Arbeite die Phasen der Reihe nach ab und committe phasenweise.

---

## 0. Rahmen & verbindliche Coding-Hinweise

**Repo / Stack**
- Lokal: `C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\` · GitHub: `jdiepers14532/script-app` (branch `main`).
- Frontend: React 18 + TypeScript + Vite. Backend: Node.js + Express + TypeScript. DB: PostgreSQL `script_db`.
- Deploy (niemals direkt auf dem Server patchen):
  ```
  commit + push → plink ... "cd /srv/script && git pull && cd backend && npm ci && npm run build && pm2 restart script-backend --update-env && cd ../frontend && npm ci && npx vite build"
  ```

**Migrationen — KRITISCH**
- Migrationsstand: v1–v117 deployed. Neue Migrationen beginnen bei **v118**.
- **Jede** neue `.sql`-Migration MUSS in der **hardcodierten** `migrationFiles`-Liste in `backend/src/index.ts` eingetragen werden — das System scannt das Verzeichnis **nicht** automatisch. Vergessen = Migration läuft nie.
- Migrationen idempotent halten (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), da Re-Runs vorkommen.

**Design / UI**
- Trade-Republic-Stil, Font Inter. Farben: Green `#00C853`, Danger `#FF3B30`, Warning `#FFCC00`, Info `#007AFF`, Gray-Surface `#F5F5F5`. 8px-Grid, Radius 8/12px.
- Ampel: **Orange (Warning) = ausstehend**, **Rot (Danger) = abgelehnt**, bestätigt = **neutral** (keine Farbe).
- Tooltips **immer** `src/components/Tooltip.tsx` — nie inline `title=""`, nie Eigenbauten.
- Gemeinsame Komponenten aus `sw-ui` (Plain-Directory-Copy nach `frontend/src/sw-ui/`, kein Submodule). Nur vorhandene Exporte verwenden.
- Neue Komponenten in `frontend/src/debugIds.ts` eintragen (Notation W/F/D/M).
- **Tablet-Pflicht**: Drag-Handler immer `mousemove/mouseup` UND `touchmove/touchend`; Touch-Targets ≥ 44×44px; kein CSS `zoom` auf Touch; Erkennung `window.matchMedia('(pointer: coarse)').matches`.

**Auth**
- Rollen 1:1 aus auth.app, keine lokale Rollen-DB. Bestehend: `requireDkAccess`.
- **Anlage-/Bearbeitungsberechtigung NICHT hartcodieren.** Wer Rollen/Figuren/Motive anlegen und bearbeiten darf, wird **in den DK-Settings konfiguriert** — orientiere dich an der bereits vorhandenen, vergleichbaren Berechtigungs-Funktionalität an anderer Stelle in Script (gleiche Patterns/Komponenten wiederverwenden). Middleware liest die konfigurierte Berechtigung pro Produktion, statt fixe Rollen zu prüfen.

**KI**
- Über bestehende `GET/PUT /api/admin/ki-settings`, Provider pro Funktion wählbar. **Mistral Cloud** für die Spiel-Disambiguierung (Ollama 600s-Timeout, zu langsam). Regex-/Heuristik-Fallback vorsehen.

**Tests (Playwright)**
- Gegen `https://script.serienwerft.studio`. Login: `POST https://auth.serienwerft.studio/api/auth/login` → `access_token`-Cookie als `Cookie`-Header. **Nur** `claude`-Testaccount. **Kein** `PLAYWRIGHT_TEST_MODE`. Niemals Produktions-DB/echte Accounts manipulieren.

**Vorhandenes wiederverwenden, nicht neu bauen**
- Revisionsfarben/-seiten: bereits in DK-Settings → übernehmen.
- Bestehendes Lock-System (per Episode, Contract-Lock via Vertragsdatenbank) → erweitern, nicht parallelisieren.
- `extractNtCharacters`, `autoUpsertNtEintraege`, `parseSuffix`/`parseSuffixServer`, Entity-Erkennung, `UniversalEditor.tsx` → erweitern.
- Tabellen `characters`, `character_productions` (hat `freigabe_status` schon), `character_kategorien`, `scene_characters` (hat `anzahl`, `ist_gruppe`), `nt_eintraege`, `rollen_freigabe_*`.

---

## Phase 0 — Schema & Migrationen (v118+)

Erstelle die Migrationen, registriere **jede** in `backend/src/index.ts`.

- **v118 — `scene_characters` Status (Dispo, Fall A)**
  - `status TEXT NOT NULL DEFAULT 'bestaetigt'` CHECK `('bestaetigt','ausstehend','abgelehnt')`
  - `quelle TEXT DEFAULT 'manuell'` CHECK `('manuell','auto_editor')`
  - Index auf `(scene_identity_id, status)`.
- **v119 — `character_productions` erweitern**
  - `freigabe_status` Wertebereich sicherstellen (`keine|ausstehend|freigegeben|abgelehnt`), **Index** auf `freigabe_status`.
  - Direkteintrag-Audit: `angelegt_von_user_id TEXT`, `angelegt_via TEXT` (`prep_direkt|editor_freigabe`), `angelegt_am TIMESTAMPTZ DEFAULT NOW()`.
  - `default_anzahl INT` (für wiederkehrende o.T.-Komparsen).
- **v120 — Genehmiger-Konfiguration erweitern**
  - `rollen_freigabe_genehmiger`: `freigabe_typ TEXT NOT NULL DEFAULT 'budget'` (`budget|dispo`), `stufe TEXT NOT NULL DEFAULT 'obligatorisch'` (`obligatorisch|review|notify`), `user_id TEXT NULL`, `rolle TEXT NULL` (CHECK: genau eines von beiden gesetzt).
  - `rollen_freigabe_konfiguration`: Toggles `deckt_rollen BOOLEAN DEFAULT TRUE`, `deckt_motive BOOLEAN DEFAULT FALSE`, `deckt_neue_szenen BOOLEAN DEFAULT FALSE`; `lock_trigger_werkstufe TEXT`, `lock_trigger_fassungslabel TEXT`; `ot_obergrenze_pro_block INT NULL` (**NULL = unbegrenzt = Funktion aus, Default**); `quorum TEXT DEFAULT 'first_responder'`.
  - **Anlage-/Bearbeitungsberechtigung** (orientiert an vorhandener Script-Funktionalität): Konfiguration, welche Rollen Figuren/Rollen und Motive **anlegen und bearbeiten** dürfen (z. B. `anlage_bearbeitung_rollen JSONB`, `anlage_bearbeitung_motive JSONB` mit Rollenliste, oder die in Script bereits genutzte Berechtigungsstruktur wiederverwenden).
  - **Lock-Override-Berechtigung**: separate, engere Rollenliste (z. B. `lock_override_rollen JSONB`).
- **v121 — Dispo-Freigabe-Anfragen (neue Tabelle)**
  - `szenen_freigabe_anfragen (id, character_id UUID, scene_identity_id UUID, production_id TEXT, status TEXT, beantragt_von_*, entschieden_*, notiz, erneut_anfrage_notiz, UNIQUE(character_id, scene_identity_id))`.
  - Spiegelt `rollen_freigabe_anfragen` (Budget bleibt dort, global, `UNIQUE(character_id, production_id)`).
- **v122 — Motiv-Budget-Freigabe**
  - `motive`: `freigabe_status TEXT DEFAULT 'keine'`, Audit-Felder analog v119. Falls Motiv-Freigabe-Anfragen separat: kleine Tabelle analog `rollen_freigabe_anfragen` mit `motiv_id`.
- **v123 — Komparsen-Klassifizierungs-Cache**
  - `komparse_klassifizierung (id, character_id, scene_identity_id, werkstufe_id, typ_erkannt TEXT ('ot'|'mit_text'|'mit_spiel'), evidence_text TEXT, konfidenz NUMERIC, quelle TEXT ('regel'|'mistral'|'manuell'), verifiziert BOOLEAN DEFAULT FALSE, erstellt_am, UNIQUE(character_id, scene_identity_id, werkstufe_id))`.
- **v124 — Glossar**
  - `glossar (id SERIAL PK, produktion_id TEXT NULL, begriff TEXT NOT NULL, abkuerzung TEXT, definition TEXT NOT NULL, kategorie TEXT, sort_order INT, erstellt_am)`. Seed mit den Begriffen aus Konzept-Abschnitt 12.
- **v125 — Override-Audit**
  - `freigabe_overrides (id, typ TEXT ('lock'|'rote_seiten'), bezug_id TEXT, user_id TEXT, begruendung TEXT, fehlende_freigaben JSONB, erstellt_am)`.

**Akzeptanz:** Alle Migrationen in `migrationFiles` eingetragen, laufen sauber durch, idempotent.

---

## Phase 1 — Klassifizierung beim Speichern & Zugriffskontrolle

- **Save-Scan umbauen** (im Hook nach `PUT /api/dokument-szenen/:id`, neben `autoUpsertNtEintraege`): aus „Rolle anlegen" wird „klassifizieren":
  1. im Szenen-Cast bestätigt? → nichts tun.
  2. in `character_productions`? → **Fall A** (Dispo): `scene_characters.status = 'ausstehend'` + `szenen_freigabe_anfragen` upsert (nur **nach Lock**).
  3. nicht vorhanden → **Fall B** (Budget): Rolle **gestaged** (`is_active = FALSE`), `freigabe_status='ausstehend'`, `rollen_freigabe_anfragen` upsert; Einführungsszene direkt `bestaetigt`.
- **`autoCreateCharacterForNT`** → Klassifizierer (anlegen→stagen).
- **Zugriffskontrolle (DK-konfigurierbar, nicht hartcodiert)**: `POST /api/characters`, `POST /api/characters/:id/productions`, Aktivierung (`is_active=TRUE`), Motiv-Anlage **und Kategorie-Hochstufung** prüfen gegen die in den DK-Settings konfigurierte Anlage-/Bearbeitungsberechtigung (vorhandene Script-Berechtigungs-Patterns wiederverwenden). **Autor standardmäßig ausgeschlossen.** Direkteinträge und Hochstufungen ins Audit (`angelegt_via='prep_direkt'`).
- **Pool-Filter**: `GET /api/characters?produktion_id=X` nur `is_active = TRUE` (gestagte/abgelehnte B-Rollen erscheinen nicht als AC-Vorschlag).

**Akzeptanz:** Ein vom Autor getippter neuer Name legt **keine** aktive Rolle an; er erzeugt eine gestagte Rolle + Budget-Anfrage. Anlage/Bearbeitung von Rollen/Motiven nur für die in den DK-Settings berechtigten Rollen; Autor standardmäßig nicht dabei.

---

## Phase 2 — Komparsen-Klassifizierung (inhaltsbasiert + Mistral)

- **`extractNtCharacters` erweitern** bzw. neuer Scan: o.T. vs. mit Text deterministisch (Dialogue-Node ja/nein). Für „mit Spiel": Action-/Handlungs-Nodes nach Figurenerwähnung scannen (Entity-Erkennung wiederverwenden).
- **Mistral-Disambiguierung** (über `ki-settings`): Kandidat-Passage → Mistral mit präziser, tarifnaher Spiel-Definition: **Spiel = Figur tritt in Interaktion oder tut etwas für die Szene Relevantes** (Handlung treibt die Szene voran oder direkte Interaktion mit benannter Figur); **reine Anwesenheit/Atmosphäre ist kein Spiel**. **Recall vor Precision** (im Zweifel als Kandidat markieren). Ergebnis + `evidence_text` + `konfidenz` in `komparse_klassifizierung`.
- **Asynchron / am Lock-Checkpoint**, nicht auf dem Save-Hotpath. Regex-/Heuristik-Fallback wenn Provider down.
- Unsichere Fälle: `verifiziert=FALSE` → Markierung „nicht inhaltlich verifiziert" am Objekt.
- **KI-Trainer**: manuelle Overrides als `POST /api/training-events` (Header `X-KI-Trainer-Secret`).

**Akzeptanz:** Ein als o.T. gelabelter Komparse mit Replik wird automatisch als „mit Text" erkannt; ein im Action-Absatz spielender Komparse wird als Kandidat „mit Spiel" gemeldet.

---

## Phase 3 — Freigabe-Logik (recalc, Stufen, Auto-Zurückziehen)

- **`recalcAnfrageStatus`** (Budget **und** Dispo): **First-Responder** — erste obligatorische Entscheidung (Freigabe **oder** Ablehnung) settled; übrige offene Genehmiger-Status auto-zurückziehen. **Nur obligatorische** Stimmen gaten; **review** = sichtbares Bedenken, blockiert nicht; **notify** = FYI.
- **Statuspropagation**: Budget freigegeben → Rolle `is_active=TRUE` + Einführungsszene `bestaetigt`. Budget-Ablehnung = **global** (`character_productions.freigabe_status='abgelehnt'`). Dispo-Ablehnung = **szenenlokal** (`scene_characters.status='abgelehnt'`).
- **Erneute Anfrage**: jeder darf, Pflicht-`erneut_anfrage_notiz`; vorheriger `notiz` für Genehmiger sichtbar.
- **Auto-Zurückziehen** (Phase-1-Scan): Vorkommen entfernt → NT `veraltet=TRUE` + Anfrage `zurueckgezogen`.
- **Keine Selbstgenehmigung** (Antragsteller ≠ Genehmiger).

**Akzeptanz:** Eine Ablehnung durch eine obligatorische Instanz settled sofort; eine Review-Ablehnung nicht. Abgelehnte Rolle bleibt in den Daten, nur Flag.

---

## Phase 4 — Editor-Farblogik (`UniversalEditor.tsx`)

- Farbe **pro Vorkommen**: Rot (global budget-abgelehnt ODER szenenlokal dispo-abgelehnt) > Orange (ausstehend) > neutral. Vor Lock nur Budget-Achse, nach Lock beide.
- **Tooltip** (`Tooltip.tsx`) am Vorkommen: Scope + Status + Ablehnungsgrund.
- Status pro Szene via API laden (`scene_characters.status` + `character_productions.freigabe_status`), Cache pro Szene invalidieren bei Szenenwechsel.

**Akzeptanz:** Eine global budget-abgelehnte Rolle ist in allen Szenen rot; eine dispo-abgelehnte nur in der betroffenen Szene.

---

## Phase 5 — Freigabe-Seite

- **Matrix** Folge (X) × Szene (Y), sparse (nur offene Zellen), gefenstert; Zellen mit Anzahl + Ampelfarbe.
- **Detailliste** je Zelle: Name, Kontext, Badges (Kategorie + `Budget · global`/`Dispo · Szene`), Freigeben/Ablehnen, Batch-Checkbox. Review-Bedenken als inline-Notiz (ruhig, kein Rot).
- **Scope-Umschalter** „Meine" / „Alle (DK)". Endpoints: `GET /api/freigaben/meine` (cross-Produktion), `GET /api/freigaben/matrix?prod=…&block=…`, `POST /api/freigaben/batch-entscheiden`.
- Tablet-tauglich, `debugIds` eintragen.

**Akzeptanz:** Genehmiger sieht alle offenen Punkte gruppiert, kann mehrere in einem Rutsch freigeben.

---

## Phase 6 — Lock-Gate & Rote-Seiten-Gate

- **Bestehendes Lock-System erweitern** (nicht neu). Revisionsfarben/-seiten aus DK-Settings übernehmen.
- **Lock-Gate**: Pre-Flight „N Budget-Freigaben ausstehend bei …"; **Override über DK-konfigurierte engere Gruppe** (z. B. Herstellungsleitung), Pflichtbegründung, auditiert in `freigabe_overrides`. Strenger als das Rote-Seiten-Gate.
- **Rote-Seiten-Gate**: blockiert Veröffentlichung bis Freigaben vorliegen; zeigt **fehlende Freigaben + zuständige Person**; **Override mit Doppelbestätigung** („Wollen Sie wirklich …?") + Audit + Markierung an der Änderung.
- Post-Lock-Cast-Änderung / neue Szene → feuert Dispo (rote Seite).

**Akzeptanz:** Locken/Veröffentlichen ist blockiert solange Freigaben offen sind; Override ist nur mit Begründung + (bei roten Seiten) Doppelbestätigung möglich und wird protokolliert.

---

## Phase 7 — DK-Settings UI

- Genehmiger-Editor: pro Eintrag `freigabe_typ`, `stufe`, `user_id`-ODER-`rolle`.
- Toggles „Freigabe deckt ab": Rollen / Motive / neue Szenen.
- Lock-Trigger: Werkstufe **oder** Fassungslabel.
- o.T.-Obergrenze pro Block (Zahl oder „unbegrenzt"; **Default unbegrenzt = aus**).
- **Anlage-/Bearbeitungsberechtigung**: konfigurieren, welche Rollen Figuren/Rollen und Motive anlegen/bearbeiten dürfen — **vorhandene Script-Berechtigungs-Patterns/Komponenten wiederverwenden**, nicht neu erfinden.
- **Lock-Override-Berechtigung**: engere Rollenliste.
- **Glossar-Editor** (Phase 8).
- Befugnis ≠ Sichtbarkeit klar trennen (Sichtbarkeit bleibt Feldgruppen-Modell). Override- vs. Konfigurationsrecht getrennt.

**Akzeptanz:** DK kann pro Produktion Genehmiger in drei Stufen für beide Typen festlegen.

---

## Phase 8 — Glossar (app-weit)

- CRUD `GET/POST/PUT/DELETE /api/glossar` (Schreiben DK-berechtigt). Seed aus Konzept-Abschnitt 12.
- **Beim Seeden den Nutzer fragen**: ausgeschriebene Klartext-Bezeichnung der DK-Rolle (einzige verbliebene offene Angabe aus dem Konzept) erfragen und im Glossar eintragen.
- Nutzung app-weit: als **Filter** (z. B. Komparsen-Typen, NT-Typen) und als **Tooltip-/Hover-Definition** an Begriffen (z. B. „SOC", „NT", „mit Spiel"). Komponente `GlossarTooltip` auf Basis von `Tooltip.tsx`.

**Akzeptanz:** Begriffe sind zentral pflegbar; ein unbekanntes Kürzel zeigt on-hover seine Glossar-Definition.

---

## Phase 9 — o.T.-Mengenkontrolle „Einsätze pro Motiv pro Block"

- Zählung aus `scene_characters.anzahl` (+ `default_anzahl`-Fallback), aggregiert als **Einsätze pro Motiv pro Block** (Schätzung: eine Gruppe = ein Einsatz pro Motiv).
- Drehtag-Zuordnung aus **Live-Dispo** (Cross-App). Obergrenze pro Block aus DK-Settings → **Warnung** in Statistik/Dispo (kein Hard-Block).
- Darstellung im bestehenden **Statistik-System** (neuer Tab/Widget).

**Akzeptanz:** Überschreitung der Block-Obergrenze erzeugt eine sichtbare Warnung, blockiert aber nichts.

---

## Phase 10 — `/hilfe`: Handbuch & Admin-DB-Doku

Claude Code legt unter der Route `/hilfe` an:

- **Userfreundliches Handbuch** (für alle Rollen, klare Sprache, Screenshots/Skizzen wo sinnvoll):
  - Was bedeuten die Farben im Editor (orange/rot), was tun bei Rot.
  - Wie der Freigabe-Workflow läuft (Budget vor Lock, Dispo nach Lock, rote Seiten).
  - Komparsen-Kategorien (o.T. / mit Text / mit Spiel) und warum sie unterschiedlich behandelt werden — mit Glossar-Verweisen.
  - Die Freigabe-Seite bedienen (Matrix, Detailliste, Batch, Meine vs. DK).
  - Lock & rote Seiten, Override und was er bedeutet.
  - Erneute Anfrage nach Ablehnung.
- **Ausführliche DB-Dokumentation im Admin-Bereich von `/hilfe`** (nur DK/Admin sichtbar):
  - Alle neuen/erweiterten Tabellen (v118–v125) mit Spalten, Typen, Constraints, Beziehungen.
  - Statusübergänge (`scene_characters.status`, `character_productions.freigabe_status`) als Zustandsdiagramm.
  - Die Auth-Chain und welche Endpoints welche Berechtigung (`requireDkAccess` / `requireBudgetAccess`) brauchen.
  - Migrations-Hinweis (`migrationFiles` in `index.ts`).
  - Cross-App-Abhängigkeiten (Live-Dispo für Einsätze, Vertragsdatenbank für Maße/Verträge, KI-Trainer für Korrekturen).

**Akzeptanz:** `/hilfe` ist für Endnutzer verständlich; der Admin-Bereich enthält eine vollständige, aktuelle Schema-Doku.

---

## Querschnitt (in jeder Phase)

- **Audit**: Direkteinträge, Overrides, Entscheidungen protokollieren (DSGVO Art. 5(2)-Kultur der Suite).
- **Tablet** & **Tooltip**-/`sw-ui`-/`debugIds`-Regeln einhalten.
- **Playwright-Tests** je Phase gegen `script.serienwerft.studio` mit `claude`-Account.
- **Build-Reihenfolge** beachten; Migrationen registrieren; phasenweise committen + deployen.

---

## Empfohlene Reihenfolge

0 → 1 → 3 → 4 (Kern-Workflow lauffähig) → 5 → 6 → 2 (Mistral) → 7 → 8 → 9 → 10.
Phase 2 kann nach Phase 4 nachgezogen werden, da die Heuristik (o.T. vs. mit Text) auch ohne Mistral trägt.
