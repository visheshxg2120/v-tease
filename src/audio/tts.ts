export const TTS_VOICES = [
  { id: 'am_michael', label: 'Michael (US, male)' },
  { id: 'am_fenrir', label: 'Fenrir (US, male)' },
  { id: 'am_puck', label: 'Puck (US, male)' },
  { id: 'am_onyx', label: 'Onyx (US, male)' },
  { id: 'am_eric', label: 'Eric (US, male)' },
  { id: 'bm_george', label: 'George (UK, male)' },
  { id: 'bm_fable', label: 'Fable (UK, male)' },
  { id: 'af_heart', label: 'Heart (US, female)' },
  { id: 'af_bella', label: 'Bella (US, female)' },
];

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: { samples: Float32Array; sampleRate: number }) => void; reject: (e: Error) => void; onProgress?: (msg: string) => void }
>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ttsWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const d = e.data;
    const job = pending.get(d.id);
    if (!job) return;
    if (d.type === 'progress') {
      const p = d.p as { status?: string; file?: string; progress?: number };
      if (p?.status === 'progress' && p.file) job.onProgress?.(`Downloading model… ${Math.round(p.progress ?? 0)}%`);
      else if (p?.status === 'ready') job.onProgress?.('Generating…');
    } else if (d.type === 'done') {
      pending.delete(d.id);
      job.resolve({ samples: d.samples, sampleRate: d.sampleRate });
    } else if (d.type === 'error') {
      pending.delete(d.id);
      job.reject(new Error(d.message));
    }
  };
  return worker;
}

/** Generate speech locally with Kokoro. */
export function synthesize(text: string, voice: string, speed: number, onProgress?: (msg: string) => void) {
  const id = nextId++;
  return new Promise<{ samples: Float32Array; sampleRate: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    onProgress?.('Loading Kokoro…');
    getWorker().postMessage({ id, text, voice, speed });
  });
}
