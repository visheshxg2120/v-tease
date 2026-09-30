import {
  DEMO_CLICKS,
  DEMO_ISLAND,
  DEMO_LISTEN,
  DEMO_SOURCE,
  DEMO_TIMES,
  DEMO_TOGGLES,
  DEMO_WINDOWS,
  demoCursorAt,
} from './demoLayout';
import { roundRect } from './draw';
import type { Rect } from '../model/types';

// Procedural stand-in for a screen recording, so the sample project runs with zero assets.

const W = DEMO_SOURCE.width;
const H = DEMO_SOURCE.height;
const FONT = 'Geist, system-ui, sans-serif';

let wallpaper: HTMLCanvasElement | null = null;

function getWallpaper() {
  if (wallpaper) return wallpaper;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, W, H);
  lg.addColorStop(0, '#9DB7FF');
  lg.addColorStop(0.5, '#E9C9F5');
  lg.addColorStop(1, '#FFE2C6');
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, col: string) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  };
  blob(500, 1200, 900, 'rgba(120,150,255,0.55)');
  blob(2100, 400, 800, 'rgba(255,170,200,0.5)');
  blob(1700, 1400, 700, 'rgba(255,210,150,0.5)');
  // menu bar
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillRect(0, 0, W, 68);
  g.fillStyle = '#1a1a1a';
  g.font = `600 26px ${FONT}`;
  g.textBaseline = 'middle';
  g.beginPath();
  g.arc(48, 34, 13, 0, Math.PI * 2);
  g.fill();
  g.fillText('Finder', 90, 35);
  g.font = `400 26px ${FONT}`;
  ['File', 'Edit', 'View', 'Go', 'Window', 'Help'].forEach((s, i) => g.fillText(s, 200 + i * 92, 35));
  // dock
  const dw = 980;
  const dx = (W - dw) / 2;
  g.fillStyle = 'rgba(255,255,255,0.4)';
  roundRect(g, dx, H - 150, dw, 128, 36);
  g.fill();
  const icons = ['#3B82F6', '#F43F5E', '#F59E0B', '#10B981', '#8B5CF6', '#0EA5E9', '#EC4899', '#64748B'];
  icons.forEach((col, i) => {
    g.fillStyle = col;
    roundRect(g, dx + 26 + i * 118, H - 136, 100, 100, 24);
    g.fill();
  });
  wallpaper = c;
  return c;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

function appear(t: number, tin: number, tout: number) {
  if (t < tin || t > tout + 0.25) return 0;
  return Math.min(easeOut((t - tin) / 0.28), 1 - clamp01((t - tout) / 0.25));
}

function drawWindow(g: CanvasRenderingContext2D, r: Rect, title: string, a: number, body: () => void) {
  if (a <= 0) return;
  g.save();
  g.globalAlpha = a;
  const s = 0.94 + 0.06 * a;
  g.translate(r.x + r.w / 2, r.y + r.h / 2);
  g.scale(s, s);
  g.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  g.shadowColor = 'rgba(0,0,0,0.28)';
  g.shadowBlur = 60;
  g.shadowOffsetY = 20;
  g.fillStyle = '#FFFFFF';
  roundRect(g, r.x, r.y, r.w, r.h, 22);
  g.fill();
  g.shadowColor = 'transparent';
  g.save();
  roundRect(g, r.x, r.y, r.w, r.h, 22);
  g.clip();
  g.fillStyle = '#F4F4F5';
  g.fillRect(r.x, r.y, r.w, 64);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(r.x + 34 + i * 34, r.y + 32, 11, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = '#3F3F46';
  g.font = `600 26px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, r.x + r.w / 2, r.y + 33);
  g.textAlign = 'left';
  body();
  g.restore();
  g.restore();
}

function drawIsland(g: CanvasRenderingContext2D, t: number) {
  let listen = 0;
  for (const [a, b] of DEMO_LISTEN) listen = Math.max(listen, Math.min(easeOut((t - a) / 0.3), 1 - clamp01((t - b) / 0.3)));
  const w = DEMO_ISLAND.w + (660 - DEMO_ISLAND.w) * listen;
  const h = DEMO_ISLAND.h + 14 * listen;
  const x = DEMO_ISLAND.x - w / 2;
  const y = 2;
  g.fillStyle = '#000';
  roundRect(g, x, y, w, h, h / 2);
  g.fill();
  if (listen > 0.05) {
    g.save();
    g.globalAlpha = listen;
    // orb
    const ox = x + 44;
    const oy = y + h / 2;
    const rg = g.createRadialGradient(ox, oy, 2, ox, oy, 24);
    rg.addColorStop(0, '#9EE7FF');
    rg.addColorStop(1, '#6D5DFC');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(ox, oy, 22, 0, Math.PI * 2);
    g.fill();
    // live bars
    g.fillStyle = '#FFFFFF';
    for (let i = 0; i < 14; i++) {
      const v = 0.3 + 0.7 * Math.abs(Math.sin(t * 9 + i * 1.3) * Math.sin(t * 3.1 + i * 0.7));
      const bh = 8 + 34 * v;
      roundRect(g, x + 110 + i * 22, oy - bh / 2, 10, bh, 5);
      g.fill();
    }
    g.font = `500 24px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.textBaseline = 'middle';
    g.fillText('Listening…', x + w - 170, oy + 1);
    g.restore();
  }
}

