import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function KommentareTab() {
  const steps = [
    { num: 1, title: 'Badge erscheint in der Szenenleiste', text: 'Sobald jemand im Messenger-App einen Kommentar zu einer Szene erstellt, erscheint in der Szenenleiste ein gelbes Sprechblasen-Symbol mit der Anzahl ungelesener Kommentare.' },
    { num: 2, title: 'Szene auswählen', text: 'Klicke auf die Szene in der Szenenleiste. Die Szene öffnet sich im Editor.' },
    { num: 3, title: 'Kommentare als gelesen markieren', text: 'Klicke im Szenen-Header auf den Kommentare-Button (Sprechblasen-Icon mit Zahl). Das Badge verschwindet sofort und die Kommentare gelten als gelesen.' },
    { num: 4, title: 'Kommentare im Messenger lesen', text: 'Öffne messenger.serienwerft.studio und suche nach der Szene — oder folge dem Link "In Script-App öffnen" in der Messenger-App zurück zu dieser Szene.' },
  ]

  const facts = [
    { label: 'Aktualisierung', value: 'Alle 60 Sekunden automatisch' },
    { label: 'Gelesen-Status', value: 'Nur beim expliziten Klick auf den Kommentare-Button' },
    { label: 'Kommentare schreiben', value: 'Ausschließlich im Messenger-App' },
    { label: 'Datenschutz', value: 'Script-App speichert nur Zeitstempel (wann du zuletzt gelesen hast) — keine Inhalte' },
    { label: 'Cross-Device', value: 'Read-Status ist pro User gespeichert und gilt auf allen Geräten' },
  ]

  return (
    <div style={{ padding: '28px 0' }}>
      <Section title="Kommentare & Messenger">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          Kommentare zu Szenen werden im <strong>Messenger-App</strong> verwaltet und erscheinen in der Script-App
          als Badge in der Szenenleiste. Die Script-App zeigt nur an, ob es ungelesene Kommentare gibt —
          Verfassen und Verwalten erfolgt ausschließlich im Messenger-App.
        </p>

        {/* Wie-es-funktioniert */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: C.text }}>So funktioniert es</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map(s => (
              <div key={s.num} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: C.blue,
                  color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.num}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{s.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Badge-Legende */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>Das Badge verstehen</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { color: '#FFCC00', label: 'Gelbes Badge mit Zahl', desc: 'Es gibt ungelesene Kommentare — Anzahl wird angezeigt' },
              { color: C.muted, label: 'Kein Badge', desc: 'Keine Kommentare zu dieser Szene, oder alle wurden gelesen' },
            ].map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.subtle }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>💬</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: b.color, minWidth: 16 }}>3</span>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Messenger → Script */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>Von Messenger zur Script-App navigieren</h3>
          <div style={{ padding: '14px 16px', background: C.blue + '10', border: `1px solid ${C.blue}33`, borderRadius: 8, fontSize: 12, lineHeight: 1.7, color: C.text }}>
            Wenn du im Messenger-App eine Annotation zu einer Szene siehst, erscheint im Kommentar-Panel
            oben rechts der Link <strong>"In Script-App öffnen"</strong>. Dieser Link öffnet die Script-App
            direkt bei der richtigen Szene und Folge.
          </div>
        </div>

        {/* Technische Details */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>Technische Details</h3>
          <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {facts.map((f, i) => (
              <div key={f.label} style={{
                display: 'grid', gridTemplateColumns: '200px 1fr',
                borderBottom: i < facts.length - 1 ? `1px solid ${C.border}` : undefined,
                fontSize: 12,
              }}>
                <div style={{ padding: '8px 12px', fontWeight: 600, background: C.subtle, color: C.muted }}>{f.label}</div>
                <div style={{ padding: '8px 12px' }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}


export default KommentareTab
