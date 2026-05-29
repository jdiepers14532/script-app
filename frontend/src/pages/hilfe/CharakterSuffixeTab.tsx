import { C, Badge, Section, InfoBox, WarnBox } from './_shared'

function GlossarRow({ kuerzel, color, lang, set, dispo }: {
  kuerzel: string; color: string; lang: string; set: string; dispo: string
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 180px 200px',
      gap: 12,
      padding: '10px 14px',
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 13,
      alignItems: 'start',
    }}>
      <div><Badge color={color}>{kuerzel}</Badge></div>
      <div style={{ color: C.text }}>{lang}</div>
      <div style={{ color: C.muted, fontSize: 12 }}>{set}</div>
      <div style={{ color: C.muted, fontSize: 12 }}>{dispo}</div>
    </div>
  )
}

function SettingRow({ label, def, desc }: { label: string; def: string; desc: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '240px 80px 1fr',
      gap: 12,
      padding: '8px 14px',
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 13,
    }}>
      <div style={{ fontWeight: 500 }}>{label}</div>
      <div style={{ color: C.muted, fontSize: 12 }}>{def}</div>
      <div style={{ color: C.muted, fontSize: 12 }}>{desc}</div>
    </div>
  )
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols.map(() => '1fr').join(' '),
      gap: 12,
      padding: '6px 14px',
      background: 'var(--bg-subtle)',
      borderRadius: '8px 8px 0 0',
      fontSize: 11,
      fontWeight: 600,
      color: C.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {cols.map((c, i) => <div key={i}>{c}</div>)}
    </div>
  )
}

