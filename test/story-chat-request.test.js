import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryChatPayload } from '../src/story-chat-request.js';

test('Story Chat request carries the configured scene count and current design context', () => {
  const payload = createStoryChatPayload({
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5:7b',
    messages: [{ role: 'user', content: 'A story idea' }],
    shotCount: 10,
    style: 'modern Japanese anime',
    assets: [{ id: 'fox', name: 'Red fox', category: 'Character' }],
    activeDesign: { id: 'fox', name: 'Red fox', category: 'Character' },
    storyboardProposal: null,
  });

  assert.equal(payload.shotCount, 10);
  assert.equal(payload.activeDesign.id, 'fox');
  assert.equal(payload.model, 'qwen2.5:7b');
});
