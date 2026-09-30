import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from '../state/store';
import { rt } from '../state/runtime';
import { renderFrame } from '../render/compose';
import { activeVideoBlock, formatBarBeat, shotSourceAt, timeToBeat } from '../model/beats';
import { FramingEditor } from './FramingEditor';

function syncVideos() {
  const s = useStore.getState();
  const p = s.project;
  const beat = timeToBeat(p, s.playhead);
  const vb = activeVideoBlock(p, beat);
  let activeId: string | null = null;
  if (vb?.kind === 'shot') {
    const src = p.sources.find((x) => x.id === vb.sourceId);
    const vs = src && rt.videos.get(src.id);
    if (src && vs) {
      activeId = src.id;
      const { src: st, rate } = shotSourceAt(p, vb, beat - vb.start);
      vs.sync(Math.min(st, src.duration - 0.01), s.playing, rate);
    }
  }
  for (const [id, vs] of rt.videos) if (id !== activeId) vs.pause();
}

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framingEdit = useStore((s) => s.framingEdit);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d', { alpha: false })!;
    let raf = 0;
    const draw = () => {
      raf = 0;
      if (rt.exporting) return;
      const s = useStore.getState();
      syncVideos();
      renderFrame(g, s.project, s.playhead, rt.env(s.project), { guides: true });
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const u1 = useStore.subscribe(req);
    const u2 = rt.subscribe(req);
    document.fonts.ready.then(() => {
      rt.demo?.reset();
      req();
    });
    req();
    return () => {
      u1();
      u2();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="preview">
      <div className="preview-stage">
        <canvas ref={canvasRef} width={1920} height={1080} className="preview-canvas" />
        {framingEdit && <FramingEditor key={framingEdit.blockId + framingEdit.which} />}
      </div>
      <PreviewInfo />
    </div>
  );
}

function PreviewInfo() {
  const p = useStore((s) => s.project);
  const playhead = useStore((s) => s.playhead);
  useSyncExternalStore(rt.subscribe, rt.getVersion);
  const beat = timeToBeat(p, playhead);
  const vb = activeVideoBlock(p, beat);
  let info = '—';
  if (vb?.kind === 'shot') {
    const { src, rate } = shotSourceAt(p, vb, beat - vb.start);
    info = `Shot · source ${src.toFixed(2)}s · ${rate.toFixed(2)}×${vb.cursor.enabled ? ' · cursor follow' : ''}`;
  } else if (vb?.kind === 'title') info = `Title · “${vb.lines.map((l) => l.text).join(' / ')}”`;
  else if (vb?.kind === 'end') info = 'End card';
  return (
    <div className="preview-info">
      <span className="mono">{formatBarBeat(p, beat)}</span>
      <span>{info}</span>
      <span className="spacer" />
      {rt.mixing && <span className="pill-status">mixing audio…</span>}
      <span className="muted">
        {p.width}×{p.height} · {p.fps}fps · {p.music.bpm} BPM
      </span>
    </div>
  );
}
