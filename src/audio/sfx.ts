// Synthesized SFX + placeholder voice. All rendered offline once and cached.

const SR = 48000;

function noiseBuffer(ctx: BaseAudioContext, secs: number) {
  const b = ctx.createBuffer(1, Math.ceil(SR * secs), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

const cache = new Map<string, Promise<AudioBuffer>>();
const once = (key: string, make: () => Promise<AudioBuffer>) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
};

/** Soft pop for pills. */
export const popSfx = () =>
  once('pop', async () => {
    const ctx = new OfflineAudioContext(1, SR * 0.2, SR);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(820, 0);
    o.frequency.exponentialRampToValueAtTime(420, 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(0.5, 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.12);
    o.connect(g).connect(ctx.destination);
    o.start();
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12, 0);
    ng.gain.exponentialRampToValueAtTime(0.0001, 0.03);
    n.connect(f).connect(ng).connect(ctx.destination);
    n.start();
    return ctx.startRendering();
  });

export const WHOOSH_LEN = 0.55;

/** Whoosh that ends exactly at WHOOSH_LEN (where the thump lands). */
export const whooshSfx = () =>
  once('whoosh', async () => {
    const ctx = new OfflineAudioContext(2, SR * (WHOOSH_LEN + 0.1), SR);
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, WHOOSH_LEN + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, 0);
    f.frequency.exponentialRampToValueAtTime(3200, WHOOSH_LEN);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(0.5, WHOOSH_LEN * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, WHOOSH_LEN + 0.06);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.5, 0);
    p.pan.linearRampToValueAtTime(0.4, WHOOSH_LEN);
    n.connect(f).connect(g).connect(p).connect(ctx.destination);
    n.start();
    return ctx.startRendering();
  });

export const thumpSfx = () =>
  once('thump', async () => {
    const ctx = new OfflineAudioContext(1, SR * 0.6, SR);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, 0);
    o.frequency.exponentialRampToValueAtTime(38, 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(0.9, 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 0.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.4, 0);
    ng.gain.exponentialRampToValueAtTime(0.0001, 0.15);
    n.connect(f).connect(ng).connect(ctx.destination);
    n.start();
    return ctx.startRendering();
  });

/**
 * Placeholder "voice": formant-filtered buzz with one amplitude bump per syllable, paced like a
 * fast read. Stands in until a real TTS/recorded clip exists, so timing, ducking and the pill
 * waveform all work.
 */
export const placeholderVoice = (text: string) =>
  once('voice:' + text, async () => {
    const words = text.split(/\s+/).filter(Boolean);
    const syl = (w: string) => Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length);
    const rate = 6.2; // syllables / s
    const events: { t: number; d: number }[] = [];
    let t = 0.04;
    for (const w of words) {
      const n = syl(w);
      for (let i = 0; i < n; i++) {
        const d = (1 / rate) * (0.8 + Math.random() * 0.4);
        events.push({ t, d });
        t += d;
      }
      t += /[,.!?]$/.test(w) ? 0.16 : 0.035;
    }
    const dur = t + 0.15;
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(128, 0);
    o.frequency.linearRampToValueAtTime(112, dur);
    const amp = ctx.createGain();
    amp.gain.value = 0;
    for (const e of events) {
      amp.gain.setTargetAtTime(0.9, e.t, 0.015);
      amp.gain.setTargetAtTime(0.15, e.t + e.d * 0.7, 0.02);
    }
    amp.gain.setTargetAtTime(0, t, 0.02);
    const out = ctx.createGain();
    out.gain.value = 0.35;
    o.connect(amp);
    [
      [650, 6, 1],
      [1150, 8, 0.6],
      [2600, 10, 0.25],
    ].forEach(([f, q, gn]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gn;
      amp.connect(bp).connect(g).connect(out);
    });
    out.connect(ctx.destination);
    o.start();
    return ctx.startRendering();
  });
