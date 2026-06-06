# Handoff 5 — Eingangskanäle (Phase 7) + Tagging/Events/Inbox (Phase 8)

> Schließt die Hub-Spezifikation ab. Neue Tabellen in Migration **v197** (in `migrationFiles` in
> `backend/src/index.ts` eintragen). `[align]` = gegen die echte Codebase / KI-Config abgleichen.

---

# Teil A — Eingangskanäle (Phase 7)

## A1 — Abteilungs-API (Kostüm/Ausstattung/Requisite …)
Andere Abteilungen erzeugen Anmerkungen, ohne ins Drehbuch zu schreiben — über **denselben**
`POST /api/anmerkungen` (Handoff 1 §2), nur aus einer anderen App heraus:
- **Bevorzugt über den eingebetteten Viewer** (Handoff 3 §7, iframe = same-origin zu script-app):
  Der Abteilungs-User annotiert im Viewer, es ist der normale POST — keine zusätzliche API-Fläche.
- **Direkt/programmatisch** (z. B. „Kostüm markiert Szene 5: Outfit-Info fehlt"): cross-subdomain
  `POST` mit Shared-Cookie; dafür CORS-Allowlist `*.serienwerft.studio` mit Credentials.
- **Anker meist szenen-weit**: `store = NULL`, nur `scene_identity_id` + `werkstufe_id` (kein
  node_id/Selektor). Das Anker-Modell trägt das (Handoff 1: `anker_szene_nur_werkstufe`-CHECK,
  `store` optional).
- **`quelle` serverseitig validieren**: Die aufrufende App/Rolle darf nur die ihr zustehende
  `quelle` setzen (eine Kostüm-App kann nicht `quelle='redaktion'` posten). Gegen
  `req.user.roles`/Origin prüfen.

## A2 — Transkription → KI → Entwürfe → Sichtung
Eine Sitzungs-/Abnahme-Transkription wird per KI in **kategorisierte Entwürfe** ausgewertet —
**niemals auto-angewendet**. Entwürfe leben in einer eigenen Staging-Tabelle, nicht als echte
Anmerkungen, bis ein Mensch sie übernimmt.

Pipeline:
```
POST /api/transkriptionen/auswerten { transcript, folge_id, werkstufe_id }
  → KI (bestehende Config: Ollama lokal / Mistral, admin-konfigurierbar je Funktion) [align]
  → strukturierte Liste von Entwürfen, je: { vorschlag_quelle, vorschlag_kategorie, body,
       szene_hinweis (Szenennr./Motiv), zitat? }
  → Server-Mapping:
      szene_hinweis → scene_identity (Match scene_nummer/ort_name in der Folge)
      zitat vorhanden → locateWithContext im content der Szene → Span-Anker (store='content')
      sonst → szenen-weiter Entwurf (store=NULL)
      konfidenz = Match-Qualität
  → anmerkung_entwurf-Zeilen (status='offen'). KEINE anmerkung/anker.
```
Sichtungs-UI: Liste der Entwürfe (zur vermuteten Stelle springen zum Verifizieren), Body/Quelle/
Kategorie editierbar, dann **Übernehmen** → erzeugt echten `anker`+`anmerkung` →
`anmerkung_entwurf.status='uebernommen'`; oder **Verwerfen** (`status='verworfen'`). Auto-Promotion
ist ausgeschlossen.

`entity-check` (V/E: liefert Entity-Matches per Name, **keine Spans**) hilft beim Vorschlagen von
`kategorie`/Figuren-Bezug, ersetzt aber nicht den `locateWithContext`-Positionsauflöser für `zitat`.

---

# Teil B — Tagging, Events, Minimal-Inbox (Phase 8)

## B1 — Tagging
```
POST /api/anmerkungen/:id/tags { user_ids: [...] }
  → für jeden user_id: SICHTBARKEITS-GATE prüfen (darf der User die anker.werkstufe_id sehen?
     werkstufen.sichtbarkeit). Nicht-sichtbar → nicht taggen/benachrichtigen (kein Leak).
  → anmerkung_tag-Zeilen anlegen.
  → Event emittieren (B3).
```
Taggbare Personen aus der Auth-App (User + Rollen + Produktionszuordnung), produktions-skopiert —
kein eigenes Verzeichnis.

## B2 — Event-Vertrag (stabil, jetzt festlegen)
Die Hülle ist erweiterbar (`typ` wächst); Konsumenten (jetzt: In-App-Inbox; später:
Notification-Dienst) lesen dieselbe Struktur:
```json
{
  "typ": "anmerkung.getaggt",
  "app": "script",
  "produktion_id": "...",
  "folge_id": "...",
  "anmerkung_id": "...",
  "anker": { "werkstufe_id": "...", "scene_identity_id": "..." },
  "von_user_id": "...",
  "an_user_ids": ["..."],
  "deeplink": "https://script.serienwerft.studio/folge/<id>?anmerkung=<id>",
  "erstellt_am": "..."
}
```

## B3 — Event-Emission (jetzt minimal, später zentral)
- **Jetzt**: pro getaggtem (sichtbarkeits-geprüftem) User eine `benachrichtigung`-Zeile (In-App).
- **Später (Folgeprojekt)**: dasselbe Event zusätzlich an den zentralen **Notification-Dienst**
  posten (Shared Secret, analog KI-Trainer `X-KI-Trainer-Secret`), der dann E-Mail/Messenger nach
  den in der **Auth-Einstellungs-Hierarchie** gepflegten Präferenzen zustellt. Der Vertrag (B2)
  bleibt unverändert — der Dienst ist nur ein weiterer Konsument.

## B4 — Minimal-Inbox (In-App)
```
GET   /api/benachrichtigungen?ungelesen=true   → meine Benachrichtigungen
PATCH /api/benachrichtigungen/:id/gelesen
```
UI: Glocken-Badge mit Ungelesen-Zähler (sw-ui `AnnotationBadge` wiederverwendbar), Dropdown-Liste,
Klick → `deeplink` zur Anmerkung. Nutzer-zentriert („meine Benachrichtigungen"), keine
Read-/Activity-Analytics (Betriebsrat/DSGVO).

---

## Migration v197

```sql
-- v197_eingangskanaele_inbox.sql  (in migrationFiles eintragen)

CREATE TABLE IF NOT EXISTS anmerkung_entwurf (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quelle_session      TEXT,                 -- Transkriptions-/Sitzungs-Referenz
  vorschlag_quelle    TEXT,
  vorschlag_kategorie TEXT,
  body                JSONB NOT NULL,
  -- Anker-Vermutung (unverbindlich, gleiche Felder wie anker):
  werkstufe_id        UUID REFERENCES werkstufen(id)       ON DELETE CASCADE,
  scene_identity_id   UUID REFERENCES scene_identities(id) ON DELETE CASCADE,
  store               TEXT CHECK (store IN ('content','kopffeld')),
  node_id             TEXT,
  feldname            TEXT,
  selektor            JSONB,
  konfidenz           REAL,
  status              TEXT NOT NULL DEFAULT 'offen'
                        CHECK (status IN ('offen','uebernommen','verworfen')),
  erstellt_am         TIMESTAMPTZ NOT NULL DEFAULT now(),
  gesichtet_von       UUID,
  gesichtet_am        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_entwurf_folge ON anmerkung_entwurf (werkstufe_id, status);

CREATE TABLE IF NOT EXISTS benachrichtigung (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,             -- Empfänger (auth user_id)
  typ           TEXT NOT NULL,             -- 'anmerkung.getaggt' | ...
  anmerkung_id  UUID REFERENCES anmerkung(id) ON DELETE CASCADE,
  von_user_id   UUID,
  deeplink      TEXT NOT NULL,
  gelesen       BOOLEAN NOT NULL DEFAULT false,
  erstellt_am   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_benachr_user ON benachrichtigung (user_id, gelesen);
```

---

## Gegenzuprüfen (`[align]`)
1. KI-Aufrufmuster (Ollama/Mistral, `ki-settings` pro Funktion) für die Transkriptions-Auswertung.
2. CORS-Konfiguration für direkte cross-subdomain-POSTs aus Abteilungs-Apps (`*.serienwerft.studio`,
   Credentials) — oder ausschließlich über den eingebetteten Viewer.
3. `quelle`-Validierung gegen Rolle/Origin der aufrufenden App.

---

## Damit ist der Hub vollständig spezifiziert
Eigene Folgeprojekte (mitgedacht, nicht hier gebaut): der zentrale **Notification-Dienst** +
persönliches **Dashboard** (konsumieren den Event-Vertrag B2; Präferenzen in der Auth-Hierarchie)
und der **Breakdown** (zweiter Konsument desselben Ankers).
