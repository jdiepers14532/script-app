// MagicModal.tsx — "Dein Wunsch ist in Erfüllung gegangen" Notification-Modal
// Design: Gold/Weiß, Shooting Star, Konfetti — kein Lila/Cinderella
import React, { useState, useEffect, useRef } from 'react';
import { injectMagicCSS, fireMagicConfetti, MAGIC_COLORS, STAR_CLIP_PATH } from './MagicWandTheme';
import type { WunschNotification } from './useWuensche';

export interface MagicModalProps {
  notifications: WunschNotification[];
  onDismiss: (notificationId: string) => void;
}

// ── Schießender Stern ─────────────────────────────────────────────────────────

function ShootingStars() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute',
          top: `${10 + i * 25}%`,
          left: 0,
          width: 80 + i * 40 + 'px',
          height: 2,
          background: `linear-gradient(90deg, transparent, ${MAGIC_COLORS.gold}, transparent)`,
          animation: `magic-shooting-star ${2 + i * 0.7}s ${i * 0.8}s ease-in-out infinite`,
          opacity: 0,
          pointerEvents: 'none',
          borderRadius: 2,
        }} />
      ))}
    </>
  );
}

// ── Funkelnde Sterne (Hintergrund) ────────────────────────────────────────────

function SparkleField() {
  const sparkles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    y: 5 + Math.random() * 90,
    size: 3 + Math.random() * 5,
    delay: Math.random() * 3,
    dur: 1.2 + Math.random() * 1.5,
  }));

  return (
    <>
      {sparkles.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: s.x + '%',
          top: s.y + '%',
          width: s.size + 'px',
          height: s.size + 'px',
          background: MAGIC_COLORS.gold,
          clipPath: STAR_CLIP_PATH,
          animation: `magic-twinkle ${s.dur}s ${s.delay}s ease-in-out infinite`,
          opacity: 0.15,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  );
}

// ── Haupt-Modal ───────────────────────────────────────────────────────────────

