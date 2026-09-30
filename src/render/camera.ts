import type { Framing, Project, ShotBlock, Source } from '../model/types';
import { ease, clamp01 } from './draw';
import { spb, shotSourceAt } from '../model/beats';

/** Crop rect in source pixels; always has the card's aspect ratio. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CursorLookup = (t: number) => { x: number; y: number; visible: boolean } | null;

export function framingCrop(f: Framing, src: Pick<Source, 'width' | 'height'>, cardW: number, cardH: number): Crop {
  const aspect = cardW / cardH;
  if (f.kind === 'anchor') {
    const w = src.width / Math.max(0.2, f.zoom);
    const h = w / aspect;
    let y = f.y - 0.3 * h;
    if (h < src.height) y = Math.min(Math.max(0, y), src.height - h);
    return { x: f.x - w / 2, y, w, h };
  }
  if (f.kind === 'window') {
    const r = f.rect;
    const s = Math.min((cardW - 2 * f.inset) / r.w, (cardH - 2 * f.inset) / r.h);
    const w = cardW / s;
    const h = cardH / s;
    return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
  }
  // full: cover
  let w: number;
  let h: number;
  if (src.width / src.height > aspect) {
    h = src.height;
    w = h * aspect;
  } else {
    w = src.width;
    h = w / aspect;
  }
  return { x: (src.width - w) / 2, y: (src.height - h) / 2, w, h };
}

/**
 * Straight-line zoom between two crops: both rects scale about their common fixed point,
 * zoom is interpolated in log space. With `lockX`, the fixed point's x is pinned to `anchorX`
 * (the residual so the move still lands exactly on B is blended in linearly).
 */
export function interpolateCrop(a: Crop, b: Crop, p: number, anchorX: number | null): Crop {
  const k = b.w / a.w;
  if (Math.abs(Math.log(k)) < 1e-4) {
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w, h: a.h };
  }
  const w = a.w * Math.pow(k, p);
  const h = a.h * Math.pow(k, p);
  const s = w / a.w;
  const fy = (b.y - k * a.y) / (1 - k);
  const y = fy + (a.y - fy) * s;
  let x: number;
  if (anchorX != null) {
    const predictedEnd = anchorX + (a.x - anchorX) * k;
    x = anchorX + (a.x - anchorX) * s + (b.x - predictedEnd) * p;
  } else {
    const fx = (b.x - k * a.x) / (1 - k);
    x = fx + (a.x - fx) * s;
  }
  return { x, y, w, h };
}

function moveAnchorX(shot: ShotBlock): number | null {
  if (!shot.lockX) return null;
  if (shot.framingStart.kind === 'anchor') return shot.framingStart.x;
  if (shot.framingEnd.kind === 'anchor') return shot.framingEnd.x;
  return null;
}

/** Camera crop for a shot at a local beat (no cursor follow). */
export function shotCropAt(p: Project, shot: ShotBlock, src: Source, localBeat: number): Crop {
  const a = framingCrop(shot.framingStart, src, p.card.w, p.card.h);
  const b = framingCrop(shot.framingEnd, src, p.card.w, p.card.h);
  const prog = shot.moveBeats <= 0 ? (localBeat >= shot.moveAt ? 1 : 0) : clamp01((localBeat - shot.moveAt) / shot.moveBeats);
  return interpolateCrop(a, b, ease(shot.ease, prog), moveAnchorX(shot));
}

// ---------- cursor follow ----------

interface FollowPath {
  step: number; // seconds per sample
  crops: Crop[];
}

const followCache = new Map<string, FollowPath>();

function spring(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const a = omega * omega * (target - x) - 2 * omega * v;
  v += a * dt;
  return [x + v * dt, v];
}

export function cursorFollowPath(
  p: Project,
  shot: ShotBlock,
  src: Source,
  cursor: CursorLookup,
  cursorVersion: number,
): FollowPath {
  const key = JSON.stringify([shot.timeMap, shot.framingStart, shot.cursor, shot.clicks, shot.length, p.music.bpm, p.card, src.id, cursorVersion]);
  const hit = followCache.get(shot.id + key);
  if (hit) return hit;
  const base = framingCrop(shot.framingStart, src, p.card.w, p.card.h);
  const cfg = shot.cursor;
  const dt = 1 / 120;
  const total = shot.length * spb(p);
  const crops: Crop[] = [];
  const clampC = (cx: number, cy: number, w: number, h: number) => [
    Math.min(Math.max(cx, base.x + w / 2), base.x + base.w - w / 2),
    Math.min(Math.max(cy, base.y + h / 2), base.y + base.h - h / 2),
  ];
  const s0 = shotSourceAt(p, shot, 0).src;
  const c0 = cursor(s0);
  let sx = c0?.visible ? c0.x : base.x + base.w / 2;
  let sy = c0?.visible ? c0.y : base.y + base.h / 2;
  let svx = 0;
  let svy = 0;
  let lz = Math.log(cfg.zoom);
  let vz = 0;
  let w0 = base.w / cfg.zoom;
  let [cx, cy] = clampC(sx, sy, w0, w0 * (base.h / base.w));
  let vx = 0;
  let vy = 0;
  for (let t = 0; t <= total + dt; t += dt) {
    const beat = t / spb(p);
    const st = shotSourceAt(p, shot, beat).src;
    const c = cursor(st);
    if (c?.visible) {
      [sx, svx] = spring(sx, svx, c.x, 7, dt);
      [sy, svy] = spring(sy, svy, c.y, 7, dt);
    }
    const clicking = shot.clicks.some((ct) => st >= ct - 0.3 && st <= ct + cfg.clickHold);
    [lz, vz] = spring(lz, vz, Math.log(clicking ? cfg.clickZoom : cfg.zoom), 4.2, dt);
    const z = Math.exp(lz);
    const w = base.w / z;
    const h = w * (base.h / base.w);
    const dzx = (w / 2) * cfg.deadZone;
    const dzy = (h / 2) * cfg.deadZone;
    let tx = cx;
    let ty = cy;
    if (sx > cx + dzx) tx = sx - dzx;
    else if (sx < cx - dzx) tx = sx + dzx;
    if (sy > cy + dzy) ty = sy - dzy;
    else if (sy < cy - dzy) ty = sy + dzy;
    [tx, ty] = clampC(tx, ty, w, h);
    [cx, vx] = spring(cx, vx, tx, 3.6, dt);
    [cy, vy] = spring(cy, vy, ty, 3.6, dt);
    [cx, cy] = clampC(cx, cy, w, h);
    crops.push({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  const path = { step: dt, crops };
  if (followCache.size > 64) followCache.clear();
  followCache.set(shot.id + key, path);
  return path;
}

export function followCropAt(path: FollowPath, localSec: number): Crop {
  const f = localSec / path.step;
  const i = Math.max(0, Math.min(path.crops.length - 2, Math.floor(f)));
  const a = path.crops[i];
  const b = path.crops[i + 1] ?? a;
  const k = clamp01(f - i);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}
