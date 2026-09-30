// Runs kokoro-js off the main thread. The model (~90 MB, q8) is fetched from Hugging Face once and
// cached by the browser.
import { KokoroTTS } from 'kokoro-js';

let model: Promise<KokoroTTS> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, text, voice, speed } = e.data as { id: number; text: string; voice: string; speed: number };
  try {
    model ??= KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: unknown) => (self as unknown as Worker).postMessage({ type: 'progress', id, p }),
    });
    const tts = await model;
    const audio = await tts.generate(text, { voice: voice as never, speed });
    const samples = new Float32Array(audio.audio);
    (self as unknown as Worker).postMessage({ type: 'done', id, samples, sampleRate: audio.sampling_rate }, [samples.buffer]);
  } catch (err) {
    model = null;
    (self as unknown as Worker).postMessage({ type: 'error', id, message: String((err as Error)?.message ?? err) });
  }
};
