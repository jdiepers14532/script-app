import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function RechtschreibungTab() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>Rechtschreibung & Grammatik</h1>
      <p style={{ color: C.muted, fontSize: 12, margin: '0 0 32px 0', lineHeight: 1.6 }}>
        Die Script-App bietet drei Stufen der Rechtschreibprüfung — von einfacher Browserunterstützung bis zu
        professioneller KI-gestützter Grammatikanalyse.
      </p>

      {/* ── Übersicht: 3 Modi ── */}
      <Section title="1. Drei Prüfmodi im Überblick">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Aus */}
          <div style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 20,
            background: C.surface,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 16,
              background: C.gray, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 10px', borderRadius: 10,
            }}>AUS</div>
            <div style={{ fontSize: 28, textAlign: 'center', margin: '8px 0 12px' }}>🚫</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>Keine Prüfung</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
              Keinerlei Markierungen im Text. Geeignet für reines Lesen, Formatierung oder wenn
              Browser-Spellcheck stört.
            </p>
          </div>
          {/* Browser */}
          <div style={{
            border: `1px solid ${C.blue}55`,
            borderRadius: 10,
            padding: 20,
            background: C.blue + '08',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 16,
              background: C.blue, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 10px', borderRadius: 10,
            }}>BROWSER</div>
            <div style={{ fontSize: 28, textAlign: 'center', margin: '8px 0 12px' }}>🔤</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>Browser-Spellcheck</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
              Nutzt die eingebaute Rechtschreibprüfung des Browsers (Chrome, Firefox, Edge).
              Erkennt Tippfehler mit <span style={{ borderBottom: '2px wavy #FF3B30', paddingBottom: 1 }}>roten Wellenlinien</span>.
              Keine Grammatikprüfung.
            </p>
          </div>
          {/* LanguageTool */}
          <div style={{
            border: `1px solid ${C.green}55`,
            borderRadius: 10,
            padding: 20,
            background: C.green + '08',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 16,
              background: C.green, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 10px', borderRadius: 10,
            }}>LANGUAGETOOL</div>
            <div style={{ fontSize: 28, textAlign: 'center', margin: '8px 0 12px' }}>✨</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>LanguageTool</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
              Server-seitige Prüfung mit LanguageTool. Erkennt Rechtschreib- <em>und</em> Grammatikfehler,
              Stilprobleme und Zeichensetzung. Markierungen direkt im Editor.
            </p>
          </div>
        </div>

        {/* Vergleichstabelle */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
          <thead>
            <tr>
              {['Funktion', 'Aus', 'Browser', 'LanguageTool', 'Grammarly'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '8px 10px', fontWeight: 700,
                  borderBottom: `2px solid ${C.border}`,
                  background: C.subtle,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { feat: 'Tippfehler erkennen',       aus: '—', browser: '✓', lt: '✓', gram: '✓' },
              { feat: 'Grammatikprüfung',           aus: '—', browser: '—', lt: '✓', gram: '✓✓' },
              { feat: 'Stilvorschläge',             aus: '—', browser: '—', lt: '✓', gram: '✓✓' },
              { feat: 'Zeichensetzung',             aus: '—', browser: '—', lt: '✓', gram: '✓✓' },
              { feat: 'Synonyme / Umformulierung',  aus: '—', browser: '—', lt: '—', gram: '✓✓' },
              { feat: 'KI-Textverbesserung',        aus: '—', browser: '—', lt: '—', gram: '✓✓' },
              { feat: 'Funktioniert offline',       aus: '✓', browser: '✓', lt: '—', gram: '—' },
              { feat: 'Datenschutz (lokal)',         aus: '✓', browser: '✓', lt: '✓ᴴ', gram: '—' },
              { feat: 'Kosten',                     aus: 'Frei', browser: 'Frei', lt: 'Frei', gram: 'Freemium' },
            ].map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : C.subtle }}>
                <td style={{ padding: '6px 10px', fontWeight: 500 }}>{r.feat}</td>
                <td style={{ padding: '6px 10px', color: r.aus === '—' ? C.gray : C.green, textAlign: 'center' }}>{r.aus}</td>
                <td style={{ padding: '6px 10px', color: r.browser === '—' ? C.gray : C.green, textAlign: 'center' }}>{r.browser}</td>
                <td style={{ padding: '6px 10px', color: r.lt === '—' ? C.gray : C.green, textAlign: 'center' }}>{r.lt}</td>
                <td style={{ padding: '6px 10px', color: r.gram === '—' ? C.gray : C.green, textAlign: 'center', fontWeight: r.gram === '✓✓' ? 700 : 400 }}>{r.gram}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>
          ✓ᴴ = LanguageTool läuft auf unserem eigenen Server — Texte verlassen nicht die Firma.
        </p>
      </Section>

      {/* ── Modus aktivieren ── */}
      <Section title="2. Rechtschreibprüfung aktivieren">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: '0 0 20px' }}>
          Die Rechtschreibprüfung wird über das <strong>Ansichtsmenü</strong> gesteuert.
        </p>
        {/* Step-by-step visual */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            {
              step: '1',
              title: 'Ansichtsmenü öffnen',
              desc: 'Klicke auf das Augen-Symbol (👁) in der oberen Leiste.',
              visual: (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#000', color: '#fff', padding: '8px 16px', borderRadius: 8,
                  fontSize: 13,
                }}>
                  <span style={{ fontSize: 18 }}>👁</span>
                  <span style={{ fontWeight: 600 }}>Ansicht</span>
                </div>
              ),
            },
            {
              step: '2',
              title: 'Rechtschreibprüfung finden',
              desc: 'Scrolle zum Abschnitt „Rechtschreibpruefung" im Ansichtsmenü.',
              visual: (
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '12px 16px', display: 'inline-block',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: C.muted }}>Rechtschreibpruefung</div>
                  <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                    {['Aus', 'Browser', 'LanguageTool'].map((label, i) => (
                      <button key={label} style={{
                        padding: '6px 14px', fontSize: 11, fontWeight: i === 2 ? 700 : 400,
                        border: 'none', borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                        background: i === 2 ? C.green + '20' : 'transparent',
                        color: i === 2 ? C.green : C.muted,
                        cursor: 'default',
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
              ),
            },
            {
              step: '3',
              title: 'Modus auswählen',
              desc: 'Wähle „LanguageTool" für die beste Erkennung. Die Prüfung startet automatisch nach 2 Sekunden Tipp-Pause.',
              visual: null,
            },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: C.blue,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>{s.step}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                <p style={{ fontSize: 11, color: C.muted, margin: '0 0 8px', lineHeight: 1.5 }}>{s.desc}</p>
                {s.visual}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── LanguageTool Markierungen ── */}
      <Section title="3. Fehler-Markierungen verstehen">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: '0 0 20px' }}>
          LanguageTool markiert Fehler direkt im Text mit farbigen Wellenlinien.
          Ein Klick auf eine Markierung öffnet das Korrektur-Popup.
        </p>
        <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
          {/* Rechtschreibfehler */}
          <div style={{
            flex: 1, border: `1px solid ${C.red}44`, borderRadius: 10,
            padding: 20, background: C.red + '06',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.red }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Rechtschreibfehler</span>
            </div>
            <div style={{
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '16px 20px', fontFamily: "'Courier Prime', Courier, monospace", fontSize: 14,
              lineHeight: 1.8,
            }}>
              Anna geht in die{' '}
              <span style={{
                textDecoration: 'underline wavy #FF3B30',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>Küche</span>{' '}
              und setzt sich an den{' '}
              <span style={{
                textDecoration: 'underline wavy #FF3B30',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>Tich</span>.
            </div>
            <p style={{ fontSize: 10, color: C.red, margin: '8px 0 0', fontWeight: 600 }}>
              Rote Wellenlinie = Wort nicht im Wörterbuch
            </p>
          </div>
          {/* Grammatikfehler */}
          <div style={{
            flex: 1, border: `1px solid ${C.orange}44`, borderRadius: 10,
            padding: 20, background: C.orange + '06',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.orange }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Grammatik / Stil</span>
            </div>
            <div style={{
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '16px 20px', fontFamily: "'Courier Prime', Courier, monospace", fontSize: 14,
              lineHeight: 1.8,
            }}>
              Peter{' '}
              <span style={{
                textDecoration: 'underline wavy #FFCC00',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>gehen</span>{' '}
              nach Hause und{' '}
              <span style={{
                textDecoration: 'underline wavy #FFCC00',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>trinken</span>{' '}
              Kaffee.
            </div>
            <p style={{ fontSize: 10, color: C.orange, margin: '8px 0 0', fontWeight: 600 }}>
              Gelbe Wellenlinie = Grammatik, Stil oder Zeichensetzung
            </p>
          </div>
        </div>

        {/* Korrektur-Popup */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Korrektur-Popup</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '14px 18px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              maxWidth: 300, fontSize: 12, lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: C.text }}>
                Möglicher Tippfehler gefunden.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Tisch', 'Tief', 'Tick'].map(r => (
                  <span key={r} style={{
                    padding: '4px 12px', borderRadius: 6,
                    background: C.green + '18', color: C.green,
                    fontWeight: 600, fontSize: 11, cursor: 'pointer',
                    border: `1px solid ${C.green}33`,
                  }}>{r}</span>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                <strong>Klick auf eine Markierung</strong> öffnet das Popup mit Korrekturvorschlägen.
                Ein Klick auf einen Vorschlag ersetzt das markierte Wort sofort im Text.
              </p>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: '8px 0 0' }}>
                Die Prüfung läuft automatisch: Nach jeder Tipp-Pause von 2 Sekunden wird der
                aktuelle Szenen-Text geprüft und die Markierungen aktualisiert.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Grammarly ── */}
      <Section title="4. Grammarly — Erweiterte Prüfung (empfohlen)">
        <div style={{
          border: `2px solid ${C.purple}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 24,
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${C.purple}, #7C3AED)`,
            padding: '20px 24px',
            color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>G</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Grammarly Browser-Extension</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  KI-gestützte Grammatik-, Stil- und Tonanalyse — funktioniert in jedem Textfeld
                </div>
              </div>
            </div>
          </div>

          {/* Vorteile */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Vorteile gegenüber LanguageTool</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { icon: '🎯', title: 'Bessere Erkennung', desc: 'KI-Modell erkennt mehr Fehler und versteht Kontext besser' },
                { icon: '💡', title: 'Umformulierungen', desc: 'Schlägt alternative Formulierungen und Synonyme vor' },
                { icon: '🎭', title: 'Ton-Analyse', desc: 'Erkennt ob der Text formell, freundlich oder sachlich klingt' },
                { icon: '📊', title: 'Lesbarkeit', desc: 'Zeigt Lesbarkeits-Score und schlägt Vereinfachungen vor' },
              ].map(v => (
                <div key={v.title} style={{
                  display: 'flex', gap: 10, padding: '10px 12px',
                  background: C.subtle, borderRadius: 8,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{v.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{v.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{v.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Installations-Anleitung */}
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16 }}>Installation in 4 Schritten</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Step 1 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>1</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Grammarly herunterladen</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Öffne den Extension-Store deines Browsers und installiere die Grammarly-Erweiterung:
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { name: 'Chrome', url: 'https://chromewebstore.google.com/detail/grammarly-ai-writing-and/kbfnbcaeplbcioakkpcpgfkobkghlhen', color: '#4285F4' },
                  { name: 'Firefox', url: 'https://addons.mozilla.org/de/firefox/addon/grammarly-1/', color: '#FF7139' },
                  { name: 'Edge', url: 'https://microsoftedge.microsoft.com/addons/detail/grammarly-ai-writing-and/cnlefmmeadmemmdciolhbnfeacpdfbkd', color: '#0078D7' },
                  { name: 'Safari', url: 'https://apps.apple.com/app/grammarly-for-safari/id1462114288', color: '#007AFF' },
                ].map(b => (
                  <a
                    key={b.name}
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8,
                      background: b.color + '15', color: b.color,
                      fontSize: 11, fontWeight: 600, textDecoration: 'none',
                      border: `1px solid ${b.color}33`,
                      transition: 'background 0.15s',
                    }}
                  >
                    ↗ {b.name} Web Store
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>2</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Extension installieren</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Klicke auf <strong>„Hinzufügen"</strong> bzw. <strong>„Add to Browser"</strong>.
                Nach der Installation erscheint das Grammarly-Icon (grüner Kreis) in der Browser-Toolbar.
              </p>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#f0f0f0', padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#00C853',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#fff', fontWeight: 700,
                }}>G</div>
                <span style={{ fontSize: 11, color: C.muted }}>← Grammarly-Icon in der Toolbar</span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>3</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Konto erstellen (kostenlos)</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Beim ersten Öffnen wirst du aufgefordert, ein Grammarly-Konto zu erstellen.
                Die <strong>kostenlose Version</strong> reicht für Rechtschreibung und grundlegende Grammatik.
                Premium (ca. 12€/Monat) bietet erweiterte Stilprüfung und Umformulierungen.
              </p>
              <div style={{
                display: 'flex', gap: 12,
                background: C.subtle, borderRadius: 8, padding: '12px 16px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 4 }}>Free</div>
                  <ul style={{ fontSize: 10, color: C.muted, margin: 0, paddingLeft: 14, lineHeight: 1.6 }}>
                    <li>Rechtschreibung</li>
                    <li>Basis-Grammatik</li>
                    <li>Zeichensetzung</li>
                  </ul>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 4 }}>Premium</div>
                  <ul style={{ fontSize: 10, color: C.muted, margin: 0, paddingLeft: 14, lineHeight: 1.6 }}>
                    <li>Alles aus Free</li>
                    <li>Erweiterte Grammatik</li>
                    <li>Stil & Ton-Analyse</li>
                    <li>KI-Umformulierungen</li>
                    <li>Plagiatsprüfung</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>4</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>In der Script-App nutzen</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Grammarly funktioniert automatisch in jedem Textfeld — auch im Szenen-Editor der Script-App.
                Stelle dazu die Rechtschreibprüfung auf <strong>„Browser"</strong> oder <strong>„Aus"</strong>
                (LanguageTool und Grammarly gleichzeitig können verwirrend sein).
              </p>
              <div style={{
                background: C.orange + '12',
                border: `1px solid ${C.orange}33`,
                borderRadius: 8, padding: '10px 14px',
                fontSize: 11, color: C.text, lineHeight: 1.5,
              }}>
                <strong style={{ color: C.orange }}>Tipp:</strong> Wenn du Grammarly verwendest, stelle den
                Script-App Modus auf <strong>„Aus"</strong> oder <strong>„Browser"</strong>, um doppelte Markierungen
                zu vermeiden. Grammarly ersetzt dann effektiv die eingebaute Prüfung.
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Sprache einstellen ── */}
      <Section title="5. Sprache & Empfehlungen">
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{
            flex: 1, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 20, background: C.surface,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>LanguageTool</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              Die Standardsprache ist <strong>Deutsch (de-DE)</strong>.
              LanguageTool erkennt die Sprache auch automatisch.
              Die Prüfung läuft auf unserem eigenen Server — Texte werden <strong>nicht</strong> an
              externe Dienste gesendet.
            </p>
          </div>
          <div style={{
            flex: 1, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 20, background: C.surface,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Grammarly</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              Grammarly prüft standardmäßig Englisch. Für <strong>Deutsch</strong>: Klicke auf
              das Grammarly-Icon → Einstellungen → Sprache → <strong>Deutsch</strong> auswählen.
              Grammarly sendet Texte an seine Cloud-Server zur Analyse.
            </p>
          </div>
        </div>

        {/* Empfehlung */}
        <div style={{
          marginTop: 20,
          background: `linear-gradient(135deg, ${C.blue}10, ${C.green}10)`,
          border: `1px solid ${C.blue}33`,
          borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Unsere Empfehlung</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.blue, marginBottom: 4 }}>Für Drehbuch-Autoren</div>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
                <strong>Grammarly (Browser)</strong> — beste Erkennung, funktioniert mit dem Drehbuch-Editor-Format,
                kennt Dialog- und Regieanweisungs-Kontext.
              </p>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.green, marginBottom: 4 }}>Für Datenschutz</div>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
                <strong>LanguageTool</strong> — läuft auf unserem Server, keine Daten an Dritte.
                Gute Erkennung für Deutsch, etwas weniger Stil-Analyse als Grammarly.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

// ── Suchen & Ersetzen Tab ─────────────────────────────────────────────────────


export default RechtschreibungTab
