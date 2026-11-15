import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = await readFile(fileURLToPath(new URL('../src/main.jsx', import.meta.url)), 'utf8');

test('Studio explains that MiniMax H3 video references are attached automatically', () => {
  assert.ok(source.includes('Selected approved character and asset designs are attached automatically as up to 9 <Picture N> references.'));
  assert.ok(!source.includes('MiniMax H3 node accepts the storyboard opening and optional flow ending frame only; it has no separate image-reference slots'));
});
