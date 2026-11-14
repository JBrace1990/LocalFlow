import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { timelineMediaDuration } from '../src/timeline-media.js';

test('storyboard media inherits its scene duration when added to the timeline', () => {
  const project={shots:[{id:'scene-1',duration:'4.5s',image:'/api/media/frame.png',clips:['/api/media/video.mp4']}]};
  assert.equal(timelineMediaDuration({url:'/api/media/frame.png',kind:'Image'},project),4.5);
  assert.equal(timelineMediaDuration({url:'/api/media/video.mp4',kind:'Video'},project),4.5);
});

test('explicit media duration wins and unrelated items keep sensible defaults', () => {
  assert.equal(timelineMediaDuration({kind:'Video',duration:7.2},null),7.2);
  assert.equal(timelineMediaDuration({kind:'Image'},null),5);
  assert.equal(timelineMediaDuration({kind:'Video'},null),10);
});

test('timeline media insertion uses the scene-aware duration helper', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /duration:timelineMediaDuration\(item,project\)/);
});
