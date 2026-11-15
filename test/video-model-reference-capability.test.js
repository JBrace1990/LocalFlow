import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src', 'main.jsx'), 'utf8');
const start = source.indexOf('function videoModelUsesPictureReferences(');
const end = source.indexOf('\nfunction ', start + 10);
assert.ok(start >= 0 && end > start, 'Video picture-reference capability helper should exist');
const usesPictureReferences = vm.runInNewContext(`${source.slice(start, end)}; videoModelUsesPictureReferences`);

test('local MiniMax H3 model is recognized as supporting Picture references without vendor metadata', () => {
  assert.equal(usesPictureReferences({ id: 'comfy-minimax-h3', type: 'Video', name: 'MiniMax H3 (Local)' }), true);
  assert.equal(usesPictureReferences({ id: 'other-local-video', type: 'Video' }), false);
});

test('storyboard prompt compilation enables Picture references for the local H3 model', () => {
  assert.match(source, /separateReferences:\s*videoModelUsesPictureReferences\(model\)/);
});
