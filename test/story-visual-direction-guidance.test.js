import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src/main.jsx'), 'utf8');

test('Story Chat explains the contents and output of an art-direction/palette asset', () => {
  assert.match(source, /Art direction\/palette asset is a reusable visual guide, not a storyboard scene/i);
  assert.match(source, /4–6 core colors plus accents/i);
  assert.match(source, /labeled swatches/i);
});

test('Story Chat explains text and image reference options and their assigned roles', () => {
  assert.match(source, /Write this as text, or add reference images below as examples/i);
  assert.match(source, /assign their roles/i);
  assert.match(source, /images can guide style, character identity, costume, or location/i);
});
