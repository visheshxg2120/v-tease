export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeOutQuart = (t: number) => 1 - Math.pow(1 - clamp01(t), 4);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeOutBack = (t: number) => {
  const c1 = 1.5;
  const x = clamp01(t) - 1;
  return 1 + (c1 + 1) * x * x * x + c1 * x * x;
};

export function ease(kind: 'quart' | 'expo' | 'cubic' | 'linear', t: number) {
  switch (kind) {
    case 'quart':
      return easeOutQuart(t);
    case 'expo':
      return easeOutExpo(t);
    case 'cubic':
      return easeOutCubic(t);
    default:
      return clamp01(t);
  }
}

export const FONT_TITLE = 'Geist';
