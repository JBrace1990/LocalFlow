import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = await fs.readFile(path.join(root, 'src/story-chat.css'), 'utf8');

test('Story Chat title and workflow steps use a compact header layout', () => {
  assert.match(css, /\.story-chat-page\s+\.story-chat-heading\s*\{[^}]*margin-bottom:\s*10px/s);
  assert.match(css, /\.story-chat-page\s+\.story-chat-heading h1\s*\{[^}]*font-size:\s*20px/s);
  assert.match(css, /\.story-chat-page\s+\.story-workflow-step\s*\{[^}]*padding:\s*6px 10px/s);
});
