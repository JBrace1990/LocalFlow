import assert from 'node:assert/strict';
import test from 'node:test';
import { isStoryboardDraftEditable, normalizeLegacyStoryboardApproval } from '../src/project-workflow.js';

test('storyboard drafts stay editable after opening in Studio', () => {
  assert.equal(isStoryboardDraftEditable({ status: 'complete', scenes: [{ id: 'scene-1' }] }), true);
  assert.equal(isStoryboardDraftEditable({ status: 'storyboard-review', scenes: [{ id: 'scene-1' }] }), true);
  assert.equal(isStoryboardDraftEditable({ status: 'review', scenes: [{ id: 'scene-1' }] }), false);
  assert.equal(isStoryboardDraftEditable({ status: 'complete', scenes: [] }), false);
  assert.equal(isStoryboardDraftEditable(null), false);
});

test('legacy projects with scenes remain accessible after the visual-development migration', () => {
  const legacy = { id: 'legacy', shots: [{ id: 'scene-1' }], visualDevelopmentApproved: false, visualDevelopmentStatus: 'needed' };
  const migrated = normalizeLegacyStoryboardApproval(legacy);
  assert.equal(migrated.visualDevelopmentApproved, true);
  assert.equal(migrated.visualDevelopmentStatus, 'complete');
  assert.equal(migrated.shots[0].id, 'scene-1');
});

test('new projects without scenes still require visual development', () => {
  const draft = { id: 'new', shots: [], visualDevelopmentApproved: false };
  assert.equal(normalizeLegacyStoryboardApproval(draft), draft);
});

test('projects explicitly requiring visual development remain gated', () => {
  const inProgress = { id: 'in-progress', shots: [{ id: 'scene-1' }], visualDevelopmentRequired: true, visualDevelopmentApproved: false, visualDevelopmentStatus: 'assets' };
  assert.equal(normalizeLegacyStoryboardApproval(inProgress), inProgress);
});
