import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const normalizeStart = source.indexOf('function normalizeVisionFocusRegion(');
const cropStart = source.indexOf('function normalizedReferenceCropFilter(');
const cropEnd = source.indexOf('\nfunction animagineReferencePrompt(', cropStart);
assert.ok(normalizeStart >= 0 && cropEnd > cropStart, 'normalized reference crop helpers should be available to the image upload path');
const cropHelpers = vm.runInNewContext(`${source.slice(normalizeStart, cropEnd)}; ({ normalizeVisionFocusRegion, normalizedReferenceCropFilter })`);
const start = source.indexOf('function animagineReferencePrompt(');
const end = source.indexOf('\nasync function inspectAnimagineComfy(', start);
assert.ok(start >= 0 && end > start, 'Animagine workflow builder should remain available for the local ComfyUI workflow');
const buildWorkflow = vm.runInNewContext(`${source.slice(start, end)}; localAnimagineXL4Workflow`);

test('averages multiple same-role design references before applying IP-Adapter', () => {
  const graph = buildWorkflow(
    'A new anime film frame of the ship from the references, full ship in frame.',
    'test/vanguard',
    ['side.png', 'quarter.png', 'front.png'],
    [
      { role: 'vehicle', assetName: 'Vanguard' },
      { role: 'vehicle', assetName: 'Vanguard' },
      { role: 'vehicle', assetName: 'Vanguard' },
    ],
    '16:9',
  );

  const nodes = Object.values(graph);
  assert.equal(nodes.filter(node => node.class_type === 'IPAdapterEncoder').length, 3);
  assert.equal(nodes.filter(node => node.class_type === 'IPAdapterCombineEmbeds').length, 1);
  assert.equal(nodes.filter(node => node.class_type === 'IPAdapterEmbeds').length, 1);
  assert.equal(nodes.filter(node => node.class_type === 'IPAdapterAdvanced').length, 0);
  const combine = nodes.find(node => node.class_type === 'IPAdapterCombineEmbeds');
  assert.equal(combine.inputs.method, 'add');
  const apply = nodes.find(node => node.class_type === 'IPAdapterEmbeds');
  assert.equal(apply.inputs.weight, 0.25);
});

test('gives character identity references stronger conditioning than general subject references', () => {
  const graph = buildWorkflow(
    'A new scene featuring Captain Voss.',
    'test/voss',
    ['voss.png', 'station.png'],
    [
      { role: 'character', assetName: 'Captain Voss' },
      { role: 'subject', assetName: 'Station' },
    ],
    '16:9',
  );
  const weights = Object.values(graph)
    .filter(node => node.class_type === 'IPAdapterAdvanced')
    .map(node => node.inputs.weight);
  assert.deepEqual(weights, [0.9, 0.65]);
});

test('validates vision focus boxes and converts them into a safe FFmpeg crop filter', () => {
  const region = cropHelpers.normalizeVisionFocusRegion({ x: 350, y: 36, width: 200, height: 800 }, 0.95, 'vehicle');
  assert.deepEqual({ ...region }, { x: 0.35, y: 0.036, width: 0.2, height: 0.8 });
  assert.equal(cropHelpers.normalizedReferenceCropFilter(region), 'crop=iw*0.200000:ih*0.800000:iw*0.350000:ih*0.036000');
  const characterRegion=cropHelpers.normalizeVisionFocusRegion({ x: 330, y: 30, width: 170, height: 600 }, 0.97, 'character');
  assert.ok(Math.abs(characterRegion.x - 0.31725) < 1e-10);
  assert.ok(Math.abs(characterRegion.y - 0) < 1e-10);
  assert.ok(Math.abs(characterRegion.width - 0.1955) < 1e-10);
  assert.ok(Math.abs(characterRegion.height - 0.66) < 1e-10);
  const qwenBox=cropHelpers.normalizeVisionFocusRegion({bbox_2d:[400,18,625,681],label:'Image 1'},undefined,'character');
  assert.ok(qwenBox && qwenBox.unit==='px' && qwenBox.y === 0 && qwenBox.height > 700 && qwenBox.width < 300, 'Qwen pixel boxes should expand into one full-body crop');
  assert.equal(cropHelpers.normalizedReferenceCropFilter(qwenBox),'crop=259:729:383:0');
  assert.equal(cropHelpers.normalizeVisionFocusRegion({ x: 100, y: 100, width: 500, height: 500 }, 0.95, 'character'), null, 'a broad square crop is probably the sheet composition, not a character');
  assert.equal(cropHelpers.normalizeVisionFocusRegion({ x: 350, y: 36, width: 200, height: 800 }, 0.4), null);
  assert.equal(cropHelpers.normalizeVisionFocusRegion({ x: 0, y: 0, width: 1000, height: 1000 }), null, 'missing confidence must not treat the full sheet as a subject crop');
  assert.equal(cropHelpers.normalizeVisionFocusRegion({ x: 0, y: 0, width: 1000, height: 1000 }, 0.99), null, 'a whole-image crop is not a useful subject isolation');
  assert.equal(cropHelpers.normalizeVisionFocusRegion({ x: 400, y: 100, width: 300, height: 600 }, 0.95, 'character'), null, 'a broad box spanning multiple poses should trigger focused crop analysis');
  assert.equal(cropHelpers.normalizedReferenceCropFilter({ x: 0.9, y: 0.2, width: 0.3, height: 0.2 }), null);
  assert.equal(cropHelpers.normalizedReferenceCropFilter({ x: 0, y: 0, width: 0.02, height: 0.8 }), null);
  assert.equal(cropHelpers.normalizedReferenceCropFilter(null), null);
});
