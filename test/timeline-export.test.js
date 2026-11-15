import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExportOutputPath, parseTimelineOutputPath } from '../src/timeline-export.js';

test('timeline save dialog path is split into a destination and safe filename', () => {
  assert.deepEqual(parseTimelineOutputPath('C:\\Films\\Foxes\\Final.mp4'), {
    destination: 'C:\\Films\\Foxes',
    filename: 'Final.mp4',
  });
});

test('timeline save path rejects empty and relative paths', () => {
  assert.equal(parseTimelineOutputPath(''), null);
  assert.equal(parseTimelineOutputPath('Final.mp4'), null);
});

test('export path accepts only the requested PDF or MP4 extension', () => {
  assert.deepEqual(parseExportOutputPath('C:\\Films\\Fox-storyboard.pdf', 'pdf'), {
    destination: 'C:\\Films', filename: 'Fox-storyboard.pdf',
  });
  assert.deepEqual(parseExportOutputPath('C:\\Films\\Final.MP4', 'mp4'), {
    destination: 'C:\\Films', filename: 'Final.MP4',
  });
  assert.equal(parseExportOutputPath('C:\\Films\\wrong.mp4', 'pdf'), null);
  assert.equal(parseExportOutputPath('C:\\Films\\wrong.pdf', 'mp4'), null);
  assert.equal(parseExportOutputPath('C:\\Films\\file.pdf', 'other'), null);
});
