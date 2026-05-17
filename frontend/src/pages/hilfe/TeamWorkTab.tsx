import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function TeamWorkTab() {
  const C = {
    blue: '#007AFF', orange: '#FF9500', green: '#00C853', purple: '#AF52DE',
    red: '#FF3B30', gray: '#757575',
  }

  return (
    <div style={{ padding: '32px 0' }}>

      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}15 0%, ${C.purple}10 100%)`,
        border: `1px solid ${C.blue}33`, borderRadius: 12,
        padding: '20px 24px', marginBottom: 36,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🤝</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Team-Work</div>
          <div style={{ fontSize: 13, color: C.gray, lineHeight: 1.7 }}>
            Team-Work steuert, wer eine Werkstufe sehen darf — von "nur ich" bis "ganze Produktion".
            Für enge Zusammenarbeit gibt es den <strong>Colab-Modus</strong> mit Echtzeit-Kollaboration (Yjs).
            Alle Einstellungen erfolgen direkt im Editor — über das Sichtbarkeits-Badge in der Kopfzeile.
          </div>
        </div>
      </div>

      {/* Einstieg */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Einstieg — wo finde ich was?</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 32 }}>
        {[
          {
            icon: '🏷️',
            title: 'Sichtbarkeit ändern',
            desc: 'Klick auf das farbige Sichtbarkeits-Badge in der Werkstufen-Kopfzeile → Dropdown öffnet sich.',
            color: C.blue,
          },
          {
            icon: '👥',
            title: 'Team-Gruppen auswählen',
            desc: 'Im Dropdown: "Team ▶" oder "Colab ▶" hovern/antippen → Flyout-Menü mit allen Gruppen.',
            color: C.blue,
          },
          {
            icon: '⚙️',
            title: 'Gruppen verwalten',
            desc: 'Im Dropdown ganz unten: "Teams verwalten" → öffnet das Team-Work-Modal.',
            color: C.gray,
          },
        ].map(item => (
          <div key={item.title} style={{
            background: 'var(--bg-subtle)', borderRadius: 10, padding: '14px 16px',
            border: `1px solid ${item.color}22`,
          }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.5 }}>{item.desc}</div>
          </div>
        ))}
      </div>

      {/* Sichtbarkeits-Ebenen */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Sichtbarkeits-Ebenen</h3>
      <p style={{ fontSize: 13, color: C.gray, lineHeight: 1.6, marginBottom: 16 }}>
        Jede Werkstufe hat genau eine Sichtbarkeit. Sie bestimmt, wer die Werkstufe in der Liste sieht
        und öffnen kann.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Einstellung', 'Sichtbar für', 'Yjs Echtzeit'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: C.gray, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { val: 'Nur ich (Privat)', color: C.orange, desc: 'Nur du — alle anderen sehen die Werkstufe nicht', yjs: false },
            { val: 'Nur ich (dauerhaft)', color: C.orange, desc: 'Wie Privat, aber kein Auto-Ablauf — bleibt dauerhaft privat', yjs: false },
            { val: 'Alle Autoren', color: C.blue, desc: 'Standard — alle Autoren der Produktion', yjs: false },
            { val: 'Gesamte Produktion', color: C.green, desc: 'Alle Produktionsmitglieder inkl. Regie, Producern etc.', yjs: false },
            { val: 'Team ▶ [Gruppe]', color: C.blue, desc: 'Nur Mitglieder der gewählten Gruppe — kein gemeinsames Tippen', yjs: false },
            { val: 'Colab ▶ [Gruppe]', color: C.purple, desc: 'Nur Mitglieder der Gruppe — mit Echtzeit-Kollaboration', yjs: true },
          ].map((row, i) => (
            <tr key={row.val} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 10px' }}>
                <span style={{ color: row.color, fontWeight: 600 }}>{row.val}</span>
              </td>
              <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{row.desc}</td>
              <td style={{ padding: '8px 10px' }}>
                {row.yjs
                  ? <span style={{ color: C.purple, fontWeight: 700 }}>✓ Ja</span>
                  : <span style={{ color: C.gray }}>—</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 32, paddingLeft: 4 }}>
        Tipp: Dieselbe Gruppe kann mal als "Team" (nur lesen) und mal als "Colab" (Echtzeit) verwendet werden —
        du wählst das jeweils im Sichtbarkeits-Menü der Werkstufe.
      </div>

      {/* Team vs. Colab */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Team vs. Colab — der Unterschied</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        {[
          {
            color: C.blue, icon: '👁',
            title: 'Team-Sichtbarkeit',
            points: [
              'Nur Mitglieder sehen die Werkstufe',
              'Jeder arbeitet für sich — kein gemeinsames Tippen',
              'Gut für: "Ich teile mit meiner Schreibpartner-Gruppe, wir editieren aber getrennt"',
            ],
          },
          {
            color: C.purple, icon: '🤝',
            title: 'Colab-Modus',
            points: [
              'Nur Mitglieder sehen die Werkstufe',
              'Echtzeit-Kollaboration via Yjs — alle tippen gleichzeitig sichtbar',
              'Gut für: "Wir schreiben zusammen in einer Session"',
            ],
          },
        ].map(c => (
          <div key={c.title} style={{
            background: c.color + '10', border: `1px solid ${c.color}33`,
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 16, marginBottom: 8 }}>{c.icon} <strong style={{ color: c.color }}>{c.title}</strong></div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {c.points.map(p => <li key={p}>{p}</li>)}
            </ul>
          </div>
        ))}
      </div>

      {/* Gruppen verwalten */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Gruppen verwalten</h3>
      <p style={{ fontSize: 13, color: C.gray, lineHeight: 1.6, marginBottom: 16 }}>
        Öffne das Team-Work-Modal über das Sichtbarkeits-Dropdown → <strong>Teams verwalten</strong>.
        Gruppen sind immer auf die aktuelle Produktion beschränkt.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {[
          {
            action: 'Gruppe erstellen',
            who: 'Jeder Autor',
            desc: 'Name + optionale Beschreibung eingeben → "Gruppe erstellen". Du wirst automatisch nicht Mitglied — tritt danach explizit bei.',
          },
          {
            action: 'Gruppe umbenennen',
            who: 'Nur Ersteller',
            desc: 'Im Detail-View: Stift-Icon neben dem Gruppennamen → Inline-Edit → Haken bestätigen.',
          },
          {
            action: 'Beitreten ("Mir selbst beitreten")',
            who: 'Jeder Autor',
            desc: 'Jeder kann einer Gruppe selbst beitreten — ohne Freigabe des Erstellers.',
          },
          {
            action: 'Andere hinzufügen',
            who: 'Nur Ersteller',
            desc: 'Person suchen (Name oder E-Mail) → Suchergebnis anklicken → wird sofort hinzugefügt.',
          },
          {
            action: 'Mitglied entfernen',
            who: 'Ersteller oder Mitglied selbst',
            desc: 'UserMinus-Icon neben dem Mitglied. Fremde Mitglieder kann nur der Ersteller entfernen.',
          },
          {
            action: 'Gruppe löschen',
            who: 'Nur Ersteller oder Admin',
            desc: 'Roten "Gruppe löschen"-Button im Detail-View. Alle zugehörigen Werkstufen verlieren die Gruppen-Sichtbarkeit.',
          },
        ].map(row => (
          <div key={row.action} style={{
            display: 'grid', gridTemplateColumns: '160px 110px 1fr',
            gap: 10, padding: '10px 14px',
            background: 'var(--bg-subtle)', borderRadius: 8,
            border: '1px solid var(--border)', fontSize: 12, alignItems: 'start',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.action}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
              background: row.who === 'Jeder Autor' ? C.blue + '18' : C.orange + '18',
              color: row.who === 'Jeder Autor' ? C.blue : C.orange,
              alignSelf: 'center', whiteSpace: 'nowrap',
            }}>{row.who}</span>
            <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{row.desc}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 32, paddingLeft: 4 }}>
        Gruppen sind produktionsbezogen — eine Gruppe aus Produktion A erscheint nicht in Produktion B.
      </div>

      {/* Privat-Modus */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Privat-Modus</h3>
      <p style={{ fontSize: 13, color: C.gray, lineHeight: 1.6, marginBottom: 16 }}>
        Der Privat-Modus schützt deine Arbeit, solange du noch nicht fertig bist.
        Es gibt zwei Varianten:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: C.orange + '0C', border: `1px solid ${C.orange}40`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.orange, marginBottom: 8 }}>
            🔒 Nur ich (Privat)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Läuft automatisch ab nach der konfigurierten Inaktivitätszeit (Standard: 4 Stunden).
            Du erhältst eine Email mit zwei Optionen:
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li><strong>Verlängern</strong> — Privat-Modus läuft weiter</li>
            <li><strong>Freigeben</strong> — Werkstufe wird wieder auf den letzten Zustand zurückgesetzt</li>
          </ul>
        </div>
        <div style={{ background: C.orange + '0C', border: `1px solid ${C.orange}40`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.orange, marginBottom: 8 }}>
            🔒 Nur ich (dauerhaft)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Kein automatischer Ablauf — bleibt privat bis du selbst die Sichtbarkeit änderst.
            Geeignet für längere Arbeitsphasen ohne Unterbrechung.
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: C.orange, fontStyle: 'italic' }}>
            Es werden keine Ablauf-Emails gesendet.
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
        <strong>Email-Links:</strong> Die Links in Ablauf-Emails sind 48 Stunden gültig, erfordern keinen Login
        und können nur einmal eingelöst werden. Sie öffnen eine einfache Bestätigungs-Seite — kein Login nötig.
      </div>

      {/* Editor-Warnungen */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Editor-Hinweise</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
        {[
          {
            color: C.orange,
            title: 'Anderer User aktiv',
            desc: 'Wenn ein anderer Autor dieselbe Werkstufe in den letzten 15 Minuten geöffnet hatte, erscheint oben im Editor ein diskreter Hinweis-Banner. Das schützt vor unbeabsichtigtem Überschreiben.',
          },
          {
            color: C.purple,
            title: 'Colab-Modus aktiv',
            desc: 'Ist die Sichtbarkeit auf "Colab ▶ [Gruppe]" gesetzt, läuft Yjs im Hintergrund. Alle Mitglieder sehen Änderungen in Echtzeit. Der Hinweis-Banner erscheint dann nicht, da Yjs das Merging übernimmt.',
          },
        ].map(item => (
          <div key={item.title} style={{
            display: 'flex', gap: 12, padding: '12px 14px',
            background: 'var(--bg-subtle)', borderRadius: 10,
            border: `1px solid ${item.color}33`,
          }}>
            <div style={{ width: 4, borderRadius: 4, background: item.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* DSGVO */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Datenschutz</h3>
      <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.7 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Was gespeichert wird</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)' }}>
              <li><code style={{ background: 'var(--bg-subtle)', padding: '0 3px', borderRadius: 3 }}>last_active_at</code> — Zeitstempel der letzten Aktivität in einer Werkstufe</li>
              <li>Kein Aktivitätslog, keine Tastenprotokollierung</li>
              <li>Session-Einträge werden nach 15 Minuten Inaktivität als beendet markiert</li>
            </ul>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Wofür die Daten genutzt werden</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)' }}>
              <li>Nur für den "Anderer User aktiv"-Hinweis — schützt <em>dich</em> vor Überschreiben</li>
              <li>Kein Auswertungs-Dashboard, keine Produktivitäts-Statistik</li>
              <li>Kein Zugriff durch Vorgesetzte auf Aktivitätsdaten</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Autorenplan Hilfe Tab ─────────────────────────────────────────────────────

export default TeamWorkTab
