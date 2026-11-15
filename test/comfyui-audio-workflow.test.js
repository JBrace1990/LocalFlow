import test from 'node:test';
import assert from 'node:assert/strict';
import { COMFY_AUDIO_MODELS, buildStableAudioWorkflow, comfyAudioReadiness, reconcileComfyAudioDownload } from '../src/comfy-audio-workflow.js';

test('Stable Audio download catalog keeps weights in Comfy model folders', () => {
  assert.deepEqual(COMFY_AUDIO_MODELS.map(model => [model.key, model.folder, model.filename]), [
    ['checkpoint', 'checkpoints', 'stable-audio-open-1.0.safetensors'],
    ['textEncoder', 'text_encoders', 't5-base.safetensors']
  ]);
  assert.ok(COMFY_AUDIO_MODELS.every(model => model.url.startsWith('https://huggingface.co/')));
});

test('Stable Audio API workflow binds prompt, duration, and saved FLAC output', () => {
  const graph = buildStableAudioWorkflow({ prompt: 'Rain on a metal roof', duration: 8, seed: 42, filenamePrefix: 'local-flow/test' });
  assert.equal(graph['3'].inputs.text, 'Rain on a metal roof');
  assert.equal(graph['5'].inputs.seconds_total, 8);
  assert.equal(graph['6'].inputs.seconds, 8);
  assert.deepEqual(graph['9'].inputs.audio, ['8', 0]);
  assert.equal(graph['9'].class_type, 'SaveAudio');
  assert.equal(graph['9'].inputs.filename_prefix, 'local-flow/test');
  assert.equal(graph['7'].inputs.seed, 42);
});

test('Comfy audio readiness requires all native nodes and both files', () => {
  const nodes = ['CheckpointLoaderSimple', 'CLIPLoader', 'CLIPTextEncode', 'ConditioningStableAudio', 'EmptyLatentAudio', 'KSampler', 'VAEDecodeAudio', 'SaveAudio'];
  assert.equal(comfyAudioReadiness({ connected: true, nodes, files: ['checkpoint', 'textEncoder'] }).ready, true);
  const missingNode = comfyAudioReadiness({ connected: true, nodes: nodes.filter(node => node !== 'ConditioningStableAudio'), files: ['checkpoint', 'textEncoder'] });
  assert.equal(missingNode.ready, false);
  assert.match(missingNode.reason, /ConditioningStableAudio/);
  const missingModel = comfyAudioReadiness({ connected: true, nodes, files: ['checkpoint'] });
  assert.equal(missingModel.ready, false);
  assert.match(missingModel.reason, /t5-base/);
  assert.equal(comfyAudioReadiness({ connected: false, nodes, files: [] }).ready, false);
});

test('installed models clear a stale failed download status', () => {
  const prior = { id: 'download-1', state: 'Failed', progress: 0, error: 'fetch failed', message: 'fetch failed' };
  assert.deepEqual(reconcileComfyAudioDownload({ ready: true }, prior), {
    ...prior,
    state: 'Complete',
    progress: 100,
    error: null,
    message: 'Stable Audio Open is ready in ComfyUI.'
  });
  assert.equal(reconcileComfyAudioDownload({ ready: false }, prior), prior);
});
