import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = await readFile(fileURLToPath(new URL('../src/main.jsx', import.meta.url)), 'utf8');

test('location designs are environment-only unless the asset description asks for people', () => {
  assert.match(source, /environment design reference[^']*No people or characters/);
});