export default function CharakterSuffixeTab() {
  return (
    <div>
      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}18 0%, ${C.purple}12 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>📞</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Charakter-Suffixe — OFF, NT, ONE-WAY</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Die Script-App erkennt automatisch, in welchem Status eine Figur in einer Szene vorkommt.
            Das beeinflusst den Szenenkopf, die Drehplanung und die NT-Aufnahme-Planung.
          </div>
        </div>
      </div>

      {/* 1. Glossar */}
      <Section title="1. Glossar — Figuren-Status">
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <TableHeader cols={['Kürzel', 'Bedeutung', 'Set-Präsenz', 'Disposition']} />
          <GlossarRow kuerzel="ON" color={C.green} lang="On-Screen — Figur im Kader sichtbar. Standard, kein Suffix nötig." set="Am Set, dreht" dispo="Drehplan (normal)" />
          <GlossarRow kuerzel="(OFF)" color={C.orange} lang="Off-Screen / O.S. — physisch im Szenenbild, außerhalb Kader. Stimme hörbar, diegetisch." set="Am Set (hinter Kamera)" dispo="Drehplan (per Toggle)" />
          <GlossarRow kuerzel="(NT)" color={C.purple} lang="Nur Ton — Figur nicht am Set. Ton wird separat im Studio aufgezeichnet." set="Nicht am Set" dispo="NT-Plan" />
          <GlossarRow kuerzel="(ONE-WAY)" color={C.blue} lang="One-Way-Telefonat — nur eine Seite sichtbar. Telefonpartner ist NT." set="Sichtbare: am Set. Partner: nicht." dispo="Sichtbare: Drehplan · Partner: NT" />
          <GlossarRow kuerzel="VO" color={C.gray} lang="Voice Over — nicht-diegetische Erzählerstimme oder innerer Monolog." set="Nicht am Set" dispo="Separat geplant" />
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          <strong>OFF vs. NT:</strong> OFF-Figuren <em>drehen mit</em> — sie stehen auf dem Set, nur außerhalb des Kaders.
          NT-Figuren kommen an <em>keinem Drehtag</em> ans Set; ihr Ton wird an einem separaten Studiotag aufgenommen.
        </div>
      </Section>

      {/* 2. Suffix-Erkennung */}
      <Section title="2. Suffix-Erkennung in CHARACTER-Zeilen">
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Wenn du in einer CHARACTER-Zeile einen Suffix hinter den Namen tippst, erkennt die App
          alle gängigen Schreibweisen und normalisiert sie automatisch.
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto',
            gap: 12, padding: '6px 14px',
            background: 'var(--bg-subtle)', borderRadius: '8px 8px 0 0',
            fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <div>Eingabe-Varianten</div><div>Kanonisch</div><div>Status</div>
          </div>
          {[
            { variants: 'off, Off, OFF, (off), O.S., o.s.', canonical: '(OFF)', badge: <Badge color={C.orange}>(OFF)</Badge> },
            { variants: 'nt, n.t., N.T., nT, (nt), (n.t.)', canonical: '(NT)', badge: <Badge color={C.purple}>(NT)</Badge> },
            { variants: 'oneway, one-way, (one-way), ONE-WAY, (ONE-WAY)', canonical: '(ONE-WAY)', badge: <Badge color={C.blue}>(ONE-WAY)</Badge> },
          ].map((row, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              gap: 12, padding: '10px 14px',
              borderBottom: i < 2 ? '1px solid var(--border-subtle)' : 'none',
              fontSize: 13, alignItems: 'center',
            }}>
              <div style={{ color: C.muted, fontFamily: 'monospace', fontSize: 12 }}>{row.variants}</div>
              <div><code style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: 4 }}>{row.canonical}</code></div>
              <div>{row.badge}</div>
            </div>
          ))}
        </div>

        <InfoBox title="Szenen-Memory">
          Die App merkt sich pro Szene den letzten Suffix einer Figur. Beim nächsten Eintippen desselben
          Namens in derselben Szene erscheint der Suffix als Vorschlag. Tippst du den Namen ohne Suffix,
          wird der Vorschlag ignoriert.
        </InfoBox>
      </Section>

      {/* 3. Szenenkopf */}
      <Section title="3. Automatischer Szenenkopf-Eintrag">
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Wenn du eine Figur per Autovervollständigung akzeptierst, wird sie automatisch im Szenenkopf
          unter Rollen eingetragen. Bei OFF- und NT-Figuren gelten Sonderregeln:
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '140px 1fr 1fr',
            gap: 12, padding: '6px 14px',
            background: 'var(--bg-subtle)', borderRadius: '8px 8px 0 0',
            fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <div>Suffix</div><div>Szenenkopf Rollen</div><div>Notizfeld</div>
          </div>
          {[
            { suffix: <Badge color={C.green}>ON (kein Suffix)</Badge>, rollen: '✓ Eintragen', notiz: '—' },
            { suffix: <Badge color={C.orange}>(OFF)</Badge>, rollen: 'Standard: nicht eintragen', notiz: '"Name im Off"' },
            { suffix: <Badge color={C.purple}>(NT)</Badge>, rollen: 'Niemals eintragen', notiz: '"NT Name"' },
            { suffix: <Badge color={C.blue}>(ONE-WAY)</Badge>, rollen: '✓ Eintragen (sichtbare Figur)', notiz: '—' },
          ].map((row, i, arr) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '140px 1fr 1fr',
              gap: 12, padding: '10px 14px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              fontSize: 13, alignItems: 'center',
            }}>
              <div>{row.suffix}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{row.rollen}</div>
              <div style={{ color: C.muted, fontSize: 12, fontFamily: 'monospace' }}>{row.notiz}</div>
            </div>
          ))}
        </div>

        <div style={{
          background: `${C.blue}12`, border: `1px solid ${C.blue}33`,
          borderRadius: 8, padding: '12px 16px', fontSize: 13, color: C.text, lineHeight: 1.6,
        }}>
          <strong>Toggle in DK-Settings:</strong> Unter <em>Drehbuchkoordination → Figuren → Charakter-Suffixe</em>
          kannst du „OFF-Figuren im Szenenkopf aufführen" aktivieren. Dann erscheinen OFF-Figuren mit
          dem Kürzel <code style={{ fontFamily: 'monospace' }}>(OFF)</code> unter Rollen — der Drehplan disponiert sie ans Set.
        </div>
      </Section>

      {/* 4. ONE-WAY-Warnung */}
      <Section title="4. ONE-WAY — Telefonpartner angeben">
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Enthält eine Szene eine ONE-WAY-Figur, aber fehlt der Telefonpartner in der Szenennotiz,
          erscheint in der Szenenleiste das Symbol <strong style={{ color: C.orange }}>☎⚠</strong>.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ background: C.orange, color: '#fff', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>1</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Klicke auf <strong style={{ color: C.orange }}>☎⚠</strong> in der Szenenleiste.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ background: C.orange, color: '#fff', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>2</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Wähle den NT-Partner aus dem Figurenverzeichnis oder tippe den Namen frei ein.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ background: C.orange, color: '#fff', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>3</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Bestätige. Der Partner wird als <code style={{ fontFamily: 'monospace' }}>NT [Name]</code> in die Szenennotiz geschrieben — die Warnung verschwindet.
            </div>
          </div>
        </div>

        <WarnBox title="Warum das wichtig ist">
          Der NT-Partner dreht nicht am Set. Er muss separat in einem Studio aufgenommen werden.
          Ohne diesen Eintrag fehlt er in der NT-Planung und kann nicht disponiert werden.
        </WarnBox>
      </Section>

      {/* 5. Action-AC */}
      <Section title="5. Autovervollständigung in Action-Zeilen">
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          In Action-Zeilen erkennt die App Figurennamen, wenn du sie in Großbuchstaben tippst
          (Standard: ab 4 Zeichen). Sobald ein bekannter Name beginnt, erscheint ein Vorschlag.
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 12, padding: '6px 14px',
            background: 'var(--bg-subtle)', borderRadius: '8px 8px 0 0',
            fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <div>Situation</div><div>Verhalten</div>
          </div>
          {[
            ['CAPS-Wort ab 4 Zeichen + bekannte Figur', 'Suggestion erscheint (Ghost oder Dropdown)'],
            ['CAPS-Wort + unbekannte Figur', 'Dialog „Neuen Charakter anlegen?" öffnet sich'],
            ['Gemischte Schreibweise (z.B. Maria)', 'Keine Autovervollständigung'],
            ['Kein weiterer Treffer beim Weiterschreiben', 'Vorschlag verschwindet lautlos'],
          ].map((row, i, arr) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 12, padding: '10px 14px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              fontSize: 13,
            }}>
              <div style={{ color: C.text }}>{row[0]}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{row[1]}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          Beim Akzeptieren (Enter oder Tab) wird der Name in Großbuchstaben eingefügt,
          wenn die Option „Namen in Action-Zeilen großschreiben" aktiv ist.
        </div>
      </Section>

      {/* 6. Neu-anlegen-Modal */}
      <Section title="6. Neuen Charakter anlegen">
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          Wenn ein eingetippter Name nicht in der Rollendatenbank gefunden wird, öffnet sich
          der Dialog „Neuen Charakter anlegen?". Dort kannst du wählen:
        </div>
        <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 2, color: C.text }}>
          <li><strong>Rolle</strong> — erhält eine Rollennummer (Standard)</li>
          <li><strong>Komparse</strong> — erhält eine Komparsen-Nummer (Toggle „Ist Komparse")</li>
        </ul>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginTop: 8 }}>
          Wenn Rollen-Freigabe konfiguriert ist, wird automatisch eine Freigabe-Anfrage gesendet.
        </div>
      </Section>

      {/* 7. DK-Settings */}
      <Section title="7. Einstellungen (Drehbuchkoordination → Figuren)">
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '240px 80px 1fr',
            gap: 12, padding: '6px 14px',
            background: 'var(--bg-subtle)', borderRadius: '8px 8px 0 0',
            fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <div>Einstellung</div><div>Standard</div><div>Beschreibung</div>
          </div>
          {[
            ['OFF / O.S. erkennen', 'Ein', 'OFF-Suffix in CHARACTER-Zeilen erkennen'],
            ['NT (Nur Ton) erkennen', 'Ein', 'NT-Suffix in CHARACTER-Zeilen erkennen'],
            ['ONE-WAY erkennen', 'Ein', 'ONE-WAY-Suffix in CHARACTER-Zeilen erkennen'],
            ['OFF-Figuren im Szenenkopf aufführen', 'Aus', 'OFF-Figuren mit (OFF) unter Rollen eintragen statt nur in die Notiz'],
            ['Action-AC aktiviert', 'Ein', 'Großbuchstaben-Erkennung in Action-Zeilen einschalten'],
            ['Mindestlänge CAPS-Wort', '4 Zeichen', 'Ab wie vielen Großbuchstaben die AC in Action-Zeilen auslöst'],
            ['Namen in Action großschreiben', 'Ein', 'Akzeptierter Name wird in Großbuchstaben in die Action-Zeile eingefügt'],
          ].map((row, i, arr) => (
            <SettingRow key={i} label={row[0]} def={row[1]} desc={row[2]} />
          ))}
        </div>
      </Section>

    </div>
  )
}
