import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSafeEnhancedPrompt, buildSceneGenerationPrompt, isFaithfulEnhancedSetting } from '../src/prompt-enhancement.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('safe Enhance fallback preserves creator wording and adds only visual direction', () => {
  const source = 'Captain Voss draws his sidearm in the spacecraft. Keep the ship visible behind him.';
  const prompt = buildSafeEnhancedPrompt({
    prompt: source,
    visualBible: { style: 'modern Japanese anime with crisp cel shading' },
  });
  assert.ok(prompt.startsWith(source));
  assert.match(prompt, /modern Japanese anime with crisp cel shading/);
  assert.match(prompt, /cinematic frame/i);
  assert.match(prompt, /lighting/i);
  assert.match(prompt, /preserve.*named subjects.*action.*setting/i);
  assert.doesNotMatch(prompt, /bridge|cockpit|corridor|hangar|gradient background/i);
});

test('safe Enhance fallback handles string style bibles and never replaces a blank creator prompt', () => {
  assert.match(buildSafeEnhancedPrompt({ prompt: 'A fox sits beside a window.', visualBible: 'warm hand-painted anime' }), /warm hand-painted anime/);
  assert.equal(buildSafeEnhancedPrompt({ prompt: '  ' }), '');
});

test('scene prompt keeps the enhanced prompt concise and does not append the full source prompt a second time', () => {
  const enhanced = 'A rainy garden gate at dusk. A Japanese man kneels beside the injured red fox.';
  const source = `${enhanced} Preserve the exact scene action and all original details.`;
  const prompt = buildSceneGenerationPrompt({ expanded: enhanced, sourcePrompt: source, sceneAction: 'The man finds the injured fox at the garden gate during rain.' });
  assert.equal(prompt, `${enhanced}\nRequired scene action: The man finds the injured fox at the garden gate during rain.`);
  assert.doesNotMatch(prompt, /Creator-preserved scene constraints|Original image request/);
});

test('Enhance rejects a model-invented spacecraft sub-location but accepts one named by the creator', () => {
  assert.equal(
    isFaithfulEnhancedSetting('Captain Voss draws his sidearm in the spacecraft.', 'Captain Voss draws his sidearm in the spacecraft interior.'),
    false,
  );
  assert.equal(
    isFaithfulEnhancedSetting('Captain Voss checks the monitors in the spacecraft cockpit.', 'Captain Voss checks the monitors in the spacecraft cockpit.'),
    true,
  );
});

test('Enhance route returns a safe fallback when the selected Ollama model fails quality validation', async () => {
  const server = await fs.readFile(path.join(root, 'server.js'), 'utf8');
  const main = await fs.readFile(path.join(root, 'src/main.jsx'), 'utf8');
  assert.match(server, /buildSafeEnhancedPrompt\(/);
  assert.match(server, /fallback\s*\}/);
  assert.match(main, /result\.fallback/);
});
