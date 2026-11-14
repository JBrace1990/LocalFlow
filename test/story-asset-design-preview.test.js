import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as storyAssetDesign from '../src/story-asset-design.js';
import { featuredAssetDesignFrame, selectedStoryAssetReferences, uniqueReferenceFrames } from '../src/story-asset-design.js';

const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

const asset = {
  id: 'fox',
  references: [
    { id: 'first', assetId: 'first', source: 'Generated', url: '/first.png' },
    { id: 'second', assetId: 'second', source: 'Generated', url: '/second.png', rating: 'preferred' },
    { id: 'source', source: 'Uploaded', url: '/reference.png' },
  ],
  designReferences: [
    { id: 'canonical-second', source: 'Generated view', sourceAssetId: 'fox', url: '/second.png', rating: 'preferred' },
    { id: 'stale-other', source: 'Generated view', sourceAssetId: 'other', url: '/other.png', rating: 'preferred' },
  ],
};

test('asset preview uses the image currently being previewed', () => {
  assert.equal(featuredAssetDesignFrame(asset, 'first')?.url, '/first.png');
});

test('asset preview uses the approved generated image, not a stale guide', () => {
  assert.equal(featuredAssetDesignFrame(asset)?.url, '/second.png');
});

test('asset preview defaults to the newest generated option and excludes source references', () => {
  const unapproved = { ...asset, references: asset.references.map(frame => ({ ...frame, rating: 'undecided' })), designReferences: [] };
  assert.equal(featuredAssetDesignFrame(unapproved)?.url, '/second.png');
});

test('reference frame assembly removes duplicate image slots when IDs differ but URL and role match', () => {
  const frames = uniqueReferenceFrames([
    { id: 'related-copy', assetId: 'related-copy', url: '/palette.png', role: 'series-style', name: 'Palette guide' },
    { id: 'explicit-copy', assetId: 'explicit-copy', url: '/palette.png', referenceRole: 'series-style', name: 'Palette guide' },
  ]);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].url, '/palette.png');
});

test('reference frame assembly keeps a shared image when it has intentionally distinct roles', () => {
  const frames = uniqueReferenceFrames([
    { id: 'identity', url: '/sheet.png', role: 'character' },
    { id: 'wardrobe', url: '/sheet.png', role: 'wardrobe' },
  ]);
  assert.equal(frames.length, 2);
});

test('story asset generation sends enabled external selections, not unchecked or self-generated frames', () => {
  const asset = {
    id: 'fox',
    name: 'The Fox',
    references: [
      { id: 'selected', url: '/selected.png', source: 'Uploaded', enabled: true, referenceRole: 'character' },
      { id: 'unchecked', url: '/unchecked.png', source: 'Uploaded', enabled: false, referenceRole: 'wardrobe' },
      { id: 'generated', url: '/generated.png', source: 'Generated', enabled: true, referenceRole: 'style' },
      { id: 'design-generated', url: '/design-generated.png', sourceKind: 'design-asset', enabled: true, referenceRole: 'style' },
      { id: 'own-project-generated', url: '/project-generated.png', source: 'Generated', enabled: true, referenceRole: 'style' },
      { id: 'selected-design', url: '/selected-design.png', source: 'Story reference', sourceKind: 'design-asset', sourceAssetId: 'wardrobe', enabled: true, referenceRole: 'wardrobe' },
      { id: 'self-design', url: '/self-design.png', source: 'Story reference', sourceKind: 'design-asset', sourceAssetId: 'fox', enabled: true, referenceRole: 'style' },
    ],
    designReferences: [
      { id: 'canonical', url: '/canonical.png', source: 'Generated view', enabled: true, rating: 'preferred' },
    ],
  };
  const project = {
    visualStyleReferences: [
      { id: 'project-guide', url: '/project-guide.png', source: 'Uploaded', enabled: true, role: 'style' },
      { id: 'project-generated', url: '/project-generated.png', source: 'Generated', enabled: true, role: 'style' },
      { id: 'project-unchecked', url: '/project-unchecked.png', source: 'Uploaded', enabled: false, role: 'style' },
      { id: 'project-design-guide', url: '/project-design-guide.png', source: 'Generated', sourceKind: 'design-asset', sourceAssetId: 'palette', enabled: true, role: 'style' },
      { id: 'project-wardrobe', url: '/project-wardrobe.png', source: 'Generated', sourceKind: 'design-asset', sourceAssetId: 'wardrobe', enabled: true, role: 'Wardrobe / insignia' },
      { id: 'asset-fox-generated-uuid', assetId: 'asset-fox-generated-uuid', url: '/self-project-guide.png', source: 'Generated view', enabled: true, name: 'The Fox · design 2', role: 'style' },
    ],
  };

  assert.deepEqual(selectedStoryAssetReferences(asset, project).map(frame => frame.url), ['/selected.png', '/selected-design.png']);
  assert.deepEqual(selectedStoryAssetReferences(asset, project, 'wardrobe').map(frame => frame.url), ['/selected.png', '/selected-design.png']);
});

