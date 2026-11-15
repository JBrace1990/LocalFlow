import test from 'node:test';
import assert from 'node:assert/strict';
import { SUGGESTED_MODELS } from '../src/suggested-models.js';

test('the suggested pool includes an anime model and a multi-reference image model', () => {
  assert.ok(SUGGESTED_MODELS.some(model => model.id === 'flux-2-klein-4b' && model.maxReferences === null && /multiple/i.test(model.referenceSupport)));
  assert.ok(SUGGESTED_MODELS.some(model => model.id === 'anima' && model.category === 'Image'));
});

test('suggested models identify ComfyUI readiness and reference limits without promising unsupported workflows', () => {
  for (const model of SUGGESTED_MODELS) {
    assert.match(model.repo, /^[\w.-]+\/[\w.-]+$/);
    assert.ok(model.bestFor, `${model.id} should explain its best use`);
    assert.ok(model.compatibility, `${model.id} should explain workflow compatibility`);
    assert.ok(model.license, `${model.id} should show its model license`);
    assert.ok(model.maxReferences === null || typeof model.maxReferences === 'number');
  }
  const anima = SUGGESTED_MODELS.find(model => model.id === 'anima');
  assert.equal(anima.maxReferences, 0);
  assert.match(anima.license, /non-commercial/i);
});

test('the FLUX.2 Klein suggestion links to a ComfyUI-ready repackaged repository', () => {
  const flux = SUGGESTED_MODELS.find(model => model.id === 'flux-2-klein-4b');
  assert.equal(flux.repo, 'Comfy-Org/Flux-2-Klein-4B');
  assert.match(flux.license, /Apache 2\.0/i);
  assert.ok(flux.recommended);
});
