import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
const playback = await import('../src/timeline-playback.js').catch(() => ({}));
const clip = { id: 'clip-1', kind: 'Video', start: 3, trimIn: 4, duration: 6 };

test('scrubbing maps timeline time through the clip trim-in offset', () => {
  assert.equal(typeof playback.timelineVideoSourceTime, 'function', 'timeline playback helpers are required');
  assert.equal(playback.timelineVideoSourceTime(clip, 5.5), 6.5);
  assert.equal(playback.timelineVideoSourceTime(clip, 2.9), null);
  assert.equal(playback.timelineVideoSourceTime(clip, 9.1), null);
  assert.equal(playback.timelinePlayheadFromMediaTime(clip, 6.5), 5.5);
});

test('small slider movements seek the preview rather than being ignored', () => {
  assert.equal(typeof playback.seekVideoToTimelinePlayhead, 'function', 'scrubbing must update the preview currentTime');
  const video = { currentTime: 6.5, readyState: 1 };
  assert.equal(playback.seekVideoToTimelinePlayhead(video, clip, 5.51), true);
  assert.equal(video.currentTime, 6.51);
});

test('timeline slider seek is applied after media metadata becomes available', async () => {
  const source = await fs.readFile(new URL('../src/audio-editor.jsx', import.meta.url), 'utf8');
  assert.match(source, /onLoadedMetadata=\{e=>\{seekVideoToTimelinePlayhead\(e\.currentTarget,previewTrack,playhead\)/);
  assert.match(source, /seekVideoToTimelinePlayhead\(videoRef\.current,previewTrack,playhead\)/);
});
