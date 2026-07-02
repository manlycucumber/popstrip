// A tiny, dependency-free confetti burst over the viewport when a photo lands.
// Reduced-motion-safe: it simply does nothing if the user prefers reduced motion.

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  round: boolean;
};

const COLORS = ['#ff2e88', '#ffcc00', '#00c2d6', '#9b5de5', '#ffffff'];

export function celebrate(): void {
  if (prefersReducedMotion()) return;
  const host = document.querySelector('.viewport') as HTMLElement | null;
  if (!host) return;

  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!w || !h) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50';
  host.appendChild(canvas);

  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }
  // Pin to a non-null-typed const so the narrowing survives into the rAF closure.
  const g: CanvasRenderingContext2D = context;
  g.scale(dpr, dpr);

  const bits: Bit[] = Array.from({ length: 110 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.34,
    y: h * 0.56,
    vx: (Math.random() - 0.5) * 11,
    vy: -(6 + Math.random() * 9),
    g: 0.28 + Math.random() * 0.14,
    size: 6 + Math.random() * 7,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() < 0.4,
  }));

  const start = performance.now();
  const duration = 1500;

  function frame(now: number): void {
    const t = now - start;
    const life = 1 - t / duration;
    g.clearRect(0, 0, w, h);
    let onscreen = false;

    for (const b of bits) {
      b.vy += b.g;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      if (b.y < h + 24 && life > 0) onscreen = true;

      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, life * 1.4));
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.fillStyle = b.color;
      if (b.round) {
        g.beginPath();
        g.arc(0, 0, b.size / 2, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.6);
      }
      g.restore();
    }

    if (t < duration && onscreen) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(frame);
}
