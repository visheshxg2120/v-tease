// Tempo + first-downbeat detection from kick (low band) and snare (1.5–6 kHz) onset envelopes.

const AR = 22050; // analysis sample rate
const HOP = 110; // ≈ 5 ms frames
const FR = AR / HOP;

async function bandSignal(buf: AudioBuffer, setup: (ctx: OfflineAudioContext, src: AudioNode) => AudioNode) {
  const len = Math.ceil(buf.duration * AR);
  const ctx = new OfflineAudioContext(1, len, AR);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  setup(ctx, src).connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

function onsetEnvelope(x: Float32Array): Float32Array {
  const n = Math.floor(x.length / HOP);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j++) s += x[j] * x[j];
    e[i] = Math.log(1 + 1000 * (s / HOP));
  }
  const o = new Float32Array(n);
  let max = 1e-9;
  for (let i = 1; i < n; i++) {
    o[i] = Math.max(0, e[i] - e[i - 1]);
    max = Math.max(max, o[i]);
  }
  for (let i = 0; i < n; i++) o[i] /= max;
  return o;
}

const interp = (o: Float32Array, f: number) => {
  const i = Math.floor(f);
  if (i < 0 || i >= o.length - 1) return 0;
  const k = f - i;
  return o[i] * (1 - k) + o[i + 1] * k;
};

/** Max onset within ±r frames of f. */
const peakNear = (o: Float32Array, f: number, r = 3) => {
  let m = 0;
  for (let d = -r; d <= r; d++) m = Math.max(m, interp(o, f + d));
  return m;
};

export interface BeatAnalysis {
  bpm: number;
  downbeat: number;
  confidence: number;
}

export async function detectBeats(buf: AudioBuffer): Promise<BeatAnalysis> {
  const low = onsetEnvelope(
    await bandSignal(buf, (ctx, src) => {
      const a = ctx.createBiquadFilter();
      a.type = 'lowpass';
      a.frequency.value = 150;
      const b = ctx.createBiquadFilter();
      b.type = 'lowpass';
      b.frequency.value = 150;
      src.connect(a).connect(b);
      return b;
    }),
  );
  const high = onsetEnvelope(
    await bandSignal(buf, (ctx, src) => {
      const a = ctx.createBiquadFilter();
      a.type = 'highpass';
      a.frequency.value = 1500;
      const b = ctx.createBiquadFilter();
      b.type = 'lowpass';
      b.frequency.value = 6000;
      src.connect(a).connect(b);
      return b;
    }),
  );
  const n = Math.min(low.length, high.length);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = low[i] + 0.7 * high[i];

  // 1. coarse tempo: weighted autocorrelation over 70–180 BPM
  let bestLag = 0;
  let bestScore = -1;
  let total = 0;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = (FR * 60) / bpm;
    let s = 0;
    for (let i = 0; i + lag + 1 < n; i += 1) s += o[i] * interp(o, i + lag);
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.9, 2));
    const score = s * prior;
    total += score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const coarse = (FR * 60) / bestLag;

  // 2. fine tempo + phase: comb score over the beat grid
  let best = { bpm: coarse, phase: 0, score: -1 };
  for (let bpm = coarse - 1.5; bpm <= coarse + 1.5; bpm += 0.02) {
    const P = (FR * 60) / bpm;
    for (let ph = 0; ph < P; ph += 1) {
      let s = 0;
      let k = 0;
      for (let f = ph; f < n - 1; f += P) {
        s += interp(o, f);
        k++;
      }
      s /= Math.max(1, k);
      if (s > best.score) best = { bpm, phase: ph, score: s };
    }
  }
  const P = (FR * 60) / best.bpm;

  // 3. first downbeat = first grid beat carrying a strong kick
  const beatsLow: number[] = [];
  for (let f = best.phase; f < n - 1; f += P) beatsLow.push(peakNear(low, f));
  const maxLow = Math.max(...beatsLow, 1e-6);
  let k0 = beatsLow.findIndex((v) => v >= 0.35 * maxLow);
  if (k0 < 0) k0 = 0;
  let f0 = best.phase + k0 * P;
  // snap to the actual kick peak within ±30 ms
  let bestF = f0;
  let bestV = -1;
  for (let d = -6; d <= 6; d++) {
    const v = low[Math.round(f0 + d)] ?? 0;
    if (v > bestV) {
      bestV = v;
      bestF = f0 + d;
    }
  }
  f0 = bestF;
  const confidence = Math.min(1, (bestScore / (total / 221)) / 4);
  return {
    bpm: Math.round(best.bpm * 100) / 100,
    downbeat: Math.max(0, f0 / FR - 0.002),
    confidence,
  };
}

/** Min/max peaks per bucket for waveform drawing. */
export interface Peaks {
  rate: number; // buckets per second
  min: Float32Array;
  max: Float32Array;
}

export function computePeaks(buf: AudioBuffer, rate = 200): Peaks {
  const n = Math.ceil(buf.duration * rate);
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  const per = buf.sampleRate / rate;
  for (let i = 0; i < n; i++) {
    let lo = 0;
    let hi = 0;
    const a = Math.floor(i * per);
    const b = Math.min(buf.length, Math.floor((i + 1) * per));
    for (let j = a; j < b; j += 2) {
      let v = 0;
      for (const c of chans) v += c[j];
      v /= chans.length;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[i] = lo;
    max[i] = hi;
  }
  return { rate, min, max };
}

/** Normalised RMS envelope (10 ms) for driving the pill waveform. */
export function rmsEnvelope(buf: AudioBuffer, rate = 100): { env: Float32Array; rate: number } {
  const x = buf.getChannelData(0);
  const per = Math.floor(buf.sampleRate / rate);
  const n = Math.ceil(x.length / per);
  const env = new Float32Array(n);
  let max = 1e-9;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const end = Math.min(x.length, (i + 1) * per);
    for (let j = i * per; j < end; j++) s += x[j] * x[j];
    env[i] = Math.sqrt(s / per);
    max = Math.max(max, env[i]);
  }
  for (let i = 0; i < n; i++) env[i] = Math.pow(env[i] / max, 0.7);
  return { env, rate };
}

/** RMS over the active (non-silent) part of a buffer. */
export function activeRms(buf: AudioBuffer): number {
  const x = buf.getChannelData(0);
  const win = Math.floor(buf.sampleRate * 0.02);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i + win < x.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += x[j] * x[j];
    const r = Math.sqrt(s / win);
    if (r > 0.004) {
      sum += s;
      cnt += win;
    }
  }
  return cnt ? Math.sqrt(sum / cnt) : 0;
}
