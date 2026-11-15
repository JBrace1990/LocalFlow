import assert from 'node:assert/strict';
import test from 'node:test';
import { timelineSceneTitle } from '../src/timeline-media.js';
import { readFile } from 'node:fs/promises';

test('timeline media picker identifies the storyboard scene for a media item', () => {
  const project={shots:[{id:'scene-7',title:'Forest Arrival',clip:'/api/media/forest.mp4'}]};
  assert.equal(timelineSceneTitle({sceneId:'scene-7'},project),'Forest Arrival');
  assert.equal(timelineSceneTitle({url:'/api/media/forest.mp4'},project),'Forest Arrival');
  assert.equal(timelineSceneTitle({name:'theme.mp3'},project),'');
});

test('timeline media picker presents thumbnails and scene context', async () => {
  const source=await readFile(new URL('../src/audio-editor.jsx',import.meta.url),'utf8');
  assert.match(source,/timeline-media-grid/);
  assert.match(source,/timeline-media-thumbnail/);
  assert.match(source,/timelineSceneTitle\(m,project\)/);
});
