// Transport: plays the offline-rendered mix (so preview audio == export audio) and drives the playhead.

import { useStore } from './store';
import { rt } from './runtime';
import { audioKey, mixProject } from '../audio/mix';
import { projectDuration } from '../model/beats';

class Player {
  private node: AudioBufferSourceNode | null = null;
  private startCtx = 0;
  private startPos = 0;
  private startPerf = 0;
  private raf = 0;

  position() {
    if (this.node) return this.startPos + (rt.audioCtx().currentTime - this.startCtx);
    return this.startPos + (performance.now() - this.startPerf) / 1000;
  }

  private startAudio(from: number) {
    this.stopAudio();
    const ctx = rt.audioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    this.startPos = from;
    this.startPerf = performance.now();
    if (rt.mix && from < rt.mix.duration) {
      const n = ctx.createBufferSource();
      n.buffer = rt.mix;
      n.connect(ctx.destination);
      n.start(ctx.currentTime + 0.01, from);
      this.startCtx = ctx.currentTime + 0.01;
      this.node = n;
    }
  }

  private stopAudio() {
    if (this.node) {
      try {
        this.node.stop();
      } catch {
        /* already stopped */
      }
      this.node.disconnect();
      this.node = null;
    }
  }

  play() {
    const s = useStore.getState();
    const dur = projectDuration(s.project);
    const from = s.playhead >= dur - 0.02 ? 0 : s.playhead;
    this.startAudio(from);
    s.setPlaying(true);
    const tick = () => {
      const st = useStore.getState();
      if (!st.playing) return;
      const pos = this.position();
      const d = projectDuration(st.project);
      if (pos >= d) {
        st.setPlayhead(d);
        this.pause();
        return;
      }
      st.setPlayhead(pos);
      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.stopAudio();
    useStore.getState().setPlaying(false);
  }

  toggle() {
    if (useStore.getState().playing) this.pause();
    else this.play();
  }

  /** Jump while playing keeps playing from the new spot. */
  seek(t: number) {
    const s = useStore.getState();
    s.setPlayhead(t);
    if (s.playing) this.startAudio(useStore.getState().playhead);
  }

  /** Re-attach audio after a re-mix without interrupting the transport. */
  refresh() {
    if (useStore.getState().playing) this.startAudio(this.position());
  }
}

export const player = new Player();

// ---- keep media loaded and the mix fresh ----

let lastAssetsKey = '';
let lastAudioKey = '';
let mixTimer: ReturnType<typeof setTimeout> | undefined;
let mixSeq = 0;

async function remix() {
  const seq = ++mixSeq;
  const p = useStore.getState().project;
  rt.mixing = true;
  rt.bump();
  try {
    await rt.ensureVoices(p);
    const buf = await mixProject(p);
    if (seq !== mixSeq) return;
    rt.mix = buf;
    player.refresh();
  } catch (e) {
    console.error('mix failed', e);
  } finally {
    if (seq === mixSeq) {
      rt.mixing = false;
      rt.bump();
    }
  }
}

export function scheduleRemix(delay = 180) {
  clearTimeout(mixTimer);
  mixTimer = setTimeout(remix, delay);
}

async function sync() {
  const p = useStore.getState().project;
  const ak = JSON.stringify([p.assets.map((a) => a.id), p.sources.map((s) => s.id)]);
  if (ak !== lastAssetsKey) {
    lastAssetsKey = ak;
    await rt.loadProject(p);
    lastAudioKey = '';
  }
  const k = audioKey(useStore.getState().project);
  if (k !== lastAudioKey) {
    lastAudioKey = k;
    scheduleRemix();
  }
}

export function startSync() {
  sync();
  useStore.subscribe((s, prev) => {
    if (s.project !== prev.project) sync();
  });
}
