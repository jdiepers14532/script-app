// MagicWandTheme.ts — Design-Tokens + CSS-Animationen für das Wünsche-Feature
// Gold/Weiß-Ästhetik, Stars & Sparkles, kein Lila/Cinderella

export const MAGIC_COLORS = {
  gold:        '#FFD700',
  goldLight:   '#FFF3B0',
  goldDark:    '#B8860B',
  silver:      '#C0C0C0',
  white:       '#FFFFFF',
  overlayDark: 'rgba(0, 0, 0, 0.72)',
  glowGold:    'rgba(255, 215, 0, 0.4)',
};

export const MAGIC_CSS = `
@keyframes magic-fade-in {
  from { opacity: 0; transform: translateY(18px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes magic-fade-out {
  from { opacity: 1; transform: scale(1);    }
  to   { opacity: 0; transform: scale(0.95); }
}
@keyframes magic-modal-in {
  0%   { opacity: 0; transform: scale(0.7);    }
  60%  { opacity: 1; transform: scale(1.04);   }
  100% { opacity: 1; transform: scale(1);      }
}
@keyframes magic-shooting-star {
  0%   { opacity: 0; transform: translate(-20vw, -20vh) scaleX(0.2); }
  20%  { opacity: 1; }
  100% { opacity: 0; transform: translate(120vw, 80vh) scaleX(1); }
}
@keyframes magic-sparkle {
  0%   { opacity: 0; transform: scale(0) rotate(0deg);   }
  45%  { opacity: 1; transform: scale(1) rotate(180deg); }
  100% { opacity: 0; transform: scale(0) rotate(360deg); }
}
@keyframes magic-twinkle {
  0%, 100% { opacity: 0.15; transform: scale(0.8); }
  50%       { opacity: 0.9;  transform: scale(1.1); }
}
@keyframes magic-toast-in {
  from { opacity: 0; transform: translateX(60px) translateY(10px); }
  to   { opacity: 1; transform: translateX(0)    translateY(0);    }
}
@keyframes magic-toast-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(60px); }
}
@keyframes magic-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,215,0,0); }
  50%       { box-shadow: 0 0 24px 6px rgba(255,215,0,0.5); }
}
@keyframes magic-counter-roll {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes magic-confetti-fall {
  0%   { transform: translateY(-10px) rotate(0deg);   opacity: 1; }
  100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
}
`;

// CSS einmalig in den DOM injizieren
let injected = false;
export function injectMagicCSS(): void {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'sw-magic-wand-theme';
  style.textContent = MAGIC_CSS;
  document.head.appendChild(style);
  injected = true;
}

// Stern-Form als clip-path (10-zackig)
export const STAR_CLIP_PATH =
  'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)';

// Konfetti erzeugen und animieren
export function fireMagicConfetti(container: HTMLElement): void {
  const colors = ['#FFD700', '#FFFFFF', '#C0C0C0', '#FFF3B0', '#FFE066'];
  const count = 120;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 4 + Math.random() * 7;
    const isRect = Math.random() > 0.5;
    const startX = 20 + Math.random() * 60; // % vom Container
    const duration = 1.8 + Math.random() * 1.5;
    const delay = Math.random() * 0.8;

    Object.assign(el.style, {
      position: 'absolute',
      left: startX + '%',
      top: '-10px',
      width: size + 'px',
      height: isRect ? size * 0.5 + 'px' : size + 'px',
      background: color,
      borderRadius: isRect ? '1px' : '50%',
      animation: `magic-confetti-fall ${duration}s ${delay}s ease-in forwards`,
      pointerEvents: 'none',
      zIndex: '99999',
    });

    container.appendChild(el);
    setTimeout(() => el.remove(), (duration + delay) * 1000 + 200);
  }
}

// Sparkle-Burst erzeugen (um ein Element herum)
export function fireSparkles(target: HTMLElement, count = 6): void {
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const angle = (i / count) * 360;
    const distance = 20 + Math.random() * 30;
    const size = 5 + Math.random() * 5;
    const rad = (angle * Math.PI) / 180;
    const tx = cx + Math.cos(rad) * distance;
    const ty = cy + Math.sin(rad) * distance;

    Object.assign(el.style, {
      position: 'fixed',
      left: tx + 'px',
      top: ty + 'px',
      width: size + 'px',
      height: size + 'px',
      background: '#FFD700',
      clipPath: STAR_CLIP_PATH,
      animation: `magic-sparkle ${500 + Math.random() * 400}ms ease-in-out forwards`,
      pointerEvents: 'none',
      zIndex: '99999',
      transform: 'translate(-50%, -50%)',
    });

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}
