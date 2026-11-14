import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as storyChatDesign from '../src/story-chat-design.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('new prepared character is selected after the existing characters and before later asset types', () => {
  const assets = [
    { id: 'style', name: 'Art direction', category: 'Style' },
    { id: 'voss', name: 'Captain Voss', category: 'Character' },
    { id: 'uniform', name: 'Crew uniform', category: 'Wardrobe' },
    { id: 'medic', name: 'Medic', category: 'Character' },
    { id: 'ship', name: 'Vanguard', category: 'Vehicle' },
  ];
  assert.equal(storyChatDesign.nextDesignIndexForAsset(assets, { id: 'new-cast', name: 'New character', category: 'Character' }, 'Captain Voss'), 4);
});

test('adding a prepared asset selects its sorted position and returns the created asset', () => {
  const asset = { id: 'new-character', name: 'New character', category: 'Character' };
  let selected = -1;
  const result = storyChatDesign.selectNewDesignAsset([
    { id: 'style', category: 'Style' },
    { id: 'uniform', category: 'Wardrobe' },
  ], asset, '', index => { selected = index; });
  assert.equal(result, asset);
  assert.equal(selected, 2);
});

test('starting a new character design opens a focused, conversational Story Chat request', () => {
  assert.equal(typeof storyChatDesign.createCharacterDesignKickoff, 'function', 'a focused character design kickoff should be available');
  const request = storyChatDesign.createCharacterDesignKickoff('New character');
  assert.match(request, /new character/i);
  assert.match(request, /existing story/i);
  assert.match(request, /appearance only/i);
  assert.match(request, /do not invent this character's story role/i);
  assert.match(request, /one focused question/i);
  assert.match(request, /before generating images/i);
  assert.doesNotMatch(request, /rewrite the story/i);
});

test('Story Chat offers an AI-assisted character entry point and applies its replies as proposals', async () => {
  const source = await fs.readFile(path.join(root, 'src/main.jsx'), 'utf8');
  assert.match(source, /Ask Story Chat to design a character/);
  assert.match(source, /createCharacterDesignKickoff\(asset\.name\)/);
  assert.match(source, /message\.designAssetId/);
  assert.match(source, /designExpansion:content/);
});
