import assert from 'node:assert/strict';
import test from 'node:test';
import { assetViewGuidance } from '../src/asset-view-guidance.js';

test('Location design guidance prioritizes environment instead of people or props', () => {
  const prompt = assetViewGuidance('Location', 'A forest clearing beside a small shrine.');
  assert.match(prompt, /environment-only/i);
  assert.match(prompt, /geography.*landmarks.*architecture or natural features.*background depth.*palette.*weather.*lighting/i);
  assert.match(prompt, /No people, characters, animals, vehicles, weapons, or foreground props/i);
});

test('Location guidance permits a person or prop only when the creator explicitly asks for it', () => {
  const prompt = assetViewGuidance('Location', 'Show the fox standing in the courtyard.');
  assert.match(prompt, /people, animals, vehicles, or props directly requested/i);
  assert.doesNotMatch(prompt, /No people, characters/);
});

test('A negative location brief never re-enables subjects because it mentions them', () => {
  const prompt = assetViewGuidance('Location', 'This should not contain any characters and should only contain buildings and nature.');
  assert.match(prompt, /No people, characters, animals, vehicles, weapons, or foreground props/);
  assert.doesNotMatch(prompt, /Include only the people/);
});

test('Wardrobe references show one complete clothing design instead of duplicated characters', () => {
  const prompt = assetViewGuidance('Wardrobe', 'Casual, comfortable clothing for outdoor work.');
  assert.match(prompt, /clothing-only flat-lay design image/i);
  assert.match(prompt, /exactly ONE outfit/i);
  assert.match(prompt, /Absolutely no person, wearer, face, head, body, mannequin, human silhouette/i);
  assert.match(prompt, /duplicate garment, second outfit.*story scene/i);
});

test('Art direction references use a clear palette and rendering board without story subjects', () => {
  const prompt = assetViewGuidance('Style', 'Modern Japanese theatrical anime, russet and dusk blue.');
  assert.match(prompt, /landscape-format modern Japanese anime art-direction reference board/i);
  assert.match(prompt, /exactly six large, separate, unlabeled color swatches/i);
  assert.match(prompt, /two small abstract rendering samples/i);
  assert.match(prompt, /No people, faces, animals, characters, clothing, vehicles, buildings, props/i);
});
