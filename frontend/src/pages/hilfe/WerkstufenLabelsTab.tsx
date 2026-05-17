import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function WerkstufenLabelsTab() {
  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 24 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 0 }
  const h3: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: C.muted, marginBottom: 12 }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.orange}18 0%, ${C.green}12 100%)`,
        border: `1px solid ${C.orange}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🏷️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Werkstufen & Fassungs-Labels</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Zwei komplementaere Konzepte: <strong>Werkstufen</strong> sind die konkreten Dokument-Container (der Text),
            waehrend <strong>Fassungs-Labels</strong> semantische Tags sind, die einer Werkstufe ihre Rolle im Produktions-Workflow zuweisen.
          </div>
        </div>
      </div>

      {/* ── 1. Werkstufen ── */}
      <div style={card}>
        <h2 style={h2}>1. Was ist eine Werkstufe?</h2>
        <p style={p}>
          Eine Werkstufe ist ein <strong>konkreter Dokumentcontainer</strong> — sie enthaelt den tatsaechlichen Text
          (ueber <code>dokument_szenen</code>). Jede Episode kann mehrere Werkstufen haben.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Typ', desc: 'Was ist es?', value: 'drehbuch · storyline · notiz', color: C.orange },
            { label: 'Version', desc: 'Wie oft neu erstellt?', value: 'V1, V2, V3...', color: C.blue },
            { label: 'Sichtbarkeit', desc: 'Wer darf lesen?', value: 'privat · team · alle · colab', color: C.purple },
            { label: 'Status', desc: 'Bearbeitbar?', value: 'entwurf · gesperrt', color: C.green },
          ].map(f => (
            <div key={f.label} style={{ border: `1px solid ${f.color}33`, borderRadius: 8, padding: '10px 14px', background: f.color + '08' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: f.color }}>{f.label}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.desc}</div>
              <code style={{ fontSize: 10, color: C.text }}>{f.value}</code>
            </div>
          ))}
        </div>

        <div style={{ background: '#000', borderRadius: 10, padding: '16px 20px', color: '#fff', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ color: '#888', marginBottom: 4 }}>// Analogie: Git</div>
          <div><span style={{ color: C.orange }}>Werkstufe</span>  = <span style={{ color: '#ccc' }}>Commit</span>  (konkreter Snapshot)</div>
          <div><span style={{ color: C.green }}>Label</span>      = <span style={{ color: '#ccc' }}>Tag</span>     (zeigt auf einen Commit)</div>
        </div>
      </div>

      {/* ── 2. Fassungs-Labels ── */}
      <div style={card}>
        <h2 style={h2}>2. Was ist ein Fassungs-Label?</h2>
        <p style={p}>
          Ein Fassungs-Label ist ein <strong>semantischer Tag</strong>, der einer Werkstufe zugewiesen wird und ihre
          Funktion im Produktionsworkflow beschreibt. Labels werden pro Produktion in der <strong>Drehbuchkoordination</strong> definiert.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {['Erstfassung', 'Redaktionsfassung', 'Drehfassung', 'Produktionsfassung'].map((l, i) => (
            <span key={l} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: i === 3 ? C.green + '20' : C.blue + '15',
              color: i === 3 ? C.green : C.blue,
              border: `1px solid ${i === 3 ? C.green : C.blue}44`,
            }}>
              {l}
              {i === 3 && <span style={{ fontSize: 9 }}>🔒</span>}
            </span>
          ))}
        </div>

        <p style={p}>
          Labels sind <strong>nicht fest</strong> — sie können wandern. Wenn eine neue Version erstellt wird,
          kann das Label „Drehfassung" von V2 auf V3 verschoben werden.
        </p>
      </div>

      {/* ── 3. Zusammenspiel ── */}
      <div style={card}>
        <h2 style={h2}>3. Zusammenspiel — Beispiel</h2>
        <div style={{
          background: '#f8f9fa', border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '16px 20px', fontFamily: 'monospace', fontSize: 12, lineHeight: 2,
        }}>
          <div style={{ color: C.muted, fontFamily: 'inherit', marginBottom: 8, fontWeight: 700 }}>Episode 4711</div>
          <div>├── <span style={{ color: C.orange }}>Drehbuch V1</span>  ← <Badge color={C.blue}>Erstfassung</Badge></div>
          <div>├── <span style={{ color: C.orange }}>Drehbuch V2</span>  ← <Badge color={C.blue}>Redaktionsfassung</Badge></div>
          <div>├── <span style={{ color: C.orange }}>Drehbuch V3</span>  ← <Badge color={C.green}>Drehfassung 🔒</Badge></div>
          <div>├── <span style={{ color: C.purple }}>Storyline V1</span>  <span style={{ color: C.muted }}>(kein Label)</span></div>
          <div>└── <span style={{ color: C.gray }}>Notiz V1</span>      <span style={{ color: C.muted }}>(kein Label)</span></div>
        </div>
      </div>

      {/* ── 4. Sichtbarkeiten ── */}
      <div style={card}>
        <h2 style={h2}>4. Sichtbarkeiten</h2>
        <p style={p}>
          Jede Werkstufe hat eine Sichtbarkeitsstufe. Diese bestimmt, wer das Dokument sehen und bearbeiten darf.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {['Stufe', 'Icon', 'Bedeutung', 'Typischer Einsatz'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { stufe: 'privat', icon: '🔒', color: '#FF9500', desc: 'Nur Ersteller sieht es', einsatz: 'Eigener Entwurf, Notizen' },
              { stufe: 'team', icon: '👥', color: '#007AFF', desc: 'Alle Autoren der Produktion', einsatz: 'Standard fuer Storylines & Drehbuecher' },
              { stufe: 'alle', icon: '🌐', color: '#00C853', desc: 'Alle Nutzer mit Produktionszugriff', einsatz: 'Finale Fassungen, Drehfassung' },
              { stufe: 'colab', icon: '👥✏️', color: '#AF52DE', desc: 'Echtzeit-Kollaboration (Yjs)', einsatz: 'Gemeinsames Schreiben, Writers Room' },
            ].map(r => (
              <tr key={r.stufe} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px' }}><code style={{ color: r.color, fontWeight: 600 }}>{r.stufe}</code></td>
                <td style={{ padding: '8px 10px', fontSize: 14 }}>{r.icon}</td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.desc}</td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.einsatz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 5. Produktionsfassung & Lock ── */}
      <div style={card}>
        <h2 style={h2}>5. Produktionsfassung & Lock-Mechanismus</h2>
        <p style={p}>
          In den DK-Settings kann ein Label als <strong>Produktionsfassung</strong> markiert werden (Checkbox „Produktionsfassung").
          Dieses Label hat eine besondere Wirkung:
        </p>
        <div style={{
          background: `linear-gradient(135deg, ${C.green}12 0%, ${C.green}05 100%)`,
          border: `1px solid ${C.green}44`,
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 8 }}>Was passiert beim Zuweisen?</div>
          <ol style={{ ...p, paddingLeft: 20, marginBottom: 0 }}>
            <li>Die Werkstufe erhaelt den <code>bearbeitung_status = 'gesperrt'</code></li>
            <li>Der Editor wird <strong>read-only</strong> — kein Bearbeiten mehr moeglich</li>
            <li>In der Szenenleiste erscheint ein Schloss-Icon</li>
            <li>Nur Nutzer mit der <em>Status-Override-Rolle</em> (konfigurierbar in Admin) können die Sperre aufheben</li>
          </ol>
        </div>
        <div style={{ background: '#fff8e1', border: '1px solid #ffcc0044', borderRadius: 8, padding: 12 }}>
          <p style={{ ...p, margin: 0, fontSize: 12 }}>
            <strong>Hinweis:</strong> Das Entfernen des Labels hebt die Sperre <em>nicht</em> automatisch auf.
            Der Status muss explizit in den Werkstufen-Einstellungen zurückgesetzt werden.
          </p>
        </div>
      </div>

      {/* ── 6. Revisions-Farben & Rote Seiten ── */}
      <div style={card}>
        <h2 style={h2}>6. Revisions-Farben (Rote Seiten)</h2>
        <p style={p}>
          Jede Produktion definiert in der Drehbuchkoordination eine <strong>Farbsequenz</strong> fuer Revisionen,
          basierend auf dem WGA-Standard. Die Reihenfolge bestimmt, welche Farbe bei der nächsten Revision vergeben wird.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { name: 'Weisse Seiten', color: '#FFFFFF', border: true },
            { name: 'Blaue Seiten', color: '#A8D8EA' },
            { name: 'Pinke Seiten', color: '#FFAEC9' },
            { name: 'Gelbe Seiten', color: '#FFFFAA' },
            { name: 'Gruene Seiten', color: '#B5E7A0' },
            { name: 'Goldrute', color: '#FFD700' },
          ].map(c => (
            <div key={c.name} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
              borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: c.color,
              border: c.border ? `1px solid ${C.border}` : 'none',
              color: '#333',
            }}>
              {c.name}
            </div>
          ))}
        </div>

        <h3 style={h3}>Wie funktionieren Rote Seiten?</h3>
        <p style={p}>
          Wenn nach einer abgegebenen Fassung Änderungen nötig sind, wird eine neue Werkstufe erstellt und automatisch
          die nächste Farbe in der Sequenz zugewiesen. Geänderte Szenen erhalten im Export einen farbigen Seitenrand
          und ein <code>*</code> am rechten Rand jeder geänderten Zeile (Revision Marks).
        </p>

        <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#000', color: '#fff', borderRadius: 8, padding: '12px 16px', lineHeight: 1.8 }}>
          <div style={{ color: '#888' }}>// Revision-Sequenz</div>
          <div>Drehbuch V1 <span style={{ color: '#aaa' }}>→</span> Weisse Seiten (Original)</div>
          <div>Drehbuch V2 <span style={{ color: '#A8D8EA' }}>→</span> Blaue Seiten (1. Revision)</div>
          <div>Drehbuch V3 <span style={{ color: '#FFAEC9' }}>→</span> Pinke Seiten (2. Revision)</div>
          <div>Drehbuch V4 <span style={{ color: '#FFFFAA' }}>→</span> Gelbe Seiten (3. Revision)</div>
        </div>
      </div>

      {/* ── 7. Memo-Schwellwert ── */}
      <div style={card}>
        <h2 style={h2}>7. Memo-Seiten (kurze Änderungen)</h2>
        <p style={p}>
          Nicht jede Änderung rechtfertigt eine vollständige Replacement Page. In den DK-Settings kann ein
          <strong> Memo-Schwellwert</strong> (in Zeichen) gesetzt werden:
        </p>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Änderung &gt; Schwellwert</div>
            <div style={{ fontSize: 12, color: C.muted }}>→ Vollstaendige <strong>Replacement Page</strong> im Export (neue Seite mit Revisionsfarbe)</div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Änderung ≤ Schwellwert</div>
            <div style={{ fontSize: 12, color: C.muted }}>→ Kompakte <strong>Memo-Zeile</strong> im Export (einzeilige Kurznotiz, kein Seitenwechsel)</div>
          </div>
        </div>
        <p style={p}>
          Standard: <code>100 Zeichen</code>. Konfigurierbar in <em>Drehbuchkoordination → Revisions-Export</em>.
        </p>
      </div>

      {/* ── 8. Wo konfigurieren? ── */}
      <div style={card}>
        <h2 style={h2}>8. Konfiguration — Wo finde ich was?</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {['Einstellung', 'Ort', 'Beschreibung'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { setting: 'Fassungs-Labels definieren', ort: 'DK → Fassungs-Labels', desc: 'Labels anlegen, Reihenfolge aendern, als Produktionsfassung markieren' },
              { setting: 'Label einer Werkstufe zuweisen', ort: 'Editor-Header → Tag-Icon', desc: 'Klick auf das Label-Chip neben der Versions-Anzeige' },
              { setting: 'Revisions-Farben', ort: 'DK → Revisions-Farben', desc: 'WGA-Farbsequenz anlegen, Reihenfolge bestimmt Revisionsreihenfolge' },
              { setting: 'Memo-Schwellwert', ort: 'DK → Revisions-Export', desc: 'Ab wieviel Zeichen eine Replacement Page statt Memo erzeugt wird' },
              { setting: 'Status-Override-Rolle', ort: 'Admin → Einstellungen', desc: 'Welche Rolle gesperrte Werkstufen entsperren darf' },
              { setting: 'Sichtbarkeit aendern', ort: 'Editor-Header → Badge', desc: 'Sichtbarkeitsstufe der aktuellen Werkstufe wechseln' },
            ].map(r => (
              <tr key={r.setting} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.setting}</td>
                <td style={{ padding: '8px 10px' }}><code style={{ fontSize: 11, background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>{r.ort}</code></td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 9. Workflow-Diagramm ── */}
      <div style={card}>
        <h2 style={h2}>9. Typischer Workflow</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { step: '1', label: 'Import', desc: 'PDF importieren → erstellt automatisch Folge + Werkstufe + Szenen', color: C.blue },
            { step: '2', label: 'Label zuweisen', desc: 'Im Editor-Header → „Erstfassung" als Label setzen', color: C.orange },
            { step: '3', label: 'Überarbeitung', desc: 'Neue Werkstufe erstellen (V2), Label „Redaktionsfassung" zuweisen', color: C.purple },
            { step: '4', label: 'Abgabe', desc: '„Drehfassung" zuweisen (Produktionsfassung) → Werkstufe wird gesperrt', color: C.green },
            { step: '5', label: 'Revision', desc: 'Neue Werkstufe (V3) mit nächster Revisionsfarbe, Änderungen markiert', color: C.red },
          ].map((s, i) => (
            <div key={s.step} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: s.color,
                  color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                }}>
                  {s.step}
                </div>
                {i < 4 && <div style={{ width: 2, height: 24, background: C.border }} />}
              </div>
              <div style={{ paddingTop: 4, paddingBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Export & Kopf-/Fußzeilen Tab ──────────────────────────────────────────────

export default WerkstufenLabelsTab
