import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { localWan22I2VWorkflow, wan22Readiness } from '../src/wan22-i2v.js';

test('Wan 2.2 storyboard workflow anchors the approved keyframe and uses both denoising stages', () => {
  const graph = localWan22I2VWorkflow({
    prompt: 'The red fox calmly approaches the man beside the forest path.',
    imageName: 'approved-fox-scene.png',
    prefix: 'fox-scene-01',
    durationSeconds: 5,
    resolution: '480p',
    aspectRatio: '16:9',
  });

  assert.equal(graph['1'].inputs.unet_name, 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors');
  assert.equal(graph['2'].inputs.unet_name, 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors');
  assert.equal(graph['3'].inputs.shift, 8);
  assert.equal(graph['4'].inputs.shift, 8);
  assert.equal(graph['5'].inputs.clip_name, 'umt5_xxl_fp8_e4m3fn_scaled.safetensors');
  assert.equal(graph['6'].inputs.vae_name, 'wan_2.1_vae.safetensors');
  assert.equal(graph['10'].class_type, 'WanImageToVideo');
  assert.equal(graph['10'].inputs.start_image[0], '9');
  assert.equal(graph['9'].inputs.image, 'approved-fox-scene.png');
  assert.equal(graph['11'].inputs.start_at_step, 0);
  assert.equal(graph['11'].inputs.end_at_step, 10);
  assert.equal(graph['11'].inputs.return_with_leftover_noise, 'enable');
  assert.equal(graph['12'].inputs.add_noise, 'disable');
  assert.equal(graph['12'].inputs.start_at_step, 10);
  assert.equal(graph['12'].inputs.end_at_step, 10000);
  assert.equal(graph['13'].inputs.samples[0], '12');
  assert.equal(graph['14'].inputs.images[0], '13');
  assert.equal(graph['15'].inputs.video[0], '14');
  assert.match(graph['7'].inputs.text, /red fox calmly approaches the man/i);
  assert.match(graph['7'].inputs.text, /approved storyboard frame/i);
  assert.match(graph['8'].inputs.text, /turnaround sheet/i);
  assert.equal(graph['10'].inputs.width, 864);
  assert.equal(graph['10'].inputs.height, 480);
  assert.equal(graph['10'].inputs.length, 81);
  assert.equal(graph['14'].inputs.fps, 16);
});

test('Wan 2.2 duration and dimensions are normalized to supported latent sizes', () => {
  const graph = localWan22I2VWorkflow({
    imageName: 'approved-frame.png',
    prefix: 'test',
    durationSeconds: 5,
    resolution: '340p',
    aspectRatio: '16:9',
  });

  assert.equal(graph['10'].inputs.height % 32, 0);
  assert.equal(graph['10'].inputs.width % 32, 0);
  assert.equal(graph['10'].inputs.length % 4, 1);
  assert.equal(graph['10'].inputs.height, 352);
  assert.equal(graph['10'].inputs.width, 640);
  assert.equal(graph['10'].inputs.length, 81);
});

test('Wan 2.2 readiness requires all four model files and every native workflow node', async () => {
  const all = new Set([
    'diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
    'diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
    'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    'vae/wan_2.1_vae.safetensors',
  ]);
  const nodes = new Set(['UNETLoader', 'ModelSamplingSD3', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode', 'WanImageToVideo', 'LoadImage', 'KSamplerAdvanced', 'VAEDecode', 'CreateVideo', 'SaveVideo']);
  const ready = await wan22Readiness({ hasFile: async (kind, file) => all.has(`${kind}/${file}`), hasNode: async node => nodes.has(node) });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missingFiles, []);
  assert.deepEqual(ready.missingNodes, []);

  const missing = await wan22Readiness({ hasFile: async (kind, file) => !(kind === 'vae' && file === 'wan_2.1_vae.safetensors'), hasNode: async node => node !== 'WanImageToVideo' });
  assert.equal(missing.ready, false);
  assert.ok(missing.missingFiles.includes('vae/wan_2.1_vae.safetensors'));
  assert.ok(missing.missingNodes.includes('WanImageToVideo'));
});

test('ComfyUI exposes Wan 2.2 only when its actual installed dependencies and schemas are ready', async () => {
  const source = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /wan22Readiness\(/);
  assert.match(source, /id:\s*'comfy-wan22-i2v'/);
  assert.match(source, /input\.modelId==='comfy-wan22-i2v'/);
});

test('Wan 2.2 is offered as a built-in video model in Studio', async () => {
  const source = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /\['comfy-minimax-h3','comfy-wan22-i2v'\]\.includes\(m\.id\)/);
});