test('explicit per-asset reference selection suppresses duplicate project guides from the same source asset', () => {
  const asset = {
    id: 'man', name: 'The Man',
    references: [{ id: 'wardrobe-frame', sourceAssetId: 'wardrobe', sourceKind: 'design-asset', source: 'Story reference', url: '/wardrobe.png', referenceRole: 'wardrobe', enabled: true }],
  };
  const project = { visualStyleReferences: [
    { id: 'same-wardrobe', sourceAssetId: 'wardrobe', sourceKind: 'design-asset', url: '/wardrobe.png', role: 'style', enabled: true },
    { id: 'series-style', sourceAssetId: 'style', sourceKind: 'design-asset', url: '/style.png', role: 'style', enabled: true },
  ] };
  assert.deepEqual(selectedStoryAssetReferences(asset, project, 'character').map(frame => frame.url), ['/wardrobe.png']);
});

test('explicit asset selections are authoritative and do not pull hidden project-wide design variants', () => {
  const asset = {
    id: 'man', name: 'The Man',
    references: [
      { id: 'selected-style', sourceAssetId: 'style', sourceKind: 'design-asset', source: 'Story reference', url: '/style-approved.png', referenceRole: 'series-style', enabled: true },
      { id: 'selected-wardrobe', sourceAssetId: 'wardrobe', sourceKind: 'design-asset', source: 'Story reference', url: '/wardrobe-approved.png', referenceRole: 'wardrobe', enabled: true },
    ],
  };
  const project = { visualStyleReferences: [
    { id: 'unselected-style-option', sourceAssetId: 'style', sourceKind: 'design-asset', url: '/style-option-1.png', role: 'series-style', enabled: true },
    { id: 'unselected-wardrobe-option', sourceAssetId: 'wardrobe', sourceKind: 'design-asset', url: '/wardrobe-option-1.png', role: 'wardrobe', enabled: true },
    { id: 'uploaded-series-guide', source: 'Uploaded', url: '/series-guide.png', role: 'style', enabled: true },
  ] };

  assert.deepEqual(selectedStoryAssetReferences(asset, project, 'character').map(frame => frame.url), ['/style-approved.png', '/wardrobe-approved.png']);
});

test('a checked asset contributes only its preferred design and derives stale roles from its category', () => {
  const asset = {
    id: 'man', name: 'The Man', references: [
      { id: 'wardrobe-old', source: 'Story reference', sourceKind: 'design-asset', sourceAssetId: 'wardrobe', url: '/wardrobe-old.png', referenceRole: 'series-style', enabled: true },
      { id: 'wardrobe-approved', source: 'Story reference', sourceKind: 'design-asset', sourceAssetId: 'wardrobe', url: '/wardrobe-approved.png', referenceRole: 'series-style', enabled: true, rating: 'preferred' },
    ],
  };
  const project = { visualAssets: [{ id: 'wardrobe', name: 'Wardrobe', category: 'Wardrobe' }] };
  const selected = selectedStoryAssetReferences(asset, project, 'character');
  assert.deepEqual(selected.map(frame => frame.url), ['/wardrobe-approved.png']);
  assert.equal(selected[0].referenceRole, 'wardrobe');
});

test('reference role defaults follow the referenced asset category rather than stale image metadata', () => {
  assert.equal(storyAssetDesign.defaultStoryReferenceRole({ category: 'Wardrobe' }, { referenceRole: 'series-style' }), 'wardrobe');
  assert.equal(storyAssetDesign.defaultStoryReferenceRole({ category: 'Character' }, { referenceRole: 'style' }), 'character');
  assert.equal(storyAssetDesign.defaultStoryReferenceRole({ category: 'Style' }, { referenceRole: 'subject' }), 'series-style');
  assert.equal(storyAssetDesign.defaultStoryReferenceRole({ category: 'Other' }, { referenceRole: 'palette' }), 'palette');
  assert.equal(storyAssetDesign.selectedStoryReferenceRole({ category: 'Wardrobe' }, { referenceRole: 'series-style' }, { referenceRole: 'series-style' }), 'wardrobe');
  assert.equal(storyAssetDesign.selectedStoryReferenceRole({ category: 'Wardrobe' }, { referenceRole: 'series-style' }, { referenceRole: 'palette', referenceRoleExplicit: true }), 'palette');
});

test('image generation deduplicates same-role references before assigning ComfyUI slots', () => {
  assert.match(main, /const referenceRows=selectedStoryAssetReferences\(asset,project,categoryRole\)/);
  assert.match(main, /const referenceFrames=!isVideo\?\(options\.assetTargetId\?uniqueReferenceFrames\(\(targetShot\?\.referenceFrames\|\|\[\]\)\.filter\(frame=>frame\?\.url\)\):imageGenerationReferences\(targetShot,targetProject,model\)\.filter\(frame=>frame\?\.url\)\):\[\]/);
  assert.match(main, /const referenceFrames=referenceRows\.slice\(0,Math\.max\(1,Number\(model\.maxReferences\)\|\|1\)\)/);
});
