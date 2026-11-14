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
  assert.equal(graph['7'].inputs.latent_image.join(','), '4,2', 'reference generation must sample from the encoder latent sized for the first reference');
});

test('Qwen text-to-image without references keeps the requested output aspect ratio', () => {
  const graph = buildWorkflow('A quiet forest at blue hour.', 'test/text-only', 0, '16:9', 1024);
  assert.equal(graph['6'].class_type, 'EmptyLatentImage');
  assert.equal(graph['6'].inputs.width / graph['6'].inputs.height, 16 / 9);
  assert.equal(graph['7'].inputs.latent_image.join(','), '6,0');
});

test('Qwen does not mix design-sheet rendering instructions into character or location identity references', () => {
  const prompt = buildPrompt('The man kneels beside the injured fox at the garden gate.', [
    { assetName: 'Man', role: 'character', assetDescription: 'Japanese man in an indigo work jacket.', assetVisualStyle: 'Turnaround sheet only; no fox or other characters.' },
    { assetName: 'Garden', role: 'location', assetDescription: 'Small garden with a wooden gate.', assetVisualStyle: 'Environment plate only; no people or animals.' },
  ], 2);
  assert.match(prompt, /Japanese man in an indigo work jacket/);
  assert.match(prompt, /Small garden with a wooden gate/);
  assert.doesNotMatch(prompt, /Turnaround sheet only|no fox or other characters|Environment plate only|no people or animals/i);
});
