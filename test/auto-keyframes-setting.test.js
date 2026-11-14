import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = await readFile(fileURLToPath(new URL('src/main.jsx', root)), 'utf8');
const server = await readFile(fileURLToPath(new URL('server.js', root)), 'utf8');

test('automatic keyframes default on and can be changed from Settings', () => {
  assert.match(source, /load\('lf-story-chat-auto-keyframes',true\)/);
  assert.match(server, /autoGenerateKeyframesAfterStoryboard:true/);
  assert.match(source, /Automatically generate keyframes after storyboard approval/);
  assert.match(source, /autoGenerateKeyframesAfterStoryboard:autoKeyframesAfterApproval/);
  assert.match(source, /setAutoKeyframes\(autoKeyframesAfterApproval\)/);
});

test('every storyboard creation path inherits the configured automatic keyframe setting', () => {
  assert.match(source, /autoGenerate=storyChatAutoKeyframes/);
  assert.match(source, /if\(autoGenerate\)\{const imageModel=.*?await queueStoryboardKeyframesInOrder\(scenes,scene=>generateBatch\('Keyframe'/);
});

test('automatic keyframe targets preserve scene order and skip scenes with an image', async () => {
  const { storyboardKeyframeTargets } = await import('../src/project-workflow.js');
  const scenes = [
    { id: 'scene-1', image: '' },
    { id: 'scene-2', image: '/existing.png' },
    { id: 'scene-3', image: '' },
  ];

  assert.deepEqual(storyboardKeyframeTargets(scenes).map(scene => scene.id), ['scene-1', 'scene-3']);
});

test('automatic keyframe submissions are awaited in storyboard order', async () => {
  const { queueStoryboardKeyframesInOrder } = await import('../src/project-workflow.js');
  const submitted = [];
  await queueStoryboardKeyframesInOrder([
    { id: 'scene-1', image: '' },
    { id: 'scene-2', image: '' },
    { id: 'scene-3', image: '' },
  ], async scene => submitted.push(scene.id));

  assert.deepEqual(submitted, ['scene-1', 'scene-2', 'scene-3']);
});
