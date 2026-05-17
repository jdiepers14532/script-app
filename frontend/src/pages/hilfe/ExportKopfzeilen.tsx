import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function ExportKopfzeilen() {
  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 24 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 0 }
  const h3: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: C.muted, marginBottom: 12 }
  const code: React.CSSProperties = { fontFamily: 'monospace', background: C.subtle, padding: '1px 5px', borderRadius: 3, fontSize: 12 }

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
            Exportiere Fassungen als PDF, FDX oder Fountain — inkl. Kopf-/Fußzeilen, Szenenkopf und Platzhaltern.
            Globale Kopf-/Fußzeilen gelten pro Produktionstyp; Vorlagen (Titelseite, Synopsis etc.) haben eigene Zonen.
          </div>
        </div>
      </div>

      {/* Kopf-/Fußzeilen */}
      <div style={card}>
        <h2 style={h2}>1. Kopf- und Fußzeilen</h2>
        <p style={p}>
          Kopf- und Fußzeilen werden <strong>global pro Produktion und Werkstufe-Typ</strong> konfiguriert
          (Drehbuchkoordination → Tab "Kopf-/Fußzeilen"). Sie erscheinen auf jeder Seite des Exports.
        </p>

        <h3 style={h3}>Globale Defaults (DK-Settings)</h3>
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

        <h3 style={h3}>Erste Seite ohne Kopf-/Fußzeile</h3>
        <p style={p}>
          Standard: Die erste Seite jedes Exports hat keine Kopfzeile (= Deckblatt-Konvention wie in Final Draft / Word).
          Kann pro Typ in DK-Settings abgeschaltet werden.
        </p>

        <h3 style={h3}>Non-Scene-Elemente (Titelseite, Synopsis etc.)</h3>
        <p style={p}>
          Vorlagen für Titelseite, Synopsis, Recap, Precap haben <strong>eigene</strong> Kopf-/Fußzeilen-Einstellungen
          (unabhängig vom globalen Default). Damit kann z.B. die Titelseite ganz ohne KZ/FZ bleiben,
          während die Synopsis eine eigene Kopfzeile hat.
        </p>
      </div>

      {/* WYSIWYG-Editor */}
      <div style={card}>
        <h2 style={h2}>2. Vorlagen-Editor (WYSIWYG)</h2>
        <p style={p}>
          Vorlagen (Drehbuchkoordination → Tab "Vorlagen") werden in einem <strong>vollständigen WYSIWYG-Editor</strong>
          bearbeitet. Der Editor zeigt eine A4-Seite mit drei Zonen:
        </p>

        {/* Zone diagram */}
        <div style={{
          border: `2px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
          maxWidth: 360, margin: '0 auto 20px', fontFamily: 'monospace', fontSize: 11,
        }}>
          {[
            { label: 'Kopfzeile', color: C.blue, note: 'Optional · AN/AUS schaltbar' },
            { label: 'Body (Hauptinhalt)', color: C.green, note: 'Fließtext mit Absatzformaten' },
            { label: 'Fußzeile', color: C.orange, note: 'Optional · AN/AUS schaltbar' },
          ].map(z => (
            <div key={z.label} style={{
              padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
              background: z.color + '10',
            }}>
              <div style={{ fontWeight: 700, color: z.color, fontSize: 12 }}>{z.label}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{z.note}</div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Platzhalter-Chips</h3>
        <p style={p}>
          Platzhalter werden als farbige Chips im Editor dargestellt — nicht als Plain-Text.
          Beim Export werden sie durch echte Werte ersetzt.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {[
            { label: '{{produktion}}', zone: 'Alle', color: C.blue },
            { label: '{{folge}}', zone: 'Alle', color: C.blue },
            { label: '{{block}}', zone: 'Alle', color: C.blue },
            { label: '{{fassung}}', zone: 'Alle', color: C.blue },
            { label: '{{datum}}', zone: 'Alle', color: C.blue },
            { label: '{{seite}}', zone: 'Nur Fußzeile', color: C.orange },
            { label: '{{seiten_gesamt}}', zone: 'Nur Fußzeile', color: C.orange },
          ].map(pl => (
            <span key={pl.label} style={{
              background: pl.color + '18', color: pl.color,
              border: `1px solid ${pl.color}44`, borderRadius: 4,
              fontSize: 11, fontFamily: 'monospace', padding: '2px 7px',
              fontWeight: 600,
            }}>
              {pl.label}
              <span style={{ fontSize: 9, color: C.muted, marginLeft: 4, fontFamily: 'inherit' }}>{pl.zone === 'Nur Fußzeile' ? ' FZ' : ''}</span>
            </span>
          ))}
        </div>

        <h3 style={h3}>Bilder in Vorlagen</h3>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: C.muted }}>
          <p style={{ ...p, marginBottom: 6 }}>In jeder Zone können Bilder eingefügt werden:</p>
          <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
            <li><strong>Firmenlogo</strong> — wird automatisch aus dem Auth-System geladen</li>
            <li><strong>Produktionslogo</strong> — aus der Produktionsdatenbank</li>
            <li><strong>Upload</strong> — eigene Grafik hochladen (als Bilddaten im Dokument gespeichert)</li>
          </ul>
          <p style={p}>Bilder können in Größe und Ausrichtung (links / zentriert / rechts) angepasst werden.</p>
        </div>
      </div>

      {/* Export */}
      <div style={card}>
        <h2 style={h2}>3. Export</h2>
        <p style={p}>
          Export über das <strong>Kontext-Menü</strong> der Szenenübersicht (Rechtsklick oder Export-Button).
          Exportiert immer die gesamte aktive Fassung (alle Szenen + Non-Scene-Elemente der aktuell offenen Werkstufe).
        </p>

        <h3 style={h3}>Export-Dialog</h3>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px',
          background: C.subtle, maxWidth: 400, marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Fassung exportieren</div>
          {[
            { label: 'PDF', checked: true },
            { label: 'Final Draft (.fdx)', checked: false },
            { label: 'Fountain (.fountain)', checked: false },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
              <div style={{
                width: 14, height: 14, border: `1px solid ${C.border}`, borderRadius: 3,
                background: f.checked ? C.blue : 'transparent', flexShrink: 0,
              }} />
              {f.label}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Dateiname</div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', background: C.surface, padding: '5px 8px', borderRadius: 4, border: `1px solid ${C.border}` }}>
              Rote Rosen - Block 22 - Folge 3841 Drehbuch V2 2026-05-12
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {['Zeilennummern', 'Replik-Nrn.', 'Revision'].map(o => (
              <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
                <div style={{ width: 12, height: 12, border: `1px solid ${C.border}`, borderRadius: 2 }} />
                {o}
              </div>
            ))}
          </div>
        </div>

        <h3 style={h3}>Dateiname-Format</h3>
        <p style={p}>
          Der Dateiname wird automatisch aus Produktion, Block, Episode (Terminus aus DK-Einstellungen),
          Werkstufe, Fassung und Datum zusammengesetzt — und kann vor dem Download manuell bearbeitet werden.
        </p>
        <div style={{ fontFamily: 'monospace', fontSize: 12, background: C.subtle, padding: '8px 12px', borderRadius: 6, color: C.text }}>
          {'{Produktion} - Block {n} - {Terminus} {n} {Werkstufe} {Fassung} {YYYY-MM-DD}'}
        </div>

        <h3 style={h3}>Dual-View</h3>
        <p style={p}>
          Sind zwei Fassungen nebeneinander geöffnet, verwendet der Export standardmäßig die
          neuere Fassung — oder fragt per Popup nach.
        </p>

        <h3 style={h3}>Export-Aufbau</h3>
        <p style={p}>Der Assembler baut für jede Seite folgendes zusammen:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 400 }}>
          {[
            { step: '1', label: 'Non-Scene-Elemente', desc: 'Titelseite, Synopsis, Recap, Precap (aus Vorlagen)' },
            { step: '2', label: 'Kopfzeile', desc: 'Globaler Default oder Vorlagen-Override, Platzhalter ersetzt' },
            { step: '3', label: 'Szenenkopf', desc: 'SZ-Nr., Motiv, INT/EXT, Tageszeit, Stoppzeit' },
            { step: '4', label: 'Szeneninhalt', desc: 'Content + Zeilennummern/Repliken wenn aktiv' },
            { step: '5', label: 'Fußzeile', desc: 'Seitenzahl, Produktionsinfo etc.' },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: C.blue,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
              }}>{s.step}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API */}
      <div style={card}>
        <h2 style={h2}>4. API-Endpunkte</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { method: 'GET', path: '/api/produktionen/:id/kopf-fusszeilen', desc: 'Alle KZ/FZ-Defaults der Produktion' },
            { method: 'GET', path: '/api/produktionen/:id/kopf-fusszeilen/:typ', desc: 'Einzelner Typ (drehbuch|storyline|notiz|alle)' },
            { method: 'PUT', path: '/api/produktionen/:id/kopf-fusszeilen/:typ', desc: 'Speichern / Aktualisieren' },
            { method: 'DELETE', path: '/api/produktionen/:id/kopf-fusszeilen/:typ', desc: 'Löschen' },
            { method: 'GET', path: '/api/werkstufe/:id/export/pdf', desc: 'PDF-Export (inkl. KZ/FZ)' },
            { method: 'GET', path: '/api/werkstufe/:id/export/fountain', desc: 'Fountain-Export' },
            { method: 'GET', path: '/api/werkstufe/:id/export/fdx', desc: 'Final Draft FDX-Export' },
          ].map(e => (
            <div key={e.path} style={{
              display: 'flex', gap: 10, alignItems: 'baseline',
              padding: '6px 10px', background: C.subtle, borderRadius: 6, fontSize: 12,
            }}>
              <span style={{
                fontWeight: 700, fontFamily: 'monospace', fontSize: 10,
                background: e.method === 'GET' ? C.green + '22' : e.method === 'PUT' ? C.blue + '22' : C.red + '22',
                color: e.method === 'GET' ? C.green : e.method === 'PUT' ? C.blue : C.red,
                padding: '1px 6px', borderRadius: 3, flexShrink: 0,
              }}>{e.method}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>{e.path}</span>
              <span style={{ color: C.muted, fontSize: 11, flex: 1, textAlign: 'right' }}>{e.desc}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Datensicherheit Tab ───────────────────────────────────────────────────────

export default ExportKopfzeilen
