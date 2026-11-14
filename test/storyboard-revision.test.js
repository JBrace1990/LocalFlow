import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateStoryboardRevisionDurations, mergeStoryboardSceneRevision, resolveStoryboardRevisionSceneIndex } from '../src/storyboard-revision.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [serverSource, mainSource] = await Promise.all([
  fs.readFile(path.join(root, 'server.js'), 'utf8'),
  fs.readFile(path.join(root, 'src/main.jsx'), 'utf8'),
]);

test('full storyboard revisions retain the requested film runtime', () => {
  const scenes = [
    { title: 'Opening', description: 'A fox is hurt.', duration: '4s' },
    { title: 'Rescue', description: 'A man helps the fox.', duration: '4s' },
    { title: 'Ending', description: 'The fox returns home.', duration: '4s' },
  ];

  const revised = allocateStoryboardRevisionDurations(scenes, 90);

  assert.deepEqual(revised.map(scene => scene.duration), ['30s', '30s', '30s']);
  assert.equal(revised.reduce((sum, scene) => sum + Number.parseFloat(scene.duration), 0), 90);
  assert.equal(revised[0].description, scenes[0].description);
});

test('full-plan runtime corrections are not mistaken for targeted scene edits', () => {
  assert.equal(resolveStoryboardRevisionSceneIndex(
    'This is a full-plan runtime correction only. Allocate exactly 90 seconds across all 8 existing scenes and preserve Scene 6 unchanged.',
    8,
  ), null);
  assert.equal(resolveStoryboardRevisionSceneIndex('Revise ONLY Scene 6: remove the invented trauma.', 8), 5);
});

test('targeted storyboard revision changes only the requested scene fields', () => {
  const scenes = [
    { title: 'Opening', description: 'A fox is hurt.', prompt: 'Wide forest shot.', duration: '4s', id: 'scene-1' },
    { title: 'Ending', description: 'They marry at home.', prompt: 'Warm interior.', duration: '4s', id: 'scene-2' },
  ];

  const revised = mergeStoryboardSceneRevision(scenes, 1, {
    title: 'Invented title',
    description: 'They share a quiet married life at home.',
    prompt: 'Medium shot in the established home.',
  });

  assert.deepEqual(revised[0], scenes[0]);
  assert.equal(revised[1].title, 'Ending');
  assert.equal(revised[1].description, 'They share a quiet married life at home.');
  assert.equal(revised[1].prompt, 'Medium shot in the established home.');
  assert.equal(revised[1].duration, '4s');
});

test('targeted text edits preserve the approved scene duration even when the model returns its default', () => {
  const scenes = [{ title: 'Decision', description: 'Old action.', prompt: 'Old prompt.', duration: '11.2s' }];

  const revised = mergeStoryboardSceneRevision(scenes, 0, {
    description: 'He kindly agrees to help.',
    prompt: 'Close shot of his kind expression.',
    duration: '4s',
  });

  assert.equal(revised[0].description, 'He kindly agrees to help.');
  assert.equal(revised[0].prompt, 'Close shot of his kind expression.');
  assert.equal(revised[0].duration, '11.2s');
});

test('targeted storyboard revision rejects invalid scene indexes and output', () => {
  assert.throws(() => mergeStoryboardSceneRevision([], 0, {}), /does not match/);
  assert.throws(() => mergeStoryboardSceneRevision([{ title: 'Only' }], -1, {}), /does not match/);
  assert.throws(() => mergeStoryboardSceneRevision([{ title: 'Only' }], 0, null), /did not return a revised scene/);
});

test('full storyboard revision carries the project runtime into duration allocation', () => {
  assert.match(mainSource, /targetDurationSeconds:linkedProject\?\.targetDurationSeconds\|\|90/);
  assert.match(mainSource, /resolveStoryboardRevisionSceneIndex\(latestCreatorInstruction,expectedSceneCount\)/);
  assert.match(serverSource, /allocateStoryboardRevisionDurations\(storyboard\.scenes,targetDurationSeconds\)/);
});