function musicBody(g: CanvasRenderingContext2D, r: Rect, t: number) {
  const ax = r.x + 50;
  const ay = r.y + 110;
  const art = g.createLinearGradient(ax, ay, ax + 300, ay + 300);
  art.addColorStop(0, '#FF7A59');
  art.addColorStop(1, '#7C3AED');
  g.fillStyle = art;
  roundRect(g, ax, ay, 300, 300, 20);
  g.fill();
  g.fillStyle = '#0A0A0A';
  g.font = `600 44px ${FONT}`;
  g.textBaseline = 'alphabetic';
  g.fillText('Late Night Drive', ax + 340, ay + 80);
  g.fillStyle = '#71717A';
  g.font = `400 30px ${FONT}`;
  g.fillText('Nova Radio · Chill mix', ax + 340, ay + 130);
  const prog = clamp01((t - DEMO_TIMES.musicIn) / 60);
  g.fillStyle = '#E4E4E7';
  roundRect(g, ax, ay + 350, r.w - 100, 10, 5);
  g.fill();
  g.fillStyle = '#0A0A0A';
  roundRect(g, ax, ay + 350, (r.w - 100) * (0.08 + prog), 10, 5);
  g.fill();
  // transport
  const cx = r.x + r.w / 2;
  const cy = ay + 420;
  g.beginPath();
  g.moveTo(cx - 14, cy - 20);
  g.lineTo(cx - 14, cy + 20);
  g.moveTo(cx + 14, cy - 20);
  g.lineTo(cx + 14, cy + 20);
  g.lineWidth = 12;
  g.strokeStyle = '#0A0A0A';
  g.stroke();
}

