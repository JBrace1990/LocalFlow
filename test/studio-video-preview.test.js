import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('Studio video clip cards reveal loaded video previews and explain load failures', async () => {
  const source = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const videoClips = source.slice(source.indexOf('className="clips-track"'), source.indexOf('</section>', source.indexOf('className="clips-track"')));
  assert.match(videoClips, /<video src=\{s\.clip\} muted preload="metadata" onLoadedData=\{/);
  assert.doesNotMatch(videoClips, /<video src=\{s\.clip\} muted preload="metadata" onLoad=\{/);
  assert.match(videoClips, /Video preview failed to load/);
  assert.match(source, /studioTab==='Video'&&shot\?\.clip\?<video src=\{shot\.clip\} controls className="preview-video"/);
});
