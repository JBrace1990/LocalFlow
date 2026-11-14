import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const durations = await import('../src/video-duration.js').catch(() => ({}));
const source = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

const models = [
  { id: 'comfy-minimax-h3', vendor: 'Local ComfyUI', type: 'Video' },
  { id: 'minimax-video', vendor: 'MiniMax', type: 'Video' },
  { id: 'comfy-other-video', vendor: 'Local ComfyUI', type: 'Video' },
];

test('local H3 duration uses a decimal minimum and one-second increments', () => {
  assert.equal(typeof durations.videoDurationRange, 'function', 'video duration range helper is required');
  const range = durations.videoDurationRange(models, 'comfy-minimax-h3');
  assert.deepEqual(range, { min: 5.2, max: 15, step: 1, options: null });
  assert.equal(durations.isVideoDurationSupported(models, 'comfy-minimax-h3', '5.2s'), true);
  assert.equal(durations.isVideoDurationSupported(models, 'comfy-minimax-h3', '5.1s'), false);
  assert.equal(durations.isVideoDurationSupported(models, 'comfy-minimax-h3', '6.2s'), true);
  assert.equal(durations.isVideoDurationSupported(models, 'comfy-minimax-h3', '6.5s'), false);
  assert.equal(durations.closestVideoDuration(models, 'comfy-minimax-h3', '4s'), '5.2s');
  assert.equal(durations.closestVideoDuration(models, 'comfy-minimax-h3', '15.8s'), '15s');
});

test('hosted MiniMax keeps its supported discrete durations and other models retain their limits', () => {
  assert.equal(typeof durations.videoDurationRange, 'function', 'video duration range helper is required');
  assert.deepEqual(durations.videoDurationRange(models, 'minimax-video'), { min: 6, max: 10, step: 1, options: [6, 10] });
  assert.equal(durations.closestVideoDuration(models, 'minimax-video', '8s'), '6s');
  assert.deepEqual(durations.videoDurationRange(models, 'comfy-other-video'), { min: 3, max: 15, step: 1, options: null });
});

test('Studio and generation settings use a model-aware numeric duration control', () => {
  assert.match(source, /function VideoDurationField\(/);
  assert.equal((source.match(/<VideoDurationField\b/g) || []).length, 2, 'both Studio video settings surfaces use the shared control');
  assert.match(source, /type="number"[\s\S]*?min=\{range\.min\}[\s\S]*?max=\{range\.max\}[\s\S]*?step=\{range\.step\}/);
  assert.doesNotMatch(source, /parseInt\(targetShot\?\.duration,10\)/);
});
