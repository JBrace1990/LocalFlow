import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRunnerConnectivity } from '../src/runner-status.js';

test('ComfyUI is connected when either its health or queue endpoint responds', () => {
  assert.equal(resolveRunnerConnectivity({ systemStatsConnected: true, queueConnected: false }), true);
  assert.equal(resolveRunnerConnectivity({ systemStatsConnected: false, queueConnected: true }), true);
  assert.equal(resolveRunnerConnectivity({ systemStatsConnected: true, queueConnected: true }), true);
  assert.equal(resolveRunnerConnectivity({ systemStatsConnected: false, queueConnected: false }), false);
});
