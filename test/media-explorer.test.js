import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { revealMediaInFileManager } from '../src/media-explorer.js';

test('Media Library reveal targets the exact kept or trashed item in Explorer', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-flow-reveal-'));
  const mediaFolder = path.join(root, 'media');
  const trashFolder = path.join(root, 'trash');
  await fs.mkdir(mediaFolder);
  await fs.mkdir(trashFolder);
  const keptName = 'shot one.png';
  const trashedName = '123__old-shot.png';
  await fs.writeFile(path.join(mediaFolder, keptName), 'image');
  await fs.writeFile(path.join(trashFolder, trashedName), 'image');
  const calls = [];
  const spawnProcess = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  try {
    const kept = await revealMediaInFileManager({ name: keptName, mediaFolder, trashFolder, platform: 'win32', spawnProcess });
    const trashed = await revealMediaInFileManager({ name: trashedName, mediaFolder, trashFolder, trash: true, platform: 'win32', spawnProcess });
    assert.equal(kept.path, path.join(mediaFolder, keptName));
    assert.equal(trashed.path, path.join(trashFolder, trashedName));
    assert.deepEqual(calls.map(call => [call.command, call.args]), [
      ['explorer.exe', [`/select,${path.join(mediaFolder, keptName)}`]],
      ['explorer.exe', [`/select,${path.join(trashFolder, trashedName)}`]],
    ]);
    assert.ok(calls.every(call => call.options.detached && call.options.windowsHide));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Media Library reveal rejects traversal and missing files without launching a file manager', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-flow-reveal-'));
  const mediaFolder = path.join(root, 'media');
  const trashFolder = path.join(root, 'trash');
  await fs.mkdir(mediaFolder);
  await fs.mkdir(trashFolder);
  let launched = false;
  const spawnProcess = () => { launched = true; const child = new EventEmitter(); queueMicrotask(() => child.emit('spawn')); return child; };
  try {
    await assert.rejects(revealMediaInFileManager({ name: '..\\outside.png', mediaFolder, trashFolder, platform: 'win32', spawnProcess }), /file name/i);
    await assert.rejects(revealMediaInFileManager({ name: 'missing.png', mediaFolder, trashFolder, platform: 'win32', spawnProcess }), /not found/i);
    assert.equal(launched, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Media Library item actions expose See in Explorer and keep trash/restore available', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const server = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /See in Explorer/);
  assert.match(source, /\/api\/media\/reveal/);
  assert.match(source, /mediaView==='kept'\?'trash':'restore'/);
  assert.match(server, /url\.pathname === '\/api\/media\/reveal'/);
});
