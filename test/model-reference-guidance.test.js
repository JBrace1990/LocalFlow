import test from 'node:test';
import assert from 'node:assert/strict';
import { modelReferenceGuidance } from '../src/model-reference-guidance.js';

test('Qwen multi-reference guidance reports its actual configured capacity', () => {
  assert.equal(
    modelReferenceGuidance({ id: 'comfy-qwen-image-2-1', name: 'Qwen Image 2.1', maxReferences: 16 }),
    'This model supports up to 16 selected visual references.'
  );
});

test('single-reference local workflows keep the one-frame guidance', () => {
  assert.equal(
    modelReferenceGuidance({ id: 'local-single-ref', name: 'Local Image Model', maxReferences: 1 }),
    'The local workflow uses one reference frame.'
  );
});

test('models with no reference support say so explicitly', () => {
  assert.equal(
    modelReferenceGuidance({ id: 'local-text-image', name: 'Text Image', maxReferences: 0 }),
    'This model does not support visual references.'
  );
});
