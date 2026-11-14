import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeComfyQueue } from '../src/comfy-queue.js';

test('ComfyUI queue normalization combines pending and running jobs with stable states', () => {
  const jobs = normalizeComfyQueue({
    queue_running: [['run-1', { node: {} }, {}, 123]],
    queue_pending: [[0, 'pending-1', { node: {} }, {}]],
  });
  assert.deepEqual(jobs, [
    { promptId: 'run-1', state: 'Running' },
    { promptId: 'pending-1', state: 'Queued' },
  ]);
});

test('ComfyUI queue normalization accepts object rows and ignores rows without IDs', () => {
  assert.deepEqual(normalizeComfyQueue({
    queue_running: [{ prompt_id: 'run-2' }, {}],
    queue_pending: [{ promptId: 'pending-2' }],
  }), [
    { promptId: 'run-2', state: 'Running' },
    { promptId: 'pending-2', state: 'Queued' },
  ]);
});
