-- v179: Glossar — erklaerung_lang + quellen Felder
--
-- erklaerung     = Kurzform (bleibt, für Tooltip / Tabellenansicht)
-- erklaerung_lang = Ausführliche Erklärung mit Abschnitten (Markdown-light: ## / • / **bold**)
-- quellen        = Quellenangaben, eine pro Zeile, Format: "Titel | URL" oder nur "URL"

ALTER TABLE dk_glossar          ADD COLUMN IF NOT EXISTS erklaerung_lang TEXT NOT NULL DEFAULT '';
ALTER TABLE dk_glossar_defaults ADD COLUMN IF NOT EXISTS erklaerung_lang TEXT NOT NULL DEFAULT '';
ALTER TABLE dk_glossar          ADD COLUMN IF NOT EXISTS quellen          TEXT NOT NULL DEFAULT '';
ALTER TABLE dk_glossar_defaults ADD COLUMN IF NOT EXISTS quellen          TEXT NOT NULL DEFAULT '';

-- ── Unterbruch eintragen ───────────────────────────────────────────────────────
INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, erklaerung_lang, quellen, term_en, kategorie, sort_order)
SELECT
  '',
  'Unterbruch',
  'Dramaturgisches Mittel: eine laufende Szene wird an einem Spannungsmoment absichtlich abgebrochen, um zu einem anderen Handlungsstrang zu schneiden — und später dorthin zurückzukehren. Kernwerkzeug der Zopfdramaturgie in Daily Soaps.',
  $LANG$## Kernbedeutung

Ein Unterbruch (= Unterbrechung; im CH/AT-Raum besonders gebräuchlich) bezeichnet das absichtliche Abbrechen einer Szene oder Handlung an einem Spannungsmoment, um zu einem anderen Handlungsstrang zu wechseln — und später zur unterbrochenen Szene zurückzukehren.

## Einbettung in die Zopfdramaturgie (Daily Soap / Telenovela)

Das ist das Kernwerkzeug der Zopfdramaturgie, die in Daily Soaps wie Rote Rosen Standard ist:

• 3–4 Handlungsstränge (A/B/C/D) werden parallel erzählt
• Jeder Strang wird an einem Spannungsmoment unterbrochen → Schnitt auf anderen Strang
• Wechselmuster: ABC → BCA → CAB → ABC
• Der Unterbruch erzeugt Spannung und hält den Zuschauer über den Schnitt hinaus bei der Stange

## Im Drehbuchformat

• Dialog-Unterbruch: Gedankenstrich — (äußere Handlung unterbricht Dialog)
• Figurenunterbrechung: (INTER) hinter dem Figurennamen
• Szenenrückkehr nach Unterbruch: Zusatz CONTINUED / WEITER

## Im Sender-Kontext (ARD etc.)

Ein Unterbruch kann auch der **Werbepause-Marker** im Skript sein — der Punkt, an dem das Skript explizit einen Cliffhanger-Moment vorschreibt, damit Zuschauer nach der Werbung zurückkehren.

## Verwandte Begriffe

**Cliffhanger** · **Zopfdramaturgie** · **PEN** (Penultimate) · **Wechselschnitt (WS)** · **Parallelmontage**$LANG$,
  $QUELLEN$Formale Drehbuchstandards | https://dramaqueen.info/wiki/formale-drehbuchstandards/
Parallelmontage — Wikipedia | https://de.wikipedia.org/wiki/Parallelmontage
Telenovelas — bpb.de | https://www.bpb.de/system/files/dokument_pdf/PuF_FS_39_Telenovelas.pdf
Daily Soaps — bpb.de | https://www.bpb.de/system/files/dokument_pdf/PuF_FS_38_Soap%20Operas_DailySoaps.pdf
Szenenübergänge | https://dramaqueen.info/wiki/szenenuebergaenge/$QUELLEN$,
  'Scene interruption / Dramatic break',
  'dramaturgie',
  153
WHERE NOT EXISTS (
  SELECT 1 FROM dk_glossar_defaults WHERE name = 'Unterbruch' AND kategorie = 'dramaturgie'
);
