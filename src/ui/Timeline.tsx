import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore, type Snap } from '../state/store';
import { rt } from '../state/runtime';
import { player } from '../state/player';
import type { Block, Project, ShotBlock } from '../model/types';
import { beatToTime, musicFileOffset, projectEndBeat, snapTo, timeToBeat } from '../model/beats';
import { revealTimes } from '../audio/mix';
import { addBlock } from '../state/actions';
import { Slider } from './controls';

const LANES = [
  { id: 'ruler', label: '', h: 26 },
  { id: 'video', label: 'Video', h: 58 },
  { id: 'overlay', label: 'Overlay', h: 40 },
  { id: 'voice', label: 'Voice', h: 34 },
  { id: 'music', label: 'Music', h: 66 },
  { id: 'sfx', label: 'SFX', h: 22 },
] as const;
type LaneId = (typeof LANES)[number]['id'];
const laneTop = (id: LaneId) => {
  let y = 0;
  for (const l of LANES) {
    if (l.id === id) return y;
    y += l.h;
  }
  return y;
};
const TOTAL_H = LANES.reduce((a, l) => a + l.h, 0);

const KIND_LABEL: Record<Block['kind'], string> = {
  title: 'Title',
  shot: 'Shot',
  end: 'End',
  command: 'Command',
  sticker: 'Sticker',
};

function blockLabel(b: Block) {
  switch (b.kind) {
    case 'title':
      return b.lines.map((l) => l.text).join(' / ');
    case 'shot':
      return `${b.framingStart.kind === 'anchor' ? b.framingStart.label ?? 'anchor' : b.framingStart.kind === 'window' ? b.framingStart.label ?? 'window' : 'full'} → ${
        b.framingEnd.kind === 'anchor' ? b.framingEnd.label ?? 'anchor' : b.framingEnd.kind === 'window' ? b.framingEnd.label ?? 'window' : 'full'
      }${b.cursor.enabled ? ' · cursor' : ''}`;
    case 'end':
      return b.title;
    case 'command':
      return `“${b.text}”`;
    case 'sticker':
      return b.emoji;
  }
}

type DragMode = 'move' | 'l' | 'r' | 'point' | 'music' | 'enter';

