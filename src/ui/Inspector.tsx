import { useState, useSyncExternalStore } from 'react';
import { selectedBlock, useStore } from '../state/store';
import { rt } from '../state/runtime';
import { player } from '../state/player';
import type { Block, CommandBlock, EndBlock, Framing, ShotBlock, StickerBlock, TitleBlock } from '../model/types';
import { beatToTime, formatBarBeat, shotSourceAt, spb, timeToBeat } from '../model/beats';
import { Btn, Num, Row, Section, Select, Text, Toggle } from './controls';
import {
  deleteSelected,
  detectCursorFor,
  duplicateSelected,
  generateAllVoices,
  generateVoice,
  importLogo,
  importMusic,
  importRecording,
  importVoiceClip,
  redetectBeats,
  relinkAsset,
  setStyle,
} from '../state/actions';
import { TTS_VOICES } from '../audio/tts';

type Upd<T extends Block> = (fn: (b: T) => void, key?: string) => void;

export function Inspector() {
  const b = useStore(selectedBlock);
  useSyncExternalStore(rt.subscribe, rt.getVersion);
  return <aside className="inspector">{b ? <BlockInspector b={b} /> : <ProjectInspector />}</aside>;
}

function BlockInspector({ b }: { b: Block }) {
  const p = useStore((s) => s.project);
  const upd = ((fn: (x: Block) => void, key?: string) => useStore.getState().updateBlock(b.id, fn, key ?? `insp:${b.id}`)) as Upd<Block>;
  const titles: Record<Block['kind'], string> = {
    title: 'Title card',
    shot: 'Shot',
    command: 'Command',
    end: 'End card',
    sticker: 'Sticker',
  };
  return (
    <>
      <div className="insp-head">
        <span className={`kind-dot k-${b.kind}`} />
        <h2>{titles[b.kind]}</h2>
        <span className="spacer" />
        <Btn small kind="ghost" onClick={duplicateSelected} title="Duplicate (⌘D)">
          Duplicate
        </Btn>
        <Btn small kind="danger" onClick={deleteSelected} title="Delete (⌫)">
          Delete
        </Btn>
      </div>
      <Section title="Timing">
        <Row label="Start">
          <Num value={b.start} step={1} min={0} onChange={(v) => upd((x) => (x.start = v))} suffix="beat" />
          <span className="muted mono">{formatBarBeat(p, b.start)}</span>
        </Row>
        <Row label="Length">
          <Num value={b.length} step={1} min={0.25} onChange={(v) => upd((x) => (x.length = v))} suffix="beats" />
          <span className="muted mono">{beatToTime(p, b.length).toFixed(2)}s</span>
        </Row>
      </Section>
      {b.kind === 'title' && <TitleInspector b={b} upd={upd as Upd<TitleBlock>} />}
      {b.kind === 'shot' && <ShotInspector b={b} upd={upd as Upd<ShotBlock>} />}
      {b.kind === 'command' && <CommandInspector b={b} upd={upd as Upd<CommandBlock>} />}
      {b.kind === 'end' && <EndInspector b={b} upd={upd as Upd<EndBlock>} />}
      {b.kind === 'sticker' && <StickerInspector b={b} upd={upd as Upd<StickerBlock>} />}
    </>
  );
}

// ---------- title ----------

