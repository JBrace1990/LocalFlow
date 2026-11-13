import test from 'node:test';
import assert from 'node:assert/strict';
import { assetDesignModelsFor, assetHasPendingGeneration, createProjectDraft, normalizeFilmDuration } from '../src/project-setup.js';

test('project setup requires a non-empty name before creating a project', () => {
  assert.equal(createProjectDraft('   '), null);
  assert.equal(createProjectDraft('  Fox story  ').name, 'Fox story');
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
