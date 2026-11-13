import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src', 'main.jsx'), 'utf8');
const start = source.indexOf('function renumberScenePrompt(');
const end = source.indexOf('\nfunction compileStoryboardVideoPrompt(', start);
assert.ok(start >= 0 && end > start, 'Storyboard reorder helper should remain available');
const { reorderStoryboardShots } = vm.runInNewContext(
  `${source.slice(start, end)}; ({ reorderStoryboardShots })`,
);

test('moving a scene changes its order, renumbers prompts, preserves identity, and clears a stale submitted prompt', () => {
  const shots = [
    { id: 'scene-1', title: 'One', prompt: 'Scene 1 — One.', image: '/one.png' },
    { id: 'scene-2', title: 'Two', prompt: 'Scene 2 — Two.', promptSource: 'Scene 2 — Two.', promptSubmitted: 'Scene 2 — Two. Expanded.', image: '/two.png' },
    { id: 'scene-3', title: 'Three', prompt: 'Scene 3 — Three.', image: '/three.png' },
  ];

  const reordered = reorderStoryboardShots(shots, 'scene-3', 'scene-2');

  assert.equal(Array.from(reordered, scene => scene.id).join(','), 'scene-1,scene-3,scene-2');
  assert.equal(reordered[1].prompt, 'Scene 2 — Three.');
  assert.equal(reordered[2].promptSource, 'Scene 3 — Two.');
  assert.equal(reordered[2].promptSubmitted, undefined);
  assert.equal(reordered[2].image, '/two.png');
});

test('dropping onto the same scene leaves the storyboard unchanged', () => {
  const shots = [{ id: 'scene-1', prompt: 'Scene 1 — One.' }];
  assert.equal(reorderStoryboardShots(shots, 'scene-1', 'scene-1'), shots);
});
