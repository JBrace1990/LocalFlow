import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = await readFile(fileURLToPath(new URL('../src/main.jsx', import.meta.url)), 'utf8');
const server = await readFile(fileURLToPath(new URL('../server.js', import.meta.url)), 'utf8');

test('Storyboard Chat edits revise the side plan from the current conversation', () => {
  assert.match(source, /const reviseStoryboardDraft=async\(conversation=storyChatMessages,creatorCanonMessages=storyChatCanonMessages\)/);
  assert.match(source, /recentConversation=conversation\.slice\(-12\)\.map\(message=>/);
  assert.match(source, /message\.role==='user'\?'Creator':'Assistant'/);
  assert.match(source, /await reviseStoryboardDraft\(\[\.\.\.messages,\{role:'assistant',content:cleanContent\}\],creatorCanonMessages\)/);
});

test('completed storyboard plans stay editable from Story Chat and are sent as revision context', () => {
  assert.match(source, /isStoryboardDraftEditable\(storyboardDraft\)/);
  assert.match(source, /storyboardProposal:isStoryboardDraftEditable\(storyboardDraft\)/);
  assert.match(source, /linkedScenes=storyboardDraft\.linkedRevision!=null&&Array\.isArray\(linkedProject\?\.shots\)/);
  assert.match(source, /expectedSceneCount=linkedScenes\.length\|\|storyChatShotCount/);
  assert.match(source, /result\.scenes\.length!==expectedSceneCount/);
  assert.match(source, /scenes:planForRevision\.scenes,status:'storyboard-review'/);
  assert.match(server, /options:\{num_predict:numPredict\}/);
  assert.match(server, /mergeStoryboardSceneRevision\(existingScenes,revisionSceneIndex,revised\.scene\)/);
  assert.match(source, /creatorInstruction:latestCreatorInstruction,creatorCanon:buildCreatorCanonContext\(creatorCanonMessages\),existingScenes:planForRevision\.scenes/);
  assert.equal((source.match(/onClick=\{\(\)=>onReviseStoryboard\(\)\}/g) || []).length, 2);
  assert.doesNotMatch(source, /onClick=\{onReviseStoryboard\}/);
});

test('successful storyboard creation completes the approval card instead of leaving it actionable', () => {
  assert.match(source, /setStoryboardDraft\(draft=>\(\{\.\.\.draft,scenes:updated\.shots\|\|\[\],projectId:updated\.id,linkedRevision:revision,status:'complete'\}\)\);setStoryChatMessages\(current=>completeStoryboardApproval\(current,updated\.shots\?\.length\|\|0\)\)/);
  assert.match(source, /completeStoryboardApproval, isStoryboardDraftEditable/);
});
