import type {
  CommandBlock,
  CursorFollow,
  EndBlock,
  Project,
  ShotBlock,
  StickerBlock,
  StylePreset,
  Theme,
  TitleBlock,
} from './types';
import { uid } from './beats';
import { DEMO_SOURCE, DEMO_WINDOWS, DEMO_ISLAND, DEMO_CLICKS } from '../render/demoLayout';

export const THEMES: Record<StylePreset, Theme> = {
  minimal: {
    bg: '#FFFFFF',
    bg2: '#FFFFFF',
    ink: '#0A0A0A',
    dim: '#ABABAB',
    keyword: '#0A0A0A',
    cardRadius: 24,
    cardShadow: 0.14,
  },
  playful: {
    bg: '#FFF4E4',
    bg2: '#FFE3F1',
    ink: '#1B1530',
    dim: '#B9A7A0',
    keyword: '#FF4F2E',
    cardRadius: 36,
    cardShadow: 0.2,
  },
};

export const defaultCursor = (): CursorFollow => ({
  enabled: false,
  zoom: 1.5,
  clickZoom: 2.1,
  deadZone: 0.45,
  clickHold: 1.1,
});

export function newTitle(start: number, text = 'Say it simply'): TitleBlock {
  return {
    id: uid('title'),
    kind: 'title',
    start,
    length: 4,
    lines: [{ text, keyword: '' }],
    line2Delay: 2,
    wordByWord: false,
    wordBeats: [],
    size: 96,
  };
}

export function newShot(start: number, sourceId: string, src = 0): ShotBlock {
  return {
    id: uid('shot'),
    kind: 'shot',
    start,
    length: 8,
    sourceId,
    timeMap: [
      { beat: 0, src },
      { beat: 8, src: src + 8 * 0.5 },
    ],
    framingStart: { kind: 'full' },
    framingEnd: { kind: 'full' },
    moveAt: 4,
    moveBeats: 1,
    ease: 'quart',
    lockX: true,
    motionBlur: true,
    popIn: true,
    reveal: false,
    cursor: defaultCursor(),
    clicks: [],
  };
}

export function newCommand(start: number, text = 'Do the thing'): CommandBlock {
  return {
    id: uid('cmd'),
    kind: 'command',
    start,
    length: 6,
    text,
    voice: { mode: 'placeholder', ttsVoice: 'am_michael', ttsSpeed: 1.25, assetId: null, generatedFor: '' },
    voiceOffset: 0.25,
    gainDb: 0,
    pop: true,
  };
}

export function newEnd(start: number, title = 'Product'): EndBlock {
  return { id: uid('end'), kind: 'end', start, length: 6, title, subtitle: '', logoAssetId: null };
}

export function newSticker(start: number, emoji = '✨'): StickerBlock {
  return {
    id: uid('stk'),
    kind: 'sticker',
    start,
    length: 4,
    emoji,
    x: 0.86,
    y: 0.2,
    size: 150,
    rotate: -8,
    wobble: true,
  };
}

export function emptyProject(): Project {
  return {
    version: 1,
    name: 'Untitled teaser',
    width: 1920,
    height: 1080,
    fps: 60,
    style: 'minimal',
    theme: { ...THEMES.minimal },
    card: { w: 1840, h: 1000 },
    beatsPerBar: 4,
    music: {
      assetId: null,
      bpm: 120,
      downbeat: 0,
      alignBeat: 0,
      enterBeat: 0,
      endBeat: null,
      gainDb: -2,
      fadeIn: 0.05,
      fadeOut: 1.5,
      duckDb: -9,
    },
    mix: { voiceGainDb: 0, sfxGainDb: -4, ceilingDb: -1, voiceRmsDb: -18, presence: true },
    sources: [],
    assets: [],
    blocks: [],
    endBeat: null,
  };
}

/** A complete sample teaser for a fictional voice assistant ("Nova"), on the built-in demo recording + demo track. */
export function sampleProject(): Project {
  const p = emptyProject();
  p.name = 'Nova — launch teaser';
  const src = DEMO_SOURCE;
  p.sources = [{ ...src }];
  p.assets = [{ id: 'demo-music', name: 'Demo track (112 BPM).wav', type: 'audio', mime: 'audio/wav', builtin: 'demo-music' }];
  p.music = {
    ...p.music,
    assetId: 'demo-music',
    bpm: 112,
    downbeat: 2.143,
    alignBeat: 8,
    enterBeat: 7,
    gainDb: -2,
  };
  const island = { kind: 'anchor' as const, x: DEMO_ISLAND.x, y: DEMO_ISLAND.y, zoom: 2.2, label: 'Notch island' };
  const win = (k: keyof typeof DEMO_WINDOWS) => ({
    kind: 'window' as const,
    rect: { ...DEMO_WINDOWS[k] },
    inset: 28,
    label: k,
  });

  const shotA: ShotBlock = {
    ...newShot(0, src.id),
    length: 12,
    timeMap: [
      { beat: 0, src: 0 },
      { beat: 7, src: 3.4 },
      { beat: 12, src: 6.08 },
    ],
    framingStart: island,
    framingEnd: win('Music'),
    moveAt: 7,
    moveBeats: 1,
    popIn: false,
    reveal: true,
  };
  const cmdA: CommandBlock = { ...newCommand(0.5, 'Hey Nova, play something chill'), length: 6 };
  const t1: TitleBlock = { ...newTitle(12, 'Talk to your Mac'), lines: [{ text: 'Talk to your Mac', keyword: 'Mac' }] };
  const shotB: ShotBlock = {
    ...newShot(16, src.id),
    length: 10,
    timeMap: [
      { beat: 0, src: 8.3 },
      { beat: 6, src: 11.2 },
      { beat: 10, src: 13.4 },
    ],
    framingStart: island,
    framingEnd: win('Reminders'),
    moveAt: 5.5,
    moveBeats: 1,
  };
  const cmdB: CommandBlock = { ...newCommand(16.5, 'Remind me to call Sam at five'), length: 5.5 };
  const t2: TitleBlock = {
    ...newTitle(26),
    length: 6,
    lines: [
      { text: 'Control the vibe', keyword: '' },
      { text: 'Just say it', keyword: '' },
    ],
    line2Delay: 2,
  };
  const shotC: ShotBlock = {
    ...newShot(32, src.id),
    length: 10,
    timeMap: [
      { beat: 0, src: 13.6 },
      { beat: 4, src: 16.0 },
      { beat: 10, src: 22.6 },
    ],
    framingStart: win('Settings'),
    framingEnd: win('Settings'),
    moveAt: 0,
    moveBeats: 0,
    cursor: { ...defaultCursor(), enabled: true, zoom: 1.35, clickZoom: 1.8 },
    clicks: [...DEMO_CLICKS],
  };
  const t3: TitleBlock = {
    ...newTitle(42),
    length: 6,
    lines: [{ text: 'Introducing Nova', keyword: 'Nova' }],
    wordByWord: true,
    wordBeats: [0, 2],
  };
  const t4: TitleBlock = {
    ...newTitle(48),
    length: 8,
    lines: [{ text: 'Nova on macOS', keyword: 'Nova' }],
    size: 112,
  };
  const end: EndBlock = { ...newEnd(56, 'Nova'), subtitle: 'Coming this fall' };

  p.blocks = [shotA, cmdA, t1, shotB, cmdB, t2, shotC, t3, t4, end];
  return p;
}
