import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src', 'main.jsx'), 'utf8');
const start = source.indexOf('function withSubmittedImagePrompt(');
const end = source.indexOf('\nfunction ', start + 10);
assert.ok(start >= 0 && end > start, 'Submitted storyboard prompt helper should remain available');
const { withSubmittedImagePrompt } = vm.runInNewContext(
  `${source.slice(start, end)}; ({ withSubmittedImagePrompt })`,
);

test('the prompt shown after generation matches the exact submitted prompt and retains the creator source', () => {
  const creatorPrompt = 'Voss raises his sidearm in the spacecraft setting.';
  const expandedPrompt = `${creatorPrompt} Close three-quarter camera, cool warning light.`;
  const submittedPrompt = `${expandedPrompt}\n\nCreator-preserved scene constraints: ${creatorPrompt}`;
  const saved = withSubmittedImagePrompt(
    { id: 'scene-1', prompt: creatorPrompt },
    creatorPrompt,
    expandedPrompt,
    'cache-key',
    submittedPrompt,
  );

  assert.equal(saved.prompt, submittedPrompt);
  assert.equal(saved.promptSubmitted, submittedPrompt);
  assert.equal(saved.promptSource, creatorPrompt);
  assert.equal(saved.promptAiEnhanced, expandedPrompt);
  assert.equal(saved.promptAiEnhancedKey, 'cache-key');
});
