import type { Block, Project, ShotBlock, TimePoint } from './types';

export const spb = (p: Project) => 60 / p.music.bpm;
export const beatToTime = (p: Project, beat: number) => beat * spb(p);
export const timeToBeat = (p: Project, t: number) => t / spb(p);

export const blockEnd = (b: Block) => b.start + b.length;

export function projectEndBeat(p: Project): number {
  if (p.endBeat != null) return p.endBeat;
  let end = 0;
  for (const b of p.blocks) end = Math.max(end, blockEnd(b));
  return Math.max(end, 4);
}

export const projectDuration = (p: Project) => beatToTime(p, projectEndBeat(p));

/** Timeline time (s) at which music file time 0 would play. */
export function musicFileOffset(p: Project): number {
  return beatToTime(p, p.music.alignBeat) - p.music.downbeat;
}

/** Bar.beat label, 1-based like a DAW. */
export function formatBarBeat(p: Project, beat: number): string {
  const bpb = p.beatsPerBar;
  const b = Math.max(0, beat);
  const bar = Math.floor(b / bpb) + 1;
  const bt = Math.floor(b % bpb) + 1;
  const frac = Math.floor((b % 1) * 4) + 1;
  return `${bar}.${bt}.${frac}`;
}

export function formatTime(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}

export const snapTo = (v: number, unit: number) => Math.round(v / unit) * unit;

/** Piecewise-linear lookup, clamped extrapolation at the last segment's slope. */
export function mapSourceTime(points: TimePoint[], beat: number): { src: number; rate: number } {
  const pts = points;
  if (pts.length === 0) return { src: 0, rate: 1 };
  if (pts.length === 1) return { src: pts[0].src, rate: 0 };
  let i = 0;
  while (i < pts.length - 2 && beat > pts[i + 1].beat) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const span = b.beat - a.beat || 1e-6;
  const slope = (b.src - a.src) / span;
  return { src: a.src + (beat - a.beat) * slope, rate: slope };
}

/** Source time + playback rate (source seconds per timeline second) for a shot at a local beat. */
export function shotSourceAt(p: Project, shot: ShotBlock, localBeat: number) {
  const { src, rate } = mapSourceTime(shot.timeMap, localBeat);
  return { src: Math.max(0, src), rate: rate / spb(p) };
}

export function activeVideoBlock(p: Project, beat: number) {
  let best: Block | null = null;
  for (const b of p.blocks) {
    if (b.kind !== 'title' && b.kind !== 'shot' && b.kind !== 'end') continue;
    if (beat >= b.start && beat < blockEnd(b) && (!best || b.start >= best.start)) best = b;
  }
  return best as import('./types').VideoBlock | null;
}

export function activeOverlays(p: Project, beat: number) {
  return p.blocks.filter(
    (b) => (b.kind === 'command' || b.kind === 'sticker') && beat >= b.start && beat < blockEnd(b),
  ) as import('./types').OverlayBlock[];
}

/** The video block right before `b` on the video lane. */
export function previousVideoBlock(p: Project, b: Block) {
  let prev: Block | null = null;
  for (const o of p.blocks) {
    if (o.id === b.id || (o.kind !== 'title' && o.kind !== 'shot' && o.kind !== 'end')) continue;
    if (blockEnd(o) <= b.start + 1e-6 && (!prev || blockEnd(o) > blockEnd(prev))) prev = o;
  }
  return prev;
}

let idCounter = 0;
export const uid = (prefix = 'b') =>
  `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
