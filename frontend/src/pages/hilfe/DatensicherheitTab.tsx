import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function DatensicherheitTab() {
  return (
    <div style={{ maxWidth: 780 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Datensicherheit & Offline-Schutz</h2>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
        Die Script-App schützt deine Arbeit nach dem <strong>Local-First-Prinzip</strong>
        (Kleppmann et al. 2019): IndexedDB im Browser ist die primäre Speicherquelle,
        der Server ist „eventually consistent". Änderungen gehen daher auch ohne
        Internetverbindung nicht verloren.
      </p>

      {/* ── Tier-Übersicht ── */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Drei Schutz-Ebenen</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            {
              tier: 'Tier 1', color: '#00C853', status: 'Aktiv',
              title: 'Offline-Write-Queue',
              desc: 'Speichert fehlgeschlagene Saves in IndexedDB. Automatischer Retry sobald das Netz zurückkehrt (online-Event). Exponential Backoff: 1s → 2s → 4s → … max 60s, max. 5 Versuche.',
            },
            {
              tier: 'Tier 2', color: '#007AFF', status: 'Aktiv',
              title: 'Conflict Detection (HTTP 409)',
              desc: 'Beim Sync wird X-Client-Version (updated_at bei Laden der Szene) an den Server gesendet. Wurde die Szene inzwischen von jemand anderem geändert, antwortet der Server mit 409. Der User kann dann "Überschreiben" oder "Verwerfen" wählen.',
            },
            {
              tier: 'Tier 3', color: '#AF52DE', status: 'Aktiv',
              title: 'Yjs IndexedDB Persistence',
              desc: 'Kollaborative Änderungen (Hocuspocus/Yjs) werden via y-indexeddb automatisch lokal persistiert. Bei Browser-Absturz oder Offline-Reload wird der letzte Stand sofort aus IndexedDB wiederhergestellt — bevor der WebSocket-Sync beginnt. Editor zeigt "Lädt lokalen Stand…" während die IDB-Daten gelesen werden.',
            },
          ].map(t => (
            <div key={t.tier} style={{
              border: `1px solid ${C.border}`,
              borderLeft: `4px solid ${t.color}`,
              borderRadius: 8,
              padding: '14px 16px',
              background: C.surface,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: t.color }}>{t.tier}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  background: t.status === 'Aktiv' ? t.color + '20' : '#FF950020',
                  color: t.status === 'Aktiv' ? t.color : '#FF9500',
                  borderRadius: 10, padding: '2px 8px',
                }}>{t.status}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Was passiert wann ── */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Was passiert mit meinen Änderungen?</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.subtle }}>
                {['Situation', 'SW installiert', 'SW nicht installiert'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, border: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Online, Save ok', '✅ Server gespeichert', '✅ Server gespeichert'],
                ['Offline, tippe Szene (Collab-Modus)', '✅ Yjs-Updates in IDB (Tier 3) + React-State', '⚠️ Änderungen nur in React-State (RAM)'],
                ['Offline, Save fehlgeschlagen', '✅ In IndexedDB-Queue → Retry on Online', '✅ In IndexedDB-Queue → Retry on Online'],
                ['Browser-Tab schließen (offline)', '⚠️ Queue bleibt in IndexedDB, Tab-State geht verloren', '⚠️ Queue bleibt, aber nicht gespeicherter Tipp-State geht verloren'],
                ['Szenenwechsel (offline)', '⚠️ Ungesaved Tipp-State der alten Szene verloren', '⚠️ Ungesaved Tipp-State der alten Szene verloren'],
                ['Back online', '✅ Auto-Sync aller Queue-Einträge', '✅ Auto-Sync aller Queue-Einträge'],
                ['409 Konflikt', '⚠️ User-Entscheidung: Überschreiben oder Verwerfen', '⚠️ User-Entscheidung: Überschreiben oder Verwerfen'],
              ].map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : C.subtle }}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: '8px 12px', border: `1px solid ${C.border}`, lineHeight: 1.5 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
          ⚠️ = teilweise Einschränkung · ✅ = vollständig gesichert
        </p>
      </div>

      {/* ── Save-Status-Anzeige ── */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Save-Status im Editor</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { status: 'Speichert…',          color: C.muted,    desc: 'Debounce läuft (1,5s nach letzter Eingabe)' },
            { status: '● Gespeichert',        color: '#00C853',  desc: 'Erfolgreich auf dem Server gespeichert' },
            { status: '⏸ Lokal gespeichert', color: '#FF9500',  desc: 'Save fehlgeschlagen (offline) — in IndexedDB-Queue, wird beim nächsten Online-Event übertragen' },
            { status: '● Fehler',             color: '#FF3B30',  desc: 'Technischer Fehler (nicht netzwerkbedingt) — manuell prüfen' },
          ].map(s => (
            <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: s.color, fontWeight: 600, minWidth: 160 }}>{s.status}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Konflikt-Auflösung ── */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Konflikt-Auflösung (Tier 2)</h3>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
          Ein Konflikt entsteht, wenn zwei Nutzer:innen dieselbe Szene gleichzeitig offline bearbeiten
          und einer davon versucht, eine ältere Version hochzuladen.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            {
              action: 'Überschreiben (Force-Push)',
              color: '#FF9500',
              desc: 'Deine lokale Version wird ohne Versionscheck erneut gespeichert und überschreibt den Server-Stand. Wählen wenn du sicher bist, dass deine Änderungen aktueller sind.',
            },
            {
              action: 'Verwerfen',
              color: C.muted,
              desc: 'Dein lokaler Eintrag wird aus der Queue gelöscht. Die Server-Version bleibt erhalten. Wählen wenn du die Änderungen des anderen Nutzers übernehmen möchtest.',
            },
          ].map(opt => (
            <div key={opt.action} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: opt.color, marginBottom: 6 }}>{opt.action}</div>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{opt.desc}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          Hinweis: Bei aktivem Hocuspocus-Kollaboration-Modus übernimmt Yjs die Conflict Resolution
          automatisch via CRDT — HTTP-Konflikte entstehen dort nicht.
        </p>
      </div>

      {/* ── Technische Details ── */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Technische Details</h3>
        <div style={{ background: C.subtle, borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 11, lineHeight: 2 }}>
          <div><span style={{ color: C.muted }}>// IndexedDB-Datenbank</span></div>
          <div><code>DB: script-offline-queue / Store: requests</code></div>
          <div style={{ marginTop: 8 }}><span style={{ color: C.muted }}>// Queue-Eintrag-Schema</span></div>
          <div><code>{'{'} id, method, url, body, timestamp, attempts, client_version, status {'}'}</code></div>
          <div style={{ marginTop: 8 }}><span style={{ color: C.muted }}>// Retry-Logik</span></div>
          <div><code>backoff = min(1000 × 2^attempts, 60000) ms · MAX_ATTEMPTS = 5</code></div>
          <div style={{ marginTop: 8 }}><span style={{ color: C.muted }}>// Conflict Detection</span></div>
          <div><code>PUT /api/dokument-szenen/:id</code></div>
          <div><code>Header: X-Client-Version: &lt;updated_at ISO&gt;</code></div>
          <div><code>Server: wenn updated_at &gt; client_version → 409 {'{'} server_version {'}'}</code></div>
        </div>
      </div>

      {/* ── Literatur ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 10 }}>Literatur & Referenzen</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: C.muted, lineHeight: 2 }}>
          <li>Kleppmann, Wiggins et al. (2019): <em>Local-first software: You own your data, in spite of the cloud</em> — ACM SIGPLAN</li>
          <li>Ink & Switch: <em>Local-First Essay</em> — inkandswitch.com/essay/local-first</li>
          <li>MDN: <em>Background Synchronization API</em></li>
          <li>Google Workbox: <em>workbox-background-sync</em></li>
        </ul>
      </div>
    </div>
  )
}

// ── Team-Work Tab ──────────────────────────────────────────────────────────

export default DatensicherheitTab
