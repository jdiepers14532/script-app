// WuenscheModal.tsx — Wünsche-Feature Modal mit Magic-Animationen
// Design: Gold/Weiß, Stars & Sparkles — kein Lila/Cinderella
import React, { useState, useEffect, useRef } from 'react';
import { injectMagicCSS, fireMagicConfetti, fireSparkles, MAGIC_COLORS, STAR_CLIP_PATH } from './MagicWandTheme';
import { useWuensche } from './useWuensche';

export interface WuenscheModalProps {
  isOpen: boolean;
  onClose: () => void;
  authApiBase: string;
  appKontext: string;
}

// ── Geräte-Erkennung ──────────────────────────────────────────────────────────

function useIsBottomSheet() {
  const [bottom, setBottom] = useState(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640)
  );
  useEffect(() => {
    const onResize = () => setBottom(
      window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640
    );
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return bottom;
}

// ── Datum-Format ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Hintergrund-Magie ─────────────────────────────────────────────────────────

function MagicBackground() {
  const stars = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: 3 + (i * 7.1) % 94,
    y: 5 + (i * 13.7) % 88,
    size: 3 + (i % 3) * 2.5,
    delay: (i * 0.31) % 2.8,
    duration: 1.4 + (i % 4) * 0.4,
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
        width: 420, height: 220,
        background: `radial-gradient(ellipse, ${MAGIC_COLORS.glowGold} 0%, transparent 68%)`,
      }} />
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: s.x + '%', top: s.y + '%',
          width: s.size + 'px', height: s.size + 'px',
          background: MAGIC_COLORS.gold,
          clipPath: STAR_CLIP_PATH,
          animation: `magic-twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          opacity: 0.12,
        }} />
      ))}
      <div style={{
        position: 'absolute', top: '18%', left: 0,
        width: 120, height: 1.5,
        background: `linear-gradient(90deg, transparent, ${MAGIC_COLORS.gold}88, transparent)`,
        animation: 'magic-shooting-star 4s 1.2s ease-in-out infinite',
        opacity: 0, borderRadius: 2,
      }} />
      <div style={{
        position: 'absolute', top: '55%', left: 0,
        width: 80, height: 1.5,
        background: `linear-gradient(90deg, transparent, ${MAGIC_COLORS.gold}66, transparent)`,
        animation: 'magic-shooting-star 4s 3.5s ease-in-out infinite',
        opacity: 0, borderRadius: 2,
      }} />
    </div>
  );
}

// ── Mini-Toast ────────────────────────────────────────────────────────────────

function MiniToast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(30,30,30,0.92)', color: '#fff',
      padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 500,
      whiteSpace: 'nowrap', zIndex: 10,
      animation: 'magic-fade-in 0.2s ease-out',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    }}>
      {text}
    </div>
  );
}

// ── SW-UI Tooltip (kanonisch: #111, fixed position, 11px) ────────────────────

function SWTooltip({ text, children, placement = 'bottom' }: { text: string; children: React.ReactElement; placement?: 'top' | 'bottom' }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span style={{
          position: 'absolute',
          ...(placement === 'bottom'
            ? { top: '100%', transform: 'translate(-50%, 8px)' }
            : { bottom: '100%', transform: 'translate(-50%, -8px)' }),
          left: '50%',
          background: '#111', color: '#fff', fontSize: 11, lineHeight: 1.5,
          padding: '6px 10px', borderRadius: 6, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 99999, pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ── Wunsch-Liste Item ─────────────────────────────────────────────────────────

interface WunschItemProps {
  wunsch: ReturnType<typeof useWuensche>['wuensche'][0];
  isTouch: boolean;
  voteDankeSpruch?: string;
  voteRueckzugSpruch?: string;
  wunschGeloeschtSpruch?: string;
  onVote: (id: string, add: boolean) => void;
  onDelete: (id: string) => void;
  onToast: (text: string) => void;
}

function WunschItem({ wunsch, isTouch, voteDankeSpruch, voteRueckzugSpruch, wunschGeloeschtSpruch, onVote, onDelete, onToast }: WunschItemProps) {
  const [voteAnim, setVoteAnim] = useState(false);
  const starSize = isTouch ? 20 : 17;

  function handleVote() {
    if (wunsch.ist_eigener) return;
    setVoteAnim(true);
    setTimeout(() => setVoteAnim(false), 400);
    onVote(wunsch.id, !wunsch.hat_gevoted);
    onToast(wunsch.hat_gevoted
      ? (voteRueckzugSpruch || 'Stimme zurückgezogen.')
      : (voteDankeSpruch || 'Stimme gezählt! ✨'));
  }

  function handleDelete() {
    onDelete(wunsch.id);
    onToast(wunschGeloeschtSpruch || 'Wunsch wurde zurückgezogen.');
  }

  return (
    <div style={{
      padding: isTouch ? '12px 16px' : '10px 16px',
      borderBottom: '1px solid #F0F0F0',
      background: wunsch.ist_eigener ? '#FFFDF0' : '#fff',
    }}>
      {/* Kopfzeile: Vote (oben links) | Titel | Delete (oben rechts) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>

        {/* Vote-Button: oben links */}
        <SWTooltip text={wunsch.ist_eigener ? 'Eigener Wunsch' : wunsch.hat_gevoted ? 'Stimme entfernen' : 'Abstimmen'} placement="bottom">
          <button
            onClick={handleVote}
            disabled={!!wunsch.ist_eigener}
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
              border: 'none', background: 'none', padding: isTouch ? '4px 6px' : '2px 4px',
              cursor: wunsch.ist_eigener ? 'default' : 'pointer',
              opacity: wunsch.ist_eigener ? 0.35 : 1,
              minWidth: isTouch ? 44 : undefined, minHeight: isTouch ? 36 : undefined,
            }}>
            <div style={{
              width: starSize, height: starSize,
              background: wunsch.hat_gevoted
                ? `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`
                : '#E0E0E0',
              clipPath: STAR_CLIP_PATH,
              animation: voteAnim ? 'magic-sparkle 0.4s ease-out' : 'none',
              transition: 'background 0.2s',
              boxShadow: wunsch.hat_gevoted ? `0 0 6px ${MAGIC_COLORS.glowGold}` : 'none',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 12, fontWeight: 700, lineHeight: 1,
              color: wunsch.hat_gevoted ? MAGIC_COLORS.goldDark : '#BDBDBD',
              animation: voteAnim ? 'magic-counter-roll 0.3s ease-out' : 'none',
            }}>
              {wunsch.votes}
            </span>
          </button>
        </SWTooltip>

        {/* Titel (Mitte) */}
        <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: '#111', lineHeight: 1.4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
          {wunsch.titel}
          {wunsch.ist_eigener && (
            <span style={{ fontSize: 10, fontWeight: 700, color: MAGIC_COLORS.goldDark, background: MAGIC_COLORS.goldLight, borderRadius: 4, padding: '1px 6px' }}>
              Deiner
            </span>
          )}
          {wunsch.app_kontext && (
            <span style={{ fontSize: 10, color: '#9E9E9E', background: '#F5F5F5', borderRadius: 4, padding: '1px 5px' }}>
              {wunsch.app_kontext}
            </span>
          )}
        </div>

        {/* Delete-Button: oben rechts */}
        {wunsch.ist_eigener && (
          <SWTooltip text="Wunsch zurückziehen" placement="bottom">
            <button onClick={handleDelete}
              style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', color: '#BDBDBD', padding: isTouch ? '4px 6px' : '2px 4px', fontSize: 18, lineHeight: 1, minWidth: isTouch ? 36 : 24, minHeight: isTouch ? 36 : 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ×
            </button>
          </SWTooltip>
        )}
      </div>

      {/* Beschreibung + Datum */}
      {wunsch.beschreibung && (
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5, marginBottom: 3, paddingLeft: 2 }}>{wunsch.beschreibung}</div>
      )}
      <div style={{ fontSize: 11, color: '#C8C8C8', paddingLeft: 2 }}>{formatDate(wunsch.eingereicht_am)}</div>
    </div>
  );
}

// ── Einreichen-Formular ───────────────────────────────────────────────────────

interface EinreichenFormProps {
  onSubmit: (titel: string, beschreibung: string, geprueft: boolean, vorschlagText?: string, angenommen?: boolean) => Promise<string>;
  ladeSpruch?: string;
  bestaetigungsSpruch?: string;
  tippText?: string;
  checkMistral: (t: string, b: string) => Promise<{ vorschlag: { titel: string; beschreibung: string } | null; fehler?: string }>;
  isTouch: boolean;
  storageKey?: string;
}

function EinreichenForm({ onSubmit, ladeSpruch, bestaetigungsSpruch, tippText, checkMistral, isTouch, storageKey }: EinreichenFormProps) {
  const [titel, setTitel] = useState(() => {
    if (!storageKey) return '';
    try { return localStorage.getItem(`${storageKey}-titel`) || ''; } catch { return ''; }
  });
  const [beschreibung, setBeschreibung] = useState(() => {
    if (!storageKey) return '';
    try { return localStorage.getItem(`${storageKey}-beschreibung`) || ''; } catch { return ''; }
  });
  const [titelFocused, setTitelFocused] = useState(false);
  const [pruefLoading, setPruefLoading] = useState(false);
  const [vorschlag, setVorschlag] = useState<{ titel: string; beschreibung: string } | null>(null);
  const [vorschlagAngenommen, setVorschlagAngenommen] = useState<boolean | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [spruchIdx, setSpruchIdx] = useState(0);
  const successRef = useRef<HTMLDivElement>(null);

  const ladesprueche = ladeSpruch
    ? [ladeSpruch]
    : ['Wünsche werden sofort erledigt, Wunder dauern etwas länger.'];

  useEffect(() => {
    if (!pruefLoading) return;
    const iv = setInterval(() => setSpruchIdx(i => (i + 1) % ladesprueche.length), 3000);
    return () => clearInterval(iv);
  }, [pruefLoading]);

  useEffect(() => {
    if (!storageKey) return;
    const t = setTimeout(() => {
      try {
        if (titel) localStorage.setItem(`${storageKey}-titel`, titel);
        else localStorage.removeItem(`${storageKey}-titel`);
        if (beschreibung) localStorage.setItem(`${storageKey}-beschreibung`, beschreibung);
        else localStorage.removeItem(`${storageKey}-beschreibung`);
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [titel, beschreibung, storageKey]);

  async function handlePruefen() {
    if (!titel.trim()) return;
    setPruefLoading(true);
    setVorschlag(null);
    setVorschlagAngenommen(null);
    try {
      const result = await checkMistral(titel, beschreibung);
      if (result.vorschlag) setVorschlag(result.vorschlag);
    } catch(e) {}
    setPruefLoading(false);
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
      if (storageKey) {
        try {
          localStorage.removeItem(`${storageKey}-titel`);
          localStorage.removeItem(`${storageKey}-beschreibung`);
        } catch {}
      }
      setVorschlag(null);
      setVorschlagAngenommen(null);
      if (successRef.current) fireMagicConfetti(successRef.current);
    } catch(e: unknown) {
      alert(e instanceof Error ? e.message : 'Fehler beim Einreichen');
    }
    setSubmitLoading(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 13px',
    border: '1.5px solid #E0E0E0', borderRadius: 10,
    fontSize: 14, boxSizing: 'border-box', outline: 'none',
    fontFamily: 'inherit', background: '#fff', color: '#111',
    transition: 'border-color 0.15s',
  };

  if (success) {
    return (
      <div ref={successRef} style={{ textAlign: 'center', padding: '48px 24px', position: 'relative', overflow: 'hidden', animation: 'magic-fade-in 0.35s ease-out' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 6 }}>{success}</div>
        <button onClick={() => setSuccess(null)}
          style={{ marginTop: 20, padding: '10px 24px', background: `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`, color: '#111', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, animation: 'magic-glow-pulse 2s ease-in-out infinite' }}>
          Weiteren Wunsch eingeben
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 20px 20px', animation: 'magic-fade-in 0.3s ease-out' }}>
      <textarea
        value={titel}
        onChange={e => setTitel(e.target.value)}
        placeholder={titelFocused ? '' : 'Hier eingeben, was Du dir für diese App wünscht. Je konkreter Du es beschreibst, desto schneller können die Elfen es umsetzen.'}
        maxLength={200}
        rows={2}
        style={{ ...inputStyle, marginBottom: 10, resize: 'none' }}
        onFocus={e => { setTitelFocused(true); e.target.style.borderColor = MAGIC_COLORS.gold; }}
        onBlur={e => { setTitelFocused(false); e.target.style.borderColor = '#E0E0E0'; }}
      />
      <textarea
        value={beschreibung}
        onChange={e => setBeschreibung(e.target.value)}
        placeholder="Beschreibung: Welches Problem löst das? Was soll passieren?"
        rows={isTouch ? 8 : 6}
        style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }}
        onFocus={e => (e.target.style.borderColor = MAGIC_COLORS.gold)}
        onBlur={e => (e.target.style.borderColor = '#E0E0E0')}
      />

      {/* Vorschlag */}
      {vorschlag && (
        <div style={{ padding: '14px 16px', background: '#FFFDF0', border: `1.5px solid ${MAGIC_COLORS.gold}`, borderRadius: 12, marginBottom: 14, animation: 'magic-fade-in 0.3s ease-out' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: MAGIC_COLORS.goldDark, marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            ✨ Verbesserungsvorschlag
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 5, color: '#111' }}>{vorschlag.titel}</div>
          <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>{vorschlag.beschreibung}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={acceptVorschlag}
              style={{ padding: isTouch ? '10px 18px' : '6px 16px', background: `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`, color: '#111', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Übernehmen
            </button>
            <button onClick={() => { setVorschlag(null); setVorschlagAngenommen(false); }}
              style={{ padding: isTouch ? '10px 18px' : '6px 16px', background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              Original behalten
            </button>
          </div>
        </div>
      )}

      {/* Ladespruch */}
      {pruefLoading && (
        <div style={{ marginBottom: 10, fontSize: 13, color: MAGIC_COLORS.goldDark, fontStyle: 'italic', lineHeight: 1.5, animation: 'magic-fade-in 0.3s ease-out' }}>
          {ladesprueche[spruchIdx]}
        </div>
      )}

      {/* Buttons: Formulierung verbessern + Absenden in einer Zeile */}
      <div style={{ display: 'flex', gap: 10 }}>
        {!vorschlag && !vorschlagAngenommen && (
          <button
            onClick={handlePruefen}
            disabled={pruefLoading || !titel.trim()}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: isTouch ? '13px 10px' : '11px 10px',
              background: pruefLoading ? MAGIC_COLORS.goldLight : `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`,
              color: '#111', border: 'none', borderRadius: 12,
              cursor: pruefLoading || !titel.trim() ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700,
              opacity: !titel.trim() ? 0.45 : 1,
              transition: 'opacity 0.15s',
              whiteSpace: 'nowrap',
            }}>
            <span style={{ fontSize: 15 }}>✨</span>
            {pruefLoading ? 'Einen Moment…' : 'Formulierung verbessern'}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitLoading || !titel.trim()}
          style={{
            flex: 1,
            padding: isTouch ? '13px 10px' : '11px 10px',
            background: titel.trim() ? '#111' : '#E0E0E0',
            color: titel.trim() ? '#fff' : '#9E9E9E',
            border: 'none', borderRadius: 12,
            cursor: titel.trim() ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 700,
            transition: 'background 0.2s',
            whiteSpace: 'nowrap',
          }}>
          {submitLoading ? '✨ Wird eingereicht…' : 'Wunsch absenden'}
        </button>
      </div>
    </div>
  );
}

// ── Changelog-Ansicht ─────────────────────────────────────────────────────────

function Changelog({ items, count, leerSpruch }: { items: ReturnType<typeof useWuensche>['erfuellte']; count: number; leerSpruch?: string }) {
  return (
    <div style={{ paddingBottom: 8 }}>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9E9E9E', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
          {leerSpruch || 'Noch keine Wünsche erfüllt'}
        </div>
      ) : items.map((w, i) => (
        <div key={w.id} style={{
          padding: '15px 20px', borderBottom: '1px solid #F5F5F5',
          animation: `magic-fade-in 0.3s ${i * 0.05}s ease-out both`
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 9, height: 9, borderRadius: '50%',
              background: `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`,
              marginTop: 5, flexShrink: 0,
              boxShadow: `0 0 6px ${MAGIC_COLORS.glowGold}`,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: '#111' }}>{w.titel}</div>
              {(w as any).ki_zusammenfassung && (
                <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6, marginBottom: 5 }}>{(w as any).ki_zusammenfassung}</div>
              )}
              {(w as any).wo_zu_finden && (
                <div style={{ fontSize: 12, color: MAGIC_COLORS.goldDark, fontWeight: 600 }}>📍 {(w as any).wo_zu_finden}</div>
              )}
              <div style={{ fontSize: 11, color: '#C8C8C8', marginTop: 4 }}>
                Erfüllt {formatDate((w as any).erfuellt_am || w.eingereicht_am)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Haupt-Modal ───────────────────────────────────────────────────────────────

export function WuenscheModal({ isOpen, onClose, authApiBase, appKontext }: WuenscheModalProps) {
  const [tab, setTab] = useState<'liste' | 'einreichen' | 'changelog'>('einreichen');
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const isBottomSheet = useIsBottomSheet();

  const {
    wuensche, erfuellte, dialoge, loading,
    loadListe, loadErfuellte, loadDialoge,
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
    setTimeout(() => { setVisible(false); setClosing(false); onClose(); }, 220);
  }

  function showToast(text: string) {
    setToast(text);
  }

  async function handleSubmit(
    titel: string, beschreibung: string, geprueft: boolean, vorschlagText?: string, angenommen?: boolean
  ): Promise<string> {
    const result = await submitWunsch(titel, beschreibung, geprueft, vorschlagText, angenommen);
    if (modalRef.current) fireSparkles(modalRef.current, 10);
    setTab('liste');
    return result.spruch || '';
  }

  if (!visible && !isOpen) return null;

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 9000,
        display: 'flex',
        alignItems: isBottomSheet ? 'flex-end' : 'center',
        justifyContent: 'center',
        animation: closing ? 'magic-fade-out 0.22s ease-in forwards' : 'magic-fade-in 0.25s ease-out',
        padding: isBottomSheet ? 0 : 16,
      }}>

      {/* Modal-Box */}
      <div
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isBottomSheet ? '100%' : 640,
          maxHeight: isBottomSheet ? '90vh' : '84vh',
          background: '#fff',
          borderRadius: isBottomSheet ? '22px 22px 0 0' : 20,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          animation: closing
            ? 'magic-fade-out 0.22s ease-in forwards'
            : 'magic-modal-in 0.42s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: isBottomSheet
            ? '0 -12px 60px rgba(0,0,0,0.35)'
            : `0 24px 80px rgba(0,0,0,0.35), 0 0 0 1px ${MAGIC_COLORS.gold}22`,
        }}>

        {/* Hintergrund-Magie */}
        <MagicBackground />

        {/* Gold-Streifen oben */}
        <div style={{
          height: 4, flexShrink: 0, position: 'relative', zIndex: 1,
          background: `linear-gradient(90deg, transparent, ${MAGIC_COLORS.gold}, ${MAGIC_COLORS.goldLight}, ${MAGIC_COLORS.gold}, transparent)`,
          animation: 'magic-glow-pulse 3s ease-in-out infinite',
        }} />

        {/* Header */}
        <div style={{ padding: '18px 22px 0', position: 'relative', zIndex: 1, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dialoge?.aktuell?.modal_willkommen ? 8 : 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26 }}>✨</span>
              <span style={{ fontWeight: 800, fontSize: 19, color: '#111' }}>
                Schon <strong style={{ fontWeight: 900, color: MAGIC_COLORS.goldDark }}>{erfuellte.length}</strong> Wünsche wurden erfüllt!
              </span>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.07)', border: 'none',
                cursor: 'pointer', fontSize: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
              }}>
              ×
            </button>
          </div>

          {/* Willkommens-Spruch */}
          {dialoge?.aktuell?.modal_willkommen && (
            <div style={{ fontSize: 13, color: MAGIC_COLORS.goldDark, fontStyle: 'italic', marginBottom: 14, paddingLeft: 2 }}>
              {dialoge.aktuell.modal_willkommen}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 4 }}>
            {([
              ['einreichen', 'ich wünsche mir….'],
              ['changelog', 'Erfüllte'],
              ['liste', 'noch bei den Elfen'],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{
                  flex: 1, padding: '7px 0',
                  background: tab === k ? '#fff' : 'transparent',
                  border: 'none', borderRadius: 9,
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: tab === k ? 700 : 400,
                  color: tab === k ? '#111' : '#888',
                  boxShadow: tab === k ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.15s',
                  minHeight: 36,
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
          {tab === 'liste' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9E9E9E', fontSize: 14 }}>Lädt…</div>
            ) : wuensche.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '52px 24px', color: '#9E9E9E' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>✨</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
                  {dialoge?.aktuell?.liste_leer || 'Noch keine Wünsche — sei der Erste!'}
                </div>
                <button onClick={() => setTab('einreichen')}
                  style={{ padding: '10px 22px', background: `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`, color: '#111', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, animation: 'magic-glow-pulse 2s ease-in-out infinite' }}>
                  ✨ ich wünsche mir….
                </button>
              </div>
            ) : (
              wuensche.map(w => (
                <WunschItem key={w.id} wunsch={w} isTouch={isBottomSheet}
                  voteDankeSpruch={dialoge?.aktuell?.vote_danke}
                  voteRueckzugSpruch={dialoge?.aktuell?.vote_rueckzug}
                  wunschGeloeschtSpruch={dialoge?.aktuell?.wunsch_geloescht}
                  onVote={vote} onDelete={deleteWunsch} onToast={showToast} />
              ))
            )
          )}

          {tab === 'einreichen' && (
            <EinreichenForm
              onSubmit={handleSubmit}
              ladeSpruch={dialoge?.aktuell?.ki_check}
              bestaetigungsSpruch={dialoge?.aktuell?.bestaetigung}
              tippText={dialoge?.aktuell?.einreichen_tipp}
              checkMistral={checkMistral}
              isTouch={isBottomSheet}
              storageKey={`wuensche-draft-${appKontext}`}
            />
          )}

          {tab === 'changelog' && (
            <Changelog items={erfuellte} count={erfuellte.length} leerSpruch={dialoge?.aktuell?.changelog_leer} />
          )}
        </div>

        {/* Toast */}
        {toast && <MiniToast text={toast} onDone={() => setToast(null)} />}

        {/* Footer — saisonaler Spruch */}
        {dialoge?.aktuell?.saison && (
          <div style={{
            padding: '11px 22px 13px',
            borderTop: `1px solid ${MAGIC_COLORS.gold}33`,
            fontSize: 14, color: MAGIC_COLORS.goldDark,
            fontStyle: 'italic', textAlign: 'center',
            fontWeight: 500,
            position: 'relative', zIndex: 1, flexShrink: 0,
            background: '#FFFDF8',
          }}>
            {dialoge.aktuell.saison}
          </div>
        )}
      </div>
    </div>
  );
}
