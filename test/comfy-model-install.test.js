import test from 'node:test';
import assert from 'node:assert/strict';
import { comfyCategoryFromFile, resolveComfyModelTarget } from '../src/comfy-model-install.js';

test('model install category comes from ComfyUI paths or curated filename mappings', () => {
  assert.equal(comfyCategoryFromFile('split_files/diffusion_models/model.safetensors'), 'diffusion_models');
  assert.equal(comfyCategoryFromFile('anima-base-v1.0.safetensors', [{ prefix: 'anima-base-v1.0', category: 'diffusion_models' }]), 'diffusion_models');
  assert.equal(comfyCategoryFromFile('unknown.bin'), '');
});

test('ComfyUI model target uses only a configured category folder and a basename', () => {
  assert.equal(resolveComfyModelTarget({ vae: ['C:/Comfy/models/vae'] }, 'vae', 'qwen_image_vae.safetensors'), 'C:\\Comfy\\models\\vae\\qwen_image_vae.safetensors');
  assert.throws(() => resolveComfyModelTarget({}, 'vae', 'weights.safetensors'), /no writable/i);
  assert.throws(() => resolveComfyModelTarget({ vae: ['C:/Comfy/models/vae'] }, 'vae', '../weights.safetensors'), /without a folder path/i);
  assert.throws(() => resolveComfyModelTarget({ vae: ['C:/Comfy/models/vae'] }, 'unknown', 'weights.safetensors'), /supported ComfyUI model category/i);
});
