import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { rt } from '../state/runtime';
import type { Framing, Rect, ShotBlock } from '../model/types';
import { shotSourceAt } from '../model/beats';
import { framingCrop } from '../render/camera';
import { Btn, Num, Slider } from './controls';

/** Edit a shot's start/end framing on the full source frame: drag a window rect or click an anchor. */
export function FramingEditor() {
  const fe = useStore((s) => s.framingEdit)!;
  const p = useStore((s) => s.project);
  const shot = p.blocks.find((b) => b.id === fe.blockId) as ShotBlock | undefined;
  const src = shot && p.sources.find((s) => s.id === shot.sourceId);
  const initial = shot ? (fe.which === 'start' ? shot.framingStart : shot.framingEnd) : ({ kind: 'full' } as Framing);
  const [f, setF] = useState<Framing>(initial);
  const beatAt = shot ? (fe.which === 'start' ? Math.min(shot.moveAt, 0.01) : shot.moveAt + shot.moveBeats) : 0;
  const [srcT, setSrcT] = useState(() => (shot ? shotSourceAt(p, shot, beatAt).src : 0));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [frameTick, setFrameTick] = useState(0);

  const W = 1200;
  const H = src ? Math.round((W * src.height) / src.width) : 750;
  const sc = src ? W / src.width : 1;

  // fetch frame
  useEffect(() => {
    if (!src) return;
    let alive = true;
    (async () => {
      if (src.kind === 'video') await rt.scrubSource(src)?.seekExact(srcT);
      if (alive) setFrameTick((x) => x + 1);
    })();
    return () => {
      alive = false;
    };
  }, [srcT, src]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !src) return;
    const g = c.getContext('2d')!;
    const img = src.kind === 'demo' ? rt.demoSource().frame(srcT) : rt.scrubSource(src)?.el;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (img) g.drawImage(img, 0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    const crop = framingCrop(f, src, p.card.w, p.card.h);
    // dim outside crop
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(crop.x * sc, crop.y * sc, crop.w * sc, crop.h * sc);
    g.fill('evenodd');
    g.restore();
    g.strokeStyle = '#7C9CFF';
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.strokeRect(crop.x * sc, crop.y * sc, crop.w * sc, crop.h * sc);
    g.setLineDash([]);
    const r = draft ?? (f.kind === 'window' ? f.rect : null);
    if (r) {
      g.strokeStyle = '#FFD166';
      g.lineWidth = 2;
      g.strokeRect(r.x * sc, r.y * sc, r.w * sc, r.h * sc);
    }
    if (f.kind === 'anchor') {
      g.strokeStyle = '#FFD166';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(f.x * sc, f.y * sc, 10, 0, Math.PI * 2);
      g.moveTo(f.x * sc, 0);
      g.lineTo(f.x * sc, H);
      g.stroke();
    }
  }, [f, draft, frameTick, src, srcT, p.card, H, sc]);

  if (!shot || !src) return null;

  const toSrc = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * src.width, y: ((e.clientY - r.top) / r.height) * src.height };
  };

  const onDown = (e: React.PointerEvent) => {
    const pt = toSrc(e);
    if (f.kind === 'anchor') {
      setF({ ...f, x: Math.round(pt.x), y: Math.round(pt.y) });
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = pt;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const pt = toSrc(e);
    const a = drag.current;
    setDraft({ x: Math.min(a.x, pt.x), y: Math.min(a.y, pt.y), w: Math.abs(pt.x - a.x), h: Math.abs(pt.y - a.y) });
  };
  const onUp = () => {
    if (draft && draft.w > 20 && draft.h > 20) {
      const rect = { x: Math.round(draft.x), y: Math.round(draft.y), w: Math.round(draft.w), h: Math.round(draft.h) };
      setF({ kind: 'window', rect, inset: f.kind === 'window' ? f.inset : 28 });
    }
    drag.current = null;
    setDraft(null);
  };

  const apply = () => {
    useStore.getState().updateBlock(shot.id, (b) => {
      if (b.kind !== 'shot') return;
      if (fe.which === 'start') b.framingStart = f;
      else b.framingEnd = f;
    });
    useStore.getState().setFramingEdit(null);
  };

  return (
    <div className="framing-editor">
      <div className="fe-bar">
        <strong>{fe.which === 'start' ? 'Start' : 'End'} framing</strong>
        <div className="seg">
          <button className={f.kind === 'full' ? 'on' : ''} onClick={() => setF({ kind: 'full' })}>
            Full
          </button>
          <button
            className={f.kind === 'anchor' ? 'on' : ''}
            onClick={() => setF({ kind: 'anchor', x: src.width / 2, y: 30, zoom: 3, label: 'Anchor' })}
          >
            Anchor
          </button>
          <button
            className={f.kind === 'window' ? 'on' : ''}
            onClick={() =>
              setF({ kind: 'window', rect: { x: src.width * 0.25, y: src.height * 0.2, w: src.width * 0.5, h: src.height * 0.6 }, inset: 28 })
            }
          >
            Window
          </button>
        </div>
        {f.kind === 'anchor' && (
          <>
            <span className="muted">zoom</span>
            <Num value={f.zoom} step={0.1} min={1} max={12} onChange={(v) => setF({ ...f, zoom: v })} width={64} />
            <span className="muted">click the frame to place the anchor</span>
          </>
        )}
        {f.kind === 'window' && (
          <>
            <span className="muted">inset</span>
            <Num value={f.inset} step={2} min={0} max={200} onChange={(v) => setF({ ...f, inset: v })} suffix="px" width={70} />
            <span className="muted">drag a rect around the window</span>
          </>
        )}
        <span className="spacer" />
        <Btn onClick={() => useStore.getState().setFramingEdit(null)} kind="ghost">
          Cancel
        </Btn>
        <Btn onClick={apply} kind="primary">
          Apply
        </Btn>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="fe-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      />
      <div className="fe-scrub">
        <span className="muted mono">source {srcT.toFixed(2)}s</span>
        <Slider value={srcT} min={0} max={src.duration} step={0.02} onChange={setSrcT} />
      </div>
    </div>
  );
}
