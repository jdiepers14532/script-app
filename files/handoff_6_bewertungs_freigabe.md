# Handoff 6 — Bewertungs-Freigabe (Verteiler-basierte Feedback-Freigabe)

> Eine einzelne **Werkstufe** wird additiv (ohne ihre Basis-`sichtbarkeit` zu ändern) einem
> **wiederverwendbaren, benannten Verteiler** zur Ansicht **und** Anmerkung freigegeben. Der
> Verteiler ist eine bestehende `colab_gruppe`. Geerdet auf die Discovery (D1–D6). `[align]` =
> beim Bau gegen den Code abzugleichen.

---

## 1. Modell (aus der Discovery)
- `werkstufen.sichtbarkeit` ist **einwertig** (D1) → die Freigabe muss **additiv** sein, nicht im
  Sichtbarkeits-Token.
- Der Verteiler = eine **`colab_gruppe`** (D2): `colab_gruppen` (id, produktion_id, name) +
  `colab_gruppen_mitglieder` (gruppe_id, user_id, user_name). Team/Colab teilen diese Tabelle
  bereits; ein „Produktionsbewertung"-Verteiler ist einfach eine weitere Gruppe.
- Neu ist nur ein **Grant** Werkstufe→Verteiler + die Gate-Erweiterung. dk_settings_access ist als
  Träger ungeeignet (flache Scope-Liste, kein Mitgliederbegriff, D4).
- Sauber getrennt von `rollen-freigabe`/Lock-Gate, `abgegeben`, scene-comment-webhook (D5) — **nicht**
  in `rollen_freigabe_*` einhängen.

---

## 2. Migration v198

```sql
-- v198_bewertungs_freigabe.sql  (nächste freie Nummer; nach v196/v197 — falls Repo weiter, anpassen)
-- In migrationFiles in backend/src/index.ts eintragen.

-- Diskriminator, damit Bewertungs-Verteiler NICHT versehentlich als team:/colab:-Sichtbarkeitsziel
-- auftauchen (und Collab-Gruppen nicht als Verteiler) — rein für saubere Auswahllisten:
ALTER TABLE colab_gruppen
  ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'colab'
  CHECK (typ IN ('colab','bewertung'));

CREATE TABLE IF NOT EXISTS werkstufe_bewertungsfreigabe (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstufe_id      UUID NOT NULL REFERENCES werkstufen(id)    ON DELETE CASCADE,
  gruppe_id         UUID NOT NULL REFERENCES colab_gruppen(id) ON DELETE CASCADE,  -- der Verteiler
  aktiv             BOOLEAN NOT NULL DEFAULT true,
  freigegeben_von   TEXT,
  freigegeben_am    TIMESTAMPTZ NOT NULL DEFAULT now(),
  zurueckgezogen_am TIMESTAMPTZ,
  UNIQUE (werkstufe_id, gruppe_id)
);
CREATE INDEX IF NOT EXISTS idx_bewfreigabe_werkstufe ON werkstufe_bewertungsfreigabe (werkstufe_id) WHERE aktiv;
CREATE INDEX IF NOT EXISTS idx_bewfreigabe_gruppe    ON werkstufe_bewertungsfreigabe (gruppe_id);
```

---

## 3. Das geteilte Sichtbarkeits-Prädikat (eine Quelle der Wahrheit)
Die strenge, **rollen-bewusste** Regel + die Bewertungs-Freigabe-Klausel kommen in **eine**
Funktion, statt den WHERE-Block drei Mal zu spiegeln (Drift-Gefahr, D3-Hinweis):

```sql
CREATE OR REPLACE FUNCTION fn_werkstufe_sichtbar(p_werkstufe uuid, p_user text, p_ist_autor boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM werkstufen w WHERE w.id = p_werkstufe AND (
         w.erstellt_von = p_user
      OR (w.sichtbarkeit = 'privat'  AND w.privat_gesetzt_von = p_user)
      OR  w.sichtbarkeit = 'produktion'                       -- alle
      OR (w.sichtbarkeit = 'autoren' AND p_ist_autor)         -- STRENGER als Alt-Listing (nur Autoren)
      OR ((w.sichtbarkeit LIKE 'team:%' OR w.sichtbarkeit LIKE 'colab:%')
          AND EXISTS (SELECT 1 FROM colab_gruppen_mitglieder cgm
                      WHERE cgm.gruppe_id = SPLIT_PART(w.sichtbarkeit, ':', 2)::uuid
                        AND cgm.user_id = p_user))
    )
  )
  OR EXISTS (                                                 -- additive Bewertungs-Freigabe
    SELECT 1 FROM werkstufe_bewertungsfreigabe bf
    JOIN colab_gruppen_mitglieder cgm ON cgm.gruppe_id = bf.gruppe_id
    WHERE bf.werkstufe_id = p_werkstufe AND bf.aktiv AND cgm.user_id = p_user
  )
$$;
```

Genutzt an **drei** Stellen (alle unser Code, nicht die Alt-Routen):
1. **Anmerkungs-Gate** (`anmerkungen.ts`, Schritt 1): `... WHERE fn_werkstufe_sichtbar(w.id, $user, $istAutor)`.
2. **Werkstufen-Auflösung des Lesemodus** (Handoff 3): welche Fassungen ein Nicht-Autor laden/öffnen
   darf — über dieses Prädikat, **nicht** über die permissive Alt-Listing-Query.
