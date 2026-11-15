import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const start = source.indexOf('function videoContinuityMetadata(');
const end = source.indexOf('\n', start);
assert.ok(start >= 0 && end > start, 'Video continuity metadata helper should remain available');
const { videoContinuityMetadata } = vm.runInNewContext(
  `${source.slice(start, end)}; ({ videoContinuityMetadata })`,
);

test('video jobs retain start scene, end scene, transition, and language metadata', () => {
  assert.deepEqual(
    { ...videoContinuityMetadata({
      type: 'Video clip',
      startSceneId: 'scene-opening',
      endSceneId: 'scene-arrival',
      transition: 'flow',
      language: 'English',
    }) },
    {
      startSceneId: 'scene-opening',
      endSceneId: 'scene-arrival',
      transition: 'flow',
      language: 'English',
    },
  );
});

test('video continuity metadata has safe defaults and normalizes transition mode', () => {
  assert.deepEqual(
    { ...videoContinuityMetadata({ type: 'Video clip', transition: 'unknown' }) },
    { startSceneId: '', endSceneId: '', transition: 'hard-cut', language: 'English' },
  );
});

test('image jobs do not receive video continuity metadata', () => {
  assert.deepEqual({ ...videoContinuityMetadata({ type: 'Keyframe' }) }, {});
});

test('Comfy job and saved media records both keep video continuity metadata', () => {
  assert.match(source, /referenceManifest:result\.referenceBindings,\.\.\.videoContinuityMetadata\(input\)/);
  assert.match(source, /referenceManifest:job\.referenceManifest\|\|\[\],\.\.\.videoContinuityMetadata\(job\)/);
});
