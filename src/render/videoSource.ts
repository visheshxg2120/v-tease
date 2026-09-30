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
    this.el = el;
    this.ready = new Promise((resolve, reject) => {
      el.addEventListener('loadeddata', () => resolve(), { once: true });
      el.addEventListener('error', () => reject(el.error), { once: true });
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

  /** Export: resolve once the frame at `t` is decoded. */
  async seekExact(t: number) {
    const el = this.el;
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - t) < 1e-4 && !this.seeking) return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      el.addEventListener('seeked', done, { once: true });
      this.pendingSeek = null;
      this.seeking = true;
      el.currentTime = t;
    });
  }
}
