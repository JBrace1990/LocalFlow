import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src', 'main.jsx'), 'utf8');
const start = source.indexOf('function nextPendingDesignIndex(');
const end = source.indexOf('\nfunction ', start + 10);
assert.ok(start >= 0 && end > start, 'Sequential design review helper should remain available');
const { nextPendingDesignIndex } = vm.runInNewContext(
  `${source.slice(start, end)}; ({ nextPendingDesignIndex })`,
);

test('review action advances past the currently open unapproved design', () => {
  const assets = [
    { id: 'style', designReferences: [{ rating: 'preferred' }] },
    { id: 'voss' },
    { id: 'uniform' },
  ];
  assert.equal(nextPendingDesignIndex(assets, 'voss'), 2);
});

test('review action wraps to the first pending design and skips approved assets', () => {
  const assets = [
    { id: 'style', designReferences: [{ rating: 'preferred' }] },
    { id: 'voss' },
    { id: 'uniform' },
  ];
  assert.equal(nextPendingDesignIndex(assets, 'uniform'), 1);
  assert.equal(nextPendingDesignIndex([{ id: 'done', designReferences: [{ rating: 'preferred' }] }], 'done'), -1);
});
