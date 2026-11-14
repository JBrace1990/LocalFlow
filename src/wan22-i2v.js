export const WAN22_FILES = Object.freeze([
  ['diffusion_models', 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors'],
  ['diffusion_models', 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors'],
  ['text_encoders', 'umt5_xxl_fp8_e4m3fn_scaled.safetensors'],
  ['vae', 'wan_2.1_vae.safetensors'],
]);

export const WAN22_NODES = Object.freeze([
  'UNETLoader', 'ModelSamplingSD3', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode',
  'WanImageToVideo', 'LoadImage', 'KSamplerAdvanced', 'VAEDecode', 'CreateVideo', 'SaveVideo',
]);

export async function wan22Readiness({ hasFile, hasNode }) {
  const [fileResults, nodeResults] = await Promise.all([
    Promise.all(WAN22_FILES.map(async ([folder, file]) => ({
      label: `${folder}/${file}`,
      ready: Boolean(await hasFile(folder, file).catch(() => false)),
    }))),
    Promise.all(WAN22_NODES.map(async node => ({
      label: node,
      ready: Boolean(await hasNode(node).catch(() => false)),
    }))),
  ]);
  const missingFiles = fileResults.filter(item => !item.ready).map(item => item.label);
  const missingNodes = nodeResults.filter(item => !item.ready).map(item => item.label);
  return {
    filesReady: missingFiles.length === 0,
    supported: missingNodes.length === 0,
    ready: missingFiles.length === 0 && missingNodes.length === 0,
    missingFiles,
    missingNodes,
  };
}

function wanDimensions(resolution, aspectRatio) {
  const heights = { '340p': 340, '480p': 480, '540p': 540, '720p': 720, '1080p': 1080 };
  const requestedHeight = heights[String(resolution || '').toLowerCase()] || 480;
  const height = Math.max(256, Math.round(requestedHeight / 32) * 32);
  const [ratioWidth, ratioHeight] = String(aspectRatio || '16:9').split(':').map(Number);
  const ratio = Number.isFinite(ratioWidth / ratioHeight) && ratioWidth > 0 && ratioHeight > 0
    ? ratioWidth / ratioHeight
    : 16 / 9;
  const width = Math.max(256, Math.round((height * ratio) / 32) * 32);
  return { width, height };
}

function wanFrameLength(durationSeconds) {
  const duration = Math.max(1, Math.min(15, Number(durationSeconds) || 5));
  const target = Math.max(5, Math.round(duration * 16));
  const lower = Math.max(5, target - (((target - 1) % 4 + 4) % 4));
  const upper = lower + 4;
  return target - lower <= upper - target ? lower : upper;
}

export function localWan22I2VWorkflow({ prompt = '', imageName, prefix = 'LocalFlow/video', durationSeconds = 5, resolution = '480p', aspectRatio = '16:9' } = {}) {
  if (!imageName) throw new Error('Wan 2.2 image-to-video requires an approved storyboard keyframe.');
  const { width, height } = wanDimensions(resolution, aspectRatio);
  const length = wanFrameLength(durationSeconds);
  const action = String(prompt || 'Natural, restrained motion that keeps the original image recognizable.').trim();
  const positive = `Use the approved storyboard frame as the exact first frame and visual source. Preserve its visible subject identities, silhouette, face, proportions, clothing, colors, lighting, environment, art style, and composition. Animate only the requested scene action; keep the same subjects and design throughout one continuous shot, with restrained natural motion and no camera cuts. Scene action: ${action}`;
  const negative = 'character turnaround sheet, model sheet, expression sheet, contact sheet, storyboard page, collage, split screen, inset panel, layout, duplicate subject, extra character, extra animal, added vehicle, changed identity, changed outfit, changed colors, altered silhouette, scene cut, camera cut, transition, frozen subject, title card, labels, lettering, logo, watermark, subtitles, captions, text overlay';
  const seed = Math.floor(Math.random() * 2147483647);
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors', weight_dtype: 'default' } },
    '3': { class_type: 'ModelSamplingSD3', inputs: { model: ['1', 0], shift: 8 } },
    '4': { class_type: 'ModelSamplingSD3', inputs: { model: ['2', 0], shift: 8 } },
    '5': { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' } },
    '6': { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
    '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['5', 0], text: positive } },
    '8': { class_type: 'CLIPTextEncode', inputs: { clip: ['5', 0], text: negative } },
    '9': { class_type: 'LoadImage', inputs: { image: imageName } },
    '10': { class_type: 'WanImageToVideo', inputs: { positive: ['7', 0], negative: ['8', 0], vae: ['6', 0], width, height, length, batch_size: 1, start_image: ['9', 0] } },
    '11': { class_type: 'KSamplerAdvanced', inputs: { model: ['3', 0], add_noise: 'enable', noise_seed: seed, steps: 20, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', positive: ['10', 0], negative: ['10', 1], latent_image: ['10', 2], start_at_step: 0, end_at_step: 10, return_with_leftover_noise: 'enable' } },
    '12': { class_type: 'KSamplerAdvanced', inputs: { model: ['4', 0], add_noise: 'disable', noise_seed: 0, steps: 20, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', positive: ['10', 0], negative: ['10', 1], latent_image: ['11', 0], start_at_step: 10, end_at_step: 10000, return_with_leftover_noise: 'disable' } },
    '13': { class_type: 'VAEDecode', inputs: { samples: ['12', 0], vae: ['6', 0] } },
    '14': { class_type: 'CreateVideo', inputs: { images: ['13', 0], fps: 16 } },
    '15': { class_type: 'SaveVideo', inputs: { video: ['14', 0], filename_prefix: prefix, format: 'auto', codec: { codec: 'auto' } } },
  };
}