export function Timeline() {
  const p = useStore((s) => s.project);
  const ppb = useStore((s) => s.pxPerBeat);
  const snap = useStore((s) => s.snap);
  const selectedId = useStore((s) => s.selectedId);
  const playing = useStore((s) => s.playing);
  useSyncExternalStore(rt.subscribe, rt.getVersion);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const endBeat = projectEndBeat(p) + 8;
  const width = Math.min(32000, endBeat * ppb);

  // background: grid + music waveform + voice envelopes
  useEffect(() => {
    const c = bgRef.current!;
    c.width = width;
    c.height = TOTAL_H;
    const g = c.getContext('2d')!;
    drawBackground(g, p, ppb, width);
  }, [p, ppb, width, rt.version]);

  // playhead follows store without re-rendering the whole timeline
  useEffect(() => {
    const place = () => {
      const s = useStore.getState();
      const x = timeToBeat(s.project, s.playhead) * s.pxPerBeat;
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`;
      const sc = scrollRef.current;
      if (sc && s.playing && (x > sc.scrollLeft + sc.clientWidth - 80 || x < sc.scrollLeft)) sc.scrollLeft = x - 120;
    };
    place();
    return useStore.subscribe(place);
  }, []);

  const drag = useRef<{
    mode: DragMode;
    id?: string;
    idx?: number;
    x0: number;
    orig: Block | null;
    origMusic?: Project['music'];
  } | null>(null);

  const beatFromEvent = (e: { clientX: number }) => {
    const r = scrollRef.current!.getBoundingClientRect();
    return (e.clientX - r.left + scrollRef.current!.scrollLeft) / ppb;
  };

  const startDrag = (e: React.PointerEvent, mode: DragMode, b: Block | null, idx?: number) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (b) useStore.getState().select(b.id);
    drag.current = { mode, id: b?.id, idx, x0: e.clientX, orig: b ? structuredClone(b) : null, origMusic: structuredClone(p.music) };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dBeats = (e.clientX - d.x0) / ppb;
    const st = useStore.getState();
    const key = `drag:${d.mode}:${d.id ?? 'music'}`;
    if (d.mode === 'music' || d.mode === 'enter') {
      const m = d.origMusic!;
      st.update((pp) => {
        if (d.mode === 'music') pp.music.alignBeat = m.alignBeat + Math.round(dBeats);
        else pp.music.enterBeat = Math.max(0, snapTo(m.enterBeat + dBeats, snap));
      }, key);
      return;
    }
    const o = d.orig!;
    st.updateBlock(
      d.id!,
      (b) => {
        if (d.mode === 'move') b.start = Math.max(0, snapTo(o.start + dBeats, snap));
        else if (d.mode === 'r') b.length = Math.max(snap, snapTo(o.length + dBeats, snap));
        else if (d.mode === 'l') {
          const ns = Math.min(o.start + o.length - snap, Math.max(0, snapTo(o.start + dBeats, snap)));
          b.length = o.start + o.length - ns;
          b.start = ns;
        } else if (d.mode === 'point' && b.kind === 'shot' && o.kind === 'shot') {
          const i = d.idx!;
          const lo = (o.timeMap[i - 1]?.beat ?? 0) + 0.25;
          const hi = (o.timeMap[i + 1]?.beat ?? Infinity) - 0.25;
          b.timeMap[i].beat = Math.min(hi, Math.max(lo, snapTo(o.timeMap[i].beat + dBeats, Math.min(snap, 0.5))));
        }
      },
      key,
    );
  };
  const onUp = () => {
    drag.current = null;
  };

  const scrub = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const go = (ev: { clientX: number }) => player.seek(beatToTime(p, Math.max(0, beatFromEvent(ev))));
    go(e);
    const mv = (ev: PointerEvent) => go(ev);
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const st = useStore.getState();
    st.setZoom(st.pxPerBeat * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const music = p.music.assetId ? rt.audio.get(p.music.assetId) : null;
  const mStart = Math.max(p.music.enterBeat, timeToBeat(p, Math.max(0, musicFileOffset(p))));
  const mEnd = music ? timeToBeat(p, musicFileOffset(p) + music.duration) : 0;

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <span className="tl-title">Timeline</span>
        <div className="tl-add">
          {(['shot', 'title', 'command', 'end', 'sticker'] as const).map((k) => (
            <button key={k} className={`chip k-${k}`} onClick={() => addBlock(k)}>
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="muted">Snap</span>
        <select className="select" value={snap} onChange={(e) => useStore.getState().setSnap(Number(e.target.value) as Snap)}>
          <option value={0.25}>1/16</option>
          <option value={0.5}>1/8</option>
          <option value={1}>Beat</option>
          <option value={4}>Bar</option>
        </select>
        <span className="muted">Zoom</span>
        <div style={{ width: 120 }}>
          <Slider value={ppb} min={8} max={160} step={1} onChange={(v) => useStore.getState().setZoom(v)} />
        </div>
      </div>
      <div className="tl-body">
        <div className="tl-heads">
          {LANES.map((l) => (
            <div key={l.id} className="tl-head" style={{ height: l.h }}>
              {l.label}
            </div>
          ))}
        </div>
        <div className="tl-scroll" ref={scrollRef} onWheel={onWheel}>
          <div
            className="tl-content"
            style={{ width, height: TOTAL_H }}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget || (e.target as Element).tagName === 'CANVAS') {
                useStore.getState().select(null);
                player.seek(beatToTime(p, beatFromEvent(e)));
              }
            }}
          >
            <canvas ref={bgRef} className="tl-bg" />
            <div className="tl-ruler" style={{ height: LANES[0].h }} onPointerDown={scrub}>
              {Array.from({ length: Math.ceil(endBeat / p.beatsPerBar) }, (_, i) => (
                <span key={i} className="tl-bar" style={{ left: i * p.beatsPerBar * ppb }}>
                  {i + 1}
                </span>
              ))}
            </div>
            {p.blocks.map((b) => {
              const lane: LaneId = b.kind === 'command' || b.kind === 'sticker' ? 'overlay' : 'video';
              const laneH = LANES.find((l) => l.id === lane)!.h;
              return (
                <div
                  key={b.id}
                  className={`tl-block k-${b.kind} ${b.id === selectedId ? 'sel' : ''}`}
                  style={{ left: b.start * ppb, width: Math.max(4, b.length * ppb - 2), top: laneTop(lane) + 4, height: laneH - 8 }}
                  onPointerDown={(e) => startDrag(e, 'move', b)}
                  title={`${KIND_LABEL[b.kind]} · ${b.length} beats`}
                >
                  {b.kind === 'shot' && <ShotMarks b={b} ppb={ppb} onPoint={(e, i) => startDrag(e, 'point', b, i)} />}
                  <span className="tl-block-label">
                    <b>{KIND_LABEL[b.kind]}</b> {blockLabel(b)}
                  </span>
                  <i className="h l" onPointerDown={(e) => startDrag(e, 'l', b)} />
                  <i className="h r" onPointerDown={(e) => startDrag(e, 'r', b)} />
                </div>
              );
            })}
            {music && (
              <>
                <div
                  className="tl-music"
                  style={{ left: mStart * ppb, width: Math.max(0, (mEnd - mStart) * ppb), top: laneTop('music') + 3, height: LANES[4].h - 6 }}
                  onPointerDown={(e) => startDrag(e, 'music', null)}
                  title="Drag to move the music against the grid (whole beats). Downbeat marker = alignBeat."
                >
                  <span>♪ {p.assets.find((a) => a.id === p.music.assetId)?.name}</span>
                </div>
                <div
                  className="tl-enter"
                  style={{ left: p.music.enterBeat * ppb - 6, top: laneTop('music') }}
                  onPointerDown={(e) => startDrag(e, 'enter', null)}
                  title="Music enters here (drag)"
                />
                <div className="tl-align" style={{ left: p.music.alignBeat * ppb, top: laneTop('music') }} title="First downbeat of the track" />
              </>
            )}
            <div className="tl-playhead" ref={playheadRef} style={{ height: TOTAL_H }} data-playing={playing} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ShotMarks({ b, ppb, onPoint }: { b: ShotBlock; ppb: number; onPoint: (e: React.PointerEvent, i: number) => void }) {
  return (
    <>
      {b.moveBeats > 0 && !b.cursor.enabled && (
        <span className="tl-move" style={{ left: b.moveAt * ppb, width: b.moveBeats * ppb }} title="Camera move" />
      )}
      {b.timeMap.slice(1).map((pt, i) => (
        <span
          key={i}
          className="tl-point"
          style={{ left: pt.beat * ppb }}
          title={`Source ${pt.src.toFixed(2)}s lands on beat ${pt.beat} (drag)`}
          onPointerDown={(e) => onPoint(e, i + 1)}
        />
      ))}
    </>
  );
}

function drawBackground(g: CanvasRenderingContext2D, p: Project, ppb: number, width: number) {
  g.clearRect(0, 0, width, TOTAL_H);
  const beats = Math.ceil(width / ppb);
  // lane separators
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (const l of LANES) g.fillRect(0, laneTop(l.id) + l.h - 1, width, 1);
  for (let i = 0; i <= beats; i++) {
    const x = Math.round(i * ppb) + 0.5;
    const bar = i % p.beatsPerBar === 0;
    g.fillStyle = bar ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
    g.fillRect(x, bar ? 0 : 14, 1, TOTAL_H);
    if (ppb >= 40 && !bar) {
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.font = '10px Geist, system-ui';
      g.fillText(String((i % p.beatsPerBar) + 1), x + 3, 22);
    }
  }
  // music waveform
  const m = p.music;
  const peaks = m.assetId ? rt.peaks.get(m.assetId) : null;
  if (peaks) {
    const top = laneTop('music');
    const h = LANES[4].h;
    const mid = top + h / 2;
    const off = musicFileOffset(p);
    const enterT = beatToTime(p, m.enterBeat);
    const endT = m.endBeat != null ? beatToTime(p, m.endBeat) : Infinity;
    for (let x = 0; x < width; x++) {
      const t0 = beatToTime(p, x / ppb);
      const t1 = beatToTime(p, (x + 1) / ppb);
      const f0 = Math.floor((t0 - off) * peaks.rate);
      const f1 = Math.max(f0 + 1, Math.floor((t1 - off) * peaks.rate));
      if (f1 < 0 || f0 >= peaks.min.length) continue;
      let lo = 0;
      let hi = 0;
      for (let f = Math.max(0, f0); f < Math.min(peaks.min.length, f1); f++) {
        lo = Math.min(lo, peaks.min[f]);
        hi = Math.max(hi, peaks.max[f]);
      }
      const active = t0 >= enterT && t0 < endT && t0 >= 0;
      g.fillStyle = active ? 'rgba(124,156,255,0.85)' : 'rgba(124,156,255,0.22)';
      g.fillRect(x, mid - hi * (h / 2 - 4), 1, Math.max(1, (hi - lo) * (h / 2 - 4)));
    }
  }
  // voice clips
  const vt = laneTop('voice');
  const vh = LANES[3].h;
  for (const b of p.blocks) {
    if (b.kind !== 'command') continue;
    const buf = rt.voiceBuffer(b);
    if (!buf) continue;
    const env = rt.envelope(buf);
    const x0 = (b.start + b.voiceOffset) * ppb;
    const w = timeToBeat(p, buf.duration) * ppb;
    const real = (b.voice.mode === 'tts' || b.voice.mode === 'clip') && b.voice.assetId;
    g.fillStyle = real ? 'rgba(255,159,67,0.18)' : 'rgba(255,159,67,0.08)';
    g.fillRect(x0, vt + 4, w, vh - 8);
    g.fillStyle = real ? 'rgba(255,159,67,0.9)' : 'rgba(255,159,67,0.45)';
    for (let x = 0; x < w; x++) {
      const t = (x / w) * buf.duration;
      const v = env.env[Math.floor(t * env.rate)] ?? 0;
      const hh = v * (vh - 12);
      g.fillRect(x0 + x, vt + vh / 2 - hh / 2, 1, Math.max(1, hh));
    }
    if (!real) {
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.font = '10px Geist, system-ui';
      g.fillText('placeholder voice', x0 + 4, vt + 13);
    }
  }
  // sfx markers
  const st = laneTop('sfx');
  const dot = (t: number, col: string, label: string) => {
    const x = timeToBeat(p, t) * ppb;
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, st + 11, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '10px Geist, system-ui';
    g.fillText(label, x + 7, st + 15);
  };
  for (const b of p.blocks) if (b.kind === 'command' && b.pop) dot(beatToTime(p, b.start), '#FF9F43', 'pop');
  for (const t of revealTimes(p)) dot(t, '#7C9CFF', 'whoosh+thump');
}
