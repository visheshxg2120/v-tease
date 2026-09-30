// Project model. Everything here is plain JSON: a project file is exactly this shape.
// Timeline positions are in beats (beat 0 = timeline t=0); source positions are in seconds.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How a shot frames the recording. Coordinates are source pixels. */
export type Framing =
  | { kind: 'full' }
  /** Zoomed view locked on a point (e.g. the notch island). zoom = sourceWidth / cropWidth. */
  | { kind: 'anchor'; x: number; y: number; zoom: number; label?: string }
  /** Fit a window rect into the card with an even inset (output px). */
  | { kind: 'window'; rect: Rect; inset: number; label?: string };

/** Piecewise-linear source time mapping point; beat is relative to block start. */
export interface TimePoint {
  beat: number;
  src: number;
}

export type Ease = 'quart' | 'expo' | 'cubic' | 'linear';

export interface CursorFollow {
  enabled: boolean;
  /** Base zoom relative to the full-frame crop. */
  zoom: number;
  /** Zoom on clicks. */
  clickZoom: number;
  /** Fraction of the crop (each axis) the cursor can roam before the camera moves. */
  deadZone: number;
  /** Seconds the click zoom holds. */
  clickHold: number;
}

interface BlockBase {
  id: string;
  /** Start, in beats. */
  start: number;
  /** Length, in beats. */
  length: number;
}

export interface TitleLine {
  text: string;
  /** Words shown in ink (comma separated). Empty = default rule (1 line: all ink; 2 lines: top dim, bottom ink). */
  keyword: string;
}

export interface TitleBlock extends BlockBase {
  kind: 'title';
  lines: TitleLine[];
  /** Beats after block start that line 2 enters (line 1 slides up to make room). */
  line2Delay: number;
  /** Word-by-word mode: each word appears on its own beat offset. */
  wordByWord: boolean;
  /** Beat offsets (relative to block start), one per word across all lines. */
  wordBeats: number[];
  size: number;
}

export interface ShotBlock extends BlockBase {
  kind: 'shot';
  sourceId: string;
  /** Source time mapping: first point = block start, add points to land events on beats / speed-ramp. */
  timeMap: TimePoint[];
  framingStart: Framing;
  framingEnd: Framing;
  /** Beat (relative) the camera move starts, and its duration in beats. */
  moveAt: number;
  moveBeats: number;
  ease: Ease;
  /** Keep the anchor's x fixed on screen during anchor↔window moves. */
  lockX: boolean;
  motionBlur: boolean;
  /** Scale 0.92→1 + fade pop when the card returns after a title. */
  popIn: boolean;
  /** Whoosh + thump on this shot's move landing (the first reveal). */
  reveal: boolean;
  cursor: CursorFollow;
  /** Manual click marks (source seconds) that the cursor follow zooms on. */
  clicks: number[];
}

export type VoiceMode = 'placeholder' | 'tts' | 'clip' | 'none';

export interface CommandBlock extends BlockBase {
  kind: 'command';
  text: string;
  voice: {
    mode: VoiceMode;
    ttsVoice: string;
    ttsSpeed: number;
    /** Asset id of the generated TTS or dropped-in clip. */
    assetId: string | null;
    /** Which text the TTS asset was generated for (to flag stale audio). */
    generatedFor: string;
  };
  /** Voice starts this many beats after the pill appears. */
  voiceOffset: number;
  gainDb: number;
  pop: boolean;
}

export interface EndBlock extends BlockBase {
  kind: 'end';
  title: string;
  subtitle: string;
  logoAssetId: string | null;
}

export interface StickerBlock extends BlockBase {
  kind: 'sticker';
  emoji: string;
  /** Position as a fraction of the canvas. */
  x: number;
  y: number;
  size: number;
  rotate: number;
  wobble: boolean;
}

export type VideoBlock = TitleBlock | ShotBlock | EndBlock;
export type OverlayBlock = CommandBlock | StickerBlock;
export type Block = VideoBlock | OverlayBlock;
export type BlockKind = Block['kind'];

export const VIDEO_KINDS: BlockKind[] = ['title', 'shot', 'end'];
export const isVideoBlock = (b: Block): b is VideoBlock => VIDEO_KINDS.includes(b.kind);

export type StylePreset = 'minimal' | 'playful';

export interface Theme {
  bg: string;
  bg2: string;
  ink: string;
  dim: string;
  keyword: string;
  cardRadius: number;
  cardShadow: number;
}

export interface Source {
  id: string;
  name: string;
  /** 'demo' is the built-in procedural recording used by the sample project. */
  kind: 'video' | 'demo';
  assetId: string | null;
  width: number;
  height: number;
  duration: number;
}

export interface AssetMeta {
  id: string;
  name: string;
  type: 'audio' | 'video' | 'image';
  mime: string;
  /** Built-in generated asset (sample music), recreated on load instead of stored. */
  builtin?: 'demo-music';
}

export interface MusicSettings {
  assetId: string | null;
  /** Detected BPM + first downbeat (seconds, in the music file). */
  bpm: number;
  downbeat: number;
  /** Timeline beat the file's first downbeat lands on. */
  alignBeat: number;
  /** Music is silent before this timeline beat (e.g. an on-screen "next track" action). */
  enterBeat: number;
  /** Music stops (with fade) at this beat; null = end of timeline. */
  endBeat: number | null;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
  duckDb: number;
}

export interface MixSettings {
  voiceGainDb: number;
  sfxGainDb: number;
  /** Peak limiter ceiling, dBFS. */
  ceilingDb: number;
  /** Target voice RMS for level matching, dBFS. */
  voiceRmsDb: number;
  presence: boolean;
}

export interface Project {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  style: StylePreset;
  theme: Theme;
  card: { w: number; h: number };
  beatsPerBar: number;
  music: MusicSettings;
  mix: MixSettings;
  sources: Source[];
  assets: AssetMeta[];
  blocks: Block[];
  /** Explicit timeline end in beats (null = end of last block). */
  endBeat: number | null;
}
