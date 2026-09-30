import { useStore } from './store';
import { rt } from './runtime';
import type { Block, BlockKind, CommandBlock, Framing, Project, ShotBlock, StylePreset } from '../model/types';
import { blockEnd, shotSourceAt, spb, uid } from '../model/beats';
import { THEMES, emptyProject, newCommand, newEnd, newShot, newSticker, newTitle, sampleProject } from '../model/sample';
import { detectBeats } from '../audio/analyze';
import { synthesize } from '../audio/tts';
import { encodeWav } from '../audio/wav';
import { detectCursor } from '../render/cursorDetect';

const st = () => useStore.getState();

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- project files ----------

export function saveProjectJson() {
  const p = st().project;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  download(blob, `${p.name.replace(/[^\w\- ]+/g, '').trim() || 'teaser'}.teaser.json`);
}

export async function openProjectJson() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try {
    const p = JSON.parse(await f.text()) as Project;
    if (p.version !== 1 || !Array.isArray(p.blocks)) throw new Error('Not a Teaser Studio project');
    st().setProject(p);
    await rt.loadProject(p);
    const missing = p.assets.filter((a) => rt.missing.has(a.id));
    st().showToast(missing.length ? `Opened. ${missing.length} media file(s) need relinking (Project panel).` : 'Project opened');
  } catch (e) {
    st().showToast(`Couldn't open: ${(e as Error).message}`);
  }
}

export function loadSample() {
  st().setProject(sampleProject());
  st().setPlayhead(0);
}

export function newProject() {
  st().setProject(emptyProject());
  st().setPlayhead(0);
}

// ---------- media ----------

export async function importMusic(file?: File | null) {
  const f = file ?? (await pickFile('audio/*'));
  if (!f) return;
  st().showToast('Analyzing music…');
  const meta = await rt.importFile(f, f.name, 'audio');
  const buf = rt.audio.get(meta.id)!;
  const a = await detectBeats(buf);
  st().update((p) => {
    p.assets.push(meta);
    p.music.assetId = meta.id;
    p.music.bpm = a.bpm;
    p.music.downbeat = a.downbeat;
  });
  st().showToast(`Detected ${a.bpm.toFixed(2)} BPM · first downbeat at ${a.downbeat.toFixed(3)}s — nudge in Project › Beat grid`);
}

export async function redetectBeats() {
  const p = st().project;
  const buf = p.music.assetId ? rt.audio.get(p.music.assetId) : null;
  if (!buf) return st().showToast('No music loaded');
  st().showToast('Analyzing…');
  const a = await detectBeats(buf);
  st().update((d) => {
    d.music.bpm = a.bpm;
    d.music.downbeat = a.downbeat;
  });
  st().showToast(`Detected ${a.bpm.toFixed(2)} BPM · downbeat ${a.downbeat.toFixed(3)}s`);
}

export async function importRecording(file?: File | null) {
  const f = file ?? (await pickFile('video/*'));
  if (!f) return;
  const meta = await rt.importFile(f, f.name, 'video');
  const src = await rt.probeVideo(meta.id, f.name);
  st().update((p) => {
    p.assets.push(meta);
    p.sources.push(src);
    // retarget shots on the demo recording (sample project) to the real one, scaling framings to its size
    for (const b of p.blocks) {
      const old = b.kind === 'shot' ? p.sources.find((s) => s.id === b.sourceId) : null;
      if (b.kind !== 'shot' || old?.kind !== 'demo') continue;
      b.sourceId = src.id;
      b.framingStart = scaleFraming(b.framingStart, src.width / old.width, src.height / old.height);
      b.framingEnd = scaleFraming(b.framingEnd, src.width / old.width, src.height / old.height);
    }
  });
  const res = src.width < 2000 ? ' — note: sub-Retina source, deep zooms will look soft' : '';
  st().showToast(`Imported ${src.width}×${src.height}, ${src.duration.toFixed(1)}s${res}`);
}

function scaleFraming(f: Framing, sx: number, sy: number): Framing {
  if (f.kind === 'anchor') return { ...f, x: f.x * sx, y: f.y * sy };
  if (f.kind === 'window') return { ...f, rect: { x: f.rect.x * sx, y: f.rect.y * sy, w: f.rect.w * sx, h: f.rect.h * sy } };
  return f;
}

export async function importLogo(file?: File | null) {
  const f = file ?? (await pickFile('image/svg+xml,image/png,image/webp'));
  if (!f) return;
  const meta = await rt.importFile(f, f.name, 'image');
  st().update((p) => {
    p.assets.push(meta);
    for (const b of p.blocks) if (b.kind === 'end') b.logoAssetId = meta.id;
  });
  st().showToast('Logo added to end card(s)');
}

export async function importVoiceClip(cmdId: string) {
  const f = await pickFile('audio/*');
  if (!f) return;
  const meta = await rt.importFile(f, f.name, 'audio');
  st().update((p) => {
    p.assets.push(meta);
    const b = p.blocks.find((x) => x.id === cmdId) as CommandBlock | undefined;
    if (b) {
      b.voice.mode = 'clip';
      b.voice.assetId = meta.id;
      b.voice.generatedFor = b.text;
    }
  });
}

