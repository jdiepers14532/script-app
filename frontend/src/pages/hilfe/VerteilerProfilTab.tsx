import { C, Badge, Section, FaqItem, InfoBox } from './_shared'

// ── Flow-Baustein (Hierarchie) ──────────────────────────────────────────────────
function FlowBox({ label, sub, color = C.blue }: { label: string; sub?: string; color?: string }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${color}55`,
      background: `${color}10`, textAlign: 'center', minWidth: 150,
    }}>
      <div style={{ fontWeight: 600, fontSize: 12, color }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
function Arrow({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: C.muted, fontSize: 11 }}>
      <span style={{ fontSize: 16 }}>↓</span>
      {label && <span>{label}</span>}
    </div>
  )
}

// ── Haupt-Tab ─────────────────────────────────────────────────────────────────
export default function VerteilerProfilTab() {
  return (
    <>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: C.text, marginTop: 0 }}>
        Das <strong>PDF-Export-Profil</strong> legt fest, wie das per Verteiler versendete
        PDF aufgebaut ist – Aufbau, Layout, Wasserzeichen. Es ist die <strong>verbindliche
        Vorlage</strong> (Single Source of Truth): Was du im Profil einstellst, kommt beim
        Versand genau so heraus – und die Live-Vorschau zeigt es vorab.
      </p>

      <Section title="Wo">
        <p style={{ fontSize: 13, lineHeight: 1.6, color: C.text }}>
          Im <strong>Verteiler</strong>-Tab einer Produktion → ein Verteiler → <strong>Profil bearbeiten</strong>.
          Jeder Verteiler hat sein eigenes Profil (je nach Auslöser/Werkstufen-Typ). Die
          <strong> Vorschau</strong> rendert gegen die <strong>Auslöser-Werkstufe</strong> –
          die neueste Werkstufe des eingestellten Typs (Fallback: neueste der Produktion).
        </p>
      </Section>

      <Section title="Was du festlegst">
        <p style={{ fontSize: 13, lineHeight: 1.6, color: C.text }}>
          <strong>Struktur</strong> (per Drag&amp;Drop VOR oder NACH die Szenen):
          {' '}<Badge color={C.blue}>Titelseite</Badge> <Badge color={C.blue}>Statistik</Badge>{' '}
          <Badge color={C.blue}>Onliner</Badge> <Badge color={C.blue}>Synopse</Badge>{' '}
          <Badge color={C.blue}>FSK</Badge> – sowie die <strong>Szenen</strong> selbst an/aus.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: C.text }}>
          <strong>Seitenlayout</strong>: Hoch-/Querformat · Kopf-/Fußzeilen-Modus
          (Standard / nur Kopf / nur Fuß / keine) · PDF-Lesezeichen (Inhaltsverzeichnis).
          {' '}<strong>Wasserzeichen</strong> (forensisch + sichtbar) und <strong>Revisionsstil</strong>.
        </p>
      </Section>

      <Section title="Profil ↔ Export-Drawer">
        <p style={{ fontSize: 13, lineHeight: 1.6, color: C.text }}>
          Auch der normale <strong>PDF-Export</strong> (Export-Drawer) kann mit dem Profil
          arbeiten – über zwei explizite Schaltflächen:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: C.text, paddingLeft: 18 }}>
          <li><strong>Aus Profil übernehmen</strong> – lädt Struktur &amp; Layout des gewählten Profils in den Drawer.</li>
          <li><strong>In Profil speichern</strong> – schreibt die aktuelle Drawer-Einstellung als Vorlage ins Profil zurück (nur die profil-relevanten Teile; konkrete Notizen/Szenen einer Folge bleiben außen vor).</li>
        </ul>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '12px 0' }}>
          <FlowBox label="PDF-Profil" sub="Vorlage / Single Source of Truth" color={C.green} />
          <Arrow label="überschreibbar" />
          <FlowBox label="Persönliches Preset" sub="deine Standard-Auswahl im Drawer" color={C.blue} />
          <Arrow label="überschreibbar" />
          <FlowBox label="Ad-hoc-Export" sub="genau dieser eine Export" color={C.muted} />
        </div>
      </Section>

      <InfoBox title="Statistik / Onliner / Synopse">
        Diese Elemente werden für die <strong>Folge der Auslöser-Werkstufe</strong> gerendert
        (Folge-Modus). Ein Block-Modus wird derzeit auf diese eine Folge aufgelöst. In der
        Vorschau weist ein Hinweis darauf hin, falls ein Element (noch) nicht dargestellt wird.
      </InfoBox>

      <Section title="Häufige Fragen">
        <FaqItem
          q="Sieht der Empfänger genau das, was die Vorschau zeigt?"
          a="Ja. Vorschau und tatsächlicher Versand nutzen denselben Renderer und dieselbe Profil-Auflösung – das Profil ist die einzige Quelle für beides."
        />
        <FaqItem
          q="Warum sehe ich in der Vorschau keine Statistik, obwohl sie aktiv ist?"
          a="Die Auslöser-Werkstufe muss einer Folge zugeordnet sein. Ohne Folgen-Bezug kann die Statistik nicht aufgelöst werden – die Vorschau meldet das dann oben als Hinweis."
        />
        <FaqItem
          q="Ändert „In Profil speichern“ auch mein persönliches Preset?"
          a="Nein. Das persönliche Preset (deine Drawer-Standardauswahl) und das Profil (die Versand-Vorlage) sind getrennt. „In Profil speichern“ schreibt nur ins gewählte Profil."
        />
      </Section>
    </>
  )
}