function TitleInspector({ b, upd }: { b: TitleBlock; upd: Upd<TitleBlock> }) {
  const words = b.lines.flatMap((l) => l.text.split(/\s+/).filter(Boolean));
  return (
    <>
      <Section title="Text">
        {b.lines.map((l, i) => (
          <div key={i} className="line-edit">
            <Row label={`Line ${i + 1}`}>
              <Text value={l.text} onChange={(v) => upd((x) => (x.lines[i].text = v))} />
            </Row>
            <Row label="Keyword" hint="Shown in ink; the rest is dimmed. Comma-separate multiple.">
              <Text
                value={l.keyword}
                placeholder={b.lines.length === 1 ? 'all ink' : i === 0 ? 'all dim' : 'all ink'}
                onChange={(v) => upd((x) => (x.lines[i].keyword = v))}
              />
            </Row>
          </div>
        ))}
        {b.lines.length === 1 ? (
          <Btn small onClick={() => upd((x) => x.lines.push({ text: 'Second line', keyword: '' }))}>
            + Second line
          </Btn>
        ) : (
          <Btn small kind="ghost" onClick={() => upd((x) => x.lines.splice(1))}>
            Remove second line
          </Btn>
        )}
      </Section>
      <Section title="Animation">
        {b.lines.length > 1 && (
          <Row label="Line 2 delay" hint="Line 1 slides up to make room">
            <Num value={b.line2Delay} step={0.5} min={0} onChange={(v) => upd((x) => (x.line2Delay = v))} suffix="beats" />
          </Row>
        )}
        <Row label="Size">
          <Num value={b.size} step={4} min={24} max={240} onChange={(v) => upd((x) => (x.size = v))} suffix="px" />
        </Row>
        <Row label="Word by word" hint="Each word lands on its own beat">
          <Toggle
            value={b.wordByWord}
            onChange={(v) =>
              upd((x) => {
                x.wordByWord = v;
                if (v && x.wordBeats.length < words.length) x.wordBeats = words.map((_, i) => x.wordBeats[i] ?? i);
              })
            }
          />
        </Row>
        {b.wordByWord && (
          <div className="word-beats">
            {words.map((w, i) => (
              <label key={i}>
                <span>{w}</span>
                <Num value={b.wordBeats[i] ?? i} step={0.5} min={0} onChange={(v) => upd((x) => (x.wordBeats[i] = v))} width={56} />
              </label>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ---------- shot ----------

function framingLabel(f: Framing) {
  if (f.kind === 'full') return 'Full frame';
  if (f.kind === 'anchor') return `Anchor · ${f.label ?? `${Math.round(f.x)},${Math.round(f.y)}`} · ${f.zoom.toFixed(1)}×`;
  return `Window · ${f.label ?? `${Math.round(f.rect.w)}×${Math.round(f.rect.h)}`} · inset ${f.inset}`;
}

function ShotInspector({ b, upd }: { b: ShotBlock; upd: Upd<ShotBlock> }) {
  const p = useStore((s) => s.project);
  const playhead = useStore((s) => s.playhead);
  const [progress, setProgress] = useState<number | null>(null);
  const localBeat = timeToBeat(p, playhead) - b.start;
  const inside = localBeat >= 0 && localBeat <= b.length;
  const edit = (which: 'start' | 'end') => {
    const st = useStore.getState();
    st.setFramingEdit({ blockId: b.id, which });
  };
  return (
    <>
      <Section title="Source">
        <Row label="Recording">
          <Select
            value={b.sourceId}
            options={[...p.sources.map((s) => ({ value: s.id, label: s.name })), ...(p.sources.length ? [] : [{ value: '', label: '— none —' }])]}
            onChange={(v) => upd((x) => (x.sourceId = v))}
          />
        </Row>
        {!p.sources.some((s) => s.kind === 'video') && (
          <p className="hint">
            Using the built-in demo recording. <a onClick={() => importRecording()}>Import your screen recording</a> — shots retarget to it.
          </p>
        )}
      </Section>
      <Section title="Time mapping" right={<span className="muted">beat → source s</span>}>
        <p className="hint">
          Each row lands a source moment on a beat. Rows after the first are “land event at source X on beat N”; different slopes = speed
          ramps.
        </p>
        <table className="tmap">
          <tbody>
            {b.timeMap.map((pt, i) => {
              const rate =
                i < b.timeMap.length - 1 ? (b.timeMap[i + 1].src - pt.src) / ((b.timeMap[i + 1].beat - pt.beat) * spb(p)) : null;
              return (
                <tr key={i}>
                  <td>
                    <Num
                      value={pt.beat}
                      step={0.5}
                      min={0}
                      onChange={(v) => upd((x) => (x.timeMap[i].beat = i === 0 ? 0 : v))}
                      width={62}
                    />
                  </td>
                  <td>
                    <Num value={pt.src} step={0.1} min={0} onChange={(v) => upd((x) => (x.timeMap[i].src = v))} suffix="s" width={80} />
                  </td>
                  <td className="muted mono">{rate != null ? `${rate.toFixed(2)}×` : ''}</td>
                  <td>
                    {i > 0 && b.timeMap.length > 2 && (
                      <button className="x" onClick={() => upd((x) => x.timeMap.splice(i, 1))}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="btn-row">
          <Btn
            small
            disabled={!inside}
            title="Insert a point at the playhead (keeps current timing); then edit its source time to land an event on this beat"
            onClick={() =>
              upd((x) => {
                const beat = Math.round(localBeat * 2) / 2;
                const src = Number(shotSourceAt(p, x, beat).src.toFixed(2));
                x.timeMap.push({ beat, src });
                x.timeMap.sort((a, c) => a.beat - c.beat);
              })
            }
          >
            + Point at playhead
          </Btn>
        </div>
      </Section>
      <Section title="Camera">
        <Row label="Start">
          <span className="framing-label">{framingLabel(b.framingStart)}</span>
          <Btn small onClick={() => edit('start')}>
            Edit
          </Btn>
        </Row>
        <Row label="End">
          <span className="framing-label">{framingLabel(b.framingEnd)}</span>
          <Btn small onClick={() => edit('end')}>
            Edit
          </Btn>
        </Row>
        <Row label="Move at">
          <Num value={b.moveAt} step={0.5} min={0} onChange={(v) => upd((x) => (x.moveAt = v))} suffix="beat" />
        </Row>
        <Row label="Move length">
          <Num value={b.moveBeats} step={0.25} min={0} onChange={(v) => upd((x) => (x.moveBeats = v))} suffix="beats" />
        </Row>
        <Row label="Ease">
          <Select
            value={b.ease}
            options={[
              { value: 'quart', label: 'Ease-out quart' },
              { value: 'expo', label: 'Ease-out expo' },
              { value: 'cubic', label: 'Ease-out cubic' },
              { value: 'linear', label: 'Linear' },
            ]}
            onChange={(v) => upd((x) => (x.ease = v))}
          />
        </Row>
        <Row label="Lock anchor x" hint="Anchor stays horizontally fixed while zooming">
          <Toggle value={b.lockX} onChange={(v) => upd((x) => (x.lockX = v))} />
        </Row>
        <Row label="Motion blur" hint="Light, only on fast moves">
          <Toggle value={b.motionBlur} onChange={(v) => upd((x) => (x.motionBlur = v))} />
        </Row>
        <Row label="Pop-in" hint="Scale 0.92→1 + fade when returning after a title">
          <Toggle value={b.popIn} onChange={(v) => upd((x) => (x.popIn = v))} />
        </Row>
        <Row label="Reveal SFX" hint="Whoosh into the move, thump on landing">
          <Toggle value={b.reveal} onChange={(v) => upd((x) => (x.reveal = v))} />
        </Row>
      </Section>
      <Section title="Cursor tracking">
        <Row label="Follow cursor" hint="Replaces the start→end move; start framing is the roaming area">
          <Toggle value={b.cursor.enabled} onChange={(v) => upd((x) => (x.cursor.enabled = v))} />
        </Row>
        {b.cursor.enabled && (
          <>
            <Row label="Zoom">
              <Num value={b.cursor.zoom} step={0.1} min={1} max={6} onChange={(v) => upd((x) => (x.cursor.zoom = v))} suffix="×" />
            </Row>
            <Row label="Click zoom">
              <Num value={b.cursor.clickZoom} step={0.1} min={1} max={8} onChange={(v) => upd((x) => (x.cursor.clickZoom = v))} suffix="×" />
            </Row>
            <Row label="Dead zone">
              <Num value={b.cursor.deadZone} step={0.05} min={0} max={0.95} onChange={(v) => upd((x) => (x.cursor.deadZone = v))} />
            </Row>
            <Row label="Click hold">
              <Num value={b.cursor.clickHold} step={0.1} min={0} max={4} onChange={(v) => upd((x) => (x.cursor.clickHold = v))} suffix="s" />
            </Row>
            <Row label="Clicks (src s)">
              <ClickList value={b.clicks} onChange={(v) => upd((x) => (x.clicks = v))} />
            </Row>
          </>
        )}
        <div className="btn-row">
          <Btn
            small
            disabled={progress != null}
            onClick={async () => {
              setProgress(0);
              try {
                await detectCursorFor(b.id, setProgress);
              } finally {
                setProgress(null);
              }
            }}
          >
            {progress != null ? `Detecting… ${Math.round(progress * 100)}%` : 'Detect cursor + clicks'}
          </Btn>
        </div>
      </Section>
    </>
  );
}

function ClickList({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      className="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        onChange(
          text
            .split(/[,\s]+/)
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b),
        )
      }
    />
  );
}

// ---------- command ----------

function CommandInspector({ b, upd }: { b: CommandBlock; upd: Upd<CommandBlock> }) {
  const [status, setStatus] = useState<string | null>(null);
  const stale = b.voice.mode === 'tts' && b.voice.assetId && b.voice.generatedFor !== b.text;
  const buf = rt.voiceBuffer(b);
  return (
    <>
      <Section title="Pill">
        <Row label="Text">
          <Text value={b.text} onChange={(v) => upd((x) => (x.text = v))} />
        </Row>
        <Row label="Pop SFX">
          <Toggle value={b.pop} onChange={(v) => upd((x) => (x.pop = v))} />
        </Row>
      </Section>
      <Section title="Voice" right={buf ? <span className="muted mono">{buf.duration.toFixed(2)}s</span> : null}>
        <Row label="Source">
          <Select
            value={b.voice.mode}
            options={[
              { value: 'placeholder', label: 'Placeholder (timing only)' },
              { value: 'tts', label: 'Kokoro TTS (local)' },
              { value: 'clip', label: 'Recorded clip' },
              { value: 'none', label: 'No voice' },
            ]}
            onChange={(v) => upd((x) => (x.voice.mode = v))}
          />
        </Row>
        {b.voice.mode === 'tts' && (
          <>
            <Row label="Voice">
              <Select value={b.voice.ttsVoice} options={TTS_VOICES.map((v) => ({ value: v.id, label: v.label }))} onChange={(v) => upd((x) => (x.voice.ttsVoice = v))} />
            </Row>
            <Row label="Speed">
              <Num value={b.voice.ttsSpeed} step={0.05} min={0.6} max={2} onChange={(v) => upd((x) => (x.voice.ttsSpeed = v))} suffix="×" />
            </Row>
            <div className="btn-row">
              <Btn
                small
                kind="primary"
                disabled={status != null}
                onClick={async () => {
                  setStatus('Starting…');
                  try {
                    await generateVoice(b.id, setStatus);
                  } catch (e) {
                    useStore.getState().showToast(`TTS failed: ${(e as Error).message}`);
                  } finally {
                    setStatus(null);
                  }
                }}
              >
                {status ?? (b.voice.assetId ? (stale ? 'Regenerate (text changed)' : 'Regenerate') : 'Generate')}
              </Btn>
            </div>
            <p className="hint">First run downloads the Kokoro model (~90 MB) into the browser cache.</p>
          </>
        )}
        {b.voice.mode === 'clip' && (
          <div className="btn-row">
            <Btn small onClick={() => importVoiceClip(b.id)}>
              {b.voice.assetId ? 'Replace clip…' : 'Choose clip…'}
            </Btn>
          </div>
        )}
        <Row label="Offset" hint="Voice starts this long after the pill">
          <Num value={b.voiceOffset} step={0.25} min={0} onChange={(v) => upd((x) => (x.voiceOffset = v))} suffix="beats" />
        </Row>
        <Row label="Gain">
          <Num value={b.gainDb} step={0.5} min={-24} max={12} onChange={(v) => upd((x) => (x.gainDb = v))} suffix="dB" />
        </Row>
      </Section>
    </>
  );
}

// ---------- end / sticker ----------

function EndInspector({ b, upd }: { b: EndBlock; upd: Upd<EndBlock> }) {
  const p = useStore((s) => s.project);
  const logo = p.assets.find((a) => a.id === b.logoAssetId);
  return (
    <Section title="End card">
      <Row label="Wordmark">
        <Text value={b.title} onChange={(v) => upd((x) => (x.title = v))} />
      </Row>
      <Row label="Subtitle">
        <Text value={b.subtitle} onChange={(v) => upd((x) => (x.subtitle = v))} />
      </Row>
      <Row label="Logo">
        <span className="framing-label">{logo?.name ?? 'none (wordmark shown)'}</span>
        <Btn small onClick={() => importLogo()}>
          {logo ? 'Replace' : 'Add'}
        </Btn>
        {logo && (
          <Btn small kind="ghost" onClick={() => upd((x) => (x.logoAssetId = null))}>
            Clear
          </Btn>
        )}
      </Row>
      <p className="hint">Use the real SVG / transparent PNG — the wordmark is a stand-in.</p>
    </Section>
  );
}

function StickerInspector({ b, upd }: { b: StickerBlock; upd: Upd<StickerBlock> }) {
  return (
    <Section title="Sticker">
      <Row label="Emoji">
        <Text value={b.emoji} onChange={(v) => upd((x) => (x.emoji = v))} />
      </Row>
      <Row label="X / Y">
        <Num value={b.x} step={0.01} min={0} max={1} onChange={(v) => upd((x) => (x.x = v))} width={64} />
        <Num value={b.y} step={0.01} min={0} max={1} onChange={(v) => upd((x) => (x.y = v))} width={64} />
      </Row>
      <Row label="Size">
        <Num value={b.size} step={10} min={20} max={600} onChange={(v) => upd((x) => (x.size = v))} suffix="px" />
      </Row>
      <Row label="Rotate">
        <Num value={b.rotate} step={1} onChange={(v) => upd((x) => (x.rotate = v))} suffix="°" />
      </Row>
      <Row label="Wobble">
        <Toggle value={b.wobble} onChange={(v) => upd((x) => (x.wobble = v))} />
      </Row>
    </Section>
  );
}

// ---------- project ----------

function ProjectInspector() {
  const p = useStore((s) => s.project);
  const up = (fn: (d: typeof p) => void, key = 'proj') => useStore.getState().update(fn, key);
  const music = p.music.assetId ? p.assets.find((a) => a.id === p.music.assetId) : null;
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  return (
    <>
      <div className="insp-head">
        <h2>Project</h2>
        <span className="spacer" />
        <span className="muted">select a block to edit it</span>
      </div>
      <Section title="General">
        <Row label="Name">
          <Text value={p.name} onChange={(v) => up((d) => (d.name = v))} />
        </Row>
        <Row label="Style">
          <Select
            value={p.style}
            options={[
              { value: 'minimal', label: 'Minimal — white, Geist, rounded card' },
              { value: 'playful', label: 'Playful — color, stickers' },
            ]}
            onChange={setStyle}
          />
        </Row>
        <Row label="Card">
          <Num value={p.card.w} step={10} min={640} max={1920} onChange={(v) => up((d) => (d.card.w = v))} width={70} />
          <Num value={p.card.h} step={10} min={360} max={1080} onChange={(v) => up((d) => (d.card.h = v))} width={70} />
          <Num value={p.theme.cardRadius} step={2} min={0} max={80} onChange={(v) => up((d) => (d.theme.cardRadius = v))} suffix="r" width={62} />
        </Row>
        <Row label="Ink / dim">
          <input type="color" value={p.theme.ink} onChange={(e) => up((d) => (d.theme.ink = e.target.value))} />
          <input type="color" value={p.theme.dim} onChange={(e) => up((d) => (d.theme.dim = e.target.value))} />
          <input type="color" value={p.theme.keyword} onChange={(e) => up((d) => (d.theme.keyword = e.target.value))} title="Keyword" />
          <input type="color" value={p.theme.bg} onChange={(e) => up((d) => (d.theme.bg = e.target.value))} title="Background" />
        </Row>
      </Section>
      <Section title="Beat grid" right={<Btn small onClick={redetectBeats}>Re-detect</Btn>}>
        <Row label="BPM">
          <Num value={p.music.bpm} step={0.01} min={40} max={240} onChange={(v) => up((d) => (d.music.bpm = v), 'bpm')} />
          <Btn small kind="ghost" onClick={() => up((d) => (d.music.bpm = +(d.music.bpm - 0.1).toFixed(2)), 'bpm')}>
            −0.1
          </Btn>
          <Btn small kind="ghost" onClick={() => up((d) => (d.music.bpm = +(d.music.bpm + 0.1).toFixed(2)), 'bpm')}>
            +0.1
          </Btn>
        </Row>
        <Row label="Downbeat" hint="Time of the first downbeat inside the music file">
          <Num value={p.music.downbeat} step={0.005} min={0} digits={3} onChange={(v) => up((d) => (d.music.downbeat = v), 'db')} suffix="s" />
          <Btn small kind="ghost" onClick={() => up((d) => (d.music.downbeat = Math.max(0, +(d.music.downbeat - 0.005).toFixed(3))), 'db')}>
            −5ms
          </Btn>
          <Btn small kind="ghost" onClick={() => up((d) => (d.music.downbeat = +(d.music.downbeat + 0.005).toFixed(3)), 'db')}>
            +5ms
          </Btn>
        </Row>
        <Row label="Tap tempo" hint="Tap along with the music while it plays">
          <Btn
            small
            onClick={() => {
              const now = performance.now();
              const t = [...tapTimes.filter((x) => now - x < 3000), now];
              setTapTimes(t);
              if (t.length >= 4) {
                const iv = (t[t.length - 1] - t[0]) / (t.length - 1);
                useStore.getState().showToast(`Tapped ≈ ${(60000 / iv).toFixed(1)} BPM`);
              }
            }}
          >
            Tap ({tapTimes.length})
          </Btn>
        </Row>
        <p className="hint">Beat {spb(p).toFixed(4)}s · bar {(spb(p) * p.beatsPerBar).toFixed(3)}s. Nudge until grid lines sit on the kicks in the Music lane.</p>
      </Section>
      <Section title="Music" right={<Btn small onClick={() => importMusic()}>{music ? 'Replace…' : 'Import…'}</Btn>}>
        <Row label="File">
          <span className="framing-label">{music?.name ?? 'none'}</span>
        </Row>
        <Row label="Downbeat on" hint="Timeline beat the track's first downbeat lands on (or drag the music clip)">
          <Num value={p.music.alignBeat} step={1} onChange={(v) => up((d) => (d.music.alignBeat = v))} suffix="beat" />
        </Row>
        <Row label="Enters at" hint="Music is silent before this beat — e.g. on an on-screen “next track”">
          <Num value={p.music.enterBeat} step={0.5} min={0} onChange={(v) => up((d) => (d.music.enterBeat = v))} suffix="beat" />
        </Row>
        <Row label="Stops at">
          <Num
            value={p.music.endBeat ?? 0}
            step={1}
            min={0}
            onChange={(v) => up((d) => (d.music.endBeat = v > 0 ? v : null))}
            suffix={p.music.endBeat == null ? 'end' : 'beat'}
          />
        </Row>
        <Row label="Gain">
          <Num value={p.music.gainDb} step={0.5} min={-30} max={6} onChange={(v) => up((d) => (d.music.gainDb = v))} suffix="dB" />
        </Row>
        <Row label="Fade in / out">
          <Num value={p.music.fadeIn} step={0.05} min={0} onChange={(v) => up((d) => (d.music.fadeIn = v))} suffix="s" width={70} />
          <Num value={p.music.fadeOut} step={0.1} min={0} onChange={(v) => up((d) => (d.music.fadeOut = v))} suffix="s" width={70} />
        </Row>
        <Row label="Duck under voice">
          <Num value={p.music.duckDb} step={0.5} min={-30} max={0} onChange={(v) => up((d) => (d.music.duckDb = v))} suffix="dB" />
        </Row>
      </Section>
      <Section title="Mix">
        <Row label="Voice level" hint="Voices are RMS-matched to this">
          <Num value={p.mix.voiceRmsDb} step={0.5} min={-40} max={-6} onChange={(v) => up((d) => (d.mix.voiceRmsDb = v))} suffix="dBFS" />
        </Row>
        <Row label="Voice gain">
          <Num value={p.mix.voiceGainDb} step={0.5} min={-24} max={12} onChange={(v) => up((d) => (d.mix.voiceGainDb = v))} suffix="dB" />
        </Row>
        <Row label="Presence lift">
          <Toggle value={p.mix.presence} onChange={(v) => up((d) => (d.mix.presence = v))} />
        </Row>
        <Row label="SFX gain">
          <Num value={p.mix.sfxGainDb} step={0.5} min={-40} max={6} onChange={(v) => up((d) => (d.mix.sfxGainDb = v))} suffix="dB" />
        </Row>
        <Row label="Limiter ceiling">
          <Num value={p.mix.ceilingDb} step={0.1} min={-12} max={0} onChange={(v) => up((d) => (d.mix.ceilingDb = v))} suffix="dBFS" />
        </Row>
        <div className="btn-row">
          <Btn small onClick={generateAllVoices}>
            Generate all voices (Kokoro)
          </Btn>
          <Btn small kind="ghost" onClick={() => player.seek(0)}>
            ⏮ Start
          </Btn>
        </div>
      </Section>
      <Section title="Media">
        {p.assets.length === 0 && <p className="hint">Drop a screen recording, a music file or a logo anywhere.</p>}
        <ul className="media">
          {p.assets.map((a) => (
            <li key={a.id}>
              <span className={`media-type t-${a.type}`}>{a.type}</span>
              <span className="media-name">{a.name}</span>
              {rt.missing.has(a.id) && (
                <Btn small kind="danger" onClick={() => relinkAsset(a.id)}>
                  Relink
                </Btn>
              )}
            </li>
          ))}
        </ul>
        <div className="btn-row">
          <Btn small onClick={() => importRecording()}>
            + Recording
          </Btn>
          <Btn small onClick={() => importMusic()}>
            + Music
          </Btn>
          <Btn small onClick={() => importLogo()}>
            + Logo
          </Btn>
        </div>
      </Section>
    </>
  );
}
