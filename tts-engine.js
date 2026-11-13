import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const SUPPORTED_VOICES = new Set([
  'af_heart','af_alloy','af_aoede','af_bella','af_jessica','af_kore','af_nicole','af_nova','af_river','af_sarah','af_sky',
  'am_adam','am_echo','am_eric','am_fenrir','am_liam','am_michael','am_onyx','am_puck','am_santa',
  'bf_alice','bf_emma','bf_isabella','bf_lily','bm_daniel','bm_fable','bm_george','bm_lewis'
]);

let active = null;
let loading = null;
let currentStatus = { state: 'Idle', progress: 0, message: 'Local speech model is ready to download on first use.' };
let generationQueue = Promise.resolve();

export function getLocalTtsStatus() {
  return { ...currentStatus };
}

export function getLocalTtsModels() {
  return [{ id: DEFAULT_MODEL, name: 'Kokoro 82M v1.0 · English voices', size: 'about 90 MB', license: 'Apache-2.0' }];
}

export async function prepareLocalSpeech(options) {
  await loadModel(options);
  return getLocalTtsStatus();
}

async function loadModel({ model = DEFAULT_MODEL, dtype = 'q8', device = 'cpu', cacheDir }) {
  const key = `${model}|${dtype}|${device}`;
  if (active?.key === key) return active.instance;
  if (loading?.key === key) return loading.promise;
  if (!/^[-\w.]+\/[-\w./]+$/.test(model) || model.includes('..')) throw new Error('Choose a supported local Kokoro model.');
  if (!['q8','q4','q4f16','fp16','fp32'].includes(dtype)) throw new Error('Choose a supported Kokoro model precision.');
  if (!['cpu','webgpu','wasm'].includes(device)) throw new Error('Choose a supported local speech device.');

  currentStatus = { state: 'Loading', progress: 0, message: 'Preparing Kokoro speech model', model };
  const promise = (async () => {
    await fs.mkdir(cacheDir, { recursive: true });
    const { env } = await import('@huggingface/transformers');
    env.cacheDir = `${path.resolve(cacheDir)}${path.sep}`;
    env.useFSCache = true;
    env.allowRemoteModels = true;
    const { KokoroTTS } = await import('kokoro-js');
    const instance = await KokoroTTS.from_pretrained(model, {
      dtype,
      device,
      progress_callback(info) {
        if (info.status === 'progress') {
          const progress = Math.max(0, Math.min(100, Math.round(info.progress || 0)));
          currentStatus = { state: 'Downloading', progress, message: `${info.file || 'Model file'} · ${progress}%`, model };
        } else if (info.status === 'initiate') {
          currentStatus = { state: 'Downloading', progress: 0, message: `Downloading ${info.file || 'speech model'}`, model };
        } else if (info.status === 'done') {
          currentStatus = { state: 'Loading', progress: 100, message: `Loading ${info.file || 'speech model'}`, model };
        }
      }
    });
    active = { key, instance };
    currentStatus = { state: 'Ready', progress: 100, message: 'Kokoro local speech model is ready.', model };
    return instance;
  })();
  loading = { key, promise };
  try {
    return await promise;
  } catch (error) {
    currentStatus = { state: 'Failed', progress: 0, message: error.message, model };
    throw error;
  } finally {
    if (loading?.promise === promise) loading = null;
  }
}

export async function generateLocalSpeech({ text, voice = 'af_heart', rate = 1, model, dtype = 'q8', device = 'cpu', cacheDir }) {
  const run = generationQueue.then(async () => {
    if (!SUPPORTED_VOICES.has(voice)) throw new Error('Choose an English Kokoro voice.');
    const tts = await loadModel({ model, dtype, device, cacheDir });
    currentStatus = { state: 'Generating', progress: 100, message: 'Generating English narration locally.', model: model || DEFAULT_MODEL };
    const audio = await tts.generate(String(text), { voice, speed: Math.max(0.7, Math.min(1.3, Number(rate) || 1)) });
    const duration = audio.audio.length / audio.sampling_rate;
    currentStatus = { state: 'Ready', progress: 100, message: 'Kokoro local speech model is ready.', model: model || DEFAULT_MODEL };
    return { bytes: Buffer.from(audio.toWav()), duration, sampleRate: audio.sampling_rate };
  });
  generationQueue = run.catch(() => {});
  return run;
}
