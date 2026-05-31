// WuenscheModal.tsx — Wünsche-Feature Modal mit Magic-Animationen
// Design: Gold/Weiß, Stars & Sparkles — kein Lila/Cinderella
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { injectMagicCSS, fireMagicConfetti, fireSparkles, MAGIC_COLORS, STAR_CLIP_PATH } from './MagicWandTheme';
import { useWuensche, WunschNotification } from './useWuensche';

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface WuenscheModalProps {
  isOpen: boolean;
  onClose: () => void;
  authApiBase: string;
  appKontext: string;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Hintergrund-Sterne ────────────────────────────────────────────────────────

function BackgroundStars() {
  const stars = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * 80,
    y: 10 + Math.random() * 80,
    size: 4 + Math.random() * 6,
    delay: Math.random() * 2,
    duration: 1.5 + Math.random() * 1.5,
  }));

  return (
    <>
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: s.x + '%',
          top: s.y + '%',
          width: s.size + 'px',
          height: s.size + 'px',
          background: MAGIC_COLORS.gold,
          clipPath: STAR_CLIP_PATH,
          animation: `magic-twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          opacity: 0.15,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  );
}

// ── Wunsch-Liste Item ─────────────────────────────────────────────────────────

interface WunschItemProps {
  wunsch: ReturnType<typeof useWuensche>['wuensche'][0];
  onVote: (id: string, add: boolean) => void;
  onDelete: (id: string) => void;
}

function WunschItem({ wunsch, onVote, onDelete }: WunschItemProps) {
  const [voteAnim, setVoteAnim] = useState(false);

  function handleVote() {
    setVoteAnim(true);
    setTimeout(() => setVoteAnim(false), 400);
    onVote(wunsch.id, !wunsch.hat_gevoted);
  }

  return (
    <div style={{
      padding: '12px 14px',
      borderBottom: '1px solid #F0F0F0',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      background: wunsch.ist_eigener ? '#FFFDF0' : '#fff',
    }}>
      {/* Vote */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
        <button
          onClick={wunsch.ist_eigener ? undefined : handleVote}
          disabled={!!wunsch.ist_eigener}
          title={wunsch.ist_eigener ? 'Eigener Wunsch' : wunsch.hat_gevoted ? 'Stimme entfernen' : 'Abstimmen'}
          style={{
            width: 32, height: 32,
            border: `2px solid ${wunsch.hat_gevoted ? MAGIC_COLORS.gold : '#E0E0E0'}`,
            borderRadius: 8,
            background: wunsch.hat_gevoted ? MAGIC_COLORS.goldLight : '#fff',
            cursor: wunsch.ist_eigener ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
            animation: voteAnim ? 'magic-sparkle 0.4s ease-out' : 'none',
            transition: 'border-color 0.15s, background 0.15s',
            opacity: wunsch.ist_eigener ? 0.4 : 1,
          }}>
          ★
        </button>
        <span style={{ fontSize: 11, fontWeight: 700, color: wunsch.hat_gevoted ? MAGIC_COLORS.goldDark : '#9E9E9E', marginTop: 2 }}>
          {wunsch.votes}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#111', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          {wunsch.titel}
          {wunsch.ist_eigener && (
            <span style={{ fontSize: 10, fontWeight: 600, color: MAGIC_COLORS.goldDark, background: MAGIC_COLORS.goldLight, borderRadius: 4, padding: '1px 5px' }}>
              Deiner
            </span>
          )}
          {wunsch.app_kontext && (
            <span style={{ fontSize: 10, color: '#9E9E9E', background: '#F5F5F5', borderRadius: 4, padding: '1px 5px' }}>
              {wunsch.app_kontext}
            </span>
          )}
        </div>
        {wunsch.beschreibung && (
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4, lineHeight: 1.4 }}>{wunsch.beschreibung}</div>
        )}
        <div style={{ fontSize: 11, color: '#BDBDBD' }}>{formatDate(wunsch.eingereicht_am)}</div>
      </div>

      {/* Löschen (nur eigene) */}
      {wunsch.ist_eigener && (
        <button onClick={() => onDelete(wunsch.id)} title="Wunsch zurückziehen"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#BDBDBD', padding: '2px 4px', fontSize: 16, lineHeight: 1 }}>
          ×
        </button>
      )}
    </div>
  );
}

// ── Einreichen-Formular ───────────────────────────────────────────────────────

interface EinreichenFormProps {
  onSubmit: (titel: string, beschreibung: string, kiGeprueft: boolean, vorschlagText?: string, angenommen?: boolean) => Promise<string>;
  kiSpruch?: string;
  bestaetigungsSpruch?: string;
  checkMistral: (t: string, b: string) => Promise<{ vorschlag: { titel: string; beschreibung: string } | null; fehler?: string }>;
}

function EinreichenForm({ onSubmit, kiSpruch, bestaetigungsSpruch, checkMistral }: EinreichenFormProps) {
  const [titel, setTitel] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [kiLoading, setKiLoading] = useState(false);
  const [kiSpruchText, setKiSpruchText] = useState('');
  const [vorschlag, setVorschlag] = useState<{ titel: string; beschreibung: string } | null>(null);
  const [vorschlagAngenommen, setVorschlagAngenommen] = useState<boolean | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [spruchIdx, setSpruchIdx] = useState(0);

  // KI-Check-Sprüche rotieren
  const kiSprueche = kiSpruch
    ? [kiSpruch]
    : ['Wünsche werden sofort erledigt, Wunder dauern etwas länger.'];
  useEffect(() => {
    if (!kiLoading) return;
    const iv = setInterval(() => setSpruchIdx(i => (i + 1) % kiSprueche.length), 3000);
    return () => clearInterval(iv);
  }, [kiLoading]);

  async function handleKiCheck() {
    if (!titel.trim()) return;
    setKiLoading(true);
    setVorschlag(null);
    setVorschlagAngenommen(null);
    try {
      const result = await checkMistral(titel, beschreibung);
      if (result.vorschlag) {
        setVorschlag(result.vorschlag);
      }
    } catch(e) {}
    setKiLoading(false);
  }

  function acceptVorschlag() {
    if (!vorschlag) return;
    setTitel(vorschlag.titel);
    setBeschreibung(vorschlag.beschreibung);
    setVorschlagAngenommen(true);
    setVorschlag(null);
  }

  async function handleSubmit() {
    if (!titel.trim()) return;
    setSubmitLoading(true);
    try {
      const spruch = await onSubmit(
        titel, beschreibung,
        vorschlag !== null || vorschlagAngenommen !== null,
        vorschlag ? JSON.stringify(vorschlag) : undefined,
        vorschlagAngenommen ?? undefined
      );
      setSuccess(bestaetigungsSpruch || spruch || 'Wunsch eingegangen!');
      setTitel('');
      setBeschreibung('');
      setVorschlag(null);
      setVorschlagAngenommen(null);
    } catch(e: unknown) {
      alert((e instanceof Error ? e.message : 'Fehler beim Einreichen'));
    }
    setSubmitLoading(false);
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', animation: 'magic-fade-in 0.35s ease-out' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✨</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 8 }}>{success}</div>
        <button onClick={() => setSuccess(null)}
          style={{ marginTop: 16, padding: '8px 20px', background: MAGIC_COLORS.gold, color: '#111', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
          Weiteren Wunsch eingeben
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', animation: 'magic-fade-in 0.35s ease-out' }}>
      {/* Hilfe-Hinweis */}
      <div style={{ padding: 10, background: '#FFFDF0', border: '1px solid ' + MAGIC_COLORS.gold + '55', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#666', lineHeight: 1.5 }}>
        <strong>Tipp:</strong> Beschreibe kurz das <em>Problem</em> und das <em>gewünschte Verhalten</em>.<br />
        Unser KI-Assistent hilft dir, den Wunsch klar zu formulieren.
      </div>

      <input
        value={titel}
        onChange={e => setTitel(e.target.value)}
        placeholder="Was wünschst du dir? (kurzer Titel)"
        maxLength={200}
        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E0E0E0', borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: 'border-box', outline: 'none' }}
      />
      <textarea
        value={beschreibung}
        onChange={e => setBeschreibung(e.target.value)}
        placeholder="Beschreibung (optional aber hilfreich): Welches Problem löst das? Was soll passieren?"
        rows={3}
        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E0E0E0', borderRadius: 8, fontSize: 13, resize: 'vertical', marginBottom: 12, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
      />

      {/* KI-Check */}
      {!vorschlag && !vorschlagAngenommen && (
        <button
          onClick={handleKiCheck}
          disabled={kiLoading || !titel.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: kiLoading ? '#F5F5F5' : '#111', color: kiLoading ? '#666' : '#fff', border: 'none', borderRadius: 8, cursor: kiLoading || !titel.trim() ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 12, opacity: !titel.trim() ? 0.5 : 1, transition: 'background 0.15s' }}>
          ✨ {kiLoading ? kiSprueche[spruchIdx] : 'Formulierung prüfen (KI)'}
        </button>
      )}

      {/* KI-Vorschlag */}
      {vorschlag && (
        <div style={{ padding: 12, background: '#FFFDF0', border: `1.5px solid ${MAGIC_COLORS.gold}`, borderRadius: 10, marginBottom: 12, animation: 'magic-fade-in 0.3s ease-out' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MAGIC_COLORS.goldDark, marginBottom: 8 }}>✨ KI-VORSCHLAG</div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{vorschlag.titel}</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.4 }}>{vorschlag.beschreibung}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={acceptVorschlag}
              style={{ padding: '5px 14px', background: MAGIC_COLORS.gold, color: '#111', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              Übernehmen
            </button>
            <button onClick={() => { setVorschlag(null); setVorschlagAngenommen(false); }}
              style={{ padding: '5px 14px', background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              Original behalten
            </button>
          </div>
        </div>
      )}

      {/* Absenden */}
      <button
        onClick={handleSubmit}
        disabled={submitLoading || !titel.trim()}
        style={{ width: '100%', padding: '10px 0', background: titel.trim() ? '#111' : '#E0E0E0', color: titel.trim() ? '#fff' : '#9E9E9E', border: 'none', borderRadius: 10, cursor: titel.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, transition: 'background 0.15s' }}>
        {submitLoading ? '...' : 'Wunsch absenden'}
      </button>
    </div>
  );
}

// ── Changelog-Ansicht ─────────────────────────────────────────────────────────

interface ChangelogProps {
  items: ReturnType<typeof useWuensche>['erfuellte'];
  count: number;
}

function Changelog({ items, count }: ChangelogProps) {
  return (
    <div style={{ padding: '0 0 8px' }}>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid #F0F0F0',
        display: 'flex', alignItems: 'center', gap: 8
      }}>
        <div style={{
          background: 'linear-gradient(135deg, ' + MAGIC_COLORS.gold + ', #FFA500)',
          borderRadius: 8, padding: '4px 10px', color: '#fff', fontWeight: 800, fontSize: 18,
          animation: count > 0 ? 'magic-counter-roll 0.4s ease-out' : 'none',
        }}>
          {count}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Wünsche erfüllt</div>
          <div style={{ fontSize: 11, color: '#9E9E9E' }}>Neueste zuerst</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9E9E9E', fontSize: 13 }}>
          Noch keine Wünsche erfüllt
        </div>
      ) : (
        items.map((w, i) => (
          <div key={w.id} style={{
            padding: '14px 20px', borderBottom: '1px solid #F8F8F8',
            animation: `magic-fade-in 0.3s ${i * 0.05}s ease-out both`
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: MAGIC_COLORS.gold, marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{w.titel}</div>
                {(w as any).ki_zusammenfassung && (
                  <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5, marginBottom: 4 }}>
                    {(w as any).ki_zusammenfassung}
                  </div>
                )}
                {(w as any).wo_zu_finden && (
                  <div style={{ fontSize: 11, color: MAGIC_COLORS.goldDark, fontWeight: 600 }}>
                    📍 {(w as any).wo_zu_finden}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#BDBDBD', marginTop: 4 }}>
                  Erfüllt {formatDate((w as any).erfuellt_am || w.eingereicht_am)}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Haupt-Modal ───────────────────────────────────────────────────────────────

export function WuenscheModal({ isOpen, onClose, authApiBase, appKontext }: WuenscheModalProps) {
  const [tab, setTab] = useState<'liste' | 'einreichen' | 'changelog'>('liste');
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const {
    wuensche, erfuellte, dialoge,
    loading, loadListe, loadErfuellte, loadDialoge,
    submitWunsch, vote, deleteWunsch, checkMistral
  } = useWuensche({ authApiBase, appKontext });

  useEffect(() => { injectMagicCSS(); }, []);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setClosing(false);
      loadListe();
      loadErfuellte();
      loadDialoge();
    }
  }, [isOpen]);

  function handleClose() {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, 200);
  }

  async function handleSubmit(
    titel: string, beschreibung: string, kiGeprueft: boolean, vorschlagText?: string, angenommen?: boolean
  ): Promise<string> {
    const result = await submitWunsch(titel, beschreibung, kiGeprueft, vorschlagText, angenommen);
    if (modalRef.current) fireSparkles(modalRef.current, 8);
    setTab('liste');
    return result.spruch || '';
  }

  if (!visible && !isOpen) return null;

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0,
        background: MAGIC_COLORS.overlayDark,
        zIndex: 9000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: closing ? 'magic-fade-out 0.2s ease-in forwards' : 'magic-fade-in 0.25s ease-out',
      }}>

      {/* Modal */}
      <div
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          animation: closing ? 'magic-fade-out 0.2s ease-in forwards' : 'magic-modal-in 0.4s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        }}>

        {/* Hintergrund-Sterne */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
          <BackgroundStars />
        </div>

        {/* Gold-Streifen oben */}
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, transparent, ${MAGIC_COLORS.gold}, ${MAGIC_COLORS.goldLight}, ${MAGIC_COLORS.gold}, transparent)`,
        }} />

        {/* Header */}
        <div style={{ padding: '16px 20px 0', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>✨</span>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#111' }}>Wünsche</span>
            </div>
            <button onClick={handleClose}
              style={{ width: 28, height: 28, borderRadius: '50%', background: '#F5F5F5', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
              ×
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, background: '#F5F5F5', borderRadius: 10, padding: 3 }}>
            {[
              ['liste', 'Alle Wünsche'],
              ['einreichen', '+ Wunsch'],
              ['changelog', `✓ ${erfuellte.length}`],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as 'liste' | 'einreichen' | 'changelog')}
                style={{ flex: 1, padding: '6px 0', background: tab === k ? '#fff' : 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: tab === k ? 700 : 400, color: tab === k ? '#111' : '#666', boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
          {tab === 'liste' && (
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9E9E9E' }}>Lädt...</div>
              ) : wuensche.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9E9E9E' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✨</div>
                  <div style={{ fontSize: 14 }}>Noch keine Wünsche — sei der Erste!</div>
                  <button onClick={() => setTab('einreichen')}
                    style={{ marginTop: 12, padding: '8px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    Wunsch einreichen
                  </button>
                </div>
              ) : (
                wuensche.map(w => (
                  <WunschItem key={w.id} wunsch={w}
                    onVote={vote}
                    onDelete={deleteWunsch} />
                ))
              )}
            </div>
          )}

          {tab === 'einreichen' && (
            <EinreichenForm
              onSubmit={handleSubmit}
              kiSpruch={dialoge?.aktuell?.ki_check}
              bestaetigungsSpruch={dialoge?.aktuell?.bestaetigung}
              checkMistral={checkMistral}
            />
          )}

          {tab === 'changelog' && (
            <Changelog items={erfuellte} count={erfuellte.length} />
          )}
        </div>

        {/* Footer */}
        {dialoge?.aktuell?.saison && (
          <div style={{ padding: '8px 20px', borderTop: '1px solid #F0F0F0', fontSize: 11, color: '#BDBDBD', fontStyle: 'italic', textAlign: 'center', position: 'relative', zIndex: 1 }}>
            {dialoge.aktuell.saison}
          </div>
        )}
      </div>
    </div>
  );
}
