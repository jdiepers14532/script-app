import { useState } from 'react'
import AppShell from '../components/AppShell'
import { C, Section, InfoBox, WarnBox, Badge, FaqItem } from './hilfe/_shared'

// ── Tabs ───────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'methoden',   label: 'Analyse-Methoden' },
  { id: 'ergebnisse', label: 'Ergebnisse lesen' },
]

// ── Übersicht ──────────────────────────────────────────────────────────────────

function UebersichtTab() {
  return (
    <div>
      <Section title="Was ist der Analyse-Bereich?">
        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 12 }}>
          Der <strong>Analyse-Bereich</strong> liefert KI-gestützte Dramaturgie-Berichte für einzelne
          Blöcke oder Folgen. Die KI liest die Szenen aus der aktuellen Werkstufe und gibt strukturiertes
          Feedback zurück — als frei formatierter Bericht (Markdown).
        </p>
        <InfoBox title="Wann ist Analyse sinnvoll?">
          Wenn ein Block oder eine Folge im Drehbuch-Stadium vorliegt und ein unabhängiger
          struktureller Check gewünscht wird: Welche Szenen tragen wirklich zur Geschichte bei?
          Sind alle Figuren aktiv? Stimmt das emotionale Tempo?
        </InfoBox>
      </Section>

      <Section title="Block vs. Folge">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 8, border: `1px solid ${C.blue}33`, borderTop: `3px solid ${C.blue}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 6 }}>Block-Analyse</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Analysiert alle Folgen eines Blocks gemeinsam. Geeignet für übergeordnete Strang-Struktur
              und Pacing-Fragen über mehrere Episoden hinweg.
            </div>
          </div>
          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 8, border: `1px solid ${C.purple}33`, borderTop: `3px solid ${C.purple}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.purple, marginBottom: 6 }}>Folgen-Analyse</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Fokus auf eine einzelne Episode. Eignet sich für detaillierte Szenen-Bewertung und
              Figuren-Entscheidungen innerhalb einer Folge.
            </div>
          </div>
        </div>
      </Section>

      <Section title="Analyse starten">
        <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'Block oder Folge in der AppShell-Leiste auswählen',
            'Scope (Block / Folge) in der Seitenleiste wählen',
            '„Neue Analyse" klicken',
            'Eine oder mehrere Analyse-Methoden auswählen',
            'Start — die KI analysiert, Ergebnis erscheint nach wenigen Sekunden bis Minuten',
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="Tastaturkürzel">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { key: 'Alt+3', desc: 'Analyse-Bereich öffnen' },
            { key: 'Alt+H', desc: 'Diese Hilfe öffnen' },
          ].map(k => (
            <div key={k.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <kbd style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                background: '#000', color: '#fff', fontSize: 11, fontFamily: 'monospace',
                fontWeight: 600,
              }}>{k.key}</kbd>
              <span style={{ fontSize: 12, color: C.muted }}>{k.desc}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Methoden ──────────────────────────────────────────────────────────────────

function MethodenTab() {
  return (
    <div>
      <Section title="Verfügbare Analyse-Methoden">
        <div style={{ display: 'grid', gap: 14 }}>

          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `3px solid #000` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Showrunner-Check</div>
              <Badge color={C.green}>~2 €</Badge>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              <strong>Produktionsorientiertes Feedback:</strong> Welche Szenen tragen wirklich — und
              was kann gestrichen werden, wenn morgen zwei Drehtage wegfallen? Kein Dramaturgie-Modell
              als explizites Werkzeug — reiner Pragmatismus aus Showrunner-Perspektive.
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Story-Consultant</div>
              <Badge color={C.orange}>~2 €</Badge>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Analyse mit drei expliziten Dramaturgie-Modellen: <strong>Reagan, Toubia, Rocchi</strong>.
              Befunde, die in mehreren Modellen auftauchen, sind besonders verlässlich.
              Tiefer und strukturierter als der Showrunner-Check.
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Strang-Heatmap</div>
              <Badge color={C.blue}>~0,50 €</Badge>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Visualisiert die Verteilung der Story-Stränge über Folgen und Szenen.
              Zeigt auf einen Blick wo ein Strang dominant ist, verschwindet oder überproportional
              viel Raum einnimmt.
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Figuren-Agency-Matrix</div>
              <Badge color={C.blue}>~0,50 €</Badge>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Wer trifft in diesem Block Entscheidungen? Wer reagiert nur?
              Hilft passiv-reaktive Charakterbögen zu identifizieren.
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.red}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Vonnegut-Arcs</div>
              <Badge color={C.blue}>~0,50 €</Badge>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Emotionale Kurven der Stränge — angelehnt an Kurt Vonneguts "Shape of Stories".
              Zeigt ob ein Strang in der richtigen Folge seinen Tiefpunkt oder Wendepunkt hat.
            </div>
          </div>

        </div>
      </Section>

      <Section title="Kosten &amp; KI-Provider">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          Alle Methoden nutzen Claude (Anthropic) als KI-Backend. Die Kosten sind Schätzwerte
          bei mittlerer Block-Größe (10 Folgen, 30 Szenen pro Folge).
        </p>
        <WarnBox title="Kosten entstehen bei jeder neuen Analyse">
          Bereits vorliegende Ergebnisse werden gecacht und kosten nichts erneut.
          „Neue Analyse" startet immer einen frischen KI-Aufruf.
        </WarnBox>
      </Section>
    </div>
  )
}

