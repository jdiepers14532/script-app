import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function SonderszenentTab() {
  // Inline icon components for the visual diagrams
  const TypeCard = ({ icon, title, color, subtitle, children }: {
    icon: string; title: string; color: string; subtitle: string; children: React.ReactNode
  }) => (
    <div style={{
      border: `2px solid ${color}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 24,
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${color}22 0%, ${color}08 100%)`,
        padding: '16px 20px',
        borderBottom: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 28 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color }}>{title}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )

  const SceneHead = ({ parts, color }: { parts: string[]; color: string }) => (
    <div style={{
      fontFamily: 'monospace',
      fontSize: 12,
      background: '#000',
      color: '#fff',
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 12,
      borderLeft: `4px solid ${color}`,
      lineHeight: 1.6,
    }}>
      {parts.map((p, i) => <div key={i}>{p}</div>)}
    </div>
  )

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 4 }}>
      <span style={{ fontWeight: 600, color: C.text, minWidth: 140 }}>{label}</span>
      <span style={{ color: C.muted }}>{value}</span>
    </div>
  )

  return (
    <div>
      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.purple}18 0%, ${C.orange}12 100%)`,
        border: `1px solid ${C.purple}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🎭</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Sonderszenen — Wechselschnitt, Stockshot, Flashback</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Neben regulaeren Szenen unterstuetzt die Script-App drei Sonderszenen-Typen mit
            strukturiertem Tracking. Jede Szene kann ueber den Szenenkopf als Sondertyp markiert werden.
            Die Terminologie (z.B. „Stockshot" vs. „Archivshot") ist produktionsweise konfigurierbar.
          </div>
        </div>
      </div>

      {/* ── 1. Übersicht ── */}
      <Section title="1. Die drei Sondertypen im Überblick">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { icon: '⇄', label: 'Wechselschnitt', color: C.blue, desc: 'Zwei oder mehr Szenen werden parallel geschnitten — z.B. Telefonat, gleichzeitige Handlung.' },
            { icon: '📷', label: 'Stockshot', color: C.orange, desc: 'Kurze Einstellung ohne Dialog — Außenansicht, Zeitsprung oder Stimmungswechsel. Kann aus dem Archiv stammen.' },
            { icon: '⏪', label: 'Flashback', color: C.purple, desc: 'Rueckblende auf eine fruehere Szene. Verweist auf die Ursprungsszene per Referenz.' },
          ].map((t, i) => (
            <div key={i} style={{
              border: `1px solid ${t.color}44`,
              borderRadius: 10,
              padding: '16px 14px',
              background: t.color + '08',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: t.color, marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{t.desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, fontStyle: 'italic' }}>
          Eine Szene kann nur einen Sondertyp gleichzeitig haben. Regulaere Szenen (kein Sondertyp) bleiben unveraendert.
        </p>
      </Section>

      {/* ── 2. Wechselschnitt ── */}
      <Section title="2. Wechselschnitt (Cross-Cutting)">
        <TypeCard icon="⇄" title="Wechselschnitt" color={C.blue} subtitle="Parallelmontage zweier oder mehrerer Szenen">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Ein Wechselschnitt verbindet eine Szene mit einer oder mehreren Partner-Szenen. Die Verknuepfung
            ist <strong>bidirektional</strong>: Markierst du Szene 8 als Wechselschnitt mit Szene 5 und 6,
            sehen auch Szene 5 und 6, dass sie Teil eines Wechselschnitts sind.
          </p>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Szenenkopf-Darstellung</div>
          <SceneHead color={C.blue} parts={[
            '8 · INT/EXT · WECHSELSCHNITT (mit Sz. 5, 6)',
          ]} />

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, marginTop: 16 }}>Bei Partner-Szenen (read-only)</div>
          <SceneHead color={C.blue} parts={[
            '5 · INT · LÜNEBURG KÜCHE · TAG — beteiligt an Wechselschnitt (Sz. 8)',
          ]} />

          <div style={{
            display: 'flex', gap: 12, marginTop: 16, padding: '12px 16px',
            background: C.blue + '0a', borderRadius: 8, border: `1px solid ${C.blue}22`,
          }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              <strong>Datenmodell:</strong> Die Partner-Beziehung wird in einer eigenen Tabelle (<Badge color={C.blue}>wechselschnitt_partner</Badge>)
              als N:M gespeichert. Jeder Partner hat eine Position (Reihenfolge im Schnitt).
              Beim Löschen einer Wechselschnitt-Szene werden die Partner-Verknüpfungen automatisch entfernt.
            </div>
          </div>
        </TypeCard>
      </Section>

      {/* ── 3. Stockshot ── */}
      <Section title="3. Stockshot / Archivshot">
        <TypeCard icon="📷" title="Stockshot" color={C.orange} subtitle="Kurze Einstellung ohne Dialog — Ortswechsel, Zeitsprung, Stimmungswechsel">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Stockshots sind kurze Aufnahmen, die zwischen Szenen eingefuegt werden — z.B. eine
            Außenansicht eines Gebäudes, ein Sonnenuntergang oder ein Zeitraffer. Sie können aus dem
            <strong> Archiv</strong> stammen (bereits gefilmt) oder <strong>neu zu drehen</strong> sein.
          </p>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Szenenkopf-Darstellung</div>
          <SceneHead color={C.orange} parts={[
            'SS · STOCKSHOT: Außenansicht Lüneburger Altstadt. — Ortswechsel [Neu zu drehen]',
          ]} />

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, marginTop: 20 }}>Drei Kategorien</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {[
              { cat: 'Ortswechsel', desc: 'Überleitung zwischen zwei Drehorten — z.B. Außenansicht des nächsten Motivs.', ex: 'Außenansicht Lüneburger Altstadt.' },
              { cat: 'Zeit vergeht', desc: 'Zeitsprung innerhalb der Handlung — z.B. Tag wird Nacht, Uhrzeiger, Kalender.', ex: 'Die Sonne wandert über den Himmel.' },
              { cat: 'Stimmungswechsel', desc: 'Änderung der Lichtstimmung — z.B. Tag → Nacht. Kann folgende Szenen beeinflussen.', ex: 'Nacht über Lüneburg. Lichter gehen an.' },
            ].map((k, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                border: `1px solid ${C.orange}33`, borderLeft: `3px solid ${C.orange}`, borderRadius: 8,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: C.orange, marginBottom: 3 }}>{k.cat}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{k.desc}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.text, marginTop: 4, opacity: 0.6 }}>Beispiel: „{k.ex}"</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Stockshot-Archiv</div>
          <div style={{
            display: 'flex', gap: 12, padding: '14px 16px',
            background: C.orange + '0a', borderRadius: 8, border: `1px solid ${C.orange}22`,
          }}>
            <span style={{ fontSize: 18 }}>🗄️</span>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Das Archiv speichert pro Staffel, welche <strong>Motiv + Lichtstimmung</strong>-Kombinationen
              bereits gefilmt wurden. Wenn du einen Stockshot anlegst und die Kombination im Archiv existiert,
              wird <Badge color={C.green}>Aus Archiv</Badge> angezeigt. Andernfalls wird automatisch
              <Badge color={C.red}>Neu zu drehen</Badge> gesetzt.<br /><br />
              Bei einem Staffelwechsel kann das Archiv der vorherigen Staffel importiert werden
              (Drehbuchkoordination → Stockshot-Archiv).
            </div>
          </div>
        </TypeCard>
      </Section>

      {/* ── 4. Flashback ── */}
      <Section title="4. Flashback / Rueckblende">
        <TypeCard icon="⏪" title="Flashback" color={C.purple} subtitle="Rueckblende auf eine fruehere Szene mit Referenz-Verknuepfung">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Eine Flashback-Szene verweist auf eine <strong>Ursprungsszene</strong> (über deren Szenen-Identität).
            So ist nachvollziehbar, auf welche Szene aus welcher Folge zurückgeblendet wird.
            Die Referenz ist klickbar und navigiert zur Ursprungsszene.
          </p>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Szenenkopf-Darstellung</div>
          <SceneHead color={C.purple} parts={[
            '12 · INT · LÜNEBURG KÜCHE · NACHT — FLASHBACK (→ Sz. 5, Folge 4398)',
          ]} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <InfoRow label="Referenz-Szene:" value="Verknuepfung ueber scene_identities (UUID)" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <InfoRow label="Nummerierung:" value="Regulaer durchgezaehlt (wie normale Szenen)" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <InfoRow label="Statistik:" value="Wird mitgezaehlt (ist eine vollwertige Szene)" />
          </div>
        </TypeCard>
      </Section>

      {/* ── 5. Stimmungswechsel-Propagierung ── */}
      <Section title="5. Stimmungswechsel-Propagierung">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Ein Stockshot mit Kategorie <strong>Stimmungswechsel</strong> aendert die Lichtstimmung
          für alle folgenden Szenen — innerhalb einer Episode und staffelübergreifend. Die neue
          Stimmung gilt, bis der nächste Stimmungswechsel kommt oder ein neuer dramaturgischer Tag beginnt.
        </p>

        {/* Visual: Timeline showing mood propagation */}
        <div style={{
          background: '#000',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 16,
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#fff',
          lineHeight: 2,
        }}>
          <div style={{ opacity: 0.5, marginBottom: 4 }}>Szenen-Reihenfolge →</div>
          <div>
            <span style={{ color: '#FFD60A' }}>☀ Sz.1 TAG</span>
            {'  →  '}
            <span style={{ color: '#FFD60A' }}>☀ Sz.2 TAG</span>
            {'  →  '}
            <span style={{ color: C.orange, fontWeight: 700 }}>📷 SS: Stimmungswechsel → NACHT</span>
            {'  →  '}
            <span style={{ color: '#5E5CE6' }}>☾ Sz.3 NACHT</span>
            {'  →  '}
            <span style={{ color: '#5E5CE6' }}>☾ Sz.4 NACHT</span>
          </div>
          <div style={{ marginTop: 8, color: C.orange, fontSize: 10 }}>
            ⚠ Wenn Sz.3 noch „TAG" als Tageszeit hat → Warnung in der Szenenleiste
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 12, padding: '12px 16px',
          background: C.orange + '0a', borderRadius: 8, border: `1px solid ${C.orange}22`,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            <strong>Inkonsistenz-Warnung:</strong> Wenn die Tageszeit einer Szene nicht zur aktuellen
            Stimmung passt (z.B. „TAG" nach einem Nacht-Stockshot), erscheint ein Warndreieck (⚠) in
            der Szenenleiste. Beim Umstellen auf eine Drehfassung werden alle Inkonsistenzen in einem
            Dialog aufgelistet.
          </div>
        </div>
      </Section>

      {/* ── 6. Terminologie ── */}
      <Section title="6. Terminologie-Konfiguration">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Die Begriffe fuer Sonderszenen-Typen sind produktionsweise konfigurierbar (Drehbuchkoordination → Terminologie).
        </p>
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          fontSize: 12,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 120px 120px',
            fontWeight: 700, fontSize: 11, padding: '8px 14px',
            background: C.surface, borderBottom: `1px solid ${C.border}`,
            color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <span>Key</span><span>Standard</span><span>Alternative</span>
          </div>
          {[
            { key: 'stockshot', std: 'Stockshot', alt: 'Archivshot' },
            { key: 'flashback', std: 'Flashback', alt: 'Rueckblende' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 120px 120px',
              padding: '8px 14px',
              borderBottom: i < 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ fontFamily: 'monospace', color: C.blue }}>{r.key}</span>
              <span>{r.std}</span>
              <span style={{ color: C.muted }}>{r.alt}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. Datenmodell-Übersicht ── */}
      <Section title="7. Datenmodell">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Die Sonderszenen-Erweiterung fuegt Spalten zur bestehenden <Badge color={C.blue}>dokument_szenen</Badge>-Tabelle
          hinzu und erstellt drei neue Tabellen.
        </p>

        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Erweiterte Spalten auf dokument_szenen</div>
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          fontSize: 12,
          marginBottom: 20,
        }}>
          {[
            { name: 'sondertyp', type: 'TEXT', desc: "NULL = normal. 'wechselschnitt' | 'stockshot' | 'flashback'" },
            { name: 'stockshot_kategorie', type: 'TEXT', desc: "'ortswechsel' | 'zeit_vergeht' | 'stimmungswechsel'" },
            { name: 'stockshot_stimmung', type: 'TEXT', desc: 'Freitext fuer Stimmungswechsel (z.B. NACHT)' },
            { name: 'stockshot_neu_drehen', type: 'BOOLEAN', desc: 'true = muss neu gefilmt werden (Default: false)' },
            { name: 'flashback_referenz_id', type: 'UUID', desc: 'FK → scene_identities.id (Ursprungsszene)' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '200px 70px 1fr',
              padding: '7px 14px',
              borderBottom: i < 4 ? `1px solid ${C.border}` : 'none',
              background: i % 2 === 0 ? C.surface : 'transparent',
            }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.name}</span>
              <Badge color={C.purple}>{f.type}</Badge>
              <span style={{ color: C.muted }}>{f.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Neue Tabellen (Migration v63)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { name: 'wechselschnitt_partner', color: C.blue, desc: 'N:M Partner-Verknuepfung fuer Wechselschnitte. dokument_szene_id + partner_identity_id + position.' },
            { name: 'stockshot_archiv', color: C.orange, desc: 'Staffelweises Archiv gefilmter Motiv+Lichtstimmung-Kombinationen. UNIQUE pro Staffel.' },
            { name: 'stockshot_templates', color: C.green, desc: 'Oneliner-Vorlagen pro Kategorie mit Platzhaltern ({motiv}, {stimmung}).' },
          ].map((t, i) => (
            <div key={i} style={{
              border: `2px solid ${t.color}`,
              borderRadius: 8,
              overflow: 'hidden',
              fontSize: 11,
            }}>
              <div style={{
                background: t.color,
                color: '#fff',
                fontWeight: 700,
                padding: '6px 10px',
                fontFamily: 'monospace',
                fontSize: 11,
              }}>
                {t.name}
              </div>
              <div style={{ padding: '8px 10px', color: C.muted, lineHeight: 1.5 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Vorlagen & OCR Tab ─────────────────────────────────────────────────────

export default SonderszenentTab
