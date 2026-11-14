import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateSceneDurations, assetDesignModelsFor, assetHasPendingGeneration, createProjectDraft, normalizeFilmDuration, videoModelSupportsSourceMode, visibleGenerationQueueItems } from '../src/project-setup.js';

const mainSource = await fs.readFile(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'src/main.jsx'), 'utf8');

test('project setup requires a non-empty name before creating a project', () => {
  assert.equal(createProjectDraft('   '), null);
  assert.equal(createProjectDraft('  Fox story  ').name, 'Fox story');
});

test('video model picker filters storyboard-only models using the app workflow state', () => {
  assert.match(mainSource, /videoModels=generationModelsFor\(models,'Video',workflowModelSlots,customWorkflows\)\.filter\(model=>videoModelSupportsSourceMode\(model,videoWorkflowMode\)\)/);
});

test('document outside-click handler does not call a removed profile-menu state setter', () => {
  assert.doesNotMatch(mainSource, /setProfileMenuOpen/);
});

test('both project creation dialogs require a name and show a neutral example', () => {
  const nameFields = mainSource.match(/id="new-project-name"[\s\S]*?placeholder="[^"]*"/g) || [];
  assert.equal(nameFields.length, 2);
  assert.equal(nameFields.filter(field => /\brequired\b/.test(field)).length, 2);
  assert.equal(nameFields.filter(field => /placeholder="e\.g\./.test(field)).length, 2);
  assert.doesNotMatch(mainSource, /placeholder="The Fox’s Wish"/);
});

test('project setup stores the requested film duration in seconds', () => {
  const project = createProjectDraft('Fox story', 90);
  assert.equal(project.targetDurationSeconds, 90);
  assert.equal(normalizeFilmDuration('2.5'), 2.5);
  assert.equal(normalizeFilmDuration('bad'), null);
});

test('asset design model choices exclude API-only, unsupported, and edit-only models', () => {
  const models = [
    { id: 'animagine', type: 'Image', vendor: 'Local ComfyUI', maxReferences: 8 },
    { id: 'qwen-edit', name: 'Qwen Image Edit 2509', type: 'Image', maxReferences: 3 },
    { id: 'minimax', type: 'Image', vendor: 'MiniMax', maxReferences: 1 },
    { id: 'z-image', type: 'Image', vendor: 'Local ComfyUI', maxReferences: 0 },
    { id: 'h3', type: 'Video', maxReferences: 9 },
  ];
  assert.deepEqual(assetDesignModelsFor(models).map(model => model.id), ['animagine']);
});

test('Wan 2.2 is available for storyboard image-to-video but not text-to-video', () => {
  assert.equal(videoModelSupportsSourceMode({ id: 'comfy-wan22-i2v' }, 'storyboard'), true);
  assert.equal(videoModelSupportsSourceMode({ id: 'comfy-wan22-i2v' }, 'image'), true);
  assert.equal(videoModelSupportsSourceMode({ id: 'comfy-wan22-i2v' }, 'text'), false);
  assert.equal(videoModelSupportsSourceMode({ id: 'comfy-minimax-h3' }, 'text'), true);
});

test('asset generation status only counts active queue states for that asset', () => {
  const queue = [
    { assetTargetId: 'fox', state: 'Running' },
    { assetTargetId: 'wolf', state: 'Complete' },
    { assetTargetId: 'wolf', state: 'Failed' },
  ];
  assert.equal(assetHasPendingGeneration('fox', queue), true);
  assert.equal(assetHasPendingGeneration('wolf', queue), false);
  assert.equal(assetHasPendingGeneration('other', queue), false);
});

test('visible queue keeps active Story Chat asset jobs when ComfyUI queue polling misses them', () => {
  const job = { id: 'asset-job-1', remoteId: 'prompt-1', assetId: 'asset-image-1', assetTargetId: 'fox', provider: 'ComfyUI', state: 'Running' };
  const rows = visibleGenerationQueueItems([], [job]);
  assert.deepEqual(rows.map(row => row.id), ['asset-job-1']);
  assert.equal(rows[0].state, 'Running');
  assert.equal(rows[0].assetTargetId, 'fox');
});

test('visible queue avoids duplicating Story Chat asset jobs reported by ComfyUI', () => {
  const job = { id: 'asset-job-1', remoteId: 'prompt-1', assetId: 'asset-image-1', assetTargetId: 'fox', provider: 'ComfyUI', state: 'Queued' };
  const rows = visibleGenerationQueueItems([{ promptId: 'prompt-1', state: 'Running', title: 'Fox design' }], [job]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'asset-job-1');
  assert.equal(rows[0].state, 'Running');
});

test('connected ComfyUI queue hides persisted asset jobs that are absent from its live queue', () => {
  const stale = { id: 'stale-asset-job', assetId: 'old-image', assetTargetId: 'fox', provider: 'ComfyUI', state: 'Queued' };
  const visible = visibleGenerationQueueItems([], [stale], [], true);
  assert.deepEqual(visible, []);
  assert.equal(assetHasPendingGeneration('fox', visible), false);
  assert.deepEqual(visibleGenerationQueueItems([], [stale], [], false), [stale]);
});

test('connected ComfyUI queue keeps a locally tracked asset job visible while polling catches up', () => {
  const submitted = { id: 'live-asset-job', assetId: 'new-image', assetTargetId: 'fox', provider: 'ComfyUI', state: 'Queued', remoteId: 'prompt-1' };
  const visible = visibleGenerationQueueItems([], [submitted], [], true, new Set(['live-asset-job']));
  assert.deepEqual(visible, [submitted]);
  assert.equal(assetHasPendingGeneration('fox', visible), true);
});

test('connected ComfyUI queue keeps local submissions visible until a prompt ID is assigned', () => {
  const submitting = { id: 'submitting-asset-job', assetId: 'new-image', assetTargetId: 'fox', provider: 'ComfyUI', state: 'Submitting' };
  assert.deepEqual(visibleGenerationQueueItems([], [submitting], [], true), [submitting]);
});

test('scene durations split the target film runtime exactly across all scenes', () => {
  const durations = allocateSceneDurations(90, 12);
  assert.equal(durations.length, 12);
  assert.equal(durations.reduce((sum, value) => sum + Number.parseFloat(value), 0), 90);
  assert.deepEqual(allocateSceneDurations(10, 3), ['3.4s', '3.3s', '3.3s']);
});
