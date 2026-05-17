import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function SuchenErsetzenTab() {
  const keyStyle: React.CSSProperties = {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
  }

  return (
    <div style={{ padding: '28px 0' }}>

      <Section title="Überblick">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Die <strong>Suchen & Ersetzen</strong>-Funktion ermoeglicht das Finden und Ersetzen von Text
            ueber verschiedene Ebenen hinweg — von der einzelnen Szene bis hin zu allen Produktionen.
          </p>
          <p style={{ marginBottom: 8 }}>
            Öffnen mit <span style={keyStyle}>Ctrl</span> + <span style={keyStyle}>H</span> (Windows)
            oder <span style={keyStyle}>⌘</span> + <span style={keyStyle}>H</span> (Mac).
          </p>
        </div>
      </Section>

      <Section title="Scope-Ebenen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { scope: 'Aktuelle Szene', desc: 'Sucht nur im aktuell geoeffneten Editor. Treffer werden direkt im Text hervorgehoben (gelb = Treffer, orange = aktiver Treffer).', color: C.blue },
            { scope: 'Episode / Folge', desc: 'Sucht in allen Szenen der aktuellen Episode in der ausgewaehlten Werkstufe.', color: C.green },
            { scope: 'Block', desc: 'Sucht in allen Episoden eines Blocks. Die Werkstufe ist wählbar. Ist eine Werkstufe in einer Episode nicht vorhanden, wird automatisch in der nächst höheren gesucht (Fallback).', color: C.orange },
            { scope: 'Staffel / Produktion', desc: 'Sucht in allen Episoden einer Produktion. Werkstufe wählbar mit Fallback.', color: C.purple },
            { scope: 'Alle Produktionen', desc: 'Sucht ueber alle Produktionen/Staffeln hinweg. Es wird immer in der letzten Fassung (hoechste Versionsnummer) gesucht.', color: C.red },
          ].map(s => (
            <div key={s.scope} style={{ border: `1px solid ${s.color}44`, borderLeft: `3px solid ${s.color}`, borderRadius: 6, padding: '8px 14px', background: s.color + '08' }}>
              <strong style={{ color: s.color, fontSize: 12 }}>{s.scope}</strong>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Werkstufen-Fallback">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Bei Suche ueber Block oder Staffel kann es vorkommen, dass eine Episode noch kein Drehbuch hat,
            aber bereits ein Treatment oder eine Beschreibung. In diesem Fall greift der <strong>Fallback</strong>:
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
          background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 12, fontWeight: 500,
        }}>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#757575', color: '#fff' }}>Notiz</span>
          <span style={{ color: C.muted }}>→</span>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#FF9500', color: '#fff' }}>Beschreibung</span>
          <span style={{ color: C.muted }}>→</span>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#AF52DE', color: '#fff' }}>Treatment</span>
          <span style={{ color: C.muted }}>→</span>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#007AFF', color: '#fff' }}>Drehbuch</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
          In der Ergebnisliste werden Fallback-Treffer mit <Badge color={C.orange}>Treatment ↑</Badge> gekennzeichnet.
        </div>
      </Section>

      <Section title="Suchoptionen">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Option</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Beschreibung</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Gross-/Kleinschreibung', 'Unterscheidet zwischen "Martha" und "MARTHA". Standardmaessig aus.'],
              ['Nur ganze Woerter', 'Findet "Rosen" nicht in "Rosenstrauch". Nutzt Wortgrenzen.'],
              ['Regulaere Ausdruecke', 'Erlaubt Regex-Patterns wie z.B. MARTHA|MARIA oder Szene\\s\\d+.'],
            ].map(([opt, desc]) => (
              <tr key={opt} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{opt}</td>
                <td style={{ padding: '6px 8px', color: C.muted }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Content-Filter">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Mit den Toggle-Buttons <Badge color={C.blue}>Beschreibung</Badge> <Badge color={C.blue}>Treatment</Badge> <Badge color={C.blue}>Drehbuch</Badge> bestimmen
            Sie, in welchen Werkstufen-Typen gesucht wird. Alle sind standardmaessig aktiv.
          </p>
        </div>
      </Section>

      <Section title="Ergebnisanzeige">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>

          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.text }}>In der aktuellen Szene</h3>
          <p style={{ marginBottom: 12 }}>
            Treffer werden direkt im Editor hervorgehoben. Navigieren Sie mit den Pfeil-Buttons
            oder <span style={keyStyle}>Enter</span> (nächster) / <span style={keyStyle}>Shift+Enter</span> (vorheriger) durch die Treffer.
            Der Zaehler zeigt z.B. "3 von 47".
          </p>

          <div style={{
            display: 'flex', gap: 12, marginBottom: 16, padding: 12, borderRadius: 8,
            background: 'var(--bg-subtle)', alignItems: 'center',
          }}>
            <div style={{ width: 80, height: 24, background: '#ffe566', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
              Treffer
            </div>
            <span style={{ color: C.muted, fontSize: 11 }}>= gelbes Highlight</span>
            <div style={{ width: 80, height: 24, background: '#FF9500', color: '#fff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
              Aktiv
            </div>
            <span style={{ color: C.muted, fontSize: 11 }}>= oranges Highlight (aktueller Treffer)</span>
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.text }}>Über mehrere Episoden</h3>
          <p style={{ marginBottom: 8 }}>
            Die Ergebnisse erscheinen im Seitenpanel, gruppiert nach Episode (Accordion).
            Klick auf einen Treffer navigiert direkt zur betreffenden Szene.
          </p>

          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
            marginBottom: 16, fontSize: 11,
          }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>
              ▼ Folge 4711 — 12 Treffer
            </div>
            <div style={{ padding: '6px 12px 6px 24px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 500 }}>Sz. 3</span> <span style={{ color: C.muted }}>(Cafe)</span>
              <span style={{ float: 'right', fontSize: 10, color: C.muted }}>[Drehbuch]</span>
              <div style={{ color: C.muted, marginTop: 2 }}>...MARTHA betritt das...</div>
            </div>
            <div style={{ padding: '6px 12px 6px 24px' }}>
              <span style={{ fontWeight: 500 }}>Sz. 8</span> <span style={{ color: C.muted }}>(Wohnung)</span>
              <span style={{ float: 'right', fontSize: 10, color: C.orange }}>[Treatment ↑]</span>
              <div style={{ color: C.muted, marginTop: 2 }}>...ruft MARTHA an und...</div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Ersetzen & Gesperrte Szenen">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            <strong>Gesperrte Szenen</strong> (Episoden mit aktivem Lock) werden bei der Suche gefunden, aber
            beim Ersetzen <strong>uebersprungen</strong>. Nach dem Ersetzen zeigt eine Meldung:
          </p>
          <div style={{
            padding: '8px 14px', borderRadius: 8, marginBottom: 12,
            background: '#00C85318', border: '1px solid #00C85344',
            fontSize: 12,
          }}>
            <span style={{ color: '#00C853' }}>42 Ersetzungen durchgefuehrt.</span>
            <span style={{ color: '#FF9500', marginLeft: 8 }}>3 Szenen waren gesperrt.</span>
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, marginTop: 16, color: C.text }}>Selektives Ersetzen</h3>
          <p style={{ marginBottom: 8 }}>
            Bei Scope Episode oder größer können Sie einzelne Treffer per Checkbox aus-/abwählen,
            bevor Sie "Alle ersetzen" klicken. Gesperrte Szenen sind automatisch deaktiviert.
          </p>
        </div>
      </Section>

      <Section title="Tastenkürzel">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Kürzel</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Ctrl/⌘ + H', 'Suchen & Ersetzen öffnen/schließen'],
              ['Enter', 'Naechster Treffer'],
              ['Shift + Enter', 'Vorheriger Treffer'],
              ['Escape', 'Dialog schließen'],
            ].map(([key, action]) => (
              <tr key={key} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px' }}>
                  <span style={keyStyle}>{key}</span>
                </td>
                <td style={{ padding: '6px 8px', color: C.muted }}>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Regex-Beispiele">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Pattern</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Findet</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['MARTHA|MARIA', 'Beide Namen'],
                ['Szene\\s\\d+', '"Szene 1", "Szene 42" etc.'],
                ['\\b\\d{2}:\\d{2}\\b', 'Uhrzeiten wie "14:30"'],
                ['(Dr\\.|Prof\\.)\\s\\w+', '"Dr. Mueller", "Prof. Schmidt"'],
                ['^INT\\.', 'Zeilen die mit "INT." beginnen'],
              ].map(([pattern, finds]) => (
                <tr key={pattern} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}><code>{pattern}</code></td>
                  <td style={{ padding: '6px 8px', color: C.muted }}>{finds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

// ── Story-Str\u00e4nge Tab ──────────────────────────────────────────────────────

export default SuchenErsetzenTab
