import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const start = source.indexOf('function localMiniMaxH3ReferenceWorkflow(');
const end = source.indexOf('\nasync function uploadComfyInputImage(', start);
assert.ok(start >= 0 && end > start, 'MiniMax H3 reference workflow builder should be available');
const buildWorkflow = vm.runInNewContext(
  `${source.slice(start, end)}; ({ localMiniMaxH3ReferenceWorkflow, buildMiniMaxH3VideoWorkflowForSource })`,
);

test('storyboard-to-video uses the approved keyframe as the opening image, not design reference sheets', () => {
  const result = buildWorkflow.buildMiniMaxH3VideoWorkflowForSource({
    prompt: 'Animate the fox meeting the man.',
    prefix: 'scene-01',
    durationSeconds: 5,
    resolution: '340p',
    aspectRatio: '16:9',
    sourceMode: 'storyboard',
    referenceImageNames: ['fox-turnaround.png', 'man-turnaround.png'],
    imageName: 'approved-scene.png',
    endImageName: null,
  });

  assert.equal(result.graph['6'].class_type, 'MiniMaxH3ImageToVideo');
  assert.equal(result.graph['5'].inputs.image, 'approved-scene.png');
  assert.deepEqual(Array.from(result.imageInputNames), ['approved-scene.png']);
  assert.equal(result.nativeVideoReferenceWorkflow, false);
});

test('text-to-video retains reference conditioning when reference images are selected', () => {
  const result = buildWorkflow.buildMiniMaxH3VideoWorkflowForSource({
    prompt: '<Picture 1> is the fox.',
    prefix: 'scene-01',
    durationSeconds: 5,
    resolution: '340p',
    aspectRatio: '16:9',
    sourceMode: 'text',
    referenceImageNames: ['fox-turnaround.png'],
    imageName: null,
    endImageName: null,
  });

  assert.equal(result.graph['6'].class_type, 'MiniMaxH3ReferenceToVideo');
  assert.equal(result.graph['30'].inputs.image, 'fox-turnaround.png');
  assert.deepEqual(Array.from(result.imageInputNames), ['fox-turnaround.png']);
  assert.equal(result.nativeVideoReferenceWorkflow, true);
});

test('MiniMax H3 maps each visual reference to the matching ordered Picture slot', () => {
  const graph = buildWorkflow.localMiniMaxH3ReferenceWorkflow(
    '<Picture 1> is Captain Voss. <Picture 2> is Vanguard.',
    'scene-01',
    5,
    '340p',
    '16:9',
    ['voss.png', 'vanguard.png'],
    'opening.png',
    'ending.png',
  );

  assert.equal(graph['6'].class_type, 'MiniMaxH3ReferenceToVideo');
  assert.deepEqual(Object.keys(graph['6'].inputs.ref_images), ['ref_image_0', 'ref_image_1']);
  assert.equal(graph['6'].inputs.ref_images.ref_image_0[0], '30');
  assert.equal(graph['6'].inputs.ref_images.ref_image_1[0], '31');
  assert.equal('ref_image_0' in graph['6'].inputs, false, 'dynamic refs must be nested under the ref_images input group');
  assert.equal(graph['30'].inputs.image, 'voss.png');
  assert.equal(graph['31'].inputs.image, 'vanguard.png');
});

test('reference-conditioned video can retain exact opening and ending storyboard anchors', () => {
  const graph = buildWorkflow.localMiniMaxH3ReferenceWorkflow(
    '<Picture 1> is Captain Voss.',
    'scene-01',
    5,
    '340p',
    '16:9',
    ['voss.png'],
    'opening.png',
    'ending.png',
  );

  assert.equal(graph['20'].class_type, 'MiniMaxH3AddGuide');
  assert.equal(graph['20'].inputs.positive[0], '6');
  assert.equal(graph['20'].inputs.frame_idx, 0);
  assert.equal(graph['20'].inputs.image[0], '5');
  assert.equal(graph['21'].inputs.positive[0], '20');
  assert.equal(graph['21'].inputs.frame_idx, -1);
  assert.equal(graph['21'].inputs.image[0], '18');
  assert.equal(graph['8'].inputs.conditioning[0], '21');
});
