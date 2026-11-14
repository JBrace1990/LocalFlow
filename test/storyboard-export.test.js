import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoryboardExportHtml } from '../src/storyboard-export.js';

test('storyboard export is valid standalone HTML with escaped project and scene data', () => {
  const html = buildStoryboardExportHtml({ name: 'Fox <Wish>', kind: 'Short film', shots: [{ id: 'scene-1', title: 'First & Found', duration: 4, description: 'A fox <3', prompt: 'English "anime"' }] }, 'Nov 14, 2026');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<main>[\s\S]*<\/main>/);
  assert.match(html, /Fox &lt;Wish&gt;/);
  assert.match(html, /First &amp; Found/);
  assert.match(html, /English &quot;anime&quot;/);
  assert.doesNotMatch(html, /\{view===|<Modal type=/);
});

test('storyboard export includes keyframes and readable empty-frame placeholders', () => {
  const html = buildStoryboardExportHtml({ name: 'Test', shots: [{ id: 'a', image: '/api/media/frame.png', title: 'Frame' }, { id: 'b', title: 'No frame' }] });
  assert.match(html, /src="\/api\/media\/frame\.png"/);
  assert.match(html, /No keyframe selected/);
});
