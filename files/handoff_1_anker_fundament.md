# Handoff 1 — Anker-Fundament (Migration v196 + Anker-Service)

> Tragendes Stück des Anmerkungen-Hubs. Backend Node/Express/TS, `script_db` (PostgreSQL 16).
> Finalisiert gegen Verify V1–V4 — die frühere Inline-DDL wurde durch die separate Datei
> `v196_anker_anmerkungen.sql` ersetzt.

---

## 0. Pflicht-Schritte
- `v196_anker_anmerkungen.sql` (Teil des Pakets) nach `backend/src/migrations/` legen UND in der
  hardcodierten `migrationFiles`-Liste in `backend/src/index.ts` eintragen (Verzeichnis wird nicht
  automatisch gescannt).
- `gen_random_uuid()` ist in PG16 ohne Extension verfügbar.

---

## 1. Datenmodell
Finales, deploy-fertiges DDL = **`v196_anker_anmerkungen.sql`**. Kernpunkte (final, gegen V1–V4):
- **Ziel als Multi-FK** statt polymorphem (typ,id): `werkstufe_id` / `konzept_version_id` /
  `future_version_id`, je eigener FK mit `ON DELETE CASCADE`, plus `CHECK (genau eines gesetzt)`
  — erfüllt „kein gemeinsamer FK" und gibt referenzielle Integrität (keine verwaisten Anker).
- `scene_identity_id UUID REFERENCES scene_identities(id) ON DELETE CASCADE` (V1: PK = `id UUID`).
- `store ('content'|'kopffeld')`, `feldname`, `selektor JSONB`.
- **`node_id TEXT`** (V3: ProseMirror node_id wird als String gespeichert). **Kein** separates
  `block_uuid_ref` — der `node_id` ist selbst der Schlüssel in `szenen_revisionen.block_uuid` (TEXT).
- `anker_status ('verankert'|'verschoben'|'verwaist')`, `konfidenz`.
- Tabellen `anmerkung`, `anmerkung_kommentar`, `anmerkung_tag` wie in v196.sql.

---

## 2. Anker-Service — API-Vertrag
Shared-Cookie-Auth; Schreibrecht via `requireDkAccess(req => productionId)` (V4: Tier-1-Rollen
frei, sonst `dk_settings_access`; kein dedizierter „ist-Autor"-Boolean).

```
POST   /api/anmerkungen
  Body: { werkstufe_id|konzept_version_id|future_version_id, scene_identity_id?, store?,
          node_id?, feldname?, selektor?, quelle, kategorie?, body }
  → legt anker + anmerkung an. 201 { anmerkung, anker }

GET    /api/anmerkungen?folge_id=&werkstufe_id=
  → Liste mit Sichtbarkeits-Gate (werkstufen.sichtbarkeit). Jede Anmerkung mit aufgelöstem Anker.

POST   /api/anker/resolve   Body: { werkstufe_id, anker_ids? }
  → [{ anker_id, anker_status, konfidenz, node_id, position }] für Liste/Inbox/„prüfen"-Queue.

PATCH  /api/anmerkungen/:id/status   Body: { status, aufloesung? }
  → Status + Audit (aufgeloest_von/_am). FREEZE-GUARD (inline, V4):
       SELECT w.eingefroren FROM werkstufen w WHERE w.id = <anker.werkstufe_id>
       → true  ⇒ 403 { code:'FROZEN' }.
    Übernehmen = NUR Status + Audit, KEIN Auto-Content (der Autor editiert selbst);
    Ablehnen berührt keinen content. Nur Autor-Recht.

POST   /api/anmerkungen/:id/kommentare   Body: { body }      → Thread
POST   /api/anmerkungen/:id/tags         Body: { user_ids[] } → tags + Event (Handoff 5)
```
Event-Vertrag fürs Tagging: siehe Handoff 5 §B2 (jetzt In-App-Inbox, später Notification-Dienst).

---

## 3. Re-Anchoring-Algorithmus (pro Anker)
```
1. store='kopffeld':
   dokument_szene zu (scene_identity_id, werkstufe_id) holen → feldname vorhanden & nicht leer?
   → 'verankert' ; sonst 'verwaist'.

2. store='content':
   content der Szene holen → Block per node_id suchen.
   a) Block gefunden:
      - selektor.position [start,end] gegen quote.exact verifizieren → 'verankert' (1.0)
      - sonst quote.exact mit prefix/suffix-Kontext im Block → 'verschoben' (Kontext-Konfidenz)
      - sonst Fuzzy (diff-match-patch) im Block → score >= Schwelle → 'verschoben'
   b) Block per node_id NICHT gefunden (Split/Merge -> neue node_id, KEINE Lineage, V3):
      → SZENENWEITE SUCHE: quote.exact über alle Blöcke der Szene; gefunden → 'verschoben'
        + node_id serverseitig aktualisieren; sonst 'verwaist'.

3. anker_status/konfidenz persistieren (oder an den Client zurückgeben).
```
Suchraum ist immer ein Block (im Fallback eine Szene) → günstig. `node_id` ist über Werkstufen
identisch (Invariante 1.3), daher löst derselbe Anker in jeder Fassung auf. Zusätzlich flaggt
`GET /api/werkstufen/:id/diff/:otherId → changed_block_uuids[]` Anker auf geänderten Blöcken für
die „prüfen"-Queue.

content-Row je Szene (V2): `SELECT * FROM dokument_szenen WHERE werkstufe_id=$1 AND
scene_identity_id=$2 AND geloescht=false` (eindeutig via `dokument_szenen_werk_si_unique`).

---

## 4. Integrationsnotizen
- **Freeze-Guard**: kein Helper — die Inline-Query (V4) im Status-Endpoint replizieren.
- **Sichtbarkeit**: `werkstufen.sichtbarkeit`-WHERE-Filter aus `werkstufen.ts` für GET + Tagging.
- **Decorations**: Frontend rendert aus aufgelösten Ankern (Handoff 2/3), kein Content-Mark; beim
  Speichern Selektor neu berechnen.
- **node_id** ist TEXT (String). Split → neue node_id (szenenweiter Fallback statt Lineage),
  Merge → behält erste. Beim Erzeugen eines content-Ankers immer das Selektor-Bündel mitschreiben.

---

## 5. Verify-Ergebnisse (V1–V4, bestätigt)
1. `scene_identities.id` = UUID (PK) → FK + ON DELETE CASCADE.
2. content-Row eindeutig via `dokument_szenen_werk_si_unique` (v111); altes `fassung_id` deprecated.
3. `szenen_revisionen.block_uuid` = TEXT (= node_id); KEINE Block-Lineage (nur Deltas);
   Cross-Werkstufen-Diff via `GET /api/werkstufen/:id/diff/:otherId → changed_block_uuids[]`.
4. Freeze-Guard = Inline-Query auf `werkstufen.eingefroren`; Lock-Gate = eigener Endpoint
   `GET /api/rollen-freigabe/:produktionId/lock-gate`; Schreibrecht via `requireDkAccess`.

---

## 6. Danach
Phase 3 (Editor-Integration, Handoff 2) → Phase 4 (Lese-Modus, Handoff 3) → Auswert-Funktionen +
Hub-Liste (Handoff 4) → Eingangskanäle + Tagging/Inbox (Handoff 5).
