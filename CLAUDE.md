# Script-App — Claude Code Projektrichtlinien

> **Globale Serienwerft-Regeln** (Firmendaten, E-Mail-System, Tablet-Kompatibilität,
> Design-System, Tooltip, Keymap, sw-ui, Playwright, Zugriffsmodell, Nginx-Security,
> Release-Disziplin, Team-Readiness) stehen im Block am Ende dieser Datei
> — zentral gepflegt in `serienwerft-docs/standards/CLAUDE_GLOBAL.md`, nicht hier editieren.
> Hier nur **Script-App-Spezifisches**.

## Stack & Repo

- **Frontend**: React 18 + TypeScript + Vite (`frontend/`)
- **Backend**: Node.js + Express + TypeScript (`backend/`)
- **DB**: PostgreSQL `script_db`, User `script_user` (PW lokal/`.env`, nicht im Repo)
- **GitHub**: `jdiepers14532/script-app`, Branch `main` (public)
- **Server**: `/srv/script/`, PM2 `script-backend` (id:31), Port 3014

### Deploy — NICHT VERHANDELBAR

**Niemals direkt auf dem Server patchen** (Configuration Drift — bei nächstem `git pull` verloren).
Immer: lokal → commit → push → Deploy.

**Umgebungen** (beide auf demselben VPS):
| | Verzeichnis | PM2 | Port | DB |
|---|---|---|---|---|
| prod | `/srv/script` | `script-backend` | 3014 | `script_db` |
| staging | `/srv/script-staging` | `script-backend-staging` | 3114 | `script_db_staging` |

Staging: `https://staging-script.serienwerft.studio` (noindex). Mail-Override aktiv (`MAIL_OVERRIDE_TO`) → alle Mails an die Test-Adresse, nie an echte Empfänger.

**Deploy** über das versionierte `deploy.sh [prod|staging]` (git pull + smart-build + Restart + Health-Check + Lock; `npm ci` nur bei Lockfile-Änderung; Prod setzt Rollback-Tag). Bequem vom lokalen Rechner über den Wrapper (liest VPS-Zugang aus `~/.serienwerft-secrets`, **kein Secret im Repo**):

```bash
bash ~/sw-deploy.sh script staging   # erst Staging (testen)
bash ~/sw-deploy.sh script prod      # dann Prod (live; fragt zur Sicherheit nach)
```

**Flow für Live-Apps**: push → `… staging` → auf staging-script testen → `… prod`.
Rollback (git-basiert): auf dem Server `cd /srv/script && git checkout <prod-tag oder commit> && bash deploy.sh prod`.
Mail-Guard: `backend/src/lib/mailGuard.ts` (`guardMailTo`) — bei neuen Mail-Versandstellen anwenden.

## Migrationen — KRITISCH

