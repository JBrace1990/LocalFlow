export const SUGGESTED_MODELS = [
  {
    id: 'flux-2-klein-4b',
    name: 'FLUX.2 Klein 4B',
    category: 'Image',
    repo: 'Comfy-Org/Flux-2-Klein-4B',
    license: 'Apache 2.0',
    bestFor: 'Best next model to evaluate for new keyframes guided by multiple visual references. The model family supports text-to-image, editing, and multi-reference composition.',
    referenceSupport: 'Multiple images supported by model workflows; LocalFlow integration is not configured yet.',
    maxReferences: null,
    compatibility: 'ComfyUI repackaged weights and an official text-to-image template are available. A reference-capable graph must be configured before it appears as a usable LocalFlow generation model.',
    sizeNote: 'Multi-file model bundle; choose only the required ComfyUI files. Check file sizes before downloading.',
    recommended: true,
    comfyUrl: 'https://comfy.org/hub/workflows/flux-2-klein-4b-text-to-image-814fd547d86e/'
  },
  {
    id: 'anima',
    name: 'Anima',
    category: 'Image',
    repo: 'circlestone-labs/Anima',
    license: 'CircleStone Labs Non-Commercial License',
    bestFor: 'Anime-focused text-to-image concepts and illustrations.',
    referenceSupport: 'No visual-reference capacity is configured; use it for prompt-led style exploration, not character matching.',
    maxReferences: 0,
    compatibility: 'ComfyUI supports Anima, but it needs its model, text encoder, VAE, and a compatible workflow. LocalFlow integration is not configured yet.',
    sizeNote: 'Requires multiple model files. Check each file size before downloading.',
    fileTargets: [
      { prefix: 'anima-base-v1.0', category: 'diffusion_models' },
      { prefix: 'qwen_3_06b_base', category: 'text_encoders' },
      { prefix: 'qwen_image_vae', category: 'vae' }
    ],
    recommended: false,
    comfyUrl: ''
  },
  {
    id: 'ltx-2-3',
    name: 'LTX-2.3',
    category: 'Video',
    repo: 'Comfy-Org/ltx-2.3',
    license: 'LTX-2 Community License',
    bestFor: 'Text-to-video and image-to-video clips from approved storyboard keyframes.',
    referenceSupport: 'Image-to-video uses a starting frame; it is not a multi-character reference system.',
    maxReferences: 1,
    compatibility: 'Official ComfyUI video workflows are available. LocalFlow would need a matching workflow and model-path setup before this can generate from Studio.',
    sizeNote: 'Large video model bundle with several dependencies. Review all file sizes before downloading.',
    recommended: false,
    comfyUrl: 'https://comfy.org/hub/workflows/ai-on-the-lot-2026-ltx-2-3-i2v-67981edb9ad4/'
  }
];
