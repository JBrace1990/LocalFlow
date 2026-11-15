import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Studio exposes the storyboard scene action for correction before image generation', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const actionField = '<label className="form-field"><span>Scene action</span><textarea value={shot?.description||\'\'} onChange={e=>updateShot(\'description\',e.target.value)} placeholder="What happens in this scene?"/></label>';
  assert.ok(source.includes(actionField),
    'the Studio inspector must let users edit the exact scene action that is included in generation prompts');
});