- Jede neue `.sql`-Migrationsdatei **MUSS** in der hardcodierten `migrationFiles`-Liste in `backend/src/index.ts` eingetragen werden — das System scannt das Verzeichnis **NICHT automatisch**. Vergessener Eintrag = Migration läuft nie.
- Migrationen idempotent halten: `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
- Nummerierung fortlaufend, bestehende Migrationen **nie überschreiben**.

## Debug-IDs (Script-spezifisch)

Neue Komponenten in `frontend/src/debugIds.ts` eintragen. Notation: `W` = Window · `F` = Panel · `D` = Drawer · `M` = Modal. Nummern nie recyceln.

## Auth & Rollen (Script-spezifisch)

- Rollen 1:1 aus auth.app — keine lokale Rollen-DB (Mapping-/Override-Prinzip: siehe globaler Block).
- Konfigurierbare Berechtigungen nicht hartcodieren — vorhandene Patterns in der Script-App wiederverwenden.

## KI

- Konfiguration: `GET/PUT /api/admin/ki-settings`, Provider pro Funktion wählbar.
- **Ollama**: 600s Timeout — für zeitkritische Aufgaben **Mistral Cloud** verwenden. Immer Regex-/Heuristik-Fallback vorsehen.
- KI-Korrekturen an KI-Trainer melden: `POST /api/training-events` mit Header `X-KI-Trainer-Secret`.

## Grundprinzip

- Vorhandenes erweitern, nicht neu bauen — bestehende Tabellen, Lock-System und DK-Settings-Strukturen wiederverwenden.
- Bei Unklarheit über Code-Stand: erst analysieren und nachfragen, dann implementieren.
- **Per-Szene-Editor**: Editor zeigt immer nur eine Szene — nie das gesamte Drehbuch. Zusammenfügen erst beim Export.

<!-- SW-GLOBAL:START -->
<!--
  KANONISCHE QUELLE der globalen Serienwerft-Entwicklungsregeln (secret-frei).
  Wird per serienwerft-docs/sync-claude-md.sh zwischen die SW-GLOBAL-Marker
  in ~/CLAUDE.md UND in jede <app>/CLAUDE.md geschrieben (siehe Skript).
  NUR HIER pflegen, dann sync ausführen.
  NIEMALS Secrets (Passwörter, Keys) hier ablegen — diese Datei landet in
  öffentlichen Repos.
-->

## Arbeitsweise — Release-Disziplin

Richtet sich nach dem Status der App:
- **App noch NICHT live (kein echter User)**: Nach jeder Code-Änderung sofort committen und deployen — schneller Iterations-Flow.
- **App IST live (echte User darauf)**: **NIEMALS** direkt auf Prod deployen. Flow: lokal → commit/push → Deploy auf **Staging** → dort prüfen → erst nach Freigabe auf **Prod**. Vor jeder Migration auf eine Live-DB: Backup. Nach jedem Prod-Deploy: Health-Check + bekannter Rollback-Pfad.

## Team-Readiness — Querschnittsprinzip für JEDE Entwicklung

Der Betrieb stellt von Solo- auf **Team-Entwicklung** um (mehrere Menschen + je eigenes Claude Code, gemeinsame GitHub-Repos). Jede Entwicklung muss das vorbereiten:
- **Secret-frei in Git**: Keine Passwörter/Keys in eingecheckten Dateien (auch nicht in CLAUDE.md). Echte Werte nur lokal (gitignored Secret-Datei, z. B. `~/.serienwerft-secrets`) bzw. als CI-Secret. Deploy-Befehle in Repos nutzen Variablen, keine Inline-`-pw '…'`.
- **Branch/PR statt direkt auf `main`**: `main` bleibt immer deploybar.
- **CI/CD-Deploy als Ziel**: Deploy gehört perspektivisch in GitHub Actions (Merge auf main → Deploy), nicht „jeder von lokal mit Root-PW".
- **GitHub Organization statt Privat-Account** für Zugriffs-/Rollenverwaltung.
- **Prod/Staging-Trennung** für jede Live-App.
- **Teilbares Projektwissen**: stabile „so arbeitet man hier"-Regeln → App-`CLAUDE.md` im Repo (secret-frei); tiefe Konzepte → `serienwerft-docs`. Der lokale `memory/`-Ordner ist pro Maschine und wird NICHT geteilt.

## Keine hardcodierten Firmendaten — PFLICHT

**NIEMALS** E-Mail-Adressen, Firmennamen, Kontaktdaten oder Adressen hardcoden. Diese kommen **ausschließlich** aus den Firmenstammdaten:
- **Quelle**: `GET https://auth.serienwerft.studio/api/admin/firmenstammdaten` (bzw. `app_settings`-Tabelle im auth-service)
- **Felder**: `company_name`, `company_address`, `it_contact_email`, `it_contact_name`, `it_contact_phone`, `company_email`, `company_phone`
- **Gilt für**: E-Mail-Templates (Subject, Body, Footer), 2FA-Issuer, E-Mail-From-Header, UI-Texte, PDFs, jede Anzeige von Firmendaten
- **Fallbacks** im Code nur als leerer String oder technischer Platzhalter (z. B. `'Serienwerft'`) — niemals echte Firmendaten
- **Bei Codereviews**: Alle Strings auf `@`, Firmennamen und Telefonnummern prüfen

## Zentrales E-Mail-System — PFLICHT

**E-Mail-Versand erfolgt IMMER über die Auth-App** — nie direkt per nodemailer/SMTP in den Apps:
- **Endpunkt**: `POST http://127.0.0.1:3002/api/internal/send-mail`
- **Auth**: `x-internal-key` Header mit `AUTH_INTERNAL_SECRET` (Wert aus `.env`, nicht im Repo)
- **Body**: `{ to, subject, html, reply_to? }` — `html` ist **body-only** (kein `<html><body>`-Wrapper)
- **Layout**: Auth-App hüllt den Body automatisch in Header/Footer (konfigurierbar in `/admin/email-system`)
- **SMTP-Konfiguration**: Nur in Auth-App — **nie** `SMTP_*` Env-Variablen in anderen Apps nutzen
- **E-Mail-Texte**: editierbar in den App-Settings — nie hardcoden. Nur Vorlagen-Funktionen, die parametrisierte body-only HTML zurückgeben.
- **getCompanyInfo()**: in `backend/src/utils/companyInfo.ts` jeder App — 5-min Cache, ruft `GET http://127.0.0.1:3002/api/public/company-info` ab
- **Staging-Schutz**: In Staging-Umgebungen mit Prod-Daten-Kopie ausgehende Mails per Override an eine Test-Adresse umleiten (`MAIL_OVERRIDE_TO`), nie an echte Empfänger.

