import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderStoryboardPdf, storyboardTextYAfterImage, writeStoryboardPdf } from '../src/storyboard-pdf.js';

test('storyboard description starts below the full fitted keyframe area', () => {
  assert.equal(storyboardTextYAfterImage(230, 360, 14), 604);
});

test('storyboard PDF contains pages and embeds selected keyframes', async () => {
  let requestedImage = '';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGosAAAAASUVORK5CYII=', 'base64');
  const pdf = await renderStoryboardPdf({
    name: 'The Fox’s Wish',
    kind: 'Short film',
    shots: [
      { id: 'scene-1', title: 'The Rescue', duration: '5s', description: 'A fox is found in the rain.', prompt: 'Modern Japanese anime, English.' , image: '/api/media/rescue.png' },
      { id: 'scene-2', title: 'The Promise', duration: '4s', description: 'The man tends the fox.' },
    ],
  }, { imageForScene: async image => { requestedImage = image; return png; } });

  assert.equal(requestedImage, '/api/media/rescue.png');
  assert.match(pdf.toString('latin1', 0, 8), /^%PDF-/);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 2);
  assert.ok(pdf.byteLength > 1000);
});

test('storyboard PDF keeps rendering when a referenced keyframe is missing', async () => {
  const pdf = await renderStoryboardPdf({ name: 'Empty frame', shots: [{ id: 'scene-1', title: 'No frame', image: '/api/media/missing.png' }] }, {
    imageForScene: async () => { throw new Error('missing frame'); },
  });
  assert.match(pdf.toString('latin1', 0, 8), /^%PDF-/);
  assert.ok(pdf.byteLength > 1000);
});

test('storyboard PDF writes a verified non-empty file at the chosen path', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'local-flow-pdf-'));
  try {
    const filePath = path.join(directory, 'Fox-storyboard.pdf');
    const result = await writeStoryboardPdf({ name: 'Fox story', shots: [{ id: 'one', title: 'Rescue', description: 'Rainy forest.' }] }, filePath);
    const bytes = await fs.readFile(filePath);
    assert.equal(result.path, filePath);
    assert.equal(result.bytes, bytes.byteLength);
    assert.match(bytes.toString('latin1', 0, 8), /^%PDF-/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
