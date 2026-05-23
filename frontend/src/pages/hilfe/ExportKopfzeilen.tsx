import { C } from './_shared'

function ExportKopfzeilen() {
  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 24 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 0 }
  const h3: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: C.muted, marginBottom: 12 }

  function ApiRow({ method, path, desc }: { method: string; path: string; desc: string }) {
    const bg = method === 'GET' ? C.green : method === 'POST' ? C.blue : method === 'PUT' ? C.orange : C.red
    return (
      <div style={{
        display: 'flex', gap: 10, alignItems: 'baseline',
        padding: '6px 10px', background: C.subtle, borderRadius: 6, fontSize: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 10, background: bg + '22', color: bg, padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>{method}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>{path}</span>
        <span style={{ color: C.muted, fontSize: 11, flex: 1, textAlign: 'right', minWidth: 120 }}>{desc}</span>
      </div>
    )
  }

  function StepRow({ n, color, label, desc }: { n: string; color: string; label: string; desc: string }) {
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: color,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
        }}>{n}</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{desc}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>

      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}18 0%, ${C.purple}12 100%)`,
        border: `1px solid ${C.blue}33`, borderRadius: 12, padding: '20px 24px', marginBottom: 32,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>📤</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Export & Kopf-/Fußzeilen</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Exportiere Fassungen als PDF, FDX oder Fountain — mit Kopf-/Fußzeilen, frei sortierbarer
            Dokumentstruktur (Statistikseiten, Notizen), Szenen-Filtern, Wasserzeichen und PDF-Lesezeichen.
          </div>
        </div>
      </div>

      {/* 1. Export-Modal */}
      <div style={card}>
        <h2 style={h2}>1. Das Export-Modal</h2>
        <p style={p}>
          Das Export-Modal öffnet sich über den <strong>Export-Button</strong> in der Werkzeug­leiste oder
          via Rechtsklick-Kontextmenü in der Szenenübersicht. Es ist in zwei Spalten aufgeteilt:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[
            { title: 'Dokumentstruktur', color: C.blue, desc: 'Reihenfolge und Inhalt des Exports festlegen — Statistikseiten, Notizen und das Hauptdrehbuch per Drag & Drop sortieren.' },
            { title: 'Einstellungen', color: C.purple, desc: 'Format, Revisionsoptionen, persönlicher Ausdruck, Szenen-Filter (Rollen / Komparsen / Motive) und PDF-Sonderoptionen.' },
          ].map(col => (
            <div key={col.title} style={{
              border: `1px solid ${col.color}44`, borderLeft: `3px solid ${col.color}`,
              borderRadius: 6, padding: '10px 14px', background: col.color + '06',
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: col.color, marginBottom: 4 }}>{col.title}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{col.desc}</div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Formate</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { fmt: 'PDF', color: C.red, note: 'Druckfertig, mit Kopf-/Fußzeilen, Statistik, Wasserzeichen' },
            { fmt: 'FDX', color: C.blue, note: 'Final Draft — für externe Autoren und Lektorate' },
            { fmt: 'Fountain', color: C.orange, note: 'Offenes Textformat, kompatibel mit vielen Apps' },
          ].map(f => (
            <div key={f.fmt} style={{
              border: `1px solid ${f.color}44`, borderRadius: 6, padding: '8px 12px',
              background: f.color + '08', flex: '1 1 160px',
            }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: f.color }}>{f.fmt}</span>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{f.note}</div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Fortschritts-Anzeige</h3>
        <p style={p}>
          Nach dem Klick auf "Export starten" wird ein Job auf dem Server gestartet. Ein Fortschrittsbalken
          zeigt den Status (0–100 %). Der Download startet automatisch sobald der Export fertig ist.
          Schließen des Modals während des Exports bricht den Job <em>nicht</em> ab — der Download
          wird trotzdem angeboten.
        </p>
      </div>

      {/* 2. Dokumentstruktur */}
      <div style={card}>
        <h2 style={h2}>2. Dokumentstruktur per Drag & Drop</h2>
        <p style={p}>
          Die linke Spalte zeigt drei Bereiche. Elemente lassen sich per Drag & Drop frei verschieben:
        </p>

        {/* Visual mock */}
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
          maxWidth: 380, marginBottom: 20,
        }}>
          {[
            { zone: 'VOR Hauptinhalt', color: C.blue, items: ['Titelseite', 'Synopsis', 'Statistik: Folge 3841'] },
            { zone: 'Hauptinhalt (Drehbuch)', color: C.green, items: ['← Hauptinhalt aktiv'] },
            { zone: 'NACH Hauptinhalt', color: C.orange, items: ['Statistik: Block 22', 'Besetzungsnotizen'] },
          ].map((zone, zi) => (
            <div key={zone.zone} style={{ borderBottom: zi < 2 ? `1px solid ${C.border}` : undefined }}>
              <div style={{
                padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                background: zone.color + '12', color: zone.color, textTransform: 'uppercase',
              }}>{zone.zone}</div>
              {zone.items.map(item => (
                <div key={item} style={{
                  padding: '7px 12px 7px 28px', fontSize: 12, color: C.text,
                  borderTop: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ color: C.muted, fontSize: 10 }}>⋮⋮</span>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>

        <h3 style={h3}>Elemente hinzufügen</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { icon: '📄', type: 'Notiz-Werkstufe', desc: 'Jede Notiz-Werkstufe (Titelseite, Synopsis, Recap …) kann VOR oder NACH dem Hauptinhalt eingebettet werden.' },
            { icon: '📊', type: 'Statistik-Seite', desc: 'Wähle Folge oder Block, konfiguriere die gewünschten Abschnitte direkt im Statistik-Modal und übernimm die Konfiguration.' },
          ].map(e => (
            <div key={e.type} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, paddingTop: 2 }}>{e.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{e.type}</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{e.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Hauptinhalt deaktivieren</h3>
        <p style={p}>
          Die Checkbox "Hauptinhalt (Szenen/Drehbuch) einschließen" kann deaktiviert werden.
          Dann enthält der Export <em>nur</em> die manuell hinzugefügten Elemente —
          nützlich z.B. für reine Statistik-PDFs oder Dokumentenpakete ohne Szenentext.
        </p>
      </div>

      {/* 3. Statistik im Export */}
      <div style={card}>
        <h2 style={h2}>3. Statistik-Seiten im Export</h2>
        <p style={p}>
          Statistik-Seiten werden vollständig server-seitig gerendert und direkt in das PDF eingebettet —
          kein separater Export nötig.
        </p>

        <h3 style={h3}>Statistik konfigurieren</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {[
            { n: '1', label: 'Element hinzufügen', desc: 'Im Dokumentstruktur-Panel auf "Statistik hinzufügen" klicken' },
            { n: '2', label: 'Statistik-Modal öffnen', desc: 'Zahnrad-Icon neben dem Element anklicken — das bekannte Statistik-Modal öffnet sich' },
            { n: '3', label: 'Folge oder Block wählen', desc: 'Folge-Modus: einzelne Episode. Block-Modus: alle Folgen des Blocks zusammengefasst' },
            { n: '4', label: 'Abschnitte auswählen', desc: 'Übersicht, Rollen, Motive etc. — genau wie in der normalen Statistik-Ansicht' },
            { n: '5', label: 'Übernehmen', desc: 'Grüner Button "Diese Statistik in Dokument übernehmen" — Konfiguration wird im Element gespeichert' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: C.purple,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
              }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background: C.purple + '10', border: `1px solid ${C.purple}33`,
          borderRadius: 8, padding: '10px 14px', fontSize: 12,
        }}>
          <span style={{ color: C.purple, fontWeight: 700 }}>Tipp:</span>{' '}
          <span style={{ color: C.muted }}>
            Mehrere Statistik-Elemente sind möglich — z.B. eine Folgenstatistik VOR dem Drehbuch
            und eine Blockstatistik NACH dem Drehbuch.
          </span>
        </div>
      </div>

      {/* 4. Filter */}
      <div style={card}>
        <h2 style={h2}>4. Szenen-Filter</h2>
        <p style={p}>
          In der rechten Einstellungs-Spalte befinden sich ausklappbare Filter-Sektionen.
          Alle Filter wirken als <strong>OR-Verknüpfung</strong> innerhalb einer Gruppe —
          eine Szene erscheint im Export, wenn sie <em>mindestens eine</em> der gewählten Optionen enthält.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Rollen-Filter', color: C.blue, desc: 'Nur Szenen mit diesen Figuren (Hauptcharaktere)' },
            { label: 'Komparsen-Filter', color: C.orange, desc: 'Nur Szenen mit diesen Gruppen (Komparsen)' },
            { label: 'Motiv-Filter', color: C.green, desc: 'Nur Szenen an diesen Drehorten / Motiven' },
          ].map(f => (
            <div key={f.label} style={{
              border: `1px solid ${f.color}44`, borderRadius: 6, padding: '10px 12px',
              background: f.color + '06',
            }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: f.color, marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <p style={p}>
          Sind alle Filter leer, werden alle Szenen der Werkstufe exportiert. Filter können
          kombiniert werden — z.B. nur Szenen in denen Rolle A oder Rolle B vorkommt <em>und</em>
          die am Motiv X spielen.
        </p>

        <div style={{
          background: C.orange + '10', border: `1px solid ${C.orange}33`,
          borderRadius: 8, padding: '10px 14px', fontSize: 12,
        }}>
          <span style={{ color: C.orange, fontWeight: 700 }}>Hinweis:</span>{' '}
          <span style={{ color: C.muted }}>
            Filter werden nur beim PDF-Export angewendet. Bei FDX/Fountain-Export
            werden immer alle Szenen exportiert.
          </span>
        </div>
      </div>

      {/* 5. PDF-Optionen */}
      <div style={card}>
        <h2 style={h2}>5. PDF-Sonderoptionen</h2>

        <h3 style={{ ...h3, marginTop: 0 }}>Sichtbares Wasserzeichen</h3>
        <p style={p}>
          Ein diagonales Wasserzeichen (z.B. "VERTRAULICH" oder "ENTWURF") kann auf allen Seiten
          eingeblendet werden. Konfiguration in der Drehbuchkoordination → Admin-Einstellungen.
          Der Text und die Deckkraft sind frei einstellbar.
        </p>
        <div style={{
          border: `2px solid ${C.border}`, borderRadius: 8, padding: '20px',
          maxWidth: 220, margin: '0 auto 20px', textAlign: 'center',
          position: 'relative', overflow: 'hidden', background: C.surface,
        }}>
          <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
            INT. WOHNZIMMER - TAG{'\n'}
            Max sitzt am Tisch und{'\n'}
            liest einen Brief.
          </div>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%) rotate(-35deg)',
            fontSize: 22, fontWeight: 900, color: '#000', opacity: 0.12,
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>VERTRAULICH</div>
        </div>

        <h3 style={h3}>PDF-Lesezeichen</h3>
        <p style={p}>
          Aktiviert das <em>PDF-Inhaltsverzeichnis</em> (Outline) im PDF-Viewer. Jede Szene,
          jede Statistikseite und jedes Notiz-Element wird als Lesezeichen eingetragen —
          ideal für lange Fassungen mit vielen Szenen.
        </p>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px',
          background: C.subtle, maxWidth: 340, fontSize: 11, fontFamily: 'monospace',
        }}>
          <div style={{ color: C.muted, marginBottom: 6 }}>PDF-Lesezeichen (Outline)</div>
          {[
            '▼ Titelseite',
            '▼ Statistik: Folge 3841',
            '▶ 1. INT. KÜCHE - TAG',
            '▶ 2. EXT. GARTEN - NACHT',
            '▶ 3A. INT. BÜRO - TAG',
          ].map(b => (
            <div key={b} style={{ color: C.blue, padding: '2px 0', fontSize: 11 }}>{b}</div>
          ))}
        </div>

        <h3 style={h3}>Persönlicher Ausdruck</h3>
        <p style={p}>
          Trägt den Namen des Empfängers als <code style={{ fontFamily: 'monospace', background: C.subtle, padding: '1px 5px', borderRadius: 3 }}>{'{{persoenlicher_ausdruck}}'}</code>-Chip
          in Kopf- oder Fußzeilen ein. So kann jedes PDF individuell für einen Empfänger erzeugt werden
          (z.B. für Drehbuchautoren-Zusendungen).
        </p>
      </div>

      {/* 6. Kopf-/Fußzeilen */}
      <div style={card}>
        <h2 style={h2}>6. Kopf- und Fußzeilen</h2>
        <p style={p}>
          Kopf- und Fußzeilen werden <strong>global pro Produktion und Werkstufe-Typ</strong> konfiguriert
          (Drehbuchkoordination → Tab "Kopf-/Fußzeilen"). Sie erscheinen auf jeder Seite des Exports.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {['Drehbuch', 'Storyline', 'Notiz'].map((t, i) => (
            <div key={t} style={{
              border: `1px solid ${[C.blue, C.orange, C.gray][i]}44`,
              borderLeft: `3px solid ${[C.blue, C.orange, C.gray][i]}`,
              borderRadius: 6, padding: '8px 12px',
              background: [C.blue, C.orange, C.gray][i] + '08', fontSize: 11,
            }}>
              <strong style={{ color: [C.blue, C.orange, C.gray][i] }}>{t}</strong>
              <div style={{ color: C.muted, marginTop: 4 }}>Eigene KZ/FZ-Konfiguration</div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Platzhalter-Chips</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {[
            { label: '{{produktion}}', color: C.blue },
            { label: '{{folge}}', color: C.blue },
            { label: '{{block}}', color: C.blue },
            { label: '{{fassung}}', color: C.blue },
            { label: '{{datum}}', color: C.blue },
            { label: '{{revision}}', color: C.purple },
            { label: '{{persoenlicher_ausdruck}}', color: C.green },
            { label: '{{seite}}', color: C.orange },
            { label: '{{seiten_gesamt}}', color: C.orange },
          ].map(pl => (
            <span key={pl.label} style={{
              background: pl.color + '18', color: pl.color,
              border: `1px solid ${pl.color}44`, borderRadius: 4,
              fontSize: 11, fontFamily: 'monospace', padding: '2px 7px', fontWeight: 600,
            }}>{pl.label}</span>
          ))}
        </div>

        <h3 style={h3}>Non-Scene-Elemente (Titelseite, Synopsis etc.)</h3>
        <p style={p}>
          Vorlagen für Titelseite, Synopsis, Recap, Precap haben <strong>eigene</strong> Kopf-/Fußzeilen-Einstellungen.
          Die Titelseite kann z.B. komplett ohne KZ/FZ bleiben, während die Synopsis eine eigene Kopfzeile hat.
        </p>
      </div>

      {/* 7. Vorlagen-Editor */}
      <div style={card}>
        <h2 style={h2}>7. Vorlagen-Editor (WYSIWYG)</h2>
        <p style={p}>
          Vorlagen (Drehbuchkoordination → Tab "Vorlagen") werden in einem vollständigen WYSIWYG-Editor
          bearbeitet. Der Editor zeigt eine A4-Seite mit drei Zonen:
        </p>

        <div style={{
          border: `2px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
          maxWidth: 340, margin: '0 auto 20px',
        }}>
          {[
            { label: 'Kopfzeile', color: C.blue, note: 'Optional · AN/AUS schaltbar' },
            { label: 'Body', color: C.green, note: 'Fließtext mit Absatzformaten, Tabellen, Bilder' },
            { label: 'Fußzeile', color: C.orange, note: 'Optional · AN/AUS schaltbar' },
          ].map(z => (
            <div key={z.label} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: z.color + '10' }}>
              <div style={{ fontWeight: 700, color: z.color, fontSize: 12 }}>{z.label}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{z.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 8. Export-Aufbau */}
      <div style={card}>
        <h2 style={h2}>8. Export-Aufbau (technisch)</h2>
        <p style={p}>
          Der Server-seitige PDF-Assembler verarbeitet die Dokumentstruktur in dieser Reihenfolge:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {[
            { n: '1', color: C.blue,   label: 'Pre-Items (VOR Hauptinhalt)',  desc: 'Notiz-Werkstufen und Statistik-Seiten in konfigurierter Reihenfolge' },
            { n: '2', color: C.green,  label: 'Hauptinhalt',                  desc: 'Alle Szenen der Werkstufe — ggf. gefiltert nach Rollen/Motiven. Kann deaktiviert werden.' },
            { n: '3', color: C.orange, label: 'Post-Items (NACH Hauptinhalt)', desc: 'Weitere Notiz-Werkstufen und Statistik-Seiten in konfigurierter Reihenfolge' },
          ].map(s => <StepRow key={s.n} {...s} />)}
        </div>

        <h3 style={h3}>Pro Seite im HTML:</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { n: 'A', color: C.gray, label: 'Wasserzeichen', desc: 'Als absolut positioniertes Overlay (wenn aktiv)' },
            { n: 'B', color: C.gray, label: 'Kopfzeile', desc: 'Globaler Default oder Vorlagen-Override, alle Chips ersetzt' },
            { n: 'C', color: C.gray, label: 'Szenenkopf', desc: 'SZ-Nr., Motiv, INT/EXT, Tageszeit, Stoppzeit' },
            { n: 'D', color: C.gray, label: 'Szeneninhalt', desc: 'Content + Zeilennummern/Repliken wenn aktiv' },
            { n: 'E', color: C.gray, label: 'Fußzeile', desc: 'Seitenzahl, Produktionsinfo etc.' },
          ].map(s => <StepRow key={s.n} {...s} />)}
        </div>
      </div>

      {/* 9. API */}
      <div style={card}>
        <h2 style={h2}>9. API-Referenz</h2>

        <h3 style={{ ...h3, marginTop: 0 }}>Export-Job</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          <ApiRow method="POST" path="/api/export/job" desc="Job erstellen + starten → { jobId }" />
          <ApiRow method="GET"  path="/api/export/job/:id" desc="Status pollen → { status, progress, error }" />
          <ApiRow method="GET"  path="/api/export/job/:id/download" desc="Fertige Datei herunterladen" />
          <ApiRow method="GET"  path="/api/export/preview" desc="HTML-Vorschau (kein Puppeteer)" />
          <ApiRow method="GET"  path="/api/export/filter-options" desc="Verfügbare Rollen, Komparsen, Motive" />
        </div>

        <h3 style={h3}>Job-Request Body</h3>
        <div style={{
          fontFamily: 'monospace', fontSize: 11, background: C.subtle,
          padding: '12px 14px', borderRadius: 8, color: C.text, overflowX: 'auto',
        }}>
          <pre style={{ margin: 0 }}>{`{
  werkstufId: string,          // UUID der Werkstufe
  format: "pdf"|"fdx"|"fountain",
  options: {
    preItems: OrderedExportItem[],   // Elemente VOR Hauptinhalt
    postItems: OrderedExportItem[],  // Elemente NACH Hauptinhalt
    hauptinhaltAktiv: boolean,       // Default: true
    pdfBookmarks: boolean,           // Lesezeichen (nur PDF)
    persoenlicher_ausdruck: string,  // {{persoenlicher_ausdruck}}
    revision: string,                // {{revision}}
    filterRollen: string[],          // OR-Filter
    filterMotive: string[],          // OR-Filter
    filterKomparsen: string[],       // OR-Filter
  }
}`}</pre>
        </div>

        <h3 style={h3}>OrderedExportItem</h3>
        <div style={{
          fontFamily: 'monospace', fontSize: 11, background: C.subtle,
          padding: '12px 14px', borderRadius: 8, color: C.text, marginBottom: 16,
        }}>
          <pre style={{ margin: 0 }}>{`{
  type: "notiz" | "statistik",
  id?: string,            // Werkstufe-UUID (type=notiz)
  label?: string,         // Anzeige-Label
  enabled: boolean,       // false = übersprungen
  statistikConfig?: {
    folge_ids: number[],  // Folge-IDs (eine = Folge-Modus, mehrere = Block-Modus)
    folge_nummer: number, // Repräsentative Folgen-Nr. für den Titel
    mode: "folge" | "block",
    sections: string[],   // z.B. ["uebersicht","rollen","motive"]
    includedSceneNumbers: number[] | null,
  }
}`}</pre>
        </div>

        <h3 style={h3}>Kopf-/Fußzeilen</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ApiRow method="GET"    path="/api/produktionen/:id/kopf-fusszeilen" desc="Alle KZ/FZ-Defaults der Produktion" />
          <ApiRow method="GET"    path="/api/produktionen/:id/kopf-fusszeilen/:typ" desc="Einzelner Typ (drehbuch|storyline|notiz)" />
          <ApiRow method="PUT"    path="/api/produktionen/:id/kopf-fusszeilen/:typ" desc="Speichern / Aktualisieren" />
          <ApiRow method="DELETE" path="/api/produktionen/:id/kopf-fusszeilen/:typ" desc="Löschen" />
        </div>
      </div>

    </div>
  )
}

export default ExportKopfzeilen
