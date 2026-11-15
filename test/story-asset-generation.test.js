import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assetViewGuidance } from '../src/asset-view-guidance.js';

const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const promptBuilder = await readFile(new URL('../src/story-asset-prompt.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

test('location designs focus on the environment and exclude incidental subjects', () => {
  const prompt = assetViewGuidance('Location', 'A serene rural village with traditional wooden houses, gardens, and a river.');
  assert.match(prompt, /environment-only design reference/i);
  assert.match(prompt, /coherent geography, distinctive landmarks, architecture or natural features, background depth, palette, weather, and lighting/i);
  assert.match(prompt, /No people, characters, animals, vehicles, weapons, or foreground props/i);
  assert.match(main, /buildVisualAssetPrompt\(\{name:asset\.name,category,/);
  assert.match(promptBuilder, /assetViewGuidance\(category, description\)/);
  assert.match(promptBuilder, /Asset type: \$\{category\}\. \$\{viewGuidance\}/);
});

test('location designs include people only when the creator explicitly asks for them', () => {
  assert.match(assetViewGuidance('Location', 'Show the fox standing in the courtyard.'), /Include only the people, animals, vehicles, or props directly requested/i);
  assert.match(assetViewGuidance('Location', 'This should not contain any characters.'), /No people, characters, animals/);
});

test('Story Chat submits the selected reference-capable model for design generation', () => {
  assert.match(main, /onGenerateAsset\(asset\.id,imageModelId\)/);
  assert.doesNotMatch(main, /onGenerateAsset\(asset\.id,imageModelId,outputsPerRun\)/);
  assert.match(main, /const generateStoryAsset=\(assetId,selectedModelId=activeImageModelId,count=outputsPerRun\)=>/);
});

test('asset development receives authoritative creator canon and includes it in the model prompt', () => {
  assert.match(main, /creatorCanon:buildCreatorCanonContext\(storyChatCanonMessages\)/);
  assert.match(server, /creatorCanon=''/);
  assert.match(server, /Authoritative creator canon:[^+]*\+String\(creatorCanon\)/);
});
