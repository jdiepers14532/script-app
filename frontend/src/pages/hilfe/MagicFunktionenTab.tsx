// ── Hilfe: Magic-Funktionen ──────────────────────────────────────────────────

import { Wand2, Sparkles } from 'lucide-react'
import { C, Section, InfoBox } from './_shared'

const H1 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: C.text }}>{children}</h2>
)
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: C.text }}>{children}</h3>
)
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: C.text }}>{children}</p>
)

function WandIcon() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 7,
      background: '#AF52DE18', border: '1.5px solid #AF52DE44',
      verticalAlign: 'middle', marginRight: 4,
    }}>
      <Wand2 size={14} color="#AF52DE" />
    </div>
  )
}

function FunctionCard({
  title, description, available, availableLabel, unavailableLabel,
}: {
  title: string
  description: string
  available: boolean
  availableLabel: string
  unavailableLabel: string
}) {
  return (
    <div style={{
      border: `1.5px solid ${available ? '#AF52DE44' : C.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      background: available ? '#AF52DE08' : C.surface,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Sparkles size={15} color={available ? '#AF52DE' : C.gray} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
          <P>{description}</P>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 600,
            color: available ? '#AF52DE' : C.gray,
            background: available ? '#AF52DE14' : C.surface,
            border: `1px solid ${available ? '#AF52DE44' : C.border}`,
            borderRadius: 5, padding: '2px 8px',
          }}>
            {available ? '✓ ' + availableLabel : '— ' + unavailableLabel}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MagicFunktionenTab() {
  return (
    <div style={{ maxWidth: 720 }}>
      {/* Titel */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: '#AF52DE18', border: '1.5px solid #AF52DE44',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Wand2 size={22} color="#AF52DE" />
          </div>
          <H1>Magic-Funktionen</H1>
        </div>
        <P>
          Das <WandIcon />-Symbol in der Toolbar des Dokument-Editors öffnet die Magic-Funktionen —
          KI-gestützte Helfer, die kontextabhängig für die aktuelle Werkstufe zur Verfügung stehen.
        </P>
      </div>

      {/* Wo ist der Button */}
      <Section title="Wo finde ich den Button?">
        <P>
          Der <WandIcon /> Zauberstab-Button befindet sich in der rechten Toolbar des Dokument-Editors,
          neben den Buttons für Export und Verlauf. Er ist in jeder Werkstufe sichtbar — ob Drehbuch,
          Storyline, Notiz oder Treatment.
        </P>
        <InfoBox title="Kontextabhängig" color={C.purple}>
          Welche Funktionen im Modal angezeigt werden, hängt vom Typ der aktuellen Werkstufe und dem
          Kontext (z.&thinsp;B. ob man sich in einer Folge befindet) ab. Nicht verfügbare Funktionen
          werden ausgegraut mit einem Hinweis angezeigt.
        </InfoBox>
      </Section>

      {/* Verfügbare Funktionen */}
      <Section title="Verfügbare Funktionen">

        <H2>Episoden-Synopse</H2>
        <FunctionCard
          title="Episoden-Synopse"
          description="Liest alle Szenen-Zusammenfassungen der aktuellen Folge aus und generiert daraus automatisch eine kompakte Episoden-Synopse. Der erzeugte Text wird direkt in die aktive Notiz eingefügt und ersetzt dabei den bisherigen Inhalt."
          available={true}
          availableLabel="Notiz-Werkstufe innerhalb einer Folge"
          unavailableLabel="Nur in Notiz-Werkstufen verfügbar"
        />

        <div style={{ marginTop: 6, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
          <strong>Voraussetzungen:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.8 }}>
            <li>Die aktive Werkstufe hat den Typ <strong>Notiz</strong></li>
            <li>Die Notiz gehört zu einer <strong>Folge</strong> (nicht zu einem freien Dokument)</li>
            <li>Die Folge enthält Szenen mit ausgefüllter <strong>Zusammenfassung</strong></li>
            <li>Die KI-Funktion <code>synopsis_generate</code> ist in den Admin-Einstellungen aktiviert</li>
          </ul>
        </div>

        <InfoBox title="Hinweis zum Inhalt" color={C.orange} style={{ marginTop: 16 }}>
          Die generierte Synopse basiert ausschließlich auf den Szenen-Zusammenfassungen, nicht auf dem
          vollständigen Drehbuchtext. Je vollständiger die Zusammenfassungen gepflegt sind, desto besser
          das Ergebnis.
        </InfoBox>

        <H2>Weitere Funktionen</H2>
        <div style={{
          border: '1.5px dashed var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          color: C.muted,
          marginBottom: 10,
        }}>
          <Sparkles size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontStyle: 'italic' }}>
            Weitere Magic-Funktionen werden in zukünftigen Updates ergänzt.
          </span>
        </div>

      </Section>

      {/* KI-Einstellungen */}
      <Section title="Admin: KI-Einstellungen">
        <P>
          Magic-Funktionen die KI verwenden, müssen in den Admin-Einstellungen aktiviert sein.
          Admins finden die Konfiguration unter <strong>Einstellungen → KI-Funktionen</strong>.
          Dort lässt sich pro Funktion der KI-Provider (Ollama / Mistral Cloud) und das Modell
          festlegen.
        </P>
      </Section>
    </div>
  )
}
