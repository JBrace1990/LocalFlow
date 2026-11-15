export const COMFY_MODEL_CATEGORIES = new Set([
  'checkpoints', 'clip', 'clip_vision', 'controlnet', 'diffusion_models',
  'embeddings', 'loras', 'text_encoders', 'upscale_models', 'vae',
  'audio_encoders', 'audio_models'
]);

export function comfyCategoryFromFile(file, fileTargets = []) {
  const segments = String(file || '').replaceAll('\\', '/').split('/').filter(Boolean);
  const category = segments.find(segment => COMFY_MODEL_CATEGORIES.has(segment));
  if (category) return category;
  const filename = segments.at(-1) || '';
  const mapping = fileTargets.find(rule => filename.toLowerCase().startsWith(String(rule.prefix || '').toLowerCase()));
  return mapping && COMFY_MODEL_CATEGORIES.has(mapping.category) ? mapping.category : '';
}

export function resolveComfyModelTarget(folderPaths, category, file) {
  if (!COMFY_MODEL_CATEGORIES.has(category)) throw new Error('Choose a supported ComfyUI model category.');
  const folders = folderPaths?.[category];
  if (!Array.isArray(folders) || !folders.length) throw new Error(`ComfyUI has no writable ${category} model folder.`);
  const rawFile = String(file || '');
  const filename = rawFile.split(/[\\/]/).at(-1);
  if (!filename || filename === '.' || filename === '..' || filename !== rawFile) {
    throw new Error('Choose a model file name without a folder path.');
  }
  const configuredBase = String(folders[0]).replace(/[\\/]+$/, '');
  const windowsPath = /^(?:[A-Za-z]:[\\/]|\\\\)/.test(configuredBase);
  const base = windowsPath ? configuredBase.replaceAll('/', '\\') : configuredBase;
  return `${base}${windowsPath ? '\\' : '/'}${filename}`;
}
