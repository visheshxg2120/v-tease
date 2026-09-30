import type { CommandBlock, EndBlock, Project, ShotBlock, Source, StickerBlock, TitleBlock } from '../model/types';
import {
  activeOverlays,
  activeVideoBlock,
  beatToTime,
  previousVideoBlock,
  shotSourceAt,
  spb,
  timeToBeat,
} from '../model/beats';
import { type Ctx, clamp01, easeOutBack, easeOutCubic, easeOutQuart, roundRect } from './draw';
import { type Crop, type CursorLookup, cursorFollowPath, followCropAt, shotCropAt } from './camera';

export interface VoiceEnv {
  /** RMS envelope, normalised 0..1. */
  env: Float32Array;
  rate: number;
}

/** Everything the pure renderer needs from the outside world. */
export interface RenderEnv {
  sourceImage(source: Source, srcTime: number): CanvasImageSource | null;
  cursor(sourceId: string): CursorLookup;
  cursorVersion: number;
  voiceEnvelope(cmd: CommandBlock): VoiceEnv | null;
  image(assetId: string): CanvasImageSource | null;
}

export interface RenderOptions {
  /** Draw guides (safe area etc.) — preview only. */
  guides?: boolean;
}

const FONT = 'Geist, system-ui, sans-serif';

export function cardRect(p: Project) {
  return { x: (p.width - p.card.w) / 2, y: (p.height - p.card.h) / 2, w: p.card.w, h: p.card.h };
}

export function renderFrame(g: Ctx, p: Project, t: number, env: RenderEnv, _opts: RenderOptions = {}) {
  const cw = g.canvas.width;
  g.setTransform(cw / p.width, 0, 0, cw / p.width, 0, 0);
  g.globalAlpha = 1;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  drawBackground(g, p);
  const beat = timeToBeat(p, t);
  const vb = activeVideoBlock(p, beat);
  if (vb) {
    const local = t - beatToTime(p, vb.start);
    if (vb.kind === 'title') drawTitle(g, p, vb, local);
    else if (vb.kind === 'shot') drawShot(g, p, vb, local, env);
    else if (vb.kind === 'end') drawEnd(g, p, vb, local, env);
  }
  for (const o of activeOverlays(p, beat)) {
    const local = t - beatToTime(p, o.start);
    if (o.kind === 'command') drawPill(g, p, o, local, env);
    else if (o.kind === 'sticker') drawSticker(g, p, o, local);
  }
}

