import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canMigrateLegacyStoryChat } from '../src/story-chat-project-isolation.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src/main.jsx'), 'utf8');

test('legacy chat migrates only to its owning project', () => {
  assert.equal(canMigrateLegacyStoryChat({ initial: true, legacyProjectId: 'old-project', activeProjectId: 'old-project' }), true);
  assert.equal(canMigrateLegacyStoryChat({ initial: true, legacyProjectId: 'old-project', activeProjectId: 'new-project' }), false);
});

test('unowned legacy chat is never copied into a new project', () => {
  assert.equal(canMigrateLegacyStoryChat({ initial: true, legacyProjectId: '', activeProjectId: 'new-project' }), false);
});

test('project hydration checks legacy ownership and persists chat only after hydration', () => {
  assert.match(source, /canMigrateLegacyStoryChat\(\{initial:first,legacyProjectId,activeProjectId:activeProject\}\)/);
  assert.match(source, /if\(!activeProject\|\|chatHydratedProject!==activeProject\)return/);
  assert.match(source, /lf-story-chat-project-id/);
  assert.match(source, /const \[storyChatMessages,setStoryChatMessages\]=useState\(\[\]\)/);
  assert.match(source, /const previousProjectId=load\('lf-active-project',''\);if\(previousProjectId\)localStorage\.setItem\('lf-story-chat-project-id',previousProjectId\)/);
});
