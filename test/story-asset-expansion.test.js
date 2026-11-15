import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoryAssetExpansionPrompt } from '../src/story-asset-expansion.js';

test('art direction expansion is isolated from character, location, and prop identity', () => {
  const prompt = buildStoryAssetExpansionPrompt({
    name: 'Series art direction and palette', category: 'Style',
    description: 'Modern Japanese 2D anime; indigo, russet, cream, and amber.',
    projectContext: 'Fox: russet coat. Park: cedar trees. Spirit: fox mask.',
  });
  assert.match(prompt, /art direction and palette only/i);
  assert.match(prompt, /no characters, locations, props, or story events/i);
  assert.match(prompt, /4–8/i);
  assert.doesNotMatch(prompt, /Fox: russet coat|Park: cedar trees|Spirit: fox mask/);
});

test('character expansion uses project bible only for shared style while staying on one character', () => {
  const prompt = buildStoryAssetExpansionPrompt({
    name: 'Yuki', category: 'Character', description: 'A red fox.',
    projectContext: 'Approved story and visual bible.',
  });
  assert.match(prompt, /one character only/i);
  assert.match(prompt, /shared art direction/i);
  assert.match(prompt, /Approved story and visual bible/);
});

test('location expansion explicitly excludes people and character design', () => {
  const prompt = buildStoryAssetExpansionPrompt({ name: 'Park', category: 'Location' });
  assert.match(prompt, /location only/i);
  assert.match(prompt, /no people, characters, animals, or props/i);
});
