# Startprompt für Claude Code — Anmerkungen-Hub bauen (script-app)

> Anweisung an die Claude-Code-Session. Repo: `script-app` (React/TS/Vite + Node/Express/TS,
> `script_db`).

## Kontext & Ziel
Du implementierst den **Anmerkungen-Hub** in der script-app. Das vollständige Design liegt im
beigefügten Paket. **Lies zuerst alle Dateien vollständig**, in dieser Reihenfolge:
`gesamtkonzept_anmerkungen_hub_v2.md` → `handoff_1` … `handoff_6` → `v196_*.sql`, `v197_*.sql`, `v198_*.sql`.
Die Handoffs sind gegen den Codebase verifiziert (V1–V4 bereits geprüft, Ergebnisse sind in v196
eingearbeitet). Halte dich an die Handoffs.

## Gesetzte Entscheidungen — nicht neu aufrollen
- Anker **out-of-band** (DB); im Editor als ProseMirror-**Decorations**, im Lesemodus als
  **DOM-Wrapping** — **nie** als Mark im `content`.
- Anker-Ziel als **Multi-FK** (`werkstufe_id`/`konzept_version_id`/`future_version_id` + CHECK
  genau eines, ON DELETE CASCADE). `node_id` ist **TEXT** (= ProseMirror node_id, String).
- **Übernehmen = nur Status + Audit**, kein automatischer Content-Eingriff; Ablehnen löst nur auf.
  Freeze-Guard **inline** (`SELECT eingefroren FROM werkstufen WHERE id = <anker.werkstufe_id>`).
- **Keine Block-Lineage** über Split/Merge → **szenenweite Suche** als Re-Anchoring-Fallback.
- **Messenger ist keine Abhängigkeit** (als Store tot). Benachrichtigung = minimale **In-App-Inbox**
  (v197); Kanäle/zentraler Dienst sind Folgeprojekt.
- Einbettung aus anderen Apps via **iframe + CSP `frame-ancestors *.serienwerft.studio`**.
- Nutzer-zentriert, **keine Read-/Activity-Analytics** (Betriebsrat §87 BetrVG / DSGVO).
- **Anmerkungs-Sichtbarkeit**: Nicht-Autoren sehen/annotieren nur `produktion`-Fassungen; eine
  additive **Bewertungs-Freigabe** (Verteiler = `colab_gruppe` mit `typ='bewertung'`) erweitert das
  pro Werkstufe. Ein geteiltes Prädikat `fn_werkstufe_sichtbar` ist die einzige Quelle der Wahrheit;
  die permissive Alt-Listing-Query in `werkstufen.ts` bleibt **unangetastet**.
- **Nicht-Autor-Auth** (geklärt): Nicht-Autoren = Suite-Nutzer mit Auth-Account ohne Script-Rolle;
  sie kommen über das geteilte `.serienwerft.studio`-Cookie durch `authMiddleware`
  (`validate-with-roles` → `valid:true, roles:[]`). `p_ist_autor = roles.length>0`. Kein
  Token/Proxy nötig. **Export/Preview hat heute KEIN Sichtbarkeits-Gate** (`exports.ts`, nur
  `authMiddleware`) → `fn_werkstufe_sichtbar` dort nachziehen.

## Repo-Pflichten
- Jede neue Migration in die hardcodierte `migrationFiles`-Liste in `backend/src/index.ts`
  eintragen (Verzeichnis wird NICHT gescannt): v196, v197, v198 in dieser Reihenfolge — das sind
  die aktuell nächsten freien Nummern (höchste im Repo ist v195); falls das Repo inzwischen weiter
  ist, die dann nächsten freien Nummern verwenden.
- **NIEMALS direkt auf dem Server patchen** — lokal ändern, commit + push, Deploy-Script.
- sw-ui: Plain-Directory-Copy, nur vorhandene Exporte; `AnnotationBadge` wiederverwenden.
- Tablet: Touch ≥44px, `mousemove/up` UND `touchmove/end`, kein CSS-`zoom`. TR-Tokens (Inter,
  8px-Grid, 8/12px-Radius, `src/components/Tooltip.tsx`).
- **Bestehendes wiederverwenden statt neu bauen**: `assemblePreviewHtml()` (Lesemodus),
  Statistik-System (Auswert-Funktionen), `werkstufen.sichtbarkeit`-Filter, `eingefroren`-Guard,
  `useFocusMode`, lock-gate, `requireDkAccess`.

## Baureihenfolge (= Handoff-Reihenfolge)
1. **v196 + Anker-Service** (Handoff 1): Tabellen; erzeugen/auflösen/re-anchoring; Status mit
   Freeze-Guard; `requireDkAccess`. Außerdem das Sichtbarkeits-Prädikat `fn_werkstufe_sichtbar`
   (streng, rollen-bewusst, **noch ohne** Bewertungs-Freigabe-Klausel) anlegen und das
   Anmerkungs-Gate darüber führen (Handoff 6 §3).
2. **Editor-Integration** (Handoff 2): Selektion→Anker (content + kopffeld), Decoration-Extension,
   Panel + Kontext-Brücke, Übernehmen/Ablehnen.
3. **Lese-/Anmerkungs-Modus** (Handoff 3): Mittelteil über `assemblePreviewHtml()`, DOM-Anchoring,
   Blatt-Navigation, iframe+CSP, `FloatingModal`. Werkstufen-Auflösung **und** Export/Preview-Gate
   über `fn_werkstufe_sichtbar` (nicht über die permissive Alt-Listing-Query).
4. **Auswert-Funktionen + Hub-Liste** (Handoff 4).
5. **Eingangskanäle + Tagging/Inbox** (Handoff 5) + v197.
6. **Bewertungs-Freigabe** (Handoff 6) + v198: Grant-Tabelle `werkstufe_bewertungsfreigabe` +
   `colab_gruppen.typ`; `fn_werkstufe_sichtbar` per `CREATE OR REPLACE` um die Bewertungs-
   Freigabe-Klausel erweitern; Grant-API + UI; Verteiler über bestehende `colab_gruppen`.

## `[align]`-Regel
Wo ein Handoff `[align]` markiert (existierende Endpoints, Export-CSS, CORS, KI-Config,
Komponenten-Props), **prüfe es rein lesend im Repo, bevor du baust**. Weicht der Befund vom Handoff
ab, **halte inne und melde den Widerspruch** — weiche nicht still ab.

## Scope-Grenzen
Bauen: der Hub (Schritte 1–6). **Nicht bauen**: zentraler Notification-Dienst, persönliches
Dashboard, Breakdown — Folgeprojekte; nur am **Event-Vertrag** (Handoff 5 §B2) bzw. am **neutralen
Anker** andockbar lassen.

## Erster Schritt
Lies das Paket. Löse die `[align]`-Punkte von Schritt 1 rein lesend auf. Dann **skizziere kurz
deinen Umsetzungsplan für Schritt 1** (v196 + Anker-Service) inkl. der zu erstellenden/anzupassenden
Dateien und Endpoints. Beginne erst nach dieser kurzen Plan-Bestätigung mit dem Code.
