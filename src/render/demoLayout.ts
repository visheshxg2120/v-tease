import type { Rect, Source } from '../model/types';

// Geometry + script of the built-in procedural "screen recording" (a Retina-ish 2560×1600 Mac desktop).

export const DEMO_SOURCE: Source = {
  id: 'demo-rec',
  name: 'Demo recording (procedural)',
  kind: 'demo',
  assetId: null,
  width: 2560,
  height: 1600,
  duration: 30,
};

export const DEMO_ISLAND = { x: 1280, y: 34, w: 360, h: 64 };

export const DEMO_WINDOWS: Record<'Music' | 'Reminders' | 'Settings', Rect> = {
  Music: { x: 900, y: 420, w: 760, h: 560 },
  Reminders: { x: 700, y: 300, w: 1160, h: 900 },
  Settings: { x: 420, y: 240, w: 1720, h: 1160 },
};

/** [start, end] of the island "listening" state. */
export const DEMO_LISTEN: [number, number][] = [
  [0.4, 3.2],
  [8.4, 10.8],
];

export const DEMO_TIMES = {
  musicIn: 3.4,
  musicOut: 8.0,
  remindersIn: 11.2,
  reminderAdd: 11.6,
  remindersOut: 13.4,
  settingsIn: 13.6,
  settingsOut: 24,
  cursorIn: 13.8,
  cursorOut: 23.5,
};

/** Settings window toggles (source px) the cursor clicks. */
export const DEMO_TOGGLES = [
  { x: 1900, y: 520 },
  { x: 1900, y: 700 },
  { x: 1900, y: 880 },
  { x: 1900, y: 1060 },
];

export const DEMO_CLICKS = [15.6, 17.4, 19.6, 21.6];

// Cursor waypoints: [time, x, y]. The cursor rests on each toggle around its click.
const WP: [number, number, number][] = [
  [13.8, 900, 1300],
  [14.6, 1200, 900],
  [15.3, 1895, 525],
  [15.9, 1895, 525],
  [16.4, 1500, 640],
  [17.1, 1895, 705],
  [17.7, 1895, 705],
  [18.4, 1100, 820],
  [19.3, 1895, 885],
  [19.9, 1895, 885],
  [20.5, 1400, 1000],
  [21.3, 1895, 1065],
  [21.9, 1895, 1065],
  [23.5, 1200, 1250],
];

const smooth = (t: number) => t * t * (3 - 2 * t);

export function demoCursorAt(t: number): { x: number; y: number; visible: boolean } {
  if (t < WP[0][0] || t > WP[WP.length - 1][0]) return { x: 0, y: 0, visible: false };
  let i = 0;
  while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
  const [t0, x0, y0] = WP[i];
  const [t1, x1, y1] = WP[i + 1];
  const k = smooth(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, visible: true };
}