export async function relinkAsset(id: string) {
  const meta = st().project.assets.find((a) => a.id === id);
  if (!meta) return;
  const f = await pickFile(meta.type === 'audio' ? 'audio/*' : meta.type === 'video' ? 'video/*' : 'image/*');
  if (!f) return;
  await rt.relink(meta, f);
  for (const s of st().project.sources) rt.ensureSource(s);
  st().update((p) => p); // trigger remix/redraw
}

/** Route dropped files by type. */
export async function importDropped(files: FileList) {
  for (const f of Array.from(files)) {
    if (f.name.endsWith('.json')) {
      const p = JSON.parse(await f.text()) as Project;
      st().setProject(p);
    } else if (f.type.startsWith('video/')) await importRecording(f);
    else if (f.type.startsWith('audio/')) await importMusic(f);
    else if (f.type.startsWith('image/')) await importLogo(f);
  }
}

// ---------- TTS ----------

export async function generateVoice(cmdId: string, onProgress?: (m: string) => void) {
  const b = st().project.blocks.find((x) => x.id === cmdId) as CommandBlock | undefined;
  if (!b) return;
  const { samples, sampleRate } = await synthesize(b.text, b.voice.ttsVoice, b.voice.ttsSpeed, onProgress);
  const blob = encodeWav([samples], sampleRate);
  const meta = await rt.importFile(blob, `voice – ${b.text.slice(0, 32)}.wav`, 'audio');
  st().update((p) => {
    p.assets.push(meta);
    const c = p.blocks.find((x) => x.id === cmdId) as CommandBlock | undefined;
    if (c) {
      c.voice.mode = 'tts';
      c.voice.assetId = meta.id;
      c.voice.generatedFor = c.text;
    }
  });
}

export async function generateAllVoices() {
  const cmds = st().project.blocks.filter(
    (b): b is CommandBlock => b.kind === 'command' && b.voice.mode !== 'none' && b.voice.mode !== 'clip' && (b.voice.generatedFor !== b.text || !b.voice.assetId),
  );
  if (!cmds.length) return st().showToast('All voices up to date');
  for (const [i, c] of cmds.entries()) {
    try {
      await generateVoice(c.id, (m) => st().showToast(`Voice ${i + 1}/${cmds.length}: ${m}`));
    } catch (e) {
      st().showToast(`TTS failed: ${(e as Error).message}`);
      return;
    }
  }
  st().showToast(`Generated ${cmds.length} voice line(s)`);
}

// ---------- cursor ----------

export async function detectCursorFor(shotId: string, onProgress: (f: number) => void) {
  const p = st().project;
  const shot = p.blocks.find((b) => b.id === shotId) as ShotBlock | undefined;
  const src = shot && p.sources.find((s) => s.id === shot.sourceId);
  if (!shot || !src) return;
  const getFrame = async (t: number): Promise<CanvasImageSource> => {
    if (src.kind === 'demo') return rt.demoSource().frame(t);
    const vs = rt.scrubSource(src)!;
    await vs.seekExact(t);
    return vs.el;
  };
  const res = await detectCursor(getFrame, src.width, src.height, src.duration, onProgress);
  rt.setCursorTrack(src.id, res.track);
  const a = shotSourceAt(p, shot, 0).src;
  const b = shotSourceAt(p, shot, shot.length).src;
  const clicks = res.clicks.filter((c) => c >= a && c <= b);
  st().updateBlock(shotId, (x) => {
    if (x.kind === 'shot') {
      x.cursor.enabled = true;
      x.clicks = clicks;
    }
  });
  st().showToast(`Cursor tracked (${res.track.filter((s) => s.visible).length} samples) · ${clicks.length} click(s) in this shot`);
}

// ---------- blocks ----------

export function addBlock(kind: BlockKind) {
  const s = st();
  const p = s.project;
  const beat = Math.round(s.playhead / spb(p));
  let b: Block;
  const videoEnd = Math.max(0, ...p.blocks.filter((x) => x.kind === 'title' || x.kind === 'shot' || x.kind === 'end').map(blockEnd));
  const at = kind === 'command' || kind === 'sticker' ? beat : Math.max(beat, videoEnd);
  switch (kind) {
    case 'title':
      b = newTitle(at);
      break;
    case 'shot': {
      const src = p.sources[p.sources.length - 1];
      b = newShot(at, src?.id ?? '', 0);
      break;
    }
    case 'command':
      b = newCommand(at);
      break;
    case 'end':
      b = newEnd(at, p.name.split(/[—-]/)[0].trim() || 'Product');
      break;
    case 'sticker':
      b = newSticker(at);
      break;
  }
  s.update((d) => {
    d.blocks.push(b);
  });
  s.select(b.id);
}

export function deleteSelected() {
  const s = st();
  if (!s.selectedId) return;
  s.update((p) => {
    p.blocks = p.blocks.filter((b) => b.id !== s.selectedId);
  });
  s.select(null);
}

export function duplicateSelected() {
  const s = st();
  const b = s.project.blocks.find((x) => x.id === s.selectedId);
  if (!b) return;
  const c = structuredClone(b);
  c.id = uid(b.kind);
  c.start = blockEnd(b);
  s.update((p) => {
    p.blocks.push(c);
  });
  s.select(c.id);
}

export function setStyle(style: StylePreset) {
  st().update((p) => {
    p.style = style;
    p.theme = { ...THEMES[style] };
  });
}

