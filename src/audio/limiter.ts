/**
 * Look-ahead peak limiter applied in place. Gain drops smoothly (averaged over the look-ahead)
 * before each peak, then releases exponentially. Doesn't normalize the mix down.
 */
export function limitInPlace(chans: Float32Array[], sampleRate: number, ceilingDb = -1, lookaheadMs = 5, releaseMs = 80) {
  const n = chans[0].length;
  const ceil = Math.pow(10, ceilingDb / 20);
  const L = Math.max(1, Math.round((lookaheadMs / 1000) * sampleRate));
  // required gain per sample
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let pk = 0;
    for (const c of chans) pk = Math.max(pk, Math.abs(c[i]));
    req[i] = pk > ceil ? ceil / pk : 1;
  }
  // forward sliding min over [i, i + 2L] (monotonic deque)
  const W = 2 * L;
  const m = new Float32Array(n);
  const dq = new Int32Array(n + W + 1);
  let head = 0;
  let tail = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + W);
    while (j <= hi) {
      while (tail > head && req[dq[tail - 1]] >= req[j]) tail--;
      dq[tail++] = j++;
    }
    while (dq[head] < i) head++;
    m[i] = req[dq[head]];
  }
  // backward moving average over [i-L, i] -> smooth attack that is still ≤ req at the peak
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + m[i];
  const rel = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
  let g = 1;
  for (let i = 0; i < n; i++) {
    const a0 = Math.max(0, i - L);
    const avg = (prefix[i + 1] - prefix[a0]) / (i + 1 - a0);
    g = avg < g ? avg : avg + (g - avg) * rel;
    for (const c of chans) c[i] *= g;
  }
}
