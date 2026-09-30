// Non-serializable runtime state: decoded media, video elements, caches. The project JSON only
// holds ids; everything heavy lives here.

import type { AssetMeta, CommandBlock, Project, Source } from '../model/types';
import { uid } from '../model/beats';
import { getBlob, putBlob } from '../lib/idb';
import { computePeaks, rmsEnvelope, type Peaks } from '../audio/analyze';
import { synthDemoTrack } from '../audio/synthMusic';
import { placeholderVoice } from '../audio/sfx';
import { DemoSource } from '../render/demoSource';
import { demoCursorAt } from '../render/demoLayout';
import { VideoSource } from '../render/videoSource';
import type { RenderEnv, VoiceEnv } from '../render/compose';
import type { CursorLookup } from '../render/camera';
import type { CursorSample } from '../render/cursorDetect';
import { lookupTrack } from '../render/cursorDetect';

type Listener = () => void;

class Runtime {
  version = 0;
  private listeners = new Set<Listener>();
  private ctx: AudioContext | null = null;

  blobs = new Map<string, Blob>();
  urls = new Map<string, string>();
  audio = new Map<string, AudioBuffer>();
  images = new Map<string, HTMLImageElement>();
  peaks = new Map<string, Peaks>();
  missing = new Set<string>();
  videos = new Map<string, VideoSource>();
  demo: DemoSource | null = null;
  placeholders = new Map<string, AudioBuffer>();
  private envelopes = new WeakMap<AudioBuffer, VoiceEnv>();
  cursorTracks = new Map<string, CursorSample[]>();
  cursorVersion = 0;
  mix: AudioBuffer | null = null;
  mixing = false;
  /** Set during export so preview-only shortcuts are off. */
  exporting = false;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  bump() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  audioCtx() {
    this.ctx ??= new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    return this.ctx;
  }

  demoSource() {
    this.demo ??= new DemoSource();
    return this.demo;
  }

  async decodeAudio(blob: Blob) {
    const ab = await blob.arrayBuffer();
    return this.audioCtx().decodeAudioData(ab);
  }

  private async register(meta: AssetMeta, blob: Blob | null) {
    if (meta.builtin === 'demo-music') {
      const buf = await synthDemoTrack();
      this.audio.set(meta.id, buf);
      this.peaks.set(meta.id, computePeaks(buf));
      return;
    }
    if (!blob) {
      this.missing.add(meta.id);
      return;
    }
    this.missing.delete(meta.id);
    this.blobs.set(meta.id, blob);
    const url = URL.createObjectURL(blob);
    this.urls.set(meta.id, url);
    if (meta.type === 'audio') {
      const buf = await this.decodeAudio(blob);
      this.audio.set(meta.id, buf);
      this.peaks.set(meta.id, computePeaks(buf));
    } else if (meta.type === 'image') {
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => {});
      this.images.set(meta.id, img);
    }
  }

  /** Load every asset + source a project references (from IndexedDB / builtins). */
  async loadProject(p: Project) {
    await Promise.all(
      p.assets.map(async (m) => {
        if (this.audio.has(m.id) || this.images.has(m.id) || this.urls.has(m.id)) return;
        const blob = m.builtin ? null : ((await getBlob(m.id).catch(() => undefined)) ?? null);
        await this.register(m, blob).catch((e) => console.warn('asset load failed', m.name, e));
      }),
    );
    for (const s of p.sources) this.ensureSource(s);
    this.bump();
  }

  ensureSource(s: Source) {
    if (s.kind !== 'video' || !s.assetId || this.videos.has(s.id)) return;
    const url = this.urls.get(s.assetId);
    if (!url) return;
    const vs = new VideoSource(url);
    vs.onFrame = () => this.bump();
    this.videos.set(s.id, vs);
  }

  /** Store a file as a new asset. */
  async importFile(file: Blob, name: string, type: AssetMeta['type']): Promise<AssetMeta> {
    const meta: AssetMeta = { id: uid('asset'), name, type, mime: file.type };
    await putBlob(meta.id, file);
    await this.register(meta, file);
    this.bump();
    return meta;
  }

  /** Relink a missing asset with a user-picked file (same id). */
  async relink(meta: AssetMeta, file: Blob) {
    await putBlob(meta.id, file);
    await this.register(meta, file);
    this.bump();
  }

  async probeVideo(assetId: string, name: string): Promise<Source> {
    const url = this.urls.get(assetId)!;
    const vs = new VideoSource(url);
    await vs.ready;
    const src: Source = {
      id: uid('src'),
      name,
      kind: 'video',
      assetId,
      width: vs.width,
      height: vs.height,
      duration: vs.duration,
    };
    vs.onFrame = () => this.bump();
    this.videos.set(src.id, vs);
    return src;
  }

  // ---------- voices ----------

  voiceBuffer(cmd: CommandBlock): AudioBuffer | null {
    const v = cmd.voice;
    if (v.mode === 'none') return null;
    if ((v.mode === 'tts' || v.mode === 'clip') && v.assetId) return this.audio.get(v.assetId) ?? null;
    return this.placeholders.get(cmd.text) ?? null;
  }

  /** Make sure placeholder voices exist for commands without real audio. */
  async ensureVoices(p: Project) {
    let changed = false;
    for (const b of p.blocks) {
      if (b.kind !== 'command' || b.voice.mode === 'none') continue;
      const hasReal = (b.voice.mode === 'tts' || b.voice.mode === 'clip') && b.voice.assetId && this.audio.has(b.voice.assetId);
      if (hasReal || this.placeholders.has(b.text)) continue;
      this.placeholders.set(b.text, await placeholderVoice(b.text));
      changed = true;
    }
    if (changed) this.bump();
  }

  envelope(buf: AudioBuffer): VoiceEnv {
    let e = this.envelopes.get(buf);
    if (!e) {
      e = rmsEnvelope(buf);
      this.envelopes.set(buf, e);
    }
    return e;
  }

  // ---------- cursor ----------

  cursorLookup(sourceId: string, p: Project): CursorLookup {
    const track = this.cursorTracks.get(sourceId);
    if (track) return (t) => lookupTrack(track, t);
    const src = p.sources.find((s) => s.id === sourceId);
    if (src?.kind === 'demo') return demoCursorAt;
    return () => null;
  }

  setCursorTrack(sourceId: string, track: CursorSample[]) {
    this.cursorTracks.set(sourceId, track);
    this.cursorVersion++;
    this.bump();
  }

  // ---------- render env ----------

  env(p: Project): RenderEnv {
    return {
      sourceImage: (src, t) => {
        if (src.kind === 'demo') return this.demoSource().frame(t);
        const vs = this.videos.get(src.id);
        if (!vs || vs.el.readyState < 2) return null;
        return vs.el;
      },
      cursor: (id) => this.cursorLookup(id, p),
      cursorVersion: this.cursorVersion,
      voiceEnvelope: (cmd) => {
        const b = this.voiceBuffer(cmd);
        return b ? this.envelope(b) : null;
      },
      image: (id) => this.images.get(id) ?? null,
    };
  }
}

export const rt = new Runtime();
