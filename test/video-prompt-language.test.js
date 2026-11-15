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
assert.ok(start >= 0 && end > start, 'Storyboard video prompt builder should remain available');
const { compileStoryboardVideoPrompt, videoFrameInputs } = vm.runInNewContext(
  `${source.slice(start, end)}; ({ compileStoryboardVideoPrompt, videoFrameInputs })`,
);

test('video prompts default to English', () => {
  const prompt = compileStoryboardVideoPrompt({ scene: { title: 'Opening' } });
  assert.match(prompt, /Use English exclusively for dialogue/);
});

test('video prompts enforce the selected speech language', () => {
  const prompt = compileStoryboardVideoPrompt({ scene: { title: 'Opening' }, language: 'Japanese' });
  assert.match(prompt, /Use Japanese exclusively for dialogue/);
});

test('other-language setting follows the prompt and falls back to English', () => {
  const prompt = compileStoryboardVideoPrompt({
    scene: { title: 'Opening' },
    language: 'Other (describe in prompt)',
  });
  assert.match(prompt, /Use the language explicitly requested in the scene prompt/);
  assert.doesNotMatch(prompt, /Other \(describe in prompt\)/);
});

test('text-to-video flow describes its ending without claiming an unattached storyboard frame', () => {
  const prompt = compileStoryboardVideoPrompt({
    scene: { title: 'Opening', description: 'Voss studies the signal.' },
    transition: 'flow',
    endScene: { title: 'Arrival', description: 'The ship reaches the planet.' },
    references: [{ assetName: 'Captain Voss', referenceRole: 'character' }],
    videoMode: 'text',
    separateReferences: false,
  });

  assert.match(prompt, /Continue the text-generated shot into scene “Arrival”/);
  assert.match(prompt, /No storyboard ending image is attached/);
  assert.match(prompt, /No separate visual-reference images are attached/);
  assert.doesNotMatch(prompt, /approved ending keyframe/i);
  assert.doesNotMatch(prompt, /storyboard opening frame plus/i);
});

test('text-to-video never attaches storyboard opening or ending images', () => {
  assert.deepEqual(
    { ...videoFrameInputs({
      videoMode: 'text',
      transition: 'flow',
      startScene: { image: '/api/media/opening.png' },
      endScene: { image: '/api/media/ending.png' },
      storyboardScene: { image: '/api/media/current.png' },
    }) },
    { start: null, end: null },
  );
});

test('storyboard video automatically attaches its selected start and flow ending keyframes', () => {
  assert.deepEqual(
    { ...videoFrameInputs({
      videoMode: 'storyboard',
      transition: 'flow',
      startScene: { image: '/api/media/opening.png' },
      endScene: { image: '/api/media/ending.png' },
      storyboardScene: { image: '/api/media/current.png' },
    }) },
    { start: '/api/media/opening.png', end: '/api/media/ending.png' },
  );
});

test('storyboard video prompt uses the approved frame and scene action without enumerating design sheets', () => {
  const prompt = compileStoryboardVideoPrompt({
    scene: {
      title: 'Rescue in the rain',
      description: 'The fox watches the man notice her at the garden gate.',
      prompt: 'Modern anime shot. Visual reference assignments: Reference 1 is the palette; Reference 2 is the fox turnaround.',
    },
    project: { name: "The Fox's Wish", visualBible: { style: 'Modern Japanese anime; rain-blue and amber palette' } },
    startScene: { title: 'Rescue in the rain' },
    assets: [{ name: 'The Fox', description: 'Fox turnaround sheet; three poses and face crops.' }],
    references: [{ assetName: 'The Fox turnaround', referenceRole: 'character' }],
    videoMode: 'storyboard',
    separateReferences: true,
  });

  assert.match(prompt, /Required opening story action: The fox watches the man notice her at the garden gate/);
  assert.match(prompt, /exact opening frame/);
  assert.match(prompt, /single continuous shot/i);
  assert.match(prompt, /Do not show character sheets, turnarounds, design boards, palettes, montages, cutaways, or additional scenes/i);
  assert.doesNotMatch(prompt, /Visual reference assignments|Reference 1 is the palette|Fox turnaround sheet|<Picture 1>/);
});

test('MiniMax H3 reference prompts name each image with its native Picture token', () => {
  const prompt = compileStoryboardVideoPrompt({
    scene: { title: 'Voss takes aim.' },
    references: [
      { assetName: 'Captain Voss', referenceRole: 'character' },
      { assetName: 'Vanguard', referenceRole: 'vehicle' },
    ],
    videoMode: 'text',
    separateReferences: true,
  });

  assert.match(prompt, /<Picture 1> is Captain Voss \(character\)/);
  assert.match(prompt, /<Picture 2> is Vanguard \(vehicle\)/);
  assert.doesNotMatch(prompt, /selected video workflow cannot accept/i);
});