3. **Export/Preview-Gate**: bevor `assemblePreviewHtml()`-HTML einer Werkstufe ausgeliefert wird.

Wichtig: Die **bestehende** `werkstufen.ts:29–46`-Listing-Query bleibt **unverändert** (sie zeigt
`autoren` weiterhin an alle und dient dem Editor-/Autoren-Kontext). Wir verschärfen nicht
app-weit, sondern nur unsere Lese-/Anmerkungs-Flächen. **`p_ist_autor` = `roles.length > 0`** aus
`validate-with-roles` (app='script') — Autoren sind die für die Script-App registrierten Nutzer.
**Nicht-Autoren = Suite-Nutzer mit Auth-Account, aber ohne Script-Rolle**: sie authentifizieren
über das geteilte `.serienwerft.studio`-Cookie (A2: `validate-with-roles` liefert `valid:true,
roles:[]`, kein Login bei der Script-App nötig) und werden von `authMiddleware` durchgelassen. Kein
Token-/Proxy-Pfad nötig (alle Bewerter haben Auth-Accounts; kontolose Externe sind ausgeschlossen).

---

## 4. API
```
POST   /api/werkstufen/:id/bewertungsfreigabe   { gruppe_id }
  → Grant anlegen (oder reaktivieren). Recht: requireDkAccess (Tier-1 / dk-scope) der Produktion
    der Werkstufe (Kette werkstufe→folge→produktion_id, D6). 201.
GET    /api/werkstufen/:id/bewertungsfreigabe
  → aktive Grants dieser Werkstufe [{ gruppe_id, name, mitglieder_count, freigegeben_am }].
DELETE /api/werkstufen/:id/bewertungsfreigabe/:grantId
  → zurückziehen (aktiv=false, zurueckgezogen_am=now). Gleiches Recht.
```
Verteiler-Verwaltung (Anlegen, Mitglieder pflegen) läuft über die **bestehenden colab_gruppen-
Endpoints** in `teamwork.ts` — mit `typ='bewertung'` beim Anlegen, damit die Sichtbarkeits-
Auswahl (`colab:`/`team:`) und die Verteiler-Auswahl getrennte Listen zeigen. `[align]` die genaue
Signatur des Gruppen-Anlegen-Endpoints.

---

## 5. UI
- Am Werkstufen-Kontext (neben/bei „Sichtbarkeit", `PUT …/sichtbarkeit`): Aktion **„Zur Bewertung
  freigeben"** → Verteiler wählen (colab_gruppen mit `typ='bewertung'`, produktions-skopiert) →
  Grant anlegen. Aktive Freigaben anzeigen, einzeln zurückziehbar.
- **Verteiler verwalten** = die bestehende Gruppen-UI (Name + Mitglieder), Kandidaten aus der
  globalen App-User-Liste (D6, wie der heutige Gruppen-Beitritt in `teamwork.ts:159`). Kein neuer
  `production→users`-Endpoint.
- Für Bewerter: die freigegebene Fassung erscheint im Lesemodus (über das Prädikat aus §3), lesbar
  und annotierbar wie eine Produktionsfassung.

---

## 6. Integration mit Schritt 1
Das Anmerkungs-Gate in `anmerkungen.ts` (Schritt 1) wird bereits mit dem **strengen, rollen-
bewussten** Prädikat gebaut; die Bewertungs-Freigabe-Klausel ist die `OR EXISTS(...bf...)`-Zeile in
§3. Bauen Schritt 1 das Gate über `fn_werkstufe_sichtbar` (zunächst ohne die bf-Klausel, falls v198
noch nicht da ist), dann ist das Andocken später ein Einzeiler in der Funktion — kein Umbau der
Endpoints. Empfehlung: v198 + Funktion gleich mitnehmen, dann ist das Gate von Anfang an vollständig.

---

## 7. Gegenzuprüfen (`[align]`)
1. **Geklärt (A2)**: Autor = Script-registriert (`roles.length>0` aus `validate-with-roles`).
   Nicht-Autoren = Auth-Account ohne Script-Rolle, kommen über das geteilte `.serienwerft.studio`-
   Cookie durch `authMiddleware` (`valid:true, roles:[]`). Kein Externen-/Token-Pfad nötig.
2. **Bestätigt (A1)**: Export/Preview (`exports.ts`, nur `authMiddleware`) hat KEIN
   Sichtbarkeits-Gate — jeder Authentifizierte kann jede Fassung als HTML ziehen. Prädikat dort
   einsetzen (unabhängig von der Bewertungs-Freigabe; schließt ein bestehendes Leck).
3. colab_gruppen-Anlegen-/Mitglieder-Endpoints in `teamwork.ts` (Signaturen, `typ`-Feld ergänzbar).
4. Lädt der Lesemodus-Viewer Werkstufen über eine eigene Query (gut) oder versehentlich über die
   permissive Alt-Listing-Query (dann auf das Prädikat umstellen).
