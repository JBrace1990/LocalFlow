import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [main, server] = await Promise.all([
  fs.readFile(path.join(root, 'src/main.jsx'), 'utf8'),
  fs.readFile(path.join(root, 'server.js'), 'utf8'),
]);

test('Storyboard PDF export downloads the PDF directly from the browser', () => {
  const method = main.match(/const exportStoryboardPdf\s*=([\s\S]*?);\s*const autoAssembleProject/)?.[0] || '';
  assert.match(method, /desktopRuntime/);
  assert.match(method, /downloadApiFile\(['"]\/api\/storyboard\/export\/download/);
  assert.match(method, /\.pdf/);
  assert.match(method, /api\/save-file-picker/);
  assert.match(method, /apiPost\(['"]\/api\/storyboard\/export/);
});

test('server exposes a real PDF attachment download route', () => {
  assert.match(server, /url\.pathname\s*===\s*['"]\/api\/storyboard\/export['"]/);
  assert.match(server, /writeStoryboardPdf/);
  assert.match(server, /url\.pathname\s*===\s*['"]\/api\/storyboard\/export\/download['"]/);
  assert.match(server, /renderStoryboardPdf/);
  assert.match(server, /application\/pdf/);
});

test('Timeline MP4 export downloads the rendered video directly from the browser', () => {
  const method = main.match(/const exportTimeline\s*=([\s\S]*?);\s*const generateProjectAudio/)?.[0] || '';
  assert.match(method, /desktopRuntime/);
  assert.match(method, /downloadApiFile\(['"]\/api\/timeline\/export\/download/);
  assert.match(method, /api\/save-file-picker/);
  assert.match(method, /apiPost\(['"]\/api\/timeline\/export/);
  assert.match(server, /url\.pathname\s*===\s*['"]\/api\/timeline\/export\/download['"]/);
  assert.match(server, /video\/mp4/);
});
