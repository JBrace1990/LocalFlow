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
  `${source.slice(start, end)}; localMiniMaxH3ReferenceWorkflow`,
);

test('MiniMax H3 maps each visual reference to the matching ordered Picture slot', () => {
  const graph = buildWorkflow(
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
  const graph = buildWorkflow(
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
