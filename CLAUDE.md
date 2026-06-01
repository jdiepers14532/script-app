# Script-App — Claude Code Projektrichtlinien

## Stack & Repo

- **Frontend**: React 18 + TypeScript + Vite (`frontend/`)
- **Backend**: Node.js + Express + TypeScript (`backend/`)
- **DB**: PostgreSQL `script_db`, User `script_user`, PW `ScriptDB2026`
- **GitHub**: `jdiepers14532/script-app`, Branch `main`
- **Server**: `/srv/script/`, PM2 `script-backend` (id:31), Port 3014

### Deploy — NICHT VERHANDELBAR

**Niemals direkt auf dem Server patchen** (Configuration Drift — bei nächstem `git pull` verloren).

Immer: lokal → commit → push → SSH-Deploy. Deploy startet immer mit `git pull` im Repo-Root:

```bash
plink -ssh -P 2222 root@212.132.108.242 -pw 'QCn50sEt' \
  "cd /srv/script && git pull && cd backend && npm ci && npm run build && pm2 restart script-backend --update-env && cd ../frontend && npm ci && npx vite build"
```

Nur Backend oder nur Frontend: jeweiligen `cd …`-Teil weglassen.

## Migrationen — KRITISCH

- Jede neue `.sql`-Migrationsdatei **MUSS** in der hardcodierten `migrationFiles`-Liste in `backend/src/index.ts` eingetragen werden — das System scannt das Verzeichnis **NICHT automatisch**. Vergessener Eintrag = Migration läuft nie.
- Migrationen idempotent halten: `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
- Nummerierung fortlaufend, bestehende Migrationen **nie überschreiben**.

## Design-System (Trade-Republic-Stil)

- **Font**: Inter (400/500/600/700)
- **Farben**: Black `#000000` · White `#FFFFFF` · Green `#00C853` · Danger `#FF3B30` · Warning `#FFCC00` · Info `#007AFF` · Surface `#F5F5F5` · Border `#E0E0E0`
- **Spacing**: 8px-Grid · **Radius**: 8px / 12px Cards · **Transitions**: 0.15s hover, 0.3s Modals

**Tooltip**: Immer `src/components/Tooltip.tsx` — niemals `title=""`, Eigenbauten oder externe Libraries.

**sw-ui**: Plain-Directory-Copy nach `frontend/src/sw-ui/`, kein Git-Submodule. Nur tatsächlich vorhandene Exporte verwenden — kein Blind-Copy. Bei Updates nur vorhandene Exports in `index.ts` pflegen.

**Debug-IDs**: Neue Komponenten in `frontend/src/debugIds.ts` eintragen. Notation: `W` = Window · `F` = Panel · `D` = Drawer · `M` = Modal. Nummern nie recyceln.

## Tablet-Kompatibilität — Pflicht bei jeder UI-Änderung

- **Erkennung**: `window.matchMedia('(pointer: coarse)').matches`
- **Drag-Handler**: immer `mousemove/mouseup` UND `touchmove/touchend`; `{ passive: false }` wenn `preventDefault()` nötig; `clientX` via `'touches' in ev ? ev.touches[0].clientX : ev.clientX`
- **Touch-Targets**: mind. 44×44px · **Drag-Handles**: mind. 20px · **CSS `zoom`**: NICHT auf Touch (verschiebt Koordinaten)

## Auth & Rollen

- Rollen 1:1 aus auth.app — keine lokale Rollen-DB. Auth-Rolle auf lokale Rolle mappen; lokale Overrides haben Vorrang.
- Konfigurierbare Berechtigungen nicht hartcodieren — vorhandene Patterns in der Script-App wiederverwenden.

## KI

- Konfiguration: `GET/PUT /api/admin/ki-settings`, Provider pro Funktion wählbar.
- **Ollama**: 600s Timeout — für zeitkritische Aufgaben **Mistral Cloud** verwenden. Immer Regex-/Heuristik-Fallback vorsehen.
- KI-Korrekturen an KI-Trainer melden: `POST /api/training-events` mit Header `X-KI-Trainer-Secret`.

## Tests (Playwright)

- Immer gegen `https://script.serienwerft.studio`.
- Login: `POST https://auth.serienwerft.studio/api/auth/login` → `access_token`-Cookie als `Cookie`-Header.
- **Nur `claude`-Testaccount** (`noreply@serienwerft.studio` / `Claude2026`).
- **KEIN `PLAYWRIGHT_TEST_MODE`** auf dem Server — Variable ist `false` und bleibt es.
- **Niemals** Produktions-DB, Passwörter, 2FA oder echte User-Accounts manipulieren.

## Grundprinzip

- Vorhandenes erweitern, nicht neu bauen — bestehende Tabellen, Lock-System und DK-Settings-Strukturen wiederverwenden.
- Bei Unklarheit über Code-Stand: erst analysieren und nachfragen, dann implementieren.
- **Per-Szene-Editor**: Editor zeigt immer nur eine Szene — nie das gesamte Drehbuch. Zusammenfügen erst beim Export.