## Tablet-Kompatibilität — PFLICHT

Apps müssen auf **PC (Maus) und Tablet (Touch)** funktionieren. Bei jeder UI-Änderung beide Eingabemodi mitdenken:
- **Erkennung**: `window.matchMedia('(pointer: coarse)').matches` — coarse = Touch/Tablet, fine = Maus/PC
- **Drag-Handler**: immer `mousemove/mouseup` UND `touchmove/touchend`; Touch-Events brauchen `{ passive: false }` wenn `preventDefault()` nötig ist; `clientX` via `'touches' in ev ? ev.touches[0].clientX : ev.clientX`
- **Touch-Targets**: mind. 44×44px auf Touch-Geräten (`@media (pointer: coarse)`)
- **Drag-Handles**: auf Touch-Geräten mind. 20px (`@media (pointer: coarse)`)
- **Default-Layout**: auf Touch kein Split-Panel-Default — nur ein Panel
- **CSS zoom**: nicht auf Touch verwenden (verschiebt Koordinaten)
- **Tooltips**: Hover-only Tooltips sind auf Touch nicht erreichbar — Shortcut-Hinweise dort weglassen

## Playwright-Tests — PFLICHT

- **KEIN `PLAYWRIGHT_TEST_MODE`** — Variable ist auf dem Server `false` und darf NICHT aktiviert werden
- **Nur den `claude`-Testaccount verwenden** (Login `noreply@serienwerft.studio`; Passwort: lokal, siehe `memory/playwright_credentials.md` — nicht im Repo)
- Auth via `POST https://auth.serienwerft.studio/api/auth/login` → `access_token`-Cookie extrahieren → als `Cookie`-Header mitsenden
- **Niemals** Produktions-DB manipulieren (Passwörter, 2FA, echte User-Accounts)
- Tests immer gegen die jeweilige App-Domain (bzw. deren Staging) laufen lassen

## Nginx Security — PFLICHT für jeden neuen Vhost

Alle internen Apps sind nicht für die Öffentlichkeit bestimmt. Jeder neue nginx-Vhost MUSS enthalten:

```nginx
server {
    listen 443 ssl;
    server_name meine-app.serienwerft.studio;

    include /etc/nginx/snippets/security-headers.conf;   # Crawler, HSTS, Clickjacking, MIME, Referrer
    include /etc/nginx/snippets/robots-noindex.conf;      # wenn der Block ein 'root' hat

    location = /index.html {
        include /etc/nginx/snippets/security-headers.conf;   # Location-Blöcke mit eigenem add_header MÜSSEN re-includen
        add_header Cache-Control "no-cache" always;
    }
}
```
- Snippets (zentral auf dem Server, nicht manuell bearbeiten): `security-headers.conf`, `robots-noindex.conf`
- **nginx `add_header`-Vererbung**: Jeder `location` mit eigenem `add_header` erbt KEINE Server-Level-Header → Snippet dort erneut includen.
- Immer `nginx -t` vor `systemctl reload nginx`.

## Zugriffsberechtigungsmodell

- Serverseitig durchgesetzt, fail-closed
- Multi-Rollen: `GET /api/mein-zugriff` berechnet Union `rw > r > none`
- `POST /api/tokens/validate` → `role` + `roles: string[]`
- **Tier 1 (global)**: `superadmin`, `geschaeftsfuehrung`, `herstellungsleitung`, `hauptbuchhaltung`
- **Tier 2 (produktionsgebunden)**: alle anderen
- React: `<VertraulichSection feldgruppe="G11" mode="hide">` → Hook `useZugriff(feldgruppe)` → `'rw'|'r'|'none'|'loading'`
- Auth-Rolle → lokale Rolle mappen; lokale Overrides haben Vorrang (gilt für alle Apps).

## Einstellungs-Hierarchie (App-übergreifend)

