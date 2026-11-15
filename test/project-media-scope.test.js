import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { projectScopedImageMedia } from '../src/project-media-scope.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Asset Editor uses only image media associated with the selected project', () => {
  const media = [
    { name: 'current.png', kind: 'Image', projectId: 'project-current', url: '/api/media/current.png' },
    { name: 'other.png', kind: 'Image', projectId: 'project-other', url: '/api/media/other.png' },
    { name: 'legacy.png', kind: 'Image', url: '/api/media/legacy.png' },
    { name: 'shared-current.png', kind: 'Image', associations: [{ projectId: 'project-other' }, { projectId: 'project-current' }], url: '/api/media/shared-current.png' },
    { name: 'clip.mp4', kind: 'Video', projectId: 'project-current', url: '/api/media/clip.mp4' },
    { name: 'broken.png', kind: 'Image', projectId: 'project-current' },
  ];

  assert.deepEqual(
    projectScopedImageMedia(media, 'project-current').map(item => item.name),
    ['current.png', 'shared-current.png'],
  );
  assert.deepEqual(projectScopedImageMedia(media, '').map(item => item.name), []);
});

test('Asset Editor resets its local draft references when the selected project changes', async () => {
  const source = await fs.readFile(path.join(root, 'src/main.jsx'), 'utf8');
  assert.match(source, /<AssetEditorView\s+key=\{project\?\.id\|\|'no-project'\}/);
  const pickerSources = source.match(/<ProjectImagePicker media=\{projectScopedImageMedia\(media,project\?\.id\)\}/g) || [];
  assert.equal(pickerSources.length, 2, 'both Asset Editor image pickers must use the selected project media');
  assert.match(source, /projectScopedImageMedia\(media,project\?\.id\)\.length>0&&<ProjectImagePicker/, 'the existing asset picker should appear only when scoped images exist');
});
