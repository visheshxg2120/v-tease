// Cursor detection by frame differencing at low resolution.
// Moving pointer → small changed blobs; the blob that got *darker* is where the (black) arrow
// now is. Large blobs are UI reactions, used to guess clicks (pointer at rest → UI changes nearby).

export interface CursorSample {
  t: number;
  x: number;
  y: number;
  visible: boolean;
}

export interface CursorDetection {
  track: CursorSample[];
  clicks: number[];
}

export function lookupTrack(track: CursorSample[], t: number) {
  if (track.length === 0) return null;
  let lo = 0;
  let hi = track.length - 1;
  if (t <= track[0].t) return track[0];
  if (t >= track[hi].t) return track[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  if (!a.visible || !b.visible) return a;
  const k = (t - a.t) / (b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, visible: true };
}

export async function detectCursor(
  getFrame: (t: number) => Promise<CanvasImageSource>,
  srcW: number,
  srcH: number,
  duration: number,
  onProgress: (f: number) => void,
  fps = 15,
): Promise<CursorDetection> {
  const aw = 640;
  const ah = Math.round((aw * srcH) / srcW);
  const sc = srcW / aw;
  const canvas = document.createElement('canvas');
  canvas.width = aw;
  canvas.height = ah;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const N = aw * ah;
  let prev: Uint8Array | null = null;
  const mask = new Uint8Array(N);
  const label = new Int32Array(N);
  const stack = new Int32Array(N);
  const maxBlob = aw * 0.05;
  const track: CursorSample[] = [];
  const bigChanges: { t: number; x: number; y: number }[] = [];
  let last: { x: number; y: number } | null = null;

  const steps = Math.floor(duration * fps);
  for (let s = 0; s <= steps; s++) {
    const t = s / fps;
    g.drawImage(await getFrame(t), 0, 0, aw, ah);
    const px = g.getImageData(0, 0, aw, ah).data;
    const cur = new Uint8Array(N);
    for (let i = 0; i < N; i++) cur[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
    let found: { x: number; y: number } | null = null;
    if (prev) {
      for (let i = 0; i < N; i++) mask[i] = Math.abs(cur[i] - prev[i]) > 24 ? 1 : 0;
      label.fill(0);
      let nextLabel = 1;
      const cands: { x: number; y: number }[] = [];
      for (let i = 0; i < N; i++) {
        if (!mask[i] || label[i]) continue;
        // flood fill
        let sp = 0;
        stack[sp++] = i;
        label[i] = nextLabel;
        let minX = aw, maxX = 0, minY = ah, maxY = 0, cnt = 0, dx = 0, dy = 0, dn = 0;
        while (sp > 0) {
          const k = stack[--sp];
          const x = k % aw;
          const y = (k / aw) | 0;
          cnt++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (cur[k] < prev[k]) {
            dx += x;
            dy += y;
            dn++;
          }
          const nb = [k - 1, k + 1, k - aw, k + aw];
          for (const q of nb) {
            if (q < 0 || q >= N || !mask[q] || label[q]) continue;
            if ((q === k - 1 && x === 0) || (q === k + 1 && x === aw - 1)) continue;
            label[q] = nextLabel;
            stack[sp++] = q;
          }
        }
        nextLabel++;
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        if (bw <= maxBlob && bh <= maxBlob && cnt >= 3) {
          if (dn > 0) cands.push({ x: (dx / dn) * sc, y: (dy / dn) * sc });
        } else if (cnt > 200) {
          bigChanges.push({ t, x: ((minX + maxX) / 2) * sc, y: ((minY + maxY) / 2) * sc });
        }
      }
      if (cands.length) {
        cands.sort((a, b) =>
          last ? Math.hypot(a.x - last!.x, a.y - last!.y) - Math.hypot(b.x - last!.x, b.y - last!.y) : 0,
        );
        found = cands[0];
      }
    }
    if (found) last = found;
    track.push(last ? { t, x: last.x, y: last.y, visible: true } : { t, x: 0, y: 0, visible: false });
    prev = cur;
    if (s % 5 === 0) {
      onProgress(s / steps);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // click guess: pointer at rest ≥0.2s, then a big UI change within 0.5s near the pointer
  const clicks: number[] = [];
  const restFrames = Math.ceil(0.2 * fps);
  for (let i = restFrames; i < track.length; i++) {
    const p = track[i];
    if (!p.visible) continue;
    let still = true;
    for (let j = i - restFrames; j < i; j++) {
      if (!track[j].visible || Math.hypot(track[j].x - p.x, track[j].y - p.y) > srcW * 0.004) still = false;
    }
    if (!still) continue;
    const hit = bigChanges.find((c) => c.t > p.t && c.t - p.t < 0.5 && Math.hypot(c.x - p.x, c.y - p.y) < srcW * 0.25);
    const ct = hit ? Math.round((hit.t - 1 / fps) * 100) / 100 : 0;
    if (hit && !clicks.some((c) => Math.abs(c - ct) < 0.8)) clicks.push(ct);
  }
  onProgress(1);
  return { track, clicks };
}