Hierarchisches System (wie MS365/Slack Enterprise): übergeordnete Settings werden vererbt, jede Ebene kann überschreiben.
```
Auth.app (global/firm-wide)        → In-Memory Cache 1h
  ↓ Override möglich
Produktion.app (produktionsspezif) → Redis Cache TTL 5min
  ↓ Override möglich
App User-Einstellungen (personal)  → direkt aus DB
  ↓ Effektiver Wert
```
- **UI-Regel**: jede Einstellung zeigt ihre Herkunft (🔒 „von Auth übernommen" = vererbt · ✏️ lokal gesetzt = überschreibt).

## Design System (Trade Republic Style)

- **Font**: Inter (400/500/600/700)
- **Colors**: Black `#000000`, White `#FFFFFF`, Green `#00C853`, Danger `#FF3B30`, Warning `#FFCC00`, Info `#007AFF`
- **Gray**: Surface `#F5F5F5`, Border `#E0E0E0`, Secondary `#757575`
- **Spacing**: 8px-Grid (xs:4, sm:8, md:16, lg:24, xl:32, 2xl:48) · **Radius**: 8px / 12px Cards · **Transitions**: 0.15s hover, 0.3s Modals
- **Charts**: Black, Green, Blue, Red, Yellow, Purple, Orange, Cyan
- **Breakpoints**: sm:640, md:768, lg:1024, xl:1280, 2xl:1536

### Tooltip — PFLICHTKOMPONENTE (nie selbst bauen)
Immer `src/components/Tooltip.tsx` verwenden. NIEMALS inline `title=""` auf Non-Button-Elementen, eigene Tooltip-Implementierungen oder externe Libraries (Radix/Tippy/Floating UI) für einfache Text-Tooltips.
Kanonische Specs: `background:#111 · color:#fff · font-size:11px · line-height:1.5 · padding:6px 10px · border-radius:6px · width:220px · white-space:pre-line · box-shadow:0 4px 12px rgba(0,0,0,.3) · z-index:99999 · pointer-events:none · position:fixed via getBoundingClientRect() · placement translate(-50%,-100%) 8px über Trigger`.
Usage: `<Tooltip text="Erklärung\nmit Zeilenumbruch"><Info size={12} /></Tooltip>`. Fehlt `Tooltip.tsx` in einer App → zuerst anlegen.

### Tastatur-Shortcuts / Keymap — PFLICHT
1. **Native Text-Tasten im Editor NIE überschreiben** (Pfeile, `Strg+Pfeile`, `Pos1`/`Ende`, `Bild auf/ab`) — App-Navigation nur mit Modifier.
2. **Browser-/OS-reservierte Kombis meiden**: `Strg/Cmd+Bild`, `Strg/Cmd+Ziffer`, `Strg+Shift+N/T/W`, `Strg+Alt+Pfeil`. Stattdessen z. B. `Alt+Bild` / `Alt+Ziffer`.
3. **Mac-Korrektheit**: Shortcuts immer über `event.code` matchen (physische Position, layout-unabhängig), nicht `event.key`. Bei Tiptap `addProseMirrorPlugins()` + `handleKeyDown`.
4. **Zentrale Registry pro App** (`frontend/src/shortcuts.ts`): `codes[]` + Modifier + `label()`. Angezeigte Kürzel MÜSSEN dort registriert sein.
5. **Eine Datenquelle** für Hilfe-Tab, Cheat-Sheet und Befehlspalette.
- Wiederverwendbare Mechanik in **sw-ui**: `CommandPalette` (`Strg/Cmd+K`), `ShortcutCheatSheet` (`?`), `useKeymapHotkeys`. App liefert nur `Command[]`/`ShortcutGroup[]`.

## sw-ui — Zentrales Komponentenpaket

- **Repo**: `github.com/jdiepers14532/sw-ui` · eingebunden als **Plain-Directory-Copy** unter `frontend/src/sw-ui/` (kein Git-Submodule!) · Import `from '../sw-ui'`
- **REGEL**: Wird ein UI-Element zum Standard erklärt → gehört in sw-ui, nicht in die App. Vor Arbeit an Editor/Chips/UI-Bausteinen erst prüfen, ob sw-ui schon etwas hat. Proaktiv fragen: *„Soll ich das in sw-ui aufnehmen?"*
- **Inhalt** (Stand pflegen): `DokumentVorlagenEditor` (+`emptyVorlagenEditorValue`), Tiptap-Extensions (`PlaceholderChipExtension`, `FontSizeExtension`, `ParagraphStyleExtension`, `ResizableImageExtension`), `AnnotationBadge`, `CompanyInfoModal`, `TerminologieProvider`/`useTerminologie`, Keymap (`CommandPalette`, `ShortcutCheatSheet`, `useKeymapHotkeys`).
- **Neue Komponente**: `sw-ui/src/<Name>.tsx` anlegen → Export in `sw-ui/src/index.ts` → Commit+Push sw-ui → in jede betroffene App nach `frontend/src/sw-ui/` kopieren + lokale `index.ts` anpassen.
<!-- SW-GLOBAL:END -->
