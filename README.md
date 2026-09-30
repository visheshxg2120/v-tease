# Teaser Studio

A small local editor for music-synced product teasers made from screen recordings. It replaces After Effects for one format: short, beat-cut promos with zooms, command pills, title cards and an end card.

```bash
npm install
npm run dev      # http://localhost:5173
```

It opens with a **sample project** ("Nova" launch teaser). The sample uses a procedurally drawn demo recording and a generated demo track, so it plays with no media files. Drop in your own recording and music to start a real one.

## The model: beats, not keyframes

Everything on the timeline is placed in **beats**. The grid comes from the music: BPM plus the time of the first downbeat inside the file.

- **Import music** → BPM and first downbeat are auto-detected (kick-band and snare-band onset peaks, then a comb search over tempo and phase). Nudge with ±0.1 BPM and ±5 ms in *Project › Beat grid* until the grid lines sit on the kicks in the Music lane.
- **Downbeat on**: the timeline beat the track's first downbeat lands on (or drag the music clip).
- **Enters at**: music is silent before this beat, so it can start on an on-screen action ("next track"). The green *enter* flag is draggable.

### Blocks

| Block | Lane | What it does |
|---|---|---|
| **Title** | video | 1–2 lines, centered. Keyword(s) in ink, rest dimmed `#ABABAB` (default for two lines: top dim, bottom ink). Lines slide up + fade as one piece; line 2 enters after *Line 2 delay* and line 1 slides up. Optional word-by-word on chosen beats. |
| **Shot** | video | A source range of the recording. **Time mapping** rows land a source moment on a beat ("event at source X on beat N"); different slopes are speed ramps (yellow diamonds on the block are draggable). **Start/End framing**: *Full*, *Anchor* (a point + zoom, e.g. the notch island) or *Window* (drag a rect; auto-fit with a 28 px inset). |
| **Command** | overlay | Floating white pill with a dark circle and a waveform driven by the voice envelope. Voice: placeholder, Kokoro TTS, recorded clip, or none. Pop SFX on entry. |
| **End** | video | Logo (SVG/PNG) or a wordmark stand-in, plus a subtitle. |
| **Sticker** | overlay | Emoji with pop-in and wobble, for the Playful style. |

### Camera moves

Zooms travel in straight lines. The start and end crops scale about their common fixed point, zoom is interpolated in log space, and the move uses ease-out quart (or expo/cubic/linear). With **Lock anchor x** the anchor stays horizontally fixed on screen during anchor↔window moves. **Motion blur** is light and only kicks in on fast moves (sub-frame samples across a 180° shutter).

**Cursor tracking** (per shot): *Detect cursor + clicks* finds the pointer by frame differencing (it picks the small blob that got darker, i.e. where the arrow now is), then guesses clicks from "pointer at rest, then the UI changes nearby". The camera follows a heavily smoothed cursor with a dead zone and zooms in on clicks. The shot's start framing is the area it roams in. Detected clicks are editable.

### Audio

The preview plays the same offline mix the export uses:

- Music at its entry point, with fades and gain.
- Auto-ducking under voice (default −9 dB, smoothed ramps).
- Voices RMS-matched to a target level, with a highpass and presence lift.
- SFX: soft pop on each pill; whoosh + thump on a shot marked *Reveal SFX* (the thump lands when the move lands).
- A look-ahead peak limiter at −1 dBFS. It limits peaks without normalizing the whole mix down.

**Kokoro TTS** runs locally in a Web Worker (`kokoro-js`). The default voice is `am_michael` at 1.25× for a fast read. The first run downloads the ~90 MB model from Hugging Face into the browser cache.

## Export

**Export MP4** renders every frame with the same renderer as the preview. It encodes with WebCodecs (H.264 + AAC, falling back to VP9 / Opus when the browser has no H.264/AAC encoder) and muxes with `mp4-muxer`. The output is 1080p60 by default; 1080p30 and 720p60 are also available.

## Projects

- Autosaved to `localStorage`. **File › Save/Open** reads and writes the project as JSON.
- Media lives in IndexedDB and the JSON references it by id. When a project is opened elsewhere, missing media shows a **Relink** button under *Project › Media*.

## Keys

`Space` play/pause · `←/→` beat (`⇧` = bar) · `Home` start · `⌘Z / ⇧⌘Z` undo/redo · `⌘D` duplicate · `⌫` delete · `Esc` deselect · `⌘/Ctrl + wheel` timeline zoom

## Layout

```
src/model      project types, beat math, sample project
src/render     canvas renderer (compose), camera math, demo recording, video sources, cursor detection
src/audio      beat detection, demo track synth, SFX, mixer, limiter, Kokoro worker
src/export     WebCodecs + mp4-muxer export
src/state      zustand store (undo), runtime media cache, transport/mix sync, actions
src/ui         top bar, preview, framing editor, inspector, timeline
```

## Next

- Optional local ffmpeg helper for 4K / ProRes export.
- Layer the product's own spoken replies from the recording right after each command.