export function MagicModal({ notifications, onDismiss }: MagicModalProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const confettiRef = useRef<HTMLDivElement>(null);
  const didFireRef = useRef(false);

  useEffect(() => { injectMagicCSS(); }, []);

  useEffect(() => {
    if (notifications.length > 0) {
      setCurrentIdx(0);
      setVisible(true);
      setClosing(false);
      didFireRef.current = false;
    } else {
      setVisible(false);
    }
  }, [notifications.length]);

  // Konfetti + Sparkles nach dem Einblenden einmalig abfeuern
  useEffect(() => {
    if (!visible || didFireRef.current) return;
    const t = setTimeout(() => {
      if (confettiRef.current) fireMagicConfetti(confettiRef.current);
      didFireRef.current = true;
    }, 400);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible || notifications.length === 0) return null;

  const notif = notifications[currentIdx];

  function handleDismiss() {
    setClosing(true);
    setTimeout(() => {
      onDismiss(notif.notification_id);
      const next = notifications.filter(n => n.notification_id !== notif.notification_id);
      if (next.length > 0) {
        setCurrentIdx(0);
        setClosing(false);
        setVisible(true);
        didFireRef.current = false;
      } else {
        setVisible(false);
        setClosing(false);
      }
    }, 250);
  }

  const hasMore = notifications.length > 1;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: MAGIC_COLORS.overlayDark,
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: closing ? 'magic-fade-out 0.25s ease-in forwards' : 'magic-fade-in 0.3s ease-out',
        padding: '16px',
      }}>

      {/* Modal-Box */}
      <div
        ref={confettiRef}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 20,
          overflow: 'hidden',
          position: 'relative',
          animation: closing ? 'magic-fade-out 0.25s ease-in forwards' : 'magic-modal-in 0.45s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: `0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px ${MAGIC_COLORS.gold}33`,
        }}>

        {/* Hintergrund-Effekte */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
          <SparkleField />
          <ShootingStars />
          {/* Goldener Glanz-Kreis */}
          <div style={{
            position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
            width: 300, height: 200,
            background: `radial-gradient(ellipse, ${MAGIC_COLORS.glowGold} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />
        </div>

        {/* Goldener Streifen */}
        <div style={{
          height: 4,
          background: `linear-gradient(90deg, transparent, ${MAGIC_COLORS.gold}, ${MAGIC_COLORS.goldLight}, ${MAGIC_COLORS.gold}, transparent)`,
          animation: 'magic-glow-pulse 2s ease-in-out infinite',
        }} />

        {/* Content */}
        <div style={{ padding: '24px 24px 20px', position: 'relative', zIndex: 1 }}>

          {/* Mehrfach-Indikator */}
          {hasMore && (
            <div style={{ textAlign: 'right', fontSize: 11, color: MAGIC_COLORS.goldDark, fontWeight: 600, marginBottom: 4 }}>
              {currentIdx + 1} / {notifications.length}
            </div>
          )}

          {/* Stern-Icon */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{
              display: 'inline-block',
              width: 56, height: 56,
              background: `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`,
              clipPath: STAR_CLIP_PATH,
              animation: 'magic-glow-pulse 1.5s ease-in-out infinite',
            }} />
          </div>

          {/* Überschrift */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: MAGIC_COLORS.goldDark, marginBottom: 6, textTransform: 'uppercase' }}>
              ✨ Dein Wunsch ist in Erfüllung gegangen ✨
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111', lineHeight: 1.3 }}>
              {notif.titel}
            </div>
          </div>

          {/* KI-Zusammenfassung */}
          {notif.ki_zusammenfassung && (
            <div style={{
              padding: '12px 14px',
              background: '#FFFDF0',
              border: `1px solid ${MAGIC_COLORS.gold}55`,
              borderRadius: 10,
              fontSize: 13,
              color: '#444',
              lineHeight: 1.6,
              marginBottom: 12,
            }}>
              {notif.ki_zusammenfassung}
            </div>
          )}

          {/* Admin-Beschreibung (wenn keine KI-Zusammenfassung) */}
          {!notif.ki_zusammenfassung && notif.admin_beschreibung && (
            <div style={{
              padding: '12px 14px',
              background: '#F8F8F8',
              borderRadius: 10,
              fontSize: 13,
              color: '#555',
              lineHeight: 1.5,
              marginBottom: 12,
            }}>
              {notif.admin_beschreibung}
            </div>
          )}

          {/* Wo zu finden */}
          {notif.wo_zu_finden && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 14px',
              background: `${MAGIC_COLORS.gold}18`,
              borderRadius: 8,
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 15 }}>📍</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: MAGIC_COLORS.goldDark, marginBottom: 2 }}>Wo findest du es?</div>
                <div style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{notif.wo_zu_finden}</div>
              </div>
            </div>
          )}

          {/* Anhänge */}
          {notif.anhaenge && notif.anhaenge.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9E9E9E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Anhänge</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {notif.anhaenge.map((a, i) => (
                  <a
                    key={i}
                    href={`https://auth.serienwerft.studio${a.pfad}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px',
                      background: '#F5F5F5',
                      border: '1px solid #E0E0E0',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#333',
                      textDecoration: 'none',
                    }}>
                    {a.typ.startsWith('image/') ? '🖼️' : a.typ.startsWith('video/') ? '🎬' : '📄'}
                    {a.dateiname}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Datum */}
          <div style={{ textAlign: 'center', fontSize: 11, color: '#BDBDBD', marginBottom: 20 }}>
            Erfüllt am {new Date(notif.erfuellt_am).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>

          {/* Button */}
          <button
            onClick={handleDismiss}
            style={{
              width: '100%',
              padding: '12px 0',
              background: `linear-gradient(135deg, ${MAGIC_COLORS.gold}, #FFA500)`,
              color: '#111',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 800,
              animation: 'magic-glow-pulse 2s ease-in-out infinite',
              letterSpacing: 0.3,
            }}>
            {hasMore ? 'Weiter ✨' : 'Super, danke! ✨'}
          </button>
        </div>
      </div>
    </div>
  );
}
