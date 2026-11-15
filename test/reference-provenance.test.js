import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStyleGuideReference } from '../src/reference-provenance.js';

test('style reference resolves to its named art-direction asset rather than a stale character parent id', () => {
  const project = { visualAssets: [
    { id: 'fox-id', name: 'Red Fox', category: 'Character', description: 'Russet fox identity.' },
    { id: 'style-id', name: 'Series art direction and palette', category: 'Style', description: 'Modern Japanese anime palette.' },
  ] };
  const ref = resolveStyleGuideReference({
    id: 'style-frame',
    name: 'Series art direction and palette · design 1',
    assignedAssetId: 'fox-id',
    assetName: 'Red Fox',
    url: '/api/media/style.png',
  }, project);

  assert.equal(ref.assignedAssetId, 'style-id');
  assert.equal(ref.assetName, 'Series art direction and palette');
  assert.equal(ref.assetCategory, 'Style');
  assert.equal(ref.assetDescription, 'Modern Japanese anime palette.');
});

test('unmatched style reference does not keep a stale non-style asset owner', () => {
  const ref = resolveStyleGuideReference({ name: 'Series visual guide', assignedAssetId: 'fox-id', assetName: 'Red Fox' }, {
    visualAssets: [{ id: 'fox-id', name: 'Red Fox', category: 'Character' }],
  });
  assert.equal(ref.assignedAssetId, '');
  assert.equal(ref.assetName, 'Series visual guide');
});
