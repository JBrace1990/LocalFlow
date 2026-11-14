import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildArtDirectionAssetPrompt, buildVisualAssetPrompt } from '../src/story-asset-prompt.js';

const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('art-direction generation cannot inherit linked character sheets or character-framing notes', () => {
  const prompt = buildArtDirectionAssetPrompt({
    name: 'Modern Japanese Anime Art Direction',
    description: 'Modern Japanese anime with refined character silhouettes and emotional but restrained acting. Fixed palette: indigo, russet, cream, and amber.',
    visualStyle: 'Hand-drawn 2D anime, restrained cel shading.',
    projectArtDirection: 'Consistent modern Japanese anime, warm interiors and cool night exteriors.',
    designExpansion: 'Frame the Kind Man and the Fox from their upper bodies.',
    linkedDesignNotes: 'Kind Man character sheet; Fox character turnaround.',
  });

  assert.match(prompt, /standalone art-direction sample/i);
  assert.match(prompt, /art-direction reference board, not a story illustration/i);
  assert.match(prompt, /exactly six large, separate, unlabeled color swatches/i);
  assert.match(prompt, /two small abstract rendering samples/i);
  assert.match(prompt, /No people, faces, animals, characters, clothing, vehicles, buildings, props/i);
  assert.match(prompt, /indigo, russet, cream, and amber/i);
  assert.doesNotMatch(prompt, /character silhouettes|character development|emotional but restrained acting/i);
  assert.doesNotMatch(prompt, /Kind Man|Fox character turnaround|upper bod/i);
});

test('a character design prompt does not list other cast members as negative identity cues', () => {
  const { prompt, fixedDetails } = buildVisualAssetPrompt({
    name: 'The Kind Man',
    category: 'Character',
    description: 'Japanese man around 30, short black hair, warm-brown eyes, gentle expression.',
    designExpansion: 'Muted indigo cardigan over a cream shirt.',
    linkedDesignNotes: "The Man's Simple Home Interior (Location): warm amber lighting.",
    projectArtDirection: 'Modern Japanese anime, deep indigo and warm amber.',
    roleInstructions: 'Reference 1 is for series art style and palette only.',
  });

  assert.match(prompt, /show exactly one character/i);
  assert.match(fixedDetails, /Muted indigo cardigan/);
  assert.doesNotMatch(`${prompt} ${fixedDetails}`, /Injured Red Fox|copper-red hair|fox ears|CAST IDENTITY SEPARATION/i);
  assert.doesNotMatch(prompt, /The Man's Simple Home Interior/);
  assert.match(prompt, /show exactly one character/i);
  assert.match(main, /buildVisualAssetPrompt\(\{name:asset\.name,category,/);
  assert.doesNotMatch(main, /CAST IDENTITY SEPARATION/);
});

test('a location background prompt excludes character-focused expansions and linked cast notes', () => {
  const { prompt, fixedDetails } = buildVisualAssetPrompt({
    name: "The Man's Simple Home Interior",
    category: 'Location',
    description: 'A modest Japanese living room with a low table, paper-shaded lamp, sliding glass door, and folded indigo blanket.',
    designExpansion: 'The man tends to the fox beside the low table while she rests on a cushion.',
    linkedDesignNotes: 'The Kind Man: black hair and indigo cardigan; the injured red fox: russet coat and cream markings.',
    projectArtDirection: 'Modern Japanese anime, warm amber interiors and cool blue night exteriors.',
  });

  assert.match(prompt, /environment-only design reference/i);
  assert.match(prompt, /location background plate/i);
  assert.match(fixedDetails, /low table, paper-shaded lamp/i);
  assert.doesNotMatch(`${prompt} ${fixedDetails}`, /tends to the fox|Kind Man|injured red fox|indigo cardigan|russet coat/i);
});
