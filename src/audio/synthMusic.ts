// Procedurally generated demo track (112 BPM, A minor) so the sample project needs no files.
// Structure: 1-bar pickup (hats + snare roll, no kick) → downbeat → 2 bars intro → 6 bars full
// → 1 bar breakdown → 3 bars full → final hit + ring-out.

export const DEMO_BPM = 112;

export async function synthDemoTrack(): Promise<AudioBuffer> {
  const sr = 44100;
  const s = 60 / DEMO_BPM;
  const bar = 4 * s;
  const D = bar; // first downbeat
  const bars = 13;
  const dur = D + bars * bar + 3.2;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(comp).connect(ctx.destination);

  const noise = ctx.createBuffer(1, sr * 2, sr);
  const nd = noise.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < nd.length; i++) {
    seed = (seed * 16807) % 2147483647;
    nd[i] = (seed / 2147483647) * 2 - 1;
  }

  const env = (g: GainNode, t: number, peak: number, decay: number, attack = 0.002) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  const noiseHit = (t: number, type: BiquadFilterType, f: number, peak: number, decay: number, pan = 0) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    const g = ctx.createGain();
    env(g, t, peak, decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(fl).connect(g).connect(p).connect(master);
    src.start(t, Math.random() * 1.5, decay + 0.05);
  };
  const kick = (t: number, peak = 1) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    env(g, t, peak, 0.38);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.45);
  };
  const snare = (t: number, peak = 0.5) => {
    noiseHit(t, 'highpass', 1400, peak, 0.17);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 190;
    const g = ctx.createGain();
    env(g, t, peak * 0.6, 0.09);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.12);
  };
  const hat = (t: number, peak = 0.12, open = false) => noiseHit(t, 'highpass', 7500, peak, open ? 0.22 : 0.045, 0.25);
  const crash = (t: number) => noiseHit(t, 'highpass', 3500, 0.35, 2.2, -0.2);
  const tone = (t: number, f: number, d: number, type: OscillatorType, peak: number, lp: number, pan = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.25, d / 3));
    g.gain.setValueAtTime(peak, t + d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(fl).connect(g).connect(p).connect(master);
    o.start(t);
    o.stop(t + d + 0.05);
  };

  const chords = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [261.63, 329.63, 392],
    [196, 246.94, 293.66],
  ];
  const roots = [55, 43.65, 65.41, 49];

  // pickup: hats + snare roll into the downbeat, riser
  for (let i = 0; i < 8; i++) hat(i * (s / 2), 0.08);
  for (let i = 0; i < 8; i++) snare(3 * s + i * (s / 8), 0.08 + i * 0.05);
  {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const fl = ctx.createBiquadFilter();
    fl.type = 'bandpass';
    fl.frequency.setValueAtTime(400, 0);
    fl.frequency.exponentialRampToValueAtTime(6000, D);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(0.25, D - 0.02);
    g.gain.linearRampToValueAtTime(0, D);
    src.connect(fl).connect(g).connect(master);
    src.start(0, 0, D);
  }

  for (let b = 0; b < bars; b++) {
    const t0 = D + b * bar;
    const ci = b % 4;
    const breakdown = b === 8;
    const final = b === 12;
    const full = (b >= 2 && b <= 7) || (b >= 9 && b <= 11);
    if (final) {
      kick(t0, 1);
      crash(t0);
      chords[0].forEach((f, i) => tone(t0, f, 3, 'sawtooth', 0.05, 1600, i - 1));
      tone(t0, roots[0], 2.5, 'sawtooth', 0.3, 300);
      continue;
    }
    if (b === 0 || b === 2 || b === 9) crash(t0);
    chords[ci].forEach((f, i) => {
      tone(t0, f, bar, 'sawtooth', breakdown ? 0.05 : 0.032, breakdown ? 900 : 1500, (i - 1) * 0.6);
      tone(t0, f * 1.004, bar, 'sawtooth', breakdown ? 0.04 : 0.025, 1500, (1 - i) * 0.6);
    });
    for (let k = 0; k < 4; k++) {
      const tb = t0 + k * s;
      if (!breakdown) {
        kick(tb, k === 0 ? 1 : 0.85);
        tone(tb + s / 2, roots[ci], s * 0.45, 'sawtooth', 0.28, 380);
        tone(tb, roots[ci], s * 0.35, 'sawtooth', 0.18, 300);
      }
      hat(tb + s / 2, breakdown ? 0.06 : 0.13, k === 3 && full);
      if (full) {
        hat(tb, 0.06);
        if (k === 1 || k === 3) snare(tb, 0.55);
      }
    }
    if (breakdown) {
      for (let i = 0; i < 8; i++) snare(t0 + 3 * s + i * (s / 8), 0.06 + i * 0.05);
    }
  }
  return ctx.startRendering();
}
