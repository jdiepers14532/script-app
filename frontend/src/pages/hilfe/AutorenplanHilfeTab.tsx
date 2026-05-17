import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function AutorenplanHilfeTab() {
  const STATUS_COLORS: Record<string, string> = {
    geplant:             '#9E9E9E',
    angefragt:           '#007AFF',
    zugesagt:            '#FF9500',
    vertrag_geschrieben: '#AF52DE',
    vertrag_zurueck:     '#00C853',
    rechnung_erhalten:   '#34C759',
  }
  const STATUS_LABELS: Record<string, string> = {
    geplant:             'Geplant',
    angefragt:           'Angefragt',
    zugesagt:            'Zugesagt',
    vertrag_geschrieben: 'Vertrag geschrieben',
    vertrag_zurueck:     'Vertrag zurück',
    rechnung_erhalten:   'Rechnung erhalten',
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>📅 Autorenplan</h2>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 32, lineHeight: 1.6 }}>
        Das Autorenplan-Modul erlaubt die Einsatzplanung aller am Buchprozess beteiligten Personen —
        Autoren, Story-Editoren, Drehbuchkoordinatoren — in einem wochenbasierten Gantt-Raster.
        Personen und Tätigkeiten kommen aus der Vertragsdatenbank (keine Duplikate).
      </p>

      {/* Benutzer-Bereich */}
      <Section title="Für alle: Planung & Workflow">
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 0 }}>Das Raster</h4>
        <p style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 16 }}>
          Das Gantt-Raster zeigt <strong>Wochen als Spalten</strong> und <strong>Prozesstypen × Slots als Zeilen</strong>.
          Du siehst jeweils 20 Wochen; mit den Pfeilen «/» navigierst du vor und zurück.
          Klicke auf eine freie Zelle, um einen neuen Einsatz anzulegen. Klicke auf einen belegten Slot,
          um ihn zu bearbeiten.
        </p>
        <div style={{ background: C.subtle, borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 12, lineHeight: 1.8 }}>
          <div><strong>Präsenz (Writers Room)</strong> — Erste Woche eines mehrteiligen Prozesses (z. B. Woche 1 des Storyedits)</div>
          <div><strong>HO (HomeOffice)</strong> — Folgewochen eines mehrteiligen Prozesses (z. B. Woche 2+3 des Storyedits)</div>
          <div><strong>Diagonal-Muster</strong> — Blöcke werden zeitversetzt im Raster dargestellt: jeder Block startet eine Woche später als der vorherige</div>
        </div>

        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Status-Workflow</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {Object.entries(STATUS_LABELS).map(([id, label]) => (
            <span key={id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: STATUS_COLORS[id] + '18',
              color: STATUS_COLORS[id],
              border: `1px solid ${STATUS_COLORS[id]}44`,
              borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[id], display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
          Jeder Einsatz durchläuft den Status von <em>Geplant</em> bis <em>Rechnung erhalten</em>.
          Der Status wird im Einsatz-Modal geändert und im Raster als farbiger Balken visualisiert.
        </p>

        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Personen anlegen & suchen</h4>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 8 }}>
          Beim Anlegen eines Einsatzes suchst du direkt in der Vertragsdatenbank.
          Wird eine Person nicht gefunden, kannst du sie über <strong>„… neu anlegen"</strong> direkt
          in die Vertragsdatenbank eintragen — ohne die App zu wechseln.
        </p>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
          Alternativ kannst du einen <strong>Platzhalter</strong> (z. B. „N.N. Autor Block 5") eintragen
          und später ersetzen.
        </p>

        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Wochennotizen</h4>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 8 }}>
          Die unterste Zeile des Rasters zeigt Wochennotizen. Typen:
        </p>
        <ul style={{ fontSize: 12, color: C.muted, lineHeight: 2, paddingLeft: 18, marginBottom: 20 }}>
          <li><strong>Allgemein</strong> — freie Anmerkungen zur Woche</li>
          <li><strong>Zusatzkosten</strong> — z. B. Reisen, Sonderleistungen (orange)</li>
          <li><strong>Sperrer</strong> — Blockierungszeiträume für einzelne Personen (rot)</li>
        </ul>

        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Futures</h4>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          Futures sind Autorengruppen für einen definierten Zeitraum (z. B. „Future III Staffel 26").
          Jede Future hat eine <em>Schreib-Phase</em> und optional eine <em>Edit-Phase</em>,
          jeweils mit eigener Autorenzuweisung und HO/Präsenz-Markierung.
          Futures werden im Tab <strong>„Futures"</strong> verwaltet — getrennt vom Haupt-Raster.
        </p>
      </Section>

      {/* Admin-Bereich */}
      <Section title="Für Admins: Buchprozess-Konfiguration">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Im Tab <strong>„Konfiguration"</strong> definierst du, welche Prozesstypen es für diese
          Produktion gibt. Jeder Prozesstyp ist vollständig konfigurierbar — nichts ist hardcodiert.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'ID', desc: 'Technischer Schlüssel, z. B. storyedit' },
            { label: 'Label', desc: 'Anzeigename im Raster' },
            { label: 'Dauer (Wochen)', desc: 'Wie viele Wochen ein Einsatz dauert (1 = einzelne Woche, 3 = Storyedit-Rhythmus)' },
            { label: 'Max. Slots', desc: 'Wie viele parallele Einsätze pro Woche angezeigt werden' },
            { label: 'Präsenz-Wochen', desc: 'Welche Wochen als Writers-Room-Anwesenheit gelten (z. B. [1] = nur Woche 1)' },
            { label: 'Kostenstelle', desc: 'Standard-Kostenstelle für diesen Prozesstyp (überschreibbar pro Einsatz)' },
            { label: 'Farbe', desc: 'Akzentfarbe im Raster-Balken' },
          ].map(({ label, desc }) => (
            <div key={label} style={{ background: C.subtle, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: C.text, marginBottom: 2 }}>{label}</div>
              <div style={{ color: C.muted, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
        <div style={{ background: C.orange + '12', border: `1px solid ${C.orange}33`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
          <strong style={{ color: C.orange }}>Hinweis:</strong> Die Konfiguration gilt pro Produktion und wird in den
          Produktions-Einstellungen gespeichert. Änderungen wirken sich sofort auf das Raster aus.
        </div>
      </Section>

      {/* Technischer Bereich */}
      <Section title="Technische Details (Datenmodell)">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          Der Autorenplan speichert keine eigene Personendatenbank.
          Stattdessen werden alle Personen über die <strong>Vertragsdatenbank</strong> referenziert:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, fontSize: 12 }}>
          {[
            { table: 'autorenplan_einsaetze', desc: 'Ein Einsatz = vollständige Laufzeit eines Prozesses (z. B. 3 Wochen Storyedit). Referenz auf Person via vertragsdb_person_id.' },
            { table: 'autorenplan_futures', desc: 'Future-Gruppen mit Schreib- und Edit-Phasen.' },
            { table: 'autorenplan_future_autoren', desc: 'Autorenzuweisung pro Future und Phase.' },
            { table: 'autorenplan_wochen_notizen', desc: 'Wochennotizen (allgemein / Zusatzkosten / Sperrer) pro Produktion und Woche.' },
            { table: 'production_app_settings', desc: 'Buchprozess-Konfiguration als JSON (key: buchprozess_config) — pro Produktion.' },
          ].map(({ table, desc }) => (
            <div key={table} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: C.subtle, borderRadius: 6, padding: '8px 12px' }}>
              <code style={{ fontFamily: 'monospace', fontSize: 10, color: C.blue, flexShrink: 0, paddingTop: 1 }}>{table}</code>
              <span style={{ color: C.muted, lineHeight: 1.5 }}>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          Alle Tabellen nutzen <code>produktion_db_id</code> (UUID aus der Produktionsdatenbank) als
          Verknüpfungsschlüssel — es gibt keine lokale Produktions-ID im Autorenplan.
        </p>
      </Section>
    </div>
  )
}


export default AutorenplanHilfeTab