function remindersBody(g: CanvasRenderingContext2D, r: Rect, t: number) {
  g.fillStyle = '#0A0A0A';
  g.font = `700 56px ${FONT}`;
  g.textBaseline = 'alphabetic';
  g.fillText('Today', r.x + 60, r.y + 150);
  const items = ['Pick up dry cleaning', 'Book flights to Lisbon', 'Water the plants'];
  const add = easeOut((t - DEMO_TIMES.reminderAdd) / 0.45);
  const rowH = 96;
  const drawRow = (text: string, y: number, hi: number) => {
    if (hi > 0) {
      g.fillStyle = `rgba(59,130,246,${0.1 * hi})`;
      roundRect(g, r.x + 40, y - 58, r.w - 80, 84, 16);
      g.fill();
    }
    g.strokeStyle = hi > 0 ? '#3B82F6' : '#A1A1AA';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(r.x + 90, y - 16, 20, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#18181B';
    g.font = `500 36px ${FONT}`;
    g.fillText(text, r.x + 140, y - 4);
  };
  let y0 = r.y + 250;
  if (add > 0) {
    g.save();
    g.globalAlpha = add;
    drawRow('Call Sam at 5 PM', y0 + (1 - add) * -30, 1);
    g.restore();
    y0 += rowH * add;
  }
  items.forEach((s, i) => drawRow(s, y0 + i * rowH, 0));
}

function toggleState(i: number, t: number) {
  const c = DEMO_CLICKS[i];
  const base = i % 2 === 0 ? 0 : 1;
  const k = clamp01((t - c - 0.05) / 0.18);
  return base === 0 ? k : 1 - k;
}

function settingsBody(g: CanvasRenderingContext2D, r: Rect, t: number) {
  g.fillStyle = '#F4F4F5';
  g.fillRect(r.x, r.y + 64, 440, r.h - 64);
  g.font = `500 30px ${FONT}`;
  g.textBaseline = 'middle';
  ['General', 'Voice', 'Shortcuts', 'Privacy', 'About'].forEach((s, i) => {
    if (i === 1) {
      g.fillStyle = '#E4E4E7';
      roundRect(g, r.x + 24, r.y + 110 + i * 76 - 30, 392, 60, 12);
      g.fill();
    }
    g.fillStyle = '#27272A';
    g.fillText(s, r.x + 60, r.y + 110 + i * 76);
  });
  g.fillStyle = '#0A0A0A';
  g.font = `700 50px ${FONT}`;
  g.fillText('Voice', r.x + 500, r.y + 160);
  const labels = ['Listen for “Hey Nova”', 'Speak responses aloud', 'Show live captions', 'Duck media while talking'];
  DEMO_TOGGLES.forEach((tg, i) => {
    g.fillStyle = '#18181B';
    g.font = `500 34px ${FONT}`;
    g.fillText(labels[i], r.x + 500, tg.y);
    g.fillStyle = '#E4E4E7';
    g.fillRect(r.x + 500, tg.y + 70, r.w - 560, 2);
    const on = toggleState(i, t);
    const tw = 112;
    const th = 64;
    const tx = tg.x - tw / 2;
    g.fillStyle = on > 0.5 ? '#22C55E' : '#D4D4D8';
    roundRect(g, tx, tg.y - th / 2, tw, th, th / 2);
    g.fill();
    g.fillStyle = '#FFF';
    g.beginPath();
    g.arc(tx + th / 2 + (tw - th) * on, tg.y, th / 2 - 5, 0, Math.PI * 2);
    g.fill();
  });
}

function drawCursor(g: CanvasRenderingContext2D, t: number) {
  const c = demoCursorAt(t);
  if (!c.visible) return;
  let press = 0;
  for (const ct of DEMO_CLICKS) {
    const d = t - ct;
    if (d > -0.08 && d < 0.5) {
      press = Math.max(press, d < 0.08 ? 1 : 0);
      const rp = clamp01(d / 0.5);
      g.strokeStyle = `rgba(59,130,246,${0.6 * (1 - rp)})`;
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c.x, c.y, 20 + 60 * rp, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const s = 2 * (1 - 0.12 * press);
  g.save();
  g.translate(c.x, c.y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, 22);
  g.lineTo(5.5, 17);
  g.lineTo(9.5, 26);
  g.lineTo(13, 24.5);
  g.lineTo(9, 16);
  g.lineTo(16, 16);
  g.closePath();
  g.fillStyle = '#000';
  g.strokeStyle = '#FFF';
  g.lineWidth = 1.6;
  g.lineJoin = 'round';
  g.stroke();
  g.fill();
  g.restore();
}

export class DemoSource {
  canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private lastT = -1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
  }

  frame(t: number): HTMLCanvasElement {
    const q = Math.round(t * 120) / 120;
    if (q === this.lastT) return this.canvas;
    this.lastT = q;
    const g = this.g;
    g.drawImage(getWallpaper(), 0, 0);
    // clock
    g.fillStyle = '#1a1a1a';
    g.font = `500 26px ${FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    g.fillText('Tue 9:41 AM', W - 40, 35);
    g.textAlign = 'left';
    const T = DEMO_TIMES;
    drawWindow(g, DEMO_WINDOWS.Music, 'Music', appear(q, T.musicIn, T.musicOut), () =>
      musicBody(g, DEMO_WINDOWS.Music, q),
    );
    drawWindow(g, DEMO_WINDOWS.Reminders, 'Reminders', appear(q, T.remindersIn, T.remindersOut), () =>
      remindersBody(g, DEMO_WINDOWS.Reminders, q),
    );
    drawWindow(g, DEMO_WINDOWS.Settings, 'Nova Settings', appear(q, T.settingsIn, T.settingsOut), () =>
      settingsBody(g, DEMO_WINDOWS.Settings, q),
    );
    drawIsland(g, q);
    drawCursor(g, q);
    return this.canvas;
  }

  /** Invalidate cached frame (e.g. after fonts load). */
  reset() {
    this.lastT = -1;
    wallpaper = null;
  }
}
