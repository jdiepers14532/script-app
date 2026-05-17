import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function SzenenEditorTab() {
  return (
    <div style={{ padding: '28px 0' }}>

      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}15 0%, ${C.green}10 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12,
        padding: '24px 28px',
        marginBottom: 36,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Szenenübersicht (Sidebar) & Szenen-Editor</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Die Script-App ist ein <strong>Per-Szene-Editor</strong>: Es wird immer nur eine einzelne Szene bearbeitet.
          Die Szenenübersicht (linke Sidebar) zeigt alle Szenen der aktuellen Werkstufe,
          der Szenen-Editor (Kopfbereich rechts) zeigt die Metadaten und den Content der ausgewaehlten Szene.
          Darunter schließen sich die Dokument-Editor-Panels (Storyline / Drehbuch) an.
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 1. Gesamtlayout */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="1. Überblick — Aufbau des Arbeitsfensters">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Das Arbeitsfenster besteht aus drei Bereichen, die horizontal nebeneinander liegen:
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Aufbau des Arbeitsfensters</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 2fr 24px 1fr', gap: 0, padding: 16, alignItems: 'stretch' }}>
            {/* Scene List */}
            <div style={{ border: `2px solid ${C.blue}`, borderRadius: 8, padding: 12, background: C.blue + '08' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.blue, marginBottom: 6 }}>Szenenleiste (links)</div>
              <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                Suchfeld<br/>
                Alle Szenen der Fassung<br/>
                Drag &amp; Drop zum Sortieren<br/>
                Rechtsklick-Menü<br/>
                Kommentar-Anzeige
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, color: C.muted }}>|</span>
            </div>
            {/* Editor area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ border: `2px solid ${C.green}`, borderRadius: 8, padding: 10, background: C.green + '08' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.green, marginBottom: 4 }}>Szenenkopf</div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  SZ-Nr · Stoppzeit · Motiv · I/A · Drehtag<br/>
                  Zusammenfassung · Rollen · Komparsen · Szeneninfo<br/>
                  Kommentar-Button · PDF-Export
                </div>
              </div>
              <div style={{ border: `2px solid ${C.orange}`, borderRadius: 8, padding: 10, background: C.orange + '08', flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.orange, marginBottom: 4 }}>Schreibbereich</div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Storyline (links) | Drehbuch (rechts)<br/>
                  Nebeneinander oder einzeln<br/>
                  Breite per Ziehen anpassbar
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, color: C.muted }}>|</span>
            </div>
            {/* Breakdown */}
            <div style={{ border: `2px dashed ${C.purple}55`, borderRadius: 8, padding: 12, background: C.purple + '06' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.purple, marginBottom: 6 }}>Analysen (rechts)</div>
              <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                Vorstopp (Spielzeit)<br/>
                Charaktere der Szene<br/>
                Motive<br/>
                (mit Fokus-Modus ausblendbar)
              </div>
            </div>
          </div>
        </div>

        <InfoBox title="Per-Szene-Prinzip" color={C.blue}>
          Der Editor zeigt <strong>immer nur den Inhalt EINER Szene</strong> an.
          Szenenwechsel: Klick in der Szenenleiste links, Pfeiltasten (links/rechts), oder am Ende einer Szene weiter scrollen.
          Das vollständige Drehbuch wird erst beim <strong>Export</strong> zusammengesetzt.
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 2. Szenenübersicht (SceneList) */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="2. Die Szenenleiste (links)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Die linke Sidebar zeigt alle Szenen der aktuellen Werkstufe als kompakte Liste.
          Breite ist per Drag resize-bar und per Collapse-Button ein-/ausklappbar.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Funktionen */}
          <div style={{
            border: `1px solid ${C.blue}33`,
            borderRadius: 10, padding: 16, background: C.blue + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 10 }}>Funktionen</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li><strong>Suche</strong> — filtert nach Szenennummer, Motivname, Zusammenfassung</li>
                <li><strong>Farbkodierung</strong> — INT/EXT + Tageszeit bestimmen Farbstreifen (3 Modi: full/subtle/off)</li>
                <li><strong>Drag & Drop</strong> — Szenen per Drag umsortieren (nur wenn keine Suche aktiv)</li>
                <li><strong>Kontextmenü</strong> — "Einfügen darunter" mit Formatauswahl (Drehbuch / Storyline / Notiz) + "Löschen"</li>
                <li><strong>Neu nummerieren</strong> — Header-Menu: sequentielle Nummerierung oder Position-Logging</li>
                <li><strong>Neue Szene</strong> — Plus-Button mit Formatauswahl (siehe unten)</li>
                <li><strong>Notizen-Bereich</strong> — Notizen werden getrennt am Ende der Szenenleiste angezeigt (einklappbar)</li>
                <li><strong>Kommentar-Badge</strong> — zeigt ungelesene Annotationen aus messenger.app</li>
                <li><strong>Lock-Indikator</strong> — wenn Episode gelockt ist</li>
                <li><strong>Szeneninfo-Tooltip</strong> — Info-Icon zeigt redaktionelle Hinweise</li>
              </ul>
            </div>
          </div>

          {/* Szenen-Zeile */}
          <div style={{
            border: `1px solid ${C.green}33`,
            borderRadius: 10, padding: 16, background: C.green + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 10 }}>Szenen-Zeile (Aufbau)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
              Jede Zeile zeigt:
              <div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 8, padding: 8, background: C.subtle, borderRadius: 6, lineHeight: 1.7 }}>
                [Farbstreifen] [Nr] [Motivname] [I/A] [Dauer] [Badges] [...Menu]
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
                <li><strong>Nr</strong> = scene_nummer + suffix (z.B. "5a")</li>
                <li><strong>Motivname</strong> = ort_name</li>
                <li><strong>I/A</strong> = int_ext Abkuerzung</li>
                <li><strong>Badges</strong> = Kommentare, Lock, Szeneninfo</li>
                <li>Aktive Szene: hervorgehoben, kein Farbstreifen</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Resize & Collapse */}
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 16,
          marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Resize & Collapse</div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li><strong>Drag-Handle</strong> — zwischen SceneList und Editor; Breite per Drag anpassbar (min. 180px)</li>
              <li><strong>Collapse-Button</strong> — Chevron-Icon auf dem Handle; blendet Sidebar komplett aus</li>
              <li><strong>State persistent</strong> — Collapsed-Zustand wird in User-Settings gespeichert</li>
            </ul>
          </div>
        </div>

        <WarnBox title="Drag & Drop nur bei leerer Suche">
          Wenn das Suchfeld Text enthaelt, ist Drag & Drop deaktiviert.
          Die gefilterte Ansicht würde sonst zu unerwarteten Umsortierungen führen.
        </WarnBox>

        {/* Neue Szene — Format-Shortcuts */}
        <div style={{ border: `1px solid ${C.blue}33`, borderRadius: 10, padding: 16, marginTop: 16, background: C.blue + '06' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: C.blue, marginBottom: 10 }}>Neue Szene — Format-Auswahl</div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8, marginBottom: 12 }}>
            Der <strong>+</strong>-Button am oberen Rand der Szenenleiste legt eine neue Szene am Ende an.
            Das Format wird über Tastenkürzel (Desktop) oder den <strong>▾</strong>-Pfeil (Tablet) gewählt:
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
            <tbody>
              {[
                { shortcut: 'D + Klick', format: 'Drehbuch', desc: 'Szene mit vollem Szenenkopf (Motiv, I/A, Drehtag, …)' },
                { shortcut: 'S + Klick oder T + Klick', format: 'Storyline / Treatment', desc: 'Szene im Storyline-Format (T = Treatment, je nach Konfiguration)' },
                { shortcut: 'N + Klick', format: 'Notiz', desc: 'Freier Notizbereich — kein Szenenkopf, nicht in Statistiken' },
                { shortcut: 'Klick (ohne Taste)', format: 'Notiz (Standard)', desc: 'Fallback: Notiz — immer klar, dass Format noch gewählt werden muss' },
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 10 }}>{r.shortcut}</td>
                  <td style={{ padding: '5px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.format}</td>
                  <td style={{ padding: '5px 8px', color: C.muted }}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
            <strong>Tablet:</strong> Neben dem + erscheint ein ▾-Pfeil der ein Formatmenü öffnet.<br/>
            <strong>"Einfügen darunter"</strong> im Kontextmenü (···) zeigt dieselben 3 Formatoptionen.
          </div>
        </div>

        {/* Notiz-Format */}
        <div style={{ border: `1px solid ${C.orange}33`, borderRadius: 10, padding: 16, marginTop: 16, background: C.orange + '06' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: C.orange, marginBottom: 10 }}>Notiz-Format — Soft Separation</div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            Szenen im Format <Tag color={C.orange}>Notiz</Tag> werden in der Szenenleiste <strong>getrennt</strong> vom Hauptfluss
            in einem einklappbaren <em>Notizen</em>-Bereich am Ende angezeigt.
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
              <strong>Was Notizen NICHT haben:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                <li>Szenenkopf (Motiv, I/A, Drehtag, …)</li>
                <li>Szenen-Nummerierung (zeigt ·)</li>
                <li>Farbkodierung nach Lichtstimmung</li>
                <li>Einfluss auf Statistiken (Seiten, Bilder, Spielzeiten)</li>
              </ul>
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
              <strong>Was Notizen HABEN:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                <li>Freitext-Editor (gleicher Inhalt)</li>
                <li>Vorlagen-Anbindung ({{'{'}{'{'}}notiz_inhalt{'}'}{'}'}})</li>
                <li>Kommentar-Badges (messenger.app)</li>
                <li>Zugang über Notizen-Sektion (einklappbar)</li>
              </ul>
            </div>
          </div>
          <InfoBox title="Format wechseln" color={C.orange}>
            Über den Format-Umschalter im Editor-Header kann das Format einer Szene gewechselt werden.
            Bei bestehendem Inhalt erscheint eine Bestätigung — der Inhalt wird beim Wechsel gelöscht, der Szenenkopf bleibt erhalten.
          </InfoBox>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 3. Szenen-Editor (Kopfbereich) */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="3. Szenen-Editor (SceneEditor)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Der SceneEditor zeigt die Metadaten der ausgewaehlten Szene und den importierten Content.
          Alle Felder sind <strong>inline-editierbar</strong> mit Auto-Save bei onBlur.
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Zeile 1 — Hauptleiste</div>
          <div style={{ padding: '12px 16px', fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, padding: 8, background: C.subtle, borderRadius: 6, marginBottom: 10 }}>
              SZ[Nr] | [Stoppzeit mm:ss] | [Motivname] | Speicherstatus | [Sp HH:MM] | [I/A] · [DT] | [Annotationen] [PDF]
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {[
                  { field: 'SZ-Nummer', desc: 'Read-only, aus scene_nummer + suffix', edit: 'Nein' },
                  { field: 'Stoppzeit', desc: 'mm:ss Input — gespeichert als stoppzeit_sek INT (Sekunden)', edit: 'Ja (onBlur)' },
                  { field: 'Motiv', desc: 'ort_name — wächst und füllt den verfügbaren Platz', edit: 'Nein (nur in Header-Feldern)' },
                  { field: 'Spielzeit (Sp)', desc: 'Wahrscheinliche Uhrzeit der Handlung, z.B. "08:30"', edit: 'Ja (onBlur)' },
                  { field: 'I/A Toggle', desc: 'Klick wechselt INT ↔ EXT (sofort gespeichert)', edit: 'Ja (onClick)' },
                  { field: 'Tageszeit Toggle', desc: 'Klick cycled TAG → NACHT → ABEND (sofort gespeichert)', edit: 'Ja (onClick)' },
                  { field: 'DT (Dramaturgischer Tag)', desc: 'Erzähltag der Geschichte (1 = erster Tag)', edit: 'Ja (onBlur)' },
                  { field: 'Annotationen-Button', desc: 'Öffnet/schliesst Annotations-Panel (messenger.app)', edit: '—' },
                  { field: 'PDF-Button', desc: 'Exportiert gesamte Werkstufe als PDF (neues Fenster)', edit: '—' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.field}</td>
                    <td style={{ padding: '5px 8px' }}>{r.desc}</td>
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: r.edit === 'Nein' ? C.red : C.green }}>{r.edit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Zeilen 2–5 — Metadaten-Felder</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li><strong>Zusammenfassung</strong> — Freitext-Input (Oneliner), gespeichert in <code>zusammenfassung</code></li>
              <li><strong>R· Rollen</strong> — Auflistung aller scene_characters mit <code>kategorie_typ = 'rolle'</code></li>
              <li><strong>K· Komparsen</strong> — Auflistung aller scene_characters mit <code>kategorie_typ = 'komparse'</code></li>
              <li><strong>Szeneninfo</strong> — nur sichtbar wenn belegt; redaktioneller Hinweis (hellblau, kursiv)</li>
            </ul>
          </div>
        </div>

        {/* Content-Bereich */}
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Content-Bereich (unterhalb Header)</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            Zeigt den importierten Szenentext als Read-Only-Darstellung (Screenplay-Formatierung):
            <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
              <li><code>character</code> → zentriert, fett, Grossbuchstaben</li>
              <li><code>dialogue</code> → eingerueckt links/rechts (80px)</li>
              <li><code>parenthetical</code> → kursiv, leicht eingerueckt</li>
              <li><code>direction / action</code> → kursiv, sekundaerfarbe</li>
              <li><code>shot</code> → fett, hellblau</li>
            </ul>
            <strong>Hinweis:</strong> Der editierbare Tiptap-Editor (EditorPanel) sitzt darunter in den DockedEditorPanels.
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 4. Navigation & Overscroll */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="4. Navigation zwischen Szenen">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

          <div style={{
            border: `1px solid ${C.blue}33`,
            borderRadius: 10, padding: 16, background: C.blue + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 8 }}>Klick (SceneList)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Klick auf eine Szenen-Zeile lädt diese Szene im Editor.
              Navigation wird persistent gespeichert (last_szene_id in user_settings).
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.green}33`,
            borderRadius: 10, padding: 16, background: C.green + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 8 }}>Pfeiltasten</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <code>←</code> / <code>→</code> = vorherige/nächste Szene (throttled 200ms)<br />
              <code>↑</code> / <code>↓</code> = vorherige/nächste Episode (throttled 400ms, block-übergreifend)<br />
              Nur aktiv wenn kein Input/Textarea fokussiert.
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.orange}33`,
            borderRadius: 10, padding: 16, background: C.orange + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.orange, marginBottom: 8 }}>Overscroll</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Am Ende/Anfang des Editor-Inhalts weiterscrollen → nächste/vorherige Szene nach Delay.
              Delay konfigurierbar in User-Preferences (<code>scrollNavDelay</code>).
            </div>
          </div>
        </div>

        <InfoBox title="Deep-Link Support" color={C.blue}>
          URL-Parameter <code>?scene=ID&produktion=X&folge=N&stage=S</code> navigiert direkt zur Szene.
          Wird von messenger.app fuer Annotationen-Links genutzt.
          Nach Auswertung wird die URL gesaeubert (history.replaceState).
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 5. Daten-Flow */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="5. Daten-Flow: Wie alles zusammenhaengt">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Die ScriptPage lädt Szenen aus dem Werkstufen-System (v2). Ältere Daten werden über Fallback geladen.
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Lade-Kaskade (ScriptPage)</div>
          <div style={{ padding: '16px 20px', fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { step: '1', label: 'Produktion sync', desc: 'AppShell → /api/produktionen/sync → produktion_id' },
                { step: '2', label: 'Bloecke laden', desc: '/api/bloecke/:produktionId → Block-Auswahl' },
                { step: '3', label: 'Folge bestimmen', desc: 'Block.folge_von..folge_bis → Folgen-Nr' },
                { step: '4', label: 'Stages laden', desc: '/api/stages/:produktionId/:folgeNr → Stage-Tabs' },
                { step: '5', label: 'Werkstufen pruefen', desc: '/api/v2/folgen → folge_id → /api/folgen/:id/werkstufen → passender Typ' },
                { step: '6', label: 'Szenen laden', desc: '/api/werkstufen/:werkId/szenen → SceneList + SceneEditor' },
                { step: '7', label: 'Szene auswählen', desc: 'Erste Szene oder saved last_szene_id → SceneEditor lädt Details' },
              ].map((s) => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <Badge color={C.blue}>{s.step}</Badge>
                  <strong style={{ fontSize: 11, minWidth: 130 }}>{s.label}</strong>
                  <code style={{ fontSize: 10 }}>{s.desc}</code>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>SceneEditor — was wird geladen pro Szene?</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Daten</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>API-Endpunkt</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Verknuepft via</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { data: 'Szenen-Metadaten + Content', api: 'GET /api/dokument-szenen/:id', via: 'dokument_szene.id (UUID)' },
                  { data: 'Charaktere (Rollen + Komparsen)', api: 'GET /api/scene-identities/:id/characters', via: 'scene_identity_id (stabil!)' },
                  { data: 'Vorstopp-Zeiten', api: 'GET /api/scene-identities/:id/vorstopp', via: 'scene_identity_id' },
                  { data: 'Revision-Deltas', api: 'GET /api/dokument-szenen/:id/revisionen', via: 'dokument_szene.id' },
                  { data: 'Kommentar-Anzahl', api: 'GET /api/szenen/:id/kommentare', via: 'szene.id (Legacy)' },
                  { data: 'Annotationen', api: 'GET /api/szenen/:id/annotations', via: 'szene.id' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px 8px', fontWeight: 500 }}>{r.data}</td>
                    <td style={{ padding: '5px 8px' }}><code style={{ fontSize: 10 }}>{r.api}</code></td>
                    <td style={{ padding: '5px 8px', fontSize: 10 }}>{r.via}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <WarnBox title="Zwei ID-Systeme (Werkstufe vs. Legacy)">
          Szenen aus dem Werkstufen-System haben <strong>UUID-IDs</strong> (<code>typeof szeneId === 'string'</code>).
          Legacy-Szenen haben <strong>numerische IDs</strong> (<code>typeof szeneId === 'number'</code>).
          SceneEditor und SceneList behandeln beide Faelle per <code>useDokumentSzenen</code>-Flag.
        </WarnBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 6. Auto-Save & Speichern */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="6. Auto-Save & Speicherlogik">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{
            border: `1px solid ${C.green}33`,
            borderRadius: 10, padding: 16, background: C.green + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 8 }}>Header-Felder (Metadaten)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Speichern bei <code>onBlur</code> oder <code>onClick</code> (Toggles).<br />
              Sofortiger PUT auf <code>/api/dokument-szenen/:id</code>.<br />
              Response aktualisiert lokalen State + SceneList.
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.orange}33`,
            borderRadius: 10, padding: 16, background: C.orange + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.orange, marginBottom: 8 }}>Content (Editor-Text)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Debounced Auto-Save: 3 Sekunden nach letzter Änderung.<br />
              Speichert via PUT <code>{'{ content: [...] }'}</code>.<br />
              Statusanzeige: "Speichert…" → "Gespeichert" (2s sichtbar).
            </div>
          </div>
        </div>

        <InfoBox title="Revision Tracking" color={C.purple}>
          Bei jeder Speicherung im Legacy-System wird eine <code>szenen_version</code> erstellt (Auto-save).
          Im Werkstufen-System werden stattdessen Revisionen in <code>szenen_revisionen</code> nachverfolgt
          (Content-Blocks mit * markiert, Revision-Color aus Admin-Settings).
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 7. Annotations */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="7. Annotationen (messenger.app-Integration)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Jede Szene kann Annotationen haben — Kommentare aus der messenger.app, verknuepft ueber die Szenen-ID.
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Annotations-Flow</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <ol style={{ margin: 0, paddingLeft: 16 }}>
              <li>SceneList zeigt <strong>Kommentar-Badge</strong> (Sprechblase + Zahl) fuer ungelesene Annotationen</li>
              <li>Klick auf Annotations-Button im SceneEditor oeffnet das Panel</li>
              <li>Panel zeigt alle Annotationen chronologisch + Eingabefeld fuer neue</li>
              <li>Neue Annotation → POST an Backend → messenger.app wird benachrichtigt</li>
              <li>Beim Schließen des Panels werden Kommentare als gelesen markiert</li>
              <li>Link "Messenger" oeffnet die volle messenger.app in neuem Tab</li>
            </ol>
          </div>
        </div>

        <InfoBox title="Unread-Count Polling" color={C.green}>
          Die ScriptPage pollt alle 60 Sekunden <code>/api/scene-comment-counts?stage_id=X</code>
          und reicht die Counts an SceneList weiter. So bleiben Badges aktuell ohne WebSocket.
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 8. Farbkodierung */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="8. Farbkodierung (INT/EXT + Tageszeit)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Szenen werden basierend auf INT/EXT und Tageszeit farblich kodiert.
          Die Farbe bestimmt Streifen in der SceneList und den Header-Akzent im Editor.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { key: 'INT + TAG', color: '#E3F2FD', stripe: '#42A5F5' },
            { key: 'EXT + TAG', color: '#E8F5E9', stripe: '#66BB6A' },
            { key: 'INT/EXT + TAG', color: '#FFF3E0', stripe: '#FFA726' },
            { key: 'INT + NACHT', color: '#1a237e', stripe: '#5C6BC0' },
            { key: 'EXT + NACHT', color: '#1b5e20', stripe: '#26A69A' },
            { key: 'ABEND', color: '#4a148c', stripe: '#AB47BC' },
          ].map(c => (
            <div key={c.key} style={{
              border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 4, height: 28, borderRadius: 2, background: c.stripe, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{c.key}</div>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace' }}>{c.stripe}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Szenen & Werkstufen Tab (Werkstufen-Modell v2, revidiert 2026-05-02)
// ══════════════════════════════════════════════════════════════════════════════

export default SzenenEditorTab
