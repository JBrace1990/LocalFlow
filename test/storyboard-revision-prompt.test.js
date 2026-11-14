import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoryboardRevisionBrief, isFullStoryboardReplacement } from '../src/storyboard-revision-prompt.js';
import { resolveStoryboardRevisionSceneIndex } from '../src/storyboard-revision.js';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');

test('storyboard generation and scene revisions carry durable creator canon separately from assistant suggestions', () => {
  assert.match(mainSource, /creatorCanon:buildCreatorCanonContext\(conversation\),existingScenes/);
  assert.match(serverSource, /creatorCanon='',existingScenes=\[\]/);
  assert.match(serverSource, /Authoritative creator canon:/);
  assert.match(serverSource, /String\(creatorCanon\)\.slice\(0,12000\)/);
});

test('a full replacement uses creator-authored canon and excludes the rejected storyboard', () => {
  const instruction = 'Replace the entire storyboard with exactly 8 distinct scenes and these beats.';
  assert.equal(isFullStoryboardReplacement(instruction), true);
  assert.equal(isFullStoryboardReplacement('Create exactly 8 distinct scenes in this order: Scene 1 rescue; Scene 2 care; Scene 3 wish.'), true);
  const brief = buildStoryboardRevisionBrief({
    sceneCount: 8,
    latestInstruction: instruction,
    userMessages: ['Create a short about a fox who wishes to become human for one night.', instruction],
    currentPlan: { scenes: [{ title: 'Rejected lap-sitting scene' }] },
    recentConversation: 'Assistant: rejected scene plan',
    fullReplacement: true,
  });
  assert.match(brief, /Replace the entire existing storyboard/);
  assert.match(brief, /fox who wishes to become human for one night/);
  assert.match(brief, /Latest definitive full-plan instruction/);
  assert.doesNotMatch(brief, /Rejected lap-sitting scene|Assistant: rejected scene plan/);
});

test('full-plan wording takes precedence over scene numbers in the outline', () => {
  const instruction = 'Replace the entire storyboard. Create exactly 8 distinct scenes: Scene 1 rescue, Scene 2 care, Scene 3 wish.';
  const fullReplacement = isFullStoryboardReplacement(instruction);
  const sceneIndex = fullReplacement ? null : resolveStoryboardRevisionSceneIndex(instruction, 8);
  assert.equal(sceneIndex, null);
  assert.match(mainSource, /fullReplacement=isFullStoryboardReplacement\(latestCreatorInstruction\),revisionSceneIndex=fullReplacement\?null:resolveStoryboardRevisionSceneIndex/);
});

test('targeted scene edits continue to preserve the untouched plan context', () => {
  assert.equal(isFullStoryboardReplacement('Revise only scene 4: change the camera angle.'), false);
  const brief = buildStoryboardRevisionBrief({
    sceneCount: 8,
    sceneIndex: 3,
    latestInstruction: 'Revise only scene 4: change the camera angle.',
    currentPlan: { scenes: [{}, {}, {}, { title: 'Transformation' }] },
    recentConversation: 'Recent relevant conversation',
  });
  assert.match(brief, /Revise only scene 4/);
  assert.match(brief, /Transformation/);
});