function drawBackground(g: Ctx, p: Project) {
  const th = p.theme;
  if (p.style === 'playful') {
    const lg = g.createLinearGradient(0, 0, p.width, p.height);
    lg.addColorStop(0, th.bg);
    lg.addColorStop(1, th.bg2);
    g.fillStyle = lg;
    g.fillRect(0, 0, p.width, p.height);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 26; i++) {
      const x = ((i * 733) % p.width) + 20;
      const y = ((i * 397) % p.height) + 10;
      g.beginPath();
      g.arc(x, y, 4 + (i % 4) * 2, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.fillStyle = th.bg;
    g.fillRect(0, 0, p.width, p.height);
  }
}

// ---------- titles ----------

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function wordColors(p: Project, b: TitleBlock, lineIdx: number, words: string[]): string[] {
  const line = b.lines[lineIdx];
  const kws = line.keyword
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (kws.length === 0) {
    const inkLine = b.lines.length === 1 || lineIdx === b.lines.length - 1;
    return words.map(() => (inkLine ? p.theme.ink : p.theme.dim));
  }
  const kwWords = new Set(kws.flatMap((k) => k.split(/\s+/).map(norm)));
  return words.map((w) => (kwWords.has(norm(w)) ? p.theme.keyword : p.theme.dim));
}

function drawTitle(g: Ctx, p: Project, b: TitleBlock, local: number) {
  const size = b.size;
  g.font = `600 ${size}px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const lineH = size * 1.18;
  const s = spb(p);
  const cy = p.height / 2;
  const lines = b.lines.slice(0, 2);
  const two = lines.length === 2 && lines[1].text.trim() !== '';
  const e2 = two ? easeOutQuart((local - b.line2Delay * s) / 0.5) : 0;
  let wordIdx = 0;
  lines.forEach((line, li) => {
    if (li === 1 && !two) return;
    const words = line.text.split(/\s+/).filter(Boolean);
    const colors = wordColors(p, b, li, words);
    const space = g.measureText(' ').width;
    const widths = words.map((w) => g.measureText(w).width);
    const total = widths.reduce((a, c) => a + c, 0) + space * Math.max(0, words.length - 1);
    let x = (p.width - total) / 2;
    const enterAt = li === 0 ? 0 : b.line2Delay * s;
    const le = easeOutQuart((local - enterAt) / 0.5);
    let y = li === 0 ? cy - (lineH / 2) * e2 : cy + lineH / 2;
    if (!b.wordByWord) y += (1 - le) * 40;
    words.forEach((w, wi) => {
      let alpha = b.wordByWord ? 1 : le;
      let dy = 0;
      if (b.wordByWord) {
        const wb = b.wordBeats[wordIdx] ?? wordIdx;
        const we = easeOutQuart((local - wb * s) / 0.4);
        alpha = we;
        dy = (1 - we) * 30;
      }
      if (alpha > 0.001) {
        g.globalAlpha = alpha;
        g.fillStyle = colors[wi];
        g.fillText(w, x, y + dy);
      }
      x += widths[wi] + space;
      wordIdx++;
    });
  });
  g.globalAlpha = 1;
}

// ---------- shots ----------

export function shotCrop(p: Project, shot: ShotBlock, src: Source, local: number, env: RenderEnv): Crop {
  if (shot.cursor.enabled) {
    const path = cursorFollowPath(p, shot, src, env.cursor(src.id), env.cursorVersion);
    return followCropAt(path, local);
  }
  return shotCropAt(p, shot, src, local / spb(p));
}

function drawShot(g: Ctx, p: Project, shot: ShotBlock, local: number, env: RenderEnv) {
  const src = p.sources.find((s) => s.id === shot.sourceId);
  const card = cardRect(p);
  const th = p.theme;
  let scale = 1;
  let alpha = 1;
  if (shot.popIn) {
    const prev = previousVideoBlock(p, shot);
    if (!prev || prev.kind !== 'shot') {
      const k = easeOutQuart(local / 0.4);
      scale = 0.92 + 0.08 * k;
      alpha = easeOutCubic(local / 0.25);
    }
  }
  g.save();
  g.globalAlpha = alpha;
  g.translate(p.width / 2, p.height / 2);
  g.scale(scale, scale);
  g.translate(-p.width / 2, -p.height / 2);
  // shadow
  g.save();
  g.shadowColor = `rgba(0,0,0,${th.cardShadow})`;
  g.shadowBlur = 70;
  g.shadowOffsetY = 24;
  g.fillStyle = '#0B0B0C';
  roundRect(g, card.x, card.y, card.w, card.h, th.cardRadius);
  g.fill();
  g.restore();
  g.save();
  roundRect(g, card.x, card.y, card.w, card.h, th.cardRadius);
  g.clip();
  if (src) {
    const localBeat = local / spb(p);
    const { src: st } = shotSourceAt(p, shot, localBeat);
    const img = env.sourceImage(src, Math.min(st, src.duration - 0.01));
    if (img) {
      const crop = shotCrop(p, shot, src, local, env);
      const samples = shot.motionBlur ? blurSamples(p, shot, src, local, env, crop) : [crop];
      samples.forEach((c, i) => {
        g.globalAlpha = alpha / (i + 1);
        g.drawImage(img, c.x, c.y, c.w, c.h, card.x, card.y, card.w, card.h);
      });
    } else {
      drawMissing(g, card, src.name);
    }
  } else {
    drawMissing(g, card, 'No source');
  }
  g.restore();
  g.restore();
}

/** Light motion blur: only when the camera moves fast, a few sub-frame crops across a 180° shutter. */
function blurSamples(p: Project, shot: ShotBlock, src: Source, local: number, env: RenderEnv, crop: Crop): Crop[] {
  const shutter = 0.5 / p.fps;
  const a = shotCrop(p, shot, src, local - shutter / 2, env);
  const b = shotCrop(p, shot, src, local + shutter / 2, env);
  const zoomSpeed = Math.abs(Math.log(b.w / a.w));
  const panSpeed = Math.hypot(b.x + b.w / 2 - (a.x + a.w / 2), b.y + b.h / 2 - (a.y + a.h / 2)) / crop.w;
  const speed = zoomSpeed + panSpeed;
  if (speed < 0.012) return [crop];
  const n = Math.min(7, 3 + Math.floor(speed * 80));
  const out: Crop[] = [];
  for (let i = 0; i < n; i++) out.push(shotCrop(p, shot, src, local - shutter / 2 + (shutter * i) / (n - 1), env));
  return out;
}

function drawMissing(g: Ctx, card: { x: number; y: number; w: number; h: number }, label: string) {
  g.fillStyle = '#1C1C1F';
  g.fillRect(card.x, card.y, card.w, card.h);
  g.fillStyle = '#71717A';
  g.font = `500 34px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`${label} — import the recording to see it here`, card.x + card.w / 2, card.y + card.h / 2);
  g.textAlign = 'left';
}

