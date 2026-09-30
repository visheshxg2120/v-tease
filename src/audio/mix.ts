import type { CommandBlock, Project } from '../model/types';
import { beatToTime, musicFileOffset, projectDuration } from '../model/beats';
import { activeRms } from './analyze';
import { popSfx, thumpSfx, whooshSfx, WHOOSH_LEN } from './sfx';
import { limitInPlace } from './limiter';
import { rt } from '../state/runtime';

export const MIX_RATE = 48000;
const db = (v: number) => Math.pow(10, v / 20);

export interface VoiceEvent {
  cmd: CommandBlock;
  start: number;
  end: number;
  buffer: AudioBuffer;
}

export function voiceEvents(p: Project): VoiceEvent[] {
  const out: VoiceEvent[] = [];
  for (const b of p.blocks) {
    if (b.kind !== 'command') continue;
    const buffer = rt.voiceBuffer(b);
    if (!buffer) continue;
    const start = beatToTime(p, b.start + b.voiceOffset);
    out.push({ cmd: b, start, end: start + buffer.duration, buffer });
  }
  return out;
}

/** Reveal SFX: whoosh into the landing, thump on it. */
export function revealTimes(p: Project): number[] {
  return p.blocks
    .filter((b) => b.kind === 'shot' && b.reveal)
    .map((b) => beatToTime(p, b.start + (b.kind === 'shot' ? b.moveAt + b.moveBeats : 0)));
}

/** Music gain curve (fades + ducking) sampled at `rate` Hz over the timeline. */
export function musicGainCurve(p: Project, voices: VoiceEvent[], dur: number, rate = 200) {
  const m = p.music;
  const n = Math.ceil(dur * rate) + 1;
  const g = new Float32Array(n);
  const enter = beatToTime(p, m.enterBeat);
  const end = m.endBeat != null ? beatToTime(p, m.endBeat) : dur;
  const duck = db(m.duckDb);
  const atk = 0.12;
  const rel = 0.35;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = db(m.gainDb);
    if (m.fadeIn > 0) v *= Math.min(1, Math.max(0, (t - enter) / m.fadeIn));
    if (m.fadeOut > 0) v *= Math.min(1, Math.max(0, (end - t) / m.fadeOut));
    let d = 1;
    for (const e of voices) {
      let k = 0;
      if (t >= e.start && t <= e.end) k = 1;
      else if (t < e.start && t > e.start - atk) k = 1 - (e.start - t) / atk;
      else if (t > e.end && t < e.end + rel) k = 1 - (t - e.end) / rel;
      if (k > 0) {
        const sk = k * k * (3 - 2 * k);
        d = Math.min(d, 1 + (duck - 1) * sk);
      }
    }
    g[i] = v * d;
  }
  return g;
}

export async function mixProject(p: Project): Promise<AudioBuffer> {
  const dur = projectDuration(p) + 0.05;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * MIX_RATE), MIX_RATE);
  const voices = voiceEvents(p);

  // music
  const m = p.music;
  const music = m.assetId ? rt.audio.get(m.assetId) : null;
  if (music) {
    const fileOffset = musicFileOffset(p);
    const enter = beatToTime(p, m.enterBeat);
    const startT = Math.max(0, enter, fileOffset);
    const fileStart = startT - fileOffset;
    const end = m.endBeat != null ? beatToTime(p, m.endBeat) : dur;
    if (fileStart < music.duration && end > startT) {
      const src = ctx.createBufferSource();
      src.buffer = music;
      const gain = ctx.createGain();
      const curve = musicGainCurve(p, voices, dur, 200);
      gain.gain.setValueCurveAtTime(curve, 0, (curve.length - 1) / 200);
      src.connect(gain).connect(ctx.destination);
      src.start(startT, fileStart, end - startT);
    }
  }

  // voice bus: highpass + presence lift
  const vbus = ctx.createGain();
  vbus.gain.value = db(p.mix.voiceGainDb);
  if (p.mix.presence) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 3200;
    pk.Q.value = 0.9;
    pk.gain.value = 3;
    vbus.connect(hp).connect(pk).connect(ctx.destination);
  } else {
    vbus.connect(ctx.destination);
  }
  for (const v of voices) {
    const rms = activeRms(v.buffer) || 0.1;
    const g = ctx.createGain();
    g.gain.value = Math.min(10, db(p.mix.voiceRmsDb) / rms) * db(v.cmd.gainDb);
    const s = ctx.createBufferSource();
    s.buffer = v.buffer;
    s.connect(g).connect(vbus);
    s.start(v.start);
  }

  // sfx
  const sfx = ctx.createGain();
  sfx.gain.value = db(p.mix.sfxGainDb);
  sfx.connect(ctx.destination);
  const play = (buf: AudioBuffer, t: number, gain = 1) => {
    if (t < 0) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(sfx);
    s.start(t);
  };
  const [pop, whoosh, thump] = await Promise.all([popSfx(), whooshSfx(), thumpSfx()]);
  for (const b of p.blocks) if (b.kind === 'command' && b.pop) play(pop, beatToTime(p, b.start), 0.7);
  for (const t of revealTimes(p)) {
    play(whoosh, Math.max(0, t - WHOOSH_LEN), 0.8);
    play(thump, t, 1);
  }

  const out = await ctx.startRendering();
  limitInPlace([out.getChannelData(0), out.getChannelData(1)], out.sampleRate, p.mix.ceilingDb);
  return out;
}

/** Everything the mix depends on — used to know when to re-mix. */
export function audioKey(p: Project): string {
  return JSON.stringify({
    m: p.music,
    x: p.mix,
    e: p.endBeat,
    c: p.blocks
      .filter((b) => b.kind === 'command')
      .map((b) => (b.kind === 'command' ? [b.start, b.voiceOffset, b.text, b.voice, b.gainDb, b.pop] : 0)),
    r: p.blocks.filter((b) => b.kind === 'shot' && b.reveal).map((b) => (b.kind === 'shot' ? [b.start, b.moveAt, b.moveBeats] : 0)),
    d: p.blocks.map((b) => b.start + b.length),
  });
}
