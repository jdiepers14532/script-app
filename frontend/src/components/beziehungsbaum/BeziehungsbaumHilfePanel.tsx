import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function BeziehungsbaumHilfePanel({ onClose }: Props) {
  const h2: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, margin: '0 0 8px', color: '#000',
  }
  const p: React.CSSProperties = {
    margin: '0 0 8px', color: '#333', fontSize: 13, lineHeight: 1.6,
  }
  const sectionStyle: React.CSSProperties = { marginBottom: 24 }

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0,
      width: 520, maxWidth: '100%',
      background: '#fff', borderLeft: '1px solid #E0E0E0',
      zIndex: 15, display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #E0E0E0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          Hilfe: Figuren-Beziehungsbaum
        </span>
        <button
          className="bb-btn"
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, border: 'none', background: '#F5F5F5',
            borderRadius: 6, cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollbarer Inhalt */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 24px',
      }}>
        <section style={sectionStyle}>
          <h2 style={h2}>Was ist das?</h2>
          <p style={p}>
            Ein Werkzeug, um die Beziehungen zwischen Figuren einer Reihe sichtbar zu
            machen — pro Staffel oder über alle Staffeln. Reines Anzeige-/Pflege-Werkzeug
            für Autor:innen; es greift nicht in die Drehbücher ein.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Staffel-Filter</h2>
          <p style={p}>
            Oben wählst du eine Staffel und siehst die Beziehungen, die in dieser Staffel
            gelten. Mit „Alle" siehst du alle Beziehungen der Reihe über alle Staffeln
            (Gesamtüberblick, kann dichter werden). Jede Beziehung hat einen
            Gültigkeitsbereich: eine Ehe ab S22 bis S24 erscheint in S22–S24, ab S25 nicht.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Filter</h2>
          <p style={p}>
            Auch beiläufig erwähnte Figuren ohne klare Rolle werden bewusst aufgenommen —
            sie können später in der Serie Relevanz bekommen. Über die Filter blendest du
            aus, was du gerade nicht brauchst: nach Beziehungstyp oder Kategorie, nach
            Status, nur Beziehungen mit Rolle, oder nur Figuren, die bereits besetzt sind
            (Schauspieler:in vorhanden).
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Woher kommen die Daten?</h2>
          <p style={p}>
            Zwei Wege: (1) Du legst Beziehungen selbst im Canvas an. (2) Einmaliger Import
            aus dem Rote-Rosen-Fandom-Wiki (CC BY-SA), der dir zur Sichtung vorgeschlagen
            wird. Nichts aus dem Wiki erscheint im Baum, bevor du es freigibst.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Der Wiki-Import — Schritt für Schritt</h2>
          <ol style={{ paddingLeft: 20, margin: 0, fontSize: 13, lineHeight: 1.7, color: '#333' }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Abruf:</strong> Ein lokal ausgeführtes Script holt den Text einer Figuren-Seite über
              die offizielle Wiki-Schnittstelle (MediaWiki-API). Nur öffentlicher Text.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Auslesen, zwei Verfahren parallel:</strong>
              <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>
                  Ein Regel-Parser liest die strukturierten Abschnitte (Verwandte,
                  Liebschaften …) — keine KI, feste Regeln.
                </li>
                <li>
                  Eine KI (Mistral, Cloud) liest den Fließtext und schlägt daraus
                  Beziehungen vor. Sie übersetzt nur Sätze in strukturierte Vorschläge.
                </li>
              </ul>
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Namensabgleich:</strong> Eine Ähnlichkeitssuche schlägt vor, welche bestehende Figur
              gemeint ist. Lokal/serverseitig — eure Figuren-Daten gehen nicht an die KI.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Warteraum:</strong> Alle Vorschläge landen im Staging, nicht im Baum.
            </li>
            <li>
              <strong>Review:</strong> Du entscheidest je Vorschlag — freigeben, neue Figur anlegen,
              parken oder ablehnen. Erst dann wird daraus eine echte Kante.
            </li>
          </ol>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Welche KI, und was macht sie?</h2>
          <p style={p}>
            Die einzige echte KI ist Mistral (großes Sprachmodell, über Cloud). Aufgabe:
            Fließtext → Beziehungs-Vorschläge mit Beleg-Satz und Sicherheits-Wert. Sie
            schreibt nichts in die Datenbank, legt keine Figuren an, ordnet keine Namen zu
            und entscheidet nichts über den Baum. An die Cloud geht nur öffentlicher
            Wiki-Text; interne Daten bleiben lokal.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Die Prozentzahlen</h2>
          <p style={p}>
            <strong>KI-Konfidenz:</strong> Wie sicher die KI ist, die Beziehung richtig aus dem Text
            gelesen zu haben. Selbst eingeschätzt — Sortierhilfe, nicht Wahrheit.
            „Hohe Konfidenz" heißt korrekt gelesen, nicht „brauchst du".
          </p>
          <p style={p}>
            <strong>Mapping-Konfidenz:</strong> Wie sicher der Namensabgleich ist, dass ein Wiki-Name
            einer bestehenden Figur entspricht.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Datenfluss in Kürze</h2>
          <div style={{
            background: '#F5F5F5', borderRadius: 8, padding: '12px 16px',
            fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8, color: '#444',
          }}>
            Öffentlicher Wiki-Text<br />
            → (lokal) Parser + (Cloud) KI<br />
            → Vorschläge<br />
            → (lokal) Namensabgleich<br />
            → Warteraum / Staging<br />
            → deine Freigabe<br />
            → Baum
          </div>
        </section>

        <section>
          <h2 style={h2}>Herkunft &amp; Lizenz</h2>
          <p style={{ ...p, marginBottom: 0 }}>
            Aus dem Wiki übernommene Beziehungen sind markiert und tragen Quelle +
            Abrufdatum (CC BY-SA).
          </p>
        </section>
      </div>
    </div>
  )
}
