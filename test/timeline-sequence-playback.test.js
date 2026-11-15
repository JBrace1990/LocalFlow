import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTimelinePlayhead, timelineVisualAtPlayhead } from '../src/timeline-playback.js';

test('timeline preview selects the visual clip under the playhead and handles gaps', () => {
  const tracks = [
    { id: 'still', kind: 'Image', start: 0, duration: 4 },
    { id: 'clip', kind: 'Video', start: 4, duration: 5 },
    { id: 'voice', kind: 'Audio', start: 0, duration: 9 },
  ];
  assert.equal(timelineVisualAtPlayhead(tracks, 0)?.id, 'still');
  assert.equal(timelineVisualAtPlayhead(tracks, 3.99)?.id, 'still');
  assert.equal(timelineVisualAtPlayhead(tracks, 4)?.id, 'clip');
  assert.equal(timelineVisualAtPlayhead(tracks, 9), null);
});

test('timeline playback resolves active audio tracks with trim offsets and gaps', async () => {
  const { timelineAudioSourceTime, timelineAudioTracksAtPlayhead } = await import('../src/timeline-playback.js');
  const tracks = [
    { id: 'narration', kind: 'Audio', start: 2, trimIn: 1.5, duration: 4, url: '/voice.wav' },
    { id: 'later', kind: 'Audio', start: 8, trimIn: 0, duration: 2, url: '/music.wav' },
  ];
  assert.equal(timelineAudioSourceTime(tracks[0], 1.99), null);
  assert.equal(timelineAudioSourceTime(tracks[0], 2), 1.5);
  assert.equal(timelineAudioSourceTime(tracks[0], 4.25), 3.75);
  assert.equal(timelineAudioSourceTime(tracks[0], 6), null);
  assert.deepEqual(timelineAudioTracksAtPlayhead(tracks, 4.25).map(track => track.id), ['narration']);
  assert.deepEqual(timelineAudioTracksAtPlayhead(tracks, 7).map(track => track.id), []);
  assert.deepEqual(timelineAudioTracksAtPlayhead(tracks, 8).map(track => track.id), ['later']);
});

test('timeline playback advances monotonically and stops at the film duration', () => {
  assert.equal(nextTimelinePlayhead(1, 0.5, 10), 1.5);
  assert.equal(nextTimelinePlayhead(9.8, 1, 10), 10);
  assert.equal(nextTimelinePlayhead(-1, -3, 10), 0);
});

test('Timeline editor exposes sequence playback controls and resolves the playhead preview', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/audio-editor.jsx', import.meta.url), 'utf8');
  assert.match(source, /timelineVisualAtPlayhead\(tracks,playhead\)/);
  assert.match(source, /aria-label=\{playing\?'Pause film preview':'Play film preview'\}/);
  assert.match(source, /className="timeline-sequence-controls"/);
  assert.match(source, /timelineAudioTracksAtPlayhead\(tracks,playhead\)/);
  assert.match(source, /aria-label="Film timeline playhead"[^>]*onChange=\{e=>scrubTo/);
  assert.match(source, /audioRefs/);
  assert.match(source, /timeline-audio-preview/);
  assert.match(source, /scrubTo/);
});
