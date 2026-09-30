import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Project } from '../model/types';
import { activeVideoBlock, projectDuration, shotSourceAt, timeToBeat } from '../model/beats';
import { renderFrame } from '../render/compose';
import { mixProject } from '../audio/mix';
import { rt } from '../state/runtime';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
  onProgress: (fraction: number, label: string) => void;
  signal: AbortSignal;
}

// H.264 first; VP9-in-MP4 as a fallback for browsers without an H.264 encoder.
const VIDEO_CODECS: [string, 'avc' | 'vp9'][] = [
  ['avc1.640033', 'avc'],
  ['avc1.64002A', 'avc'],
  ['avc1.4D0033', 'avc'],
  ['avc1.42003E', 'avc'],
  ['vp09.00.41.08', 'vp9'],
];

async function pickVideoCodec(o: ExportOptions) {
  for (const [codec, mux] of VIDEO_CODECS) {
    const cfg: VideoEncoderConfig = {
      codec,
      width: o.width,
      height: o.height,
      bitrate: o.videoBitrate,
      framerate: o.fps,
      latencyMode: 'quality',
      ...(mux === 'avc' ? { avc: { format: 'avc' as const } } : {}),
    };
    const s = await VideoEncoder.isConfigSupported(cfg).catch(() => null);
    if (s?.supported) return { cfg, mux };
  }
  throw new Error('No supported video encoder config (WebCodecs). Try Chrome/Edge.');
}

async function pickAudioCodec(sampleRate: number) {
  for (const [codec, mux] of [
    ['mp4a.40.2', 'aac'],
    ['opus', 'opus'],
  ] as const) {
    const cfg: AudioEncoderConfig = { codec, sampleRate, numberOfChannels: 2, bitrate: 256000 };
    const s = await AudioEncoder.isConfigSupported(cfg).catch(() => null);
    if (s?.supported) return { cfg, mux };
  }
  return null;
}

/** Make sure the video frame needed at timeline time t is decoded (frame-exact seek). */
async function prepareFrame(p: Project, t: number) {
  const vb = activeVideoBlock(p, timeToBeat(p, t));
  if (!vb || vb.kind !== 'shot') return;
  const src = p.sources.find((s) => s.id === vb.sourceId);
  if (!src || src.kind !== 'video') return;
  const vs = rt.videos.get(src.id);
  if (!vs) return;
  const local = timeToBeat(p, t) - vb.start;
  const st = Math.min(shotSourceAt(p, vb, local).src, src.duration - 0.01);
  await vs.seekExact(st);
}

export async function exportMp4(p: Project, o: ExportOptions): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs is not available in this browser.');
  o.onProgress(0, 'Mixing audio…');
  const mix = await mixProject(p);
  const duration = projectDuration(p);
  const vcodec = await pickVideoCodec(o);
  const acodec = await pickAudioCodec(mix.sampleRate);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: vcodec.mux, width: o.width, height: o.height, frameRate: o.fps },
    audio: acodec ? { codec: acodec.mux, numberOfChannels: 2, sampleRate: mix.sampleRate } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encErr: Error | null = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encErr = e),
  });
  venc.configure(vcodec.cfg);

  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const g = canvas.getContext('2d', { alpha: false })!;
  const env = rt.env(p);
  const frames = Math.ceil(duration * o.fps);
  const frameDur = 1e6 / o.fps;
  rt.exporting = true;
  try {
    for (let i = 0; i < frames; i++) {
      if (o.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (encErr) throw encErr;
      const t = i / o.fps;
      await prepareFrame(p, t);
      renderFrame(g, p, t, env);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
      venc.encode(vf, { keyFrame: i % (o.fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1));
      if (i % 10 === 0) o.onProgress((i / frames) * 0.95, `Rendering frame ${i} / ${frames}`);
    }
    await venc.flush();

    if (acodec) {
      o.onProgress(0.96, 'Encoding audio…');
      const aenc = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => (encErr = e),
      });
      aenc.configure(acodec.cfg);
      const L = mix.getChannelData(0);
      const R = mix.getChannelData(1);
      const total = Math.min(mix.length, Math.ceil(duration * mix.sampleRate));
      const block = 4800;
      for (let s = 0; s < total; s += block) {
        const n = Math.min(block, total - s);
        const data = new Float32Array(n * 2);
        data.set(L.subarray(s, s + n), 0);
        data.set(R.subarray(s, s + n), n);
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: mix.sampleRate,
          numberOfFrames: n,
          numberOfChannels: 2,
          timestamp: Math.round((s / mix.sampleRate) * 1e6),
          data,
        });
        aenc.encode(ad);
        ad.close();
      }
      await aenc.flush();
    }
    if (encErr) throw encErr;
    muxer.finalize();
    o.onProgress(1, 'Done');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    rt.exporting = false;
    if (venc.state !== 'closed') venc.close();
  }
}

