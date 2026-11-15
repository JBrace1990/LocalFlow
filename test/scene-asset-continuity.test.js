import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src', 'main.jsx'), 'utf8');
const projectFramesStart = source.indexOf('const projectVisualAssetFrames=');
const projectFramesEnd = source.indexOf('\nconst closeRelatedAssetIds=', projectFramesStart);
const matchingStart = projectFramesEnd + 1;
const matchingEnd = source.indexOf('\nconst imageReferenceOptions=', matchingStart);
assert.ok(projectFramesStart >= 0 && projectFramesEnd > projectFramesStart, 'Project reference frame selector should remain available');
assert.ok(matchingEnd > matchingStart, 'Scene reference frame selector should remain available');
const helpers = vm.runInNewContext(
  `${source.slice(projectFramesStart, projectFramesEnd)}\n${source.slice(matchingStart, matchingEnd)}; ({ projectVisualAssetFrames, sceneAssetReferenceFrames, storyAssetCatalog })`,
);

const project = {
  id: 'project-1',
  visualAssets: [{
    id: 'captain-voss',
    name: 'Captain Voss',
    category: 'Character',
    description: 'Established character identity.',
    references: [{ id: 'uploaded-sheet', assetId: 'uploaded-sheet', url: '/uploaded-sheet.png', source: 'User upload', referenceRole: 'character' }],
    designReferences: [
      { id: 'approved-design', url: '/approved.png', rating: 'preferred' },
      { id: 'rejected-design', url: '/rejected.png', rating: 'rejected' },
      { id: 'candidate-design', url: '/candidate.png', rating: 'undecided' },
    ],
  }],
};

test('the preferred approved design is the single automatic reference for an assigned asset', () => {
  const frames = helpers.sceneAssetReferenceFrames({ assetIds: ['captain-voss'] }, project, { maxReferences: 3 });

  assert.deepEqual(Array.from(frames, frame => frame.assetId), ['approved-design']);
  assert.ok(frames.every(frame => !['/rejected.png', '/candidate.png'].includes(frame.url)));
});

test('per-scene continuity selections override broad project assignments', () => {
  const multiAssetProject = {
    visualAssets: [
      { id: 'fox', name: 'The Fox', category: 'Character', references: [{ id: 'fox-ref', url: '/fox.png', source: 'User upload' }] },
      { id: 'ren', name: 'The Man', category: 'Character', relatedAssetIds: ['spirit'], references: [{ id: 'ren-ref', url: '/ren.png', source: 'User upload' }] },
      { id: 'spirit', name: 'The Fox Spirit', category: 'Character', references: [{ id: 'spirit-ref', url: '/spirit.png', source: 'User upload' }] },
    ],
  };
  const frames = helpers.sceneAssetReferenceFrames({ assetIds: ['fox', 'ren', 'spirit'], continuityAssetIds: ['ren'] }, multiAssetProject, { maxReferences: 4 });
  assert.deepEqual(Array.from(frames, frame => frame.assetId), ['ren-ref']);
});

test('automatic references include only one design frame per assigned asset', () => {
  const multiViewProject = {
    visualAssets: [{
      id: 'shrine',
      name: 'The Shrine',
      category: 'Location',
      references: [
        { id: 'shrine-primary', url: '/shrine-front.png', source: 'User upload', rating: 'preferred' },
        { id: 'shrine-extra', url: '/shrine-detail.png', source: 'User upload' },
      ],
    }],
  };
  const frames = helpers.sceneAssetReferenceFrames({ continuityAssetIds: ['shrine'] }, multiViewProject, { maxReferences: 16 });

  assert.deepEqual(Array.from(frames, frame => frame.assetId), ['shrine-primary']);
});

test('generated design options stay out of the user-managed project reference picker', () => {
  const frames = helpers.projectVisualAssetFrames(project);

  assert.deepEqual(Array.from(frames, frame => frame.url), ['/uploaded-sheet.png']);
});

test('Story Chat sees approved design anchors but not rejected or undecided image candidates', () => {
  const catalog = helpers.storyAssetCatalog(project);
  const frames = catalog.find(asset => asset.id === 'captain-voss').references;

  assert.deepEqual(Array.from(frames, frame => frame.url), ['/uploaded-sheet.png', '/approved.png']);
});
