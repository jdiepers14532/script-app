import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function DatensicherheitUserTab() {
  return (
    <div style={{ maxWidth: 780 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Datensicherheit</h2>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
        Hier erfährst du, wie deine Arbeit gespeichert wird, was beim Offline-Gehen passiert
        und wie die App verhindert, dass Änderungen verloren gehen oder überschrieben werden.
      </p>

      {/* Wann wird gespeichert */}
      <Section title="Wann wird meine Arbeit gespeichert?">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          Die App speichert <strong>automatisch</strong> während du schreibst — du musst nie manuell auf "Speichern" drücken.
          Jede Änderung im Szenentext wird nach einer kurzen Pause (etwa 1–2 Sekunden Inaktivität) automatisch an den Server geschickt.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { icon: '✅', label: 'Szenentext', desc: 'Jede Änderung wird automatisch gespeichert (Auto-Save nach ~1 Sek. Pause).' },
            { icon: '✅', label: 'Szenenkopf', desc: 'Motiv, Innen/Außen, Tag/Nacht, Rollen, Zusammenfassung — beim Verlassen des Feldes gespeichert.' },
            { icon: '✅', label: 'Werkstufen & Fassungen', desc: 'Neue Werkstufen und Versionen werden sofort beim Anlegen gespeichert.' },
            { icon: '✅', label: 'Story-Stränge & Sichtbarkeit', desc: 'Alle Metadaten werden direkt beim Klick gespeichert.' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{r.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Offline */}
      <Section title="Was passiert, wenn ich offline gehe?">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          Die App erkennt automatisch, wenn du keine Internetverbindung hast. Du kannst <strong>weiter schreiben</strong> —
          deine Änderungen werden zunächst im Browser zwischengespeichert.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            {
              step: '1', color: '#FF9500',
              title: 'Offline erkannt',
              desc: 'Die App zeigt ein Offline-Symbol. Neue Saves landen in einer internen Warteschlange im Browser.',
            },
            {
              step: '2', color: '#007AFF',
              title: 'Du schreibst weiter',
              desc: 'Alles funktioniert wie gewohnt. Deine Änderungen gehen nicht verloren — sie warten im Browser.',
            },
            {
              step: '3', color: '#00C853',
              title: 'Verbindung zurück',
              desc: 'Sobald das Netz zurückkehrt, sendet die App alle gespeicherten Änderungen automatisch an den Server — du musst nichts tun.',
            },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${s.color}`, borderRadius: 8, padding: '12px 14px' }}>
              <span style={{ fontWeight: 700, color: s.color, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{s.step}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: '#007AFF10', border: '1px solid #007AFF33', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          <strong style={{ color: C.text }}>Tipp: App installieren.</strong> Als installierte App (PWA) bleibt die Script-App auch
          ohne Netz vollständig nutzbar — inklusive aller zuletzt geladenen Szenen.
        </div>
      </Section>

      {/* Konflikte */}
      <Section title="Wann können Daten überschrieben werden?">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          Ein Konflikt entsteht, wenn <strong>zwei Personen gleichzeitig dieselbe Szene bearbeiten</strong>,
          ohne dass einer davon den Colab-Modus verwendet. Hier sind die typischen Situationen:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {[
            {
              risk: 'Hoch', color: '#FF3B30',
              title: 'Gleichzeitiges Schreiben ohne Colab',
              desc: 'Person A und Person B bearbeiten dieselbe Szene ohne Colab-Modus. Wer zuletzt speichert, überschreibt die Änderungen des anderen. Die App warnt mit einem gelben Banner, wenn jemand die Szene zuletzt aktiv hatte.',
            },
            {
              risk: 'Mittel', color: '#FF9500',
              title: 'Offline-Rückkehr nach langer Zeit',
              desc: 'Du warst offline und hast Änderungen gemacht. In der Zwischenzeit hat jemand anderes dieselbe Szene geändert. Die App erkennt den Konflikt und fragt dich, ob du deine Version behalten oder die Serverversion übernehmen möchtest.',
            },
            {
              risk: 'Niedrig', color: '#00C853',
              title: 'Verschiedene Szenen gleichzeitig',
              desc: 'Kein Risiko: Zwei Personen können problemlos an verschiedenen Szenen in derselben Episode arbeiten.',
            },
          ].map(r => (
            <div key={r.risk} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${r.color}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 10, background: r.color + '20', color: r.color, borderRadius: 10, padding: '2px 8px' }}>Risiko: {r.risk}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Vorkehrungen */}
      <Section title="Was tut die App, um Konflikte zu vermeiden?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            {
              icon: '⚠️',
              title: 'Warnbanner bei aktiven Mitbearbeitern',
              desc: 'Wenn jemand eine Szene in den letzten 15 Minuten geöffnet hatte (und noch nicht abgemeldet ist), erscheint ein orangener Banner: "XY hat diese Szene zuletzt bearbeitet." So weißt du, bevor du anfängst, ob Kollisionsgefahr besteht.',
            },
            {
              icon: '🔒',
              title: 'Privat-Modus',
              desc: 'Du kannst eine Werkstufe auf "Nur ich" stellen. Andere Autoren sehen die Szene dann nicht mehr und können nicht hineinschreiben. Ideal, wenn du an einem Entwurf arbeitest und noch nicht bereit bist, ihn zu teilen. Der Privat-Modus läuft nach einer konfigurierten Zeit automatisch ab und du bekommst eine E-Mail.',
            },
            {
              icon: '🤝',
              title: 'Colab-Modus (Echtzeit)',
              desc: 'Wenn ihr explizit zusammenarbeiten wollt, schalte die Werkstufe auf Colab. Dann arbeiten alle in Echtzeit in derselben Szene — wie Google Docs. Konflikte sind dann unmöglich, weil alle Änderungen sofort zusammengeführt werden.',
            },
            {
              icon: '🔄',
              title: 'Konflikt-Dialog',
              desc: 'Falls doch ein Konflikt erkannt wird (HTTP 409), öffnet die App einen Dialog: "Deine Version" vs. "Server-Version". Du entscheidest, welche behalten wird.',
            },
          ].map(item => (
            <div key={item.title} style={{ display: 'flex', gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Empfehlung */}
      <Section title="Empfehlung für die tägliche Arbeit">
        <div style={{ background: '#00C85310', border: '1px solid #00C85333', borderRadius: 8, padding: '16px 18px', fontSize: 13, lineHeight: 1.7 }}>
          <ul style={{ margin: 0, paddingLeft: 18, color: C.muted }}>
            <li><strong style={{ color: C.text }}>Schreibst du alleine?</strong> Einfach loslegen. Auto-Save erledigt den Rest.</li>
            <li><strong style={{ color: C.text }}>Arbeitest du an einer Szene, die andere auch bearbeiten?</strong> Achte auf den Warnbanner. Nutze den Privat-Modus, wenn du ungestört arbeiten willst.</li>
            <li><strong style={{ color: C.text }}>Schreibt ihr wirklich gleichzeitig?</strong> Wechselt in den Colab-Modus — dann gibt es keine Konflikte.</li>
            <li><strong style={{ color: C.text }}>Offline unterwegs?</strong> Einfach arbeiten. Die App synct alles automatisch, wenn du wieder online bist.</li>
          </ul>
        </div>
      </Section>

      {/* App-Updates */}
      <Section title="App-Updates — was ist der Update-Toast?">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 14 }}>
          Wenn wir eine neue Version der App veröffentlichen, lädt dein Browser die neue Version automatisch herunter —
          aber sie wird <strong>nicht sofort aktiv</strong>. Stattdessen siehst du einen kleinen Toast oben rechts:
        </p>

        {/* Mockup Update-Toast */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#1A1A1A', color: '#fff', borderRadius: 10,
            padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            maxWidth: 340,
          }}>
            <span style={{ fontSize: 16 }}>🔄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Neue Version verfügbar</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Klicke "Jetzt aktualisieren", um die neue Version zu laden</div>
            </div>
            <button style={{ background: '#00C853', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'default', flexShrink: 0 }}>
              Jetzt aktualisieren
            </button>
          </div>
        </div>

        {/* Flow */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 16, overflow: 'hidden', borderRadius: 8, border: `1px solid ${C.border}` }}>
          {[
            { step: '1', color: '#007AFF', title: 'Update geladen', desc: 'Die neue Version wurde im Hintergrund heruntergeladen. Du merkst davon nichts.' },
            { step: '2', color: '#FF9500', title: 'Toast erscheint', desc: 'Du siehst den Update-Hinweis. Die App läuft noch in der alten Version weiter.' },
            { step: '3', color: '#00C853', title: 'Du klickst "Aktualisieren"', desc: 'Die neue Version wird aktiv, die Seite lädt einmal neu. Deine Arbeit ist gespeichert.' },
          ].map((s, i) => (
            <div key={s.step} style={{ flex: 1, padding: '12px 14px', background: C.surface, borderLeft: i > 0 ? `1px solid ${C.border}` : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: s.color, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</span>
                <span style={{ fontWeight: 600, fontSize: 11 }}>{s.title}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{s.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ background: '#007AFF10', border: '1px solid #007AFF33', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          <strong style={{ color: C.text }}>Warum nicht automatisch?</strong> Die App wartet auf dein OK, damit kein offener Tab
          mitten im Schreiben plötzlich neu lädt. Du kannst den Toast ignorieren —
          beim nächsten Öffnen der App ist sie automatisch aktuell.
        </div>
      </Section>

      {/* Session & Token */}
      <Section title="Anmeldung & Session — kein plötzlicher Logout">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 14 }}>
          Dein Login wird durch ein zeitlich begrenztes Token gesichert (15 Minuten).
          Die App erneuert dieses Token automatisch im Hintergrund —
          du wirst <strong>nicht mitten in der Arbeit ausgeloggt</strong>.
        </p>

        {/* Token-Lifecycle Diagramm */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 36, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ flex: 1, height: '100%', background: '#00C85318', display: 'flex', alignItems: 'center', paddingLeft: 12, fontSize: 11, color: '#00C853', fontWeight: 600 }}>
              Token gültig (0–10 min)
            </div>
            <div style={{ width: 100, height: '100%', background: '#FF950018', borderLeft: '2px dashed #FF9500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#FF9500', fontWeight: 600 }}>
              Stiller Refresh
            </div>
            <div style={{ width: 80, height: '100%', background: '#FF3B3010', borderLeft: '2px dashed #FF3B30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#FF3B30', fontWeight: 600 }}>
              Ablauf
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: C.muted }}>
            <span>0 min</span>
            <span>↑ automatischer Refresh (10 min)</span>
            <span>15 min</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {[
            { icon: '🔑', title: 'Automatischer Refresh', desc: 'Die App erkennt, wann dein Token bald abläuft, und holt still ein neues — ohne dass du etwas tust oder merkst.' },
            { icon: '💾', title: 'Redirect-Fallback', desc: 'Falls du doch mal ausgeloggt wirst, merkt sich die App den Link, den du gerade offen hattest, und bringt dich nach dem Login automatisch dorthin zurück.' },
            { icon: '🍪', title: 'Sicheres Cookie', desc: 'Dein Login-Token ist ein sicherer, nicht auslesbarer Browser-Cookie. JavaScript kann ihn nicht stehlen — er wird ausschließlich vom Browser selbst verwaltet.' },
          ].map(item => (
            <div key={item.title} style={{ display: 'flex', gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 14px' }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#FF9500' + '10', border: '1px solid #FF950033', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          <strong style={{ color: C.text }}>Wann werde ich trotzdem ausgeloggt?</strong> Wenn du die App sehr lange nicht nutzt
          (länger als 7 Tage ohne Reload) oder dich explizit abmeldest. Danach landest du auf der
          Login-Seite und kommst automatisch zurück zum zuletzt geöffneten Link.
        </div>
      </Section>
    </div>
  )
}


export default DatensicherheitUserTab
