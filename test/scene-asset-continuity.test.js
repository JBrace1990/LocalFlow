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

test('only approved generated designs and source images feed automatic scene references', () => {
  const frames = helpers.sceneAssetReferenceFrames({ assetIds: ['captain-voss'] }, project, { maxReferences: 3 });

  assert.deepEqual(Array.from(frames, frame => frame.assetId), ['approved-design', 'uploaded-sheet']);
  assert.ok(frames.every(frame => !['/rejected.png', '/candidate.png'].includes(frame.url)));
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
