import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const workflowStart = source.indexOf('function localQwenImage21Workflow(');
const workflowEnd = source.indexOf('\nfunction animagineReferencePrompt(', workflowStart);
const promptStart = source.indexOf('function qwenReferencePrompt(');
const promptEnd = source.indexOf('\nfunction localMiniMaxH3Workflow(', promptStart);
assert.ok(workflowStart >= 0 && workflowEnd > workflowStart, 'Qwen workflow builder should remain available');
assert.ok(promptStart >= 0 && promptEnd > promptStart, 'Qwen reference prompt builder should remain available');
const buildWorkflow = vm.runInNewContext(`${source.slice(workflowStart, workflowEnd)}; localQwenImage21Workflow`);
const buildPrompt = vm.runInNewContext(`${source.slice(promptStart, promptEnd)}; qwenReferencePrompt`);

test('Qwen reference slots preserve the same order and roles as the attached images', () => {
  const assignments = [
    { slot: 1, assetId: 'voss', assetName: 'Captain Kael Voss', role: 'character' },
    { slot: 2, assetId: 'vanguard', assetName: 'Vanguard', role: 'vehicle' },
    { slot: 3, assetId: 'ship-interior', assetName: 'Vanguard bridge', role: 'location' },
  ];
  const prompt = buildPrompt('Captain Voss reaches for his sidearm on the bridge.', assignments, assignments.length);
  const graph = buildWorkflow(prompt, 'test/continuity', assignments.length, '16:9', 1024);

  assert.equal(graph['4'].class_type, 'TextEncodeQwenImage21');
  assert.equal(graph['4'].inputs['images.image_1'][0], '10');
  assert.equal(graph['4'].inputs['images.image_2'][0], '11');
  assert.equal(graph['4'].inputs['images.image_3'][0], '12');
  assert.deepEqual(
    [graph['10'].inputs.image, graph['11'].inputs.image, graph['12'].inputs.image],
    ['local-flow-reference-1.png', 'local-flow-reference-2.png', 'local-flow-reference-3.png'],
  );
  assert.match(graph['4'].inputs.prompt, /<image1> is Captain Kael Voss.*character identity/i);
  assert.match(graph['4'].inputs.prompt, /<image2> is Vanguard.*vehicle design and silhouette/i);
  assert.match(graph['4'].inputs.prompt, /<image3> is Vanguard bridge.*environment design/i);
  assert.match(graph['4'].inputs.prompt, /new composition that follows the requested action and scene/i);
});
