import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assetHasPendingGeneration } from '../src/project-setup.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const main = await fs.readFile(path.join(root, 'src/main.jsx'), 'utf8');
const css = await fs.readFile(path.join(root, 'src/story-chat.css'), 'utf8');

test('Story Chat image generation shows a live loading status over the design preview', () => {
  assert.match(main, /story-design-generating/);
  assert.match(main, /Generating image/);
  assert.match(main, /role="status"[^>]*aria-live="polite"/);
  assert.match(css, /\.story-design-generating\s*\{/);
  assert.match(main, /visibleGenerationQueueItems\(comfyQueue\.items\|\|\[\],queue,hiddenQueueJobIdsRef\.current,comfyQueue\.connected,liveAssetQueueJobIdsRef\.current\)/);
  assert.match(main, /liveAssetQueueJobIdsRef\.current\.add\(item\.id\)/);
});

test('Story Chat recognizes a persisted asset-generation job after queue reconciliation', () => {
  const job = { sceneId: 'asset-scene-visual-fox-design', state: 'Queued' };
  assert.equal(assetHasPendingGeneration('visual-fox-design', [job]), true);
});
