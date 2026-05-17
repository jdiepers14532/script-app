import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function DokumentEditorHilfeTab() {
  return (
    <div style={{ padding: '28px 0' }}>

      <Section title="1. Dokument-System (Folgen-Dokumente)">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Jede Folge kann mehrere <strong>Absatzformat-Vorlagen</strong> haben: Drehbuch, Storyline, Notiz, Abstrakt sowie
            admin-definierte Custom-Typen. Jeder Typ hat exakt ein Dokument pro Folge.
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong>Fassungen</strong> sind Versionen desselben Dokuments (Fassung 1, 2, 3...).
            Beim Erstellen einer neuen Fassung wird der Inhalt der aktuellen Fassung kopiert.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {[
              { label: 'Drehbuch', color: C.blue, note: 'Drehbuch-Format (Final Draft)' },
              { label: 'Storyline', color: C.orange, note: 'Rich Text' },
              { label: 'Notiz', color: C.gray, note: 'Rich Text' },
              { label: 'Custom-Typ', color: C.purple, note: 'Admin-konfigurierbar' },
            ].map(t => (
              <div key={t.label} style={{ border: `1px solid ${t.color}44`, borderLeft: `3px solid ${t.color}`, borderRadius: 6, padding: '6px 12px', background: t.color + '08', fontSize: 11 }}>
                <strong style={{ color: t.color }}>{t.label}</strong>
                <div style={{ color: C.muted, marginTop: 2 }}>{t.note}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="2. Sichtbarkeits-States">
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <p style={{ color: C.muted, marginBottom: 12 }}>
            Jede Fassung hat einen Sichtbarkeits-Status, der bestimmt wer lesen und schreiben darf.
          </p>
          {[
            { status: 'privat',     color: '#757575', desc: 'Nur der Ersteller. Andere sehen das Dokument nicht.' },
            { status: 'colab',      color: '#007AFF', desc: 'Nur Mitglieder der Colab-Gruppe können schreiben. Echtzeit-Kollaboration aktiv.' },
            { status: 'review',     color: '#FF9500', desc: 'Reviewer können lesen und annotieren, nicht schreiben.' },
            { status: 'produktion', color: '#AF52DE', desc: 'Produktions-Gruppe sieht das Dokument (nur lesen).' },
            { status: 'alle',       color: '#00C853', desc: 'Alle eingeloggten Nutzer können lesen.' },
          ].map(s => (
            <div key={s.status} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <span style={{ padding: '2px 8px', borderRadius: 99, border: `1px solid ${s.color}`, color: s.color, fontSize: 11, fontWeight: 500, flexShrink: 0, marginTop: 1 }}>{s.status}</span>
              <span style={{ color: C.muted }}>{s.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="3. Abgabe-Flow">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 12 }}>Die Schaltfläche Abgeben friert die aktuelle Fassung ein und erstellt optional die nächste.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {['Fassung 1 aktiv', 'Abgeben', 'F1 eingefroren', 'Fassung 2 erstellt'].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: C.muted }}>dann</span>}
                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 11 }}>{s}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 12 }}>Eingefrorene Fassungen sind schreibgeschützt (HTTP 409 bei Schreibversuch).</p>
        </div>
      </Section>

      <Section title="4. Drehbuch-Editor (Screenplay-Format)">
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <p style={{ color: C.muted, marginBottom: 12 }}>
            Tiptap/ProseMirror-basierter WYSIWYG-Editor. 7 Elementtypen, Tab/Enter-Flow nach Final Draft Standard.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Element', 'Tab-Folge', 'Enter-Folge', 'Einrückung L/R'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: C.muted, fontWeight: 500 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[
                { typ: 'scene_heading', tab: 'action', enter: 'action', lr: '0 / 0' },
                { typ: 'action', tab: 'character', enter: 'action', lr: '0 / 0' },
                { typ: 'character', tab: 'action', enter: 'dialogue', lr: '37 / 0' },
                { typ: 'dialogue', tab: 'character', enter: 'character', lr: '25 / 25' },
                { typ: 'parenthetical', tab: 'dialogue', enter: 'dialogue', lr: '30 / 30' },
                { typ: 'transition', tab: 'scene_heading', enter: 'scene_heading', lr: '0 / 0' },
                { typ: 'shot', tab: 'action', enter: 'action', lr: '0 / 0' },
              ].map(e => (
                <tr key={e.typ} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 500, color: C.blue }}>{e.typ}</td>
                  <td style={{ padding: '4px 8px', color: C.muted }}>{e.tab}</td>
                  <td style={{ padding: '4px 8px', color: C.muted }}>{e.enter}</td>
                  <td style={{ padding: '4px 8px', color: C.muted }}>{e.lr} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="5. Echtzeit-Kollaboration">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Kollaboration ist aktiv wenn die Fassung auf colab gesetzt ist und der Nutzer Autor-Rolle hat.
            Technologie: Yjs + Hocuspocus WebSocket (/ws/collab).
          </p>
          <p>
            Im Online-Modus werden Änderungen in Echtzeit synchronisiert. Im Offline-Modus erscheint ein roter Warnhinweis.
            Änderungen werden bei Reconnect automatisch zusammengeführt.
          </p>
        </div>
      </Section>

      <Section title="6. Side-by-Side Ansicht">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p>
            Über den Columns-Button in der Topbar können zwei Panels nebeneinander angezeigt werden.
            Jedes Panel hat einen eigenen Dokumenttyp- und Fassungs-Selektor.
            Typische Kombination: Storyline links, Drehbuch rechts.
          </p>
        </div>
      </Section>

    </div>
  )
}



export default DokumentEditorHilfeTab
