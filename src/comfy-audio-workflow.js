export const COMFY_AUDIO_MODELS = Object.freeze([
  Object.freeze({
    key: 'checkpoint',
    folder: 'checkpoints',
    filename: 'stable-audio-open-1.0.safetensors',
    url: 'https://huggingface.co/Comfy-Org/stable-audio-open-1.0_repackaged/resolve/main/stable-audio-open-1.0.safetensors',
    label: 'Stable Audio Open 1.0 checkpoint'
  }),
  Object.freeze({
    key: 'textEncoder',
    folder: 'text_encoders',
    filename: 't5-base.safetensors',
    url: 'https://huggingface.co/ComfyUI-Wiki/t5-base/resolve/main/t5-base.safetensors',
    label: 'T5 base text encoder'
  })
]);

export const COMFY_AUDIO_NODE_TYPES = Object.freeze([
  'CheckpointLoaderSimple',
  'CLIPLoader',
  'CLIPTextEncode',
  'ConditioningStableAudio',
  'EmptyLatentAudio',
  'KSampler',
  'VAEDecodeAudio',
  'SaveAudio'
]);

export function comfyAudioReadiness({ connected = false, nodes = [], files = [] } = {}) {
  if (!connected) return { ready: false, reason: 'ComfyUI is not connected.' };
  const missingNodes = COMFY_AUDIO_NODE_TYPES.filter(name => !nodes.includes(name));
  if (missingNodes.length) return { ready: false, reason: `This ComfyUI install is missing audio nodes: ${missingNodes.join(', ')}.` };
  const missingFiles = COMFY_AUDIO_MODELS.filter(model => !files.includes(model.key));
  if (missingFiles.length) return { ready: false, reason: `Download required ComfyUI model files: ${missingFiles.map(model => model.filename).join(', ')}.` };
  return { ready: true, reason: 'ComfyUI audio nodes and Stable Audio model files are ready.' };
}

export function reconcileComfyAudioDownload(status, download) {
  if (status?.ready && download?.state === 'Failed') {
    return {
      ...download,
      state: 'Complete',
      progress: 100,
      error: null,
      message: 'Stable Audio Open is ready in ComfyUI.'
    };
  }
  return download || null;
}

export function buildStableAudioWorkflow({ prompt, duration = 6, seed = 0, filenamePrefix = 'local-flow/sound-effects' } = {}) {
  const text = String(prompt || '').trim();
  if (!text || text.length > 1800) throw new Error('Describe the sound effect in 1,800 characters or fewer.');
  const seconds = Math.max(1, Math.min(30, Number(duration) || 6));
  const safeSeed = Math.max(0, Math.floor(Number(seed) || 0));
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: COMFY_AUDIO_MODELS[0].filename } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: COMFY_AUDIO_MODELS[1].filename, type: 'stable_audio', device: 'default' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text, clip: ['2', 0] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['2', 0] } },
    '5': { class_type: 'ConditioningStableAudio', inputs: { positive: ['3', 0], negative: ['4', 0], seconds_start: 0, seconds_total: seconds } },
    '6': { class_type: 'EmptyLatentAudio', inputs: { seconds, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['5', 0], negative: ['5', 1], latent_image: ['6', 0], seed: safeSeed, steps: 40, cfg: 4.98, sampler_name: 'dpmpp_3m_sde_gpu', scheduler: 'exponential', denoise: 1 } },
    '8': { class_type: 'VAEDecodeAudio', inputs: { samples: ['7', 0], vae: ['1', 2] } },
    '9': { class_type: 'SaveAudio', inputs: { audio: ['8', 0], filename_prefix: String(filenamePrefix).replace(/[\\/]+$/, '') || 'local-flow/sound-effects' } }
  };
}
