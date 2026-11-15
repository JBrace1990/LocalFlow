import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const start = source.indexOf('function enhancedReferenceAssignmentBlock(');
const end = source.indexOf('\nasync function inspectAnimagineComfy(', start);
assert.ok(start >= 0 && end > start, 'Enhance reference assignment formatter should remain available');
const formatAssignments = vm.runInNewContext(
  `${source.slice(start, end)}; enhancedReferenceAssignmentBlock`,
);

test('Enhance prompt maps each capped reference slot to its named subject and role', () => {
  const block = formatAssignments([
    { assetName: 'Captain Voss', roleName: 'character identity', assetDescription: 'Dark tousled hair and scar on right cheek', referenceObservations: 'same face and build' },
    { assetName: 'Vanguard', roleName: 'vehicle silhouette', assetDescription: 'Long white and charcoal modular starship' },
    { assetName: 'Blue anomaly', roleName: 'location palette' },
  ], 2);

  assert.match(block, /Reference 1 is Captain Voss \(character identity\)/);
  assert.match(block, /same face and build/);
  assert.match(block, /Reference 2 is Vanguard \(vehicle silhouette\)/);
  assert.doesNotMatch(block, /Blue anomaly/);
  assert.doesNotMatch(block, /\.png|filename|file name/i);
});

test('Enhance prompt adds no reference block when no references are assigned', () => {
  assert.equal(formatAssignments([], 8), '');
});
