let holder: HTMLDivElement | null = null;
/** Detached media elements can be starved of loading/decoding; keep them in the DOM, invisible. */
function mediaHolder() {
  if (!holder) {
    holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:0;bottom:0;width:4px;height:4px;overflow:hidden;pointer-events:none;z-index:-1';
    document.body.appendChild(holder);
  }
  return holder;
}

/** Wraps an HTMLVideoElement for preview sync (loose, rate-matched) and export (frame-exact seeks). */
export class VideoSource {
  el: HTMLVideoElement;
  ready: Promise<void>;
  private seeking = false;
  private pendingSeek: number | null = null;
  onFrame: (() => void) | null = null;

  constructor(url: string) {
    const el = document.createElement('video');
    el.src = url;
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.style.width = '2px';
    mediaHolder().appendChild(el);
    this.el = el;
    let loaded = false;
    this.ready = new Promise((resolve, reject) => {
      el.addEventListener(
        'loadeddata',
        () => {
          loaded = true;
          resolve();
        },
        { once: true },
      );
      el.addEventListener('error', () => reject(el.error), { once: true });
      // Only for the initial load: nudge a stall once, then fail instead of hanging forever.
      setTimeout(() => !loaded && el.load(), 4000);
      setTimeout(() => !loaded && reject(new Error('Video failed to load')), 15000);
    });
    el.addEventListener('seeked', () => {
      this.seeking = false;
      if (this.pendingSeek != null) {
        const t = this.pendingSeek;
        this.pendingSeek = null;
        this.seek(t);
      }
      this.onFrame?.();
    });
  }

  get width() {
    return this.el.videoWidth;
  }
  get height() {
    return this.el.videoHeight;
  }
  get duration() {
    return this.el.duration;
  }

  private seek(t: number) {
    if (this.seeking) {
      this.pendingSeek = t;
      return;
    }
    this.seeking = true;
    this.el.currentTime = t;
  }

  /** Preview: keep the element near `t`. While playing, match rate and only correct drift. */
  sync(t: number, playing: boolean, rate: number) {
    const el = this.el;
    if (!playing || rate <= 0.01) {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - t) > 1 / 120) this.seek(t);
      return;
    }
    const r = Math.min(16, Math.max(0.0625, rate));
    if (Math.abs(el.playbackRate - r) > 0.01) el.playbackRate = r;
    if (el.paused) el.play().catch(() => {});
    if (Math.abs(el.currentTime - t) > 0.15) this.seek(t);
  }

  pause() {
    if (!this.el.paused) this.el.pause();
  }

  /** Export/analysis: resolve once the frame at `t` is decoded (re-seeks if something else moved it). */
  async seekExact(t: number) {
    const el = this.el;
    await this.ready;
    if (!el.paused) el.pause();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Math.abs(el.currentTime - t) < 1e-3 && !this.seeking && el.readyState >= 2) return;
      await new Promise<void>((resolve) => {
        // a seek that never reports back must not hang export/analysis
        const timer = setTimeout(resolve, 3000);
        el.addEventListener(
          'seeked',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        this.pendingSeek = null;
        this.seeking = true;
        el.currentTime = t;
      });
    }
  }
}
