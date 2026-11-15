import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'src', 'main.jsx'), 'utf8');
const start = source.indexOf('function promptValueText(');
const end = source.indexOf('\nfunction App()', start);
assert.ok(start >= 0 && end > start, 'Storyboard image prompt builder should remain available');
const { compileStoryboardImagePrompt } = vm.runInNewContext(
  `${source.slice(start, end)}; ({ compileStoryboardImagePrompt })`,
);

test('compiled storyboard prompt preserves both scene action and detailed image prompt', () => {
  const prompt = compileStoryboardImagePrompt({
    number: 6,
    title: 'Signal breach',
    description: 'Voss grabs his gun as the alarm sounds.',
    prompt: 'Tight three-quarter shot; red alarm lights cut across Voss’s face. Keep the control room dim and frame his hand reaching for the sidearm.',
  }, { style: 'anime cinematic' }, 'anime cinematic', []);

  assert.match(prompt, /Voss grabs his gun as the alarm sounds/);
  assert.match(prompt, /Tight three-quarter shot/);
  assert.match(prompt, /red alarm lights cut across Voss’s face/);
  assert.match(prompt, /frame his hand reaching for the sidearm/);
});

test('compiled storyboard prompt uses fixed asset identity without leaking design-sheet layout instructions', () => {
  const prompt = compileStoryboardImagePrompt({
    number: 2,
    title: 'Voss takes aim',
    description: 'Voss takes aim.',
    prompt: 'Medium close-up with clear silhouette.',
  }, { style: 'anime cinematic, crisp blue-gray cel shading' }, 'anime cinematic', [{
    name: 'Captain Voss',
    category: 'Character',
    description: 'Rugged adult captain with short dark brown hair and navy uniform.',
    designExpansion: 'Character turnaround sheet, show front and side views. No fox or other characters.',
    visualStyle: 'Reference sheet only; do not place in a story scene.',
  }]);

  assert.match(prompt, /anime cinematic, crisp blue-gray cel shading/);
  assert.match(prompt, /Captain Voss \(Character\)/);
  assert.match(prompt, /short dark brown hair and navy uniform/);
  assert.doesNotMatch(prompt, /turnaround sheet|front and side views|No fox|Reference sheet only|do not place in a story scene/i);
});