// ---------- end card ----------

function drawEnd(g: Ctx, p: Project, b: EndBlock, local: number, env: RenderEnv) {
  const k = easeOutQuart(local / 0.6);
  g.save();
  g.globalAlpha = easeOutCubic(local / 0.4);
  g.translate(p.width / 2, p.height / 2);
  const s = 0.96 + 0.04 * k;
  g.scale(s, s);
  const logo = b.logoAssetId ? env.image(b.logoAssetId) : null;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const subY = b.subtitle ? 40 : 0;
  if (logo) {
    const lw = (logo as HTMLImageElement).naturalWidth || (logo as ImageBitmap).width || 600;
    const lh = (logo as HTMLImageElement).naturalHeight || (logo as ImageBitmap).height || 200;
    const sc = Math.min(560 / lw, 240 / lh);
    g.drawImage(logo, (-lw * sc) / 2, (-lh * sc) / 2 - subY, lw * sc, lh * sc);
  } else {
    g.fillStyle = p.theme.ink;
    g.font = `600 128px ${FONT}`;
    g.fillText(b.title, 0, -subY);
  }
  if (b.subtitle) {
    g.fillStyle = p.theme.dim;
    g.font = `500 40px ${FONT}`;
    g.fillText(b.subtitle, 0, 110 - subY + 30);
  }
  g.restore();
  g.textAlign = 'left';
}

// ---------- command pill ----------

export function envelopeAt(e: VoiceEnv | null, t: number) {
  if (!e || t < 0) return 0;
  const i = Math.floor(t * e.rate);
  return i >= 0 && i < e.env.length ? e.env[i] : 0;
}

function drawPill(g: Ctx, p: Project, b: CommandBlock, local: number, env: RenderEnv) {
  const dur = b.length * spb(p);
  const kin = local / 0.38;
  const out = clamp01((dur - local) / 0.22);
  const a = Math.min(clamp01(kin * 1.6), out);
  if (a <= 0) return;
  const sc = 0.86 + 0.14 * easeOutBack(kin);
  const card = cardRect(p);
  const text = `“${b.text}”`;
  g.font = `500 34px ${FONT}`;
  const tw = g.measureText(text).width;
  const h = 88;
  const circle = 64;
  const w = 12 + circle + 22 + tw + 38;
  const cx = p.width / 2;
  const cy = card.y + card.h - 70 - h / 2;
  g.save();
  g.globalAlpha = a;
  g.translate(cx, cy);
  g.scale(sc, sc);
  g.shadowColor = 'rgba(0,0,0,0.18)';
  g.shadowBlur = 44;
  g.shadowOffsetY = 12;
  g.fillStyle = '#FFFFFF';
  roundRect(g, -w / 2, -h / 2, w, h, h / 2);
  g.fill();
  g.shadowColor = 'transparent';
  const ccx = -w / 2 + 12 + circle / 2;
  g.fillStyle = '#0A0A0A';
  g.beginPath();
  g.arc(ccx, 0, circle / 2, 0, Math.PI * 2);
  g.fill();
  const ve = env.voiceEnvelope(b);
  const vt = local - b.voiceOffset * spb(p);
  const mult = [0.55, 0.85, 1, 0.8, 0.5];
  g.fillStyle = '#FFFFFF';
  for (let i = 0; i < 5; i++) {
    const v = Math.min(1, envelopeAt(ve, vt - Math.abs(i - 2) * 0.035) * 1.25);
    const bh = 7 + 26 * v * mult[i];
    roundRect(g, ccx - 17 + i * 8.5 - 2.5, -bh / 2, 5, bh, 2.5);
    g.fill();
  }
  g.fillStyle = '#0A0A0A';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(text, -w / 2 + 12 + circle + 22, 1);
  g.restore();
}

// ---------- stickers ----------

function drawSticker(g: Ctx, p: Project, b: StickerBlock, local: number) {
  const dur = b.length * spb(p);
  const k = easeOutBack(local / 0.45);
  const a = Math.min(clamp01(local / 0.15), clamp01((dur - local) / 0.2));
  const wob = b.wobble ? Math.sin(local * 4) * 5 : 0;
  g.save();
  g.globalAlpha = a;
  g.translate(b.x * p.width, b.y * p.height);
  g.rotate(((b.rotate + wob) * Math.PI) / 180);
  g.scale(Math.max(0.01, k), Math.max(0.01, k));
  g.font = `${b.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(b.emoji, 0, 0);
  g.restore();
  g.textAlign = 'left';
}
