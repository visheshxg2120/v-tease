import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { player } from '../state/player';
import { exportMp4 } from '../export/exportMp4';
import { projectDuration } from '../model/beats';
import { Btn, Row, Select } from './controls';

const PRESETS = {
  '1080p60': { width: 1920, height: 1080, fps: 60, bitrate: 20e6 },
  '1080p30': { width: 1920, height: 1080, fps: 30, bitrate: 14e6 },
  '720p60': { width: 1280, height: 720, fps: 60, bitrate: 10e6 },
} as const;
type PresetKey = keyof typeof PRESETS;

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const p = useStore((s) => s.project);
  const [preset, setPreset] = useState<PresetKey>('1080p60');
  const [state, setState] = useState<{ progress: number; label: string } | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; secs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const supported = typeof VideoEncoder !== 'undefined';

  const start = async () => {
    player.pause();
    setError(null);
    setResult(null);
    const ac = new AbortController();
    abort.current = ac;
    const cfg = PRESETS[preset];
    const t0 = performance.now();
    try {
      const blob = await exportMp4(p, {
        width: cfg.width,
        height: cfg.height,
        fps: cfg.fps,
        videoBitrate: cfg.bitrate,
        signal: ac.signal,
        onProgress: (progress, label) => setState({ progress, label }),
      });
      const url = URL.createObjectURL(blob);
      setResult({ url, size: blob.size, secs: (performance.now() - t0) / 1000 });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.name.replace(/[^\w\- ]+/g, '').trim() || 'teaser'}-${preset}.mp4`;
      a.click();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setState(null);
      abort.current = null;
    }
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !state && onClose()}>
      <div className="modal">
        <h3>Export MP4</h3>
        <Row label="Format">
          <Select
            value={preset}
            options={[
              { value: '1080p60', label: '1920×1080 · 60 fps (H.264)' },
              { value: '1080p30', label: '1920×1080 · 30 fps' },
              { value: '720p60', label: '1280×720 · 60 fps (quick check)' },
            ]}
            onChange={setPreset}
          />
        </Row>
        <p className="hint">
          {projectDuration(p).toFixed(1)}s · {Math.ceil(projectDuration(p) * PRESETS[preset].fps)} frames · rendered in-browser with WebCodecs, muxed with
          mp4-muxer. Audio is the same offline mix you hear in preview (AAC, or Opus if AAC encoding isn't available).
        </p>
        {!supported && <p className="error">WebCodecs isn't available here — use a recent Chrome, Edge or Safari.</p>}
        {state && (
          <div className="progress">
            <div className="bar">
              <span style={{ width: `${state.progress * 100}%` }} />
            </div>
            <span className="muted">{state.label}</span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {result && (
          <p className="ok">
            Done in {result.secs.toFixed(1)}s · {(result.size / 1e6).toFixed(1)} MB ·{' '}
            <a href={result.url} download={`${p.name}.mp4`}>
              download again
            </a>
          </p>
        )}
        <div className="modal-actions">
          {state ? (
            <Btn kind="danger" onClick={() => abort.current?.abort()}>
              Cancel
            </Btn>
          ) : (
            <>
              <Btn kind="ghost" onClick={onClose}>
                Close
              </Btn>
              <Btn kind="primary" disabled={!supported} onClick={start}>
                {result ? 'Export again' : 'Export'}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