// ── Ergebnisse ─────────────────────────────────────────────────────────────────

function ErgebnisseTab() {
  return (
    <div>
      <Section title="Ergebnisse interpretieren">
        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 12 }}>
          Analyse-Ergebnisse erscheinen als <strong>Markdown-Berichte</strong> in der rechten
          Hauptfläche. Jeder Bericht enthält Abschnitte je nach Methode:
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            { icon: '📋', title: 'Zusammenfassung', desc: 'Kurzfassung der wichtigsten Befunde an den Beginn jedes Berichts.' },
            { icon: '🎬', title: 'Szenen-Bewertung', desc: 'Einzelne Szenen werden bewertet — mit Begründung. "Kann gestrichen werden" bedeutet: aus struktureller Sicht, nicht aus Autorenrecht.' },
            { icon: '🧶', title: 'Strang-Analyse', desc: 'Wie entwickeln sich die Stränge? Fehler im Pacing, ungelöste Handlungsfäden, zu dominante Einzelstränge.' },
            { icon: '🎭', title: 'Figuren-Feedback', desc: 'Wer hat zu wenig Szene, wer ist überrepräsentiert, wessen Bogen ist unklar?' },
          ].map(item => (
            <div key={item.title} style={{
              display: 'flex', gap: 12, padding: '10px 14px',
              background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Häufige Fragen">
        <FaqItem
          q="Wie lange dauert eine Analyse?"
          a={<p style={{ margin: 0 }}>Zwischen 10 Sekunden (Heatmap) und 3 Minuten (Story-Consultant). Der Status-Spinner und Fortschritts-Meldungen zeigen den aktuellen Stand.</p>}
        />
        <FaqItem
          q="Kann ich mehrere Methoden gleichzeitig starten?"
          a={<p style={{ margin: 0 }}>Ja. Im Methoden-Auswahl-Dialog können mehrere Methoden gleichzeitig angehakt werden. Sie laufen sequenziell durch.</p>}
        />
        <FaqItem
          q="Wie lange sind Ergebnisse gespeichert?"
          a={<p style={{ margin: 0 }}>Analyse-Ergebnisse werden in der Datenbank gespeichert und sind dauerhaft verfügbar — solange der zugehörige Block existiert.</p>}
        />
        <FaqItem
          q="Die Analyse liefert Unsinn / offensichtliche Fehler"
          a={<p style={{ margin: 0 }}>KI-Analysen sind Vorschläge, keine Urteile. Sie kennen den Serien-Kontext nicht vollständig. Kritische Aussagen der KI immer im Team diskutieren, bevor Änderungen vorgenommen werden.</p>}
        />
      </Section>
    </div>
  )
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────────

export default function AnalyseHilfePage() {
  const [activeSection, setActiveSection] = useState('uebersicht')

  return (
    <AppShell>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* Linke Navigation */}
        <div style={{
          width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
          background: 'var(--bg-surface)', overflowY: 'auto', padding: '16px 0',
        }}>
          <div style={{ padding: '0 16px 12px', fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Analyse
          </div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 16px', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: activeSection === s.id ? 600 : 400,
                color: activeSection === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeSection === s.id ? 'var(--bg-subtle)' : 'transparent',
                borderLeft: activeSection === s.id ? `3px solid ${C.blue}` : '3px solid transparent',
                transition: 'all 0.12s', fontFamily: 'inherit',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Inhalt */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 860 }}>
          {activeSection === 'uebersicht' && <UebersichtTab />}
          {activeSection === 'methoden'   && <MethodenTab />}
          {activeSection === 'ergebnisse' && <ErgebnisseTab />}
        </div>

      </div>
    </AppShell>
  )
}
