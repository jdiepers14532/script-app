import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function VorlagenOcrTab() {
  const C = { bg: '#fafafa', card: '#fff', border: '#e5e5e5', text: '#111', muted: '#666', blue: '#007AFF', green: '#00C853' }
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }
  const h2: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginBottom: 12, color: C.text }
  const h3: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: C.muted, marginBottom: 8 }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Dokument-Vorlagen & PDF-OCR</h1>

      <div style={card}>
        <h2 style={h2}>Dokumenten-Vorlagen</h2>
        <p style={p}>
          Vorlagen definieren das Layout und den Inhalt von Nicht-Szenen-Elementen wie Titelseite, Synopsis, Recap und Precap.
          Sie werden in der Drehbuchkoordination unter dem Tab <strong>Dokumenten-Vorlagen</strong> verwaltet.
        </p>
        <div style={{ background: '#FFF9E6', border: '1px solid #FFCC0066', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#7A6000', marginBottom: 8 }}>
          <strong>Hinweis Datenbankbegriff:</strong> Dokumenten-Werkstufen werden intern in der Datenbank (Werkstufen-Tabelle) noch als Typ <code>notiz</code> geführt. Das ist ein technischer Bezeichner und hat keine Auswirkung auf die Nutzung.
        </div>
        <h3 style={h3}>Vorlagen-Typen</h3>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li><strong>Titelseite</strong> — Deckblatt mit Produktions-Metadaten (Staffel, Block, Autor, Regie)</li>
          <li><strong>Synopsis</strong> — Zusammenfassung der Folge mit Figurennamen</li>
          <li><strong>Recap</strong> — Rückblick auf vorherige Handlung</li>
          <li><strong>Precap</strong> — Vorschau auf kommende Handlung</li>
          <li><strong>Benutzerdefiniert</strong> — Freie Vorlage für andere Zwecke</li>
        </ul>
        <h3 style={h3}>Meta-Platzhalter</h3>
        <p style={p}>
          Beim Erstellen einer Vorlage können Platzhalter eingefügt werden, die beim Einfügen durch echte Werte ersetzt werden:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {['{{autor}}', '{{block}}', '{{folge}}', '{{folgentitel}}', '{{staffel}}', '{{produktion}}', '{{datum}}', '{{fassung}}', '{{version}}'].map(k => (
            <code key={k} style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{k}</code>
          ))}
        </div>
        <h3 style={h3}>Vorlagen im Editor</h3>
        <p style={p}>
          Wenn eine Notiz-Szene ausgewählt ist, zeigt der Editor-Header ein Dropdown <em>"Vorlage einfügen..."</em>.
          Bei Auswahl wird der Vorlagen-Inhalt in die Szene eingefügt. Manuelle Änderungen sind danach möglich.
        </p>
        <h3 style={h3}>Import-Erkennung</h3>
        <p style={p}>
          Beim PDF-Import erkennt die App automatisch Titelseiten, Synopsis, Recap und Precap aus der Dokumentstruktur.
          Diese werden als eigene Nicht-Szenen-Elemente mit eigener UUID importiert und in der Szenenübersicht angezeigt
          (Toggle: <em>"Alles anzeigen"</em> im Hamburger-Menü der Szenenleiste).
        </p>
        <h3 style={h3}>Produktion kopieren</h3>
        <p style={p}>
          Vorlagen können über <em>Drehbuchkoordination → Von Produktion kopieren → Dokument-Vorlagen</em> in eine neue Produktion übernommen werden.
        </p>
      </div>

      <div style={card}>
        <h2 style={h2}>PDF-Texterkennung (OCR)</h2>
        <p style={p}>
          Beim Import von PDF-Dateien stehen zwei Extraktionsmethoden zur Verfügung:
        </p>
        <h3 style={h3}>1. pdftotext (Standard)</h3>
        <p style={p}>
          Schnelle lokale Extraktion über Poppler. Funktioniert gut bei Textschicht-PDFs.
          Bei Zeilennummern am rechten Rand kann die Seitenbreite per Slider beschnitten werden (Standard: 85%).
        </p>
        <h3 style={h3}>2. Mistral OCR</h3>
        <p style={p}>
          KI-basierte Texterkennung über die Mistral-API (<code>mistral-ocr-latest</code>).
          Liefert bessere Ergebnisse bei gescannten PDFs oder komplexen Layouts.
          Erfordert einen aktiven Mistral API-Key in den Admin-Einstellungen.
        </p>
        <h3 style={h3}>Konfiguration</h3>
        <p style={p}>
          Der OCR-Toggle erscheint automatisch im Import-Wizard (Schritt 1), wenn in den
          <strong> Admin-Einstellungen</strong> (Admin → KI) ein Mistral-Provider mit API-Key aktiv ist
          und die Funktion <code>pdf_ocr</code> aktiviert wurde.
        </p>
        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
          <p style={{ ...p, margin: 0, fontSize: 12 }}>
            <strong>Hinweis:</strong> Mistral OCR sendet das PDF an die Mistral-API. Bei vertraulichen Dokumenten die lokale pdftotext-Methode verwenden.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Werkstufen & Labels Tab ────────────────────────────────────────────────

export default VorlagenOcrTab
