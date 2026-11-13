import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const start = source.indexOf('function buildCreativeChatSystem(');
const end = source.indexOf('\nfunction ', start + 10);
assert.ok(start >= 0 && end > start, 'Story Chat system prompt builder should remain available');
const buildSystem = vm.runInNewContext(
  `${source.slice(start, end)}; buildCreativeChatSystem`,
);

test('Story Chat develops non-canon gaps as proposals and asks one consequential question', () => {
  const system = buildSystem({ shotCount: 10, style: 'cinematic anime' });
  assert.match(system, /proactively develop concrete, coherent ideas as clearly labeled AI proposals/i);
  assert.match(system, /ask at most one focused question/i);
  assert.match(system, /do not turn routine creative choices into questions/i);
  assert.match(system, /never present an unconfirmed name, motivation, world rule, or plot detail as a fact/i);
  assert.match(system, /advance only one story decision per turn/i);
  assert.match(system, /never return a numbered questionnaire or a list of questions/i);
  assert.match(system, /For missing character motivation, choose a clearly labeled proposal instead of asking the creator to invent one/i);
  assert.match(system, /never ask a vague "Should we proceed\?" question/i);
});

test('Story Chat retains explicit creator canon and requires approval before storyboard preparation', () => {
  const system = buildSystem({ shotCount: 8, style: 'anime' });
  assert.match(system, /preserve.*exactly/i);
  assert.match(system, /Should I prepare the character and visual asset designs first\?/);
  assert.match(system, /Only after that explicit approval/i);
});

const choicesStart = source.indexOf('function creativeChatOptionChoices(');
const choicesEnd = source.indexOf('\nasync function bodyJson', choicesStart);
assert.ok(choicesStart >= 0 && choicesEnd > choicesStart, 'Story Chat choice mapper should remain available');
const mapChoices = vm.runInNewContext(
  `${source.slice(choicesStart, choicesEnd)}; creativeChatOptionChoices`,
);
test('Story Chat choice buttons reflect enumerated options in the active question', () => {
  const choices = mapChoices('What aspect of the planet should be emphasized? Should it be its ability to heal, communicate, or something else?');
  assert.deepEqual(Array.from(choices, choice => choice.label), ['Heal', 'Communicate', 'Something Else']);
  assert.match(choices[0].reply, /prefer heal/i);
  const planetChoices = mapChoices('Should it be bioluminescent, sentient, or something else?');
  assert.deepEqual(Array.from(planetChoices, choice => choice.label), ['Bioluminescent', 'Sentient', 'Something Else']);
});

const normalizeStart = source.indexOf('function normalizeCreativeReply(');
const normalizeEnd = source.indexOf('\nfunction creativeChatOptionChoices', normalizeStart);
assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart, 'Creative reply normalizer should remain available');
const normalizeReply = vm.runInNewContext(
  `${source.slice(normalizeStart, normalizeEnd)}; normalizeCreativeReply`,
);
test('Story Chat collapses stacked questions to one clear decision while retaining proposal', () => {
  const reply = normalizeReply('Proposal: the living planet could respond to Voss as he explores.\n\nWhat aspect should be emphasized? Should it heal, communicate, or remain mysterious?');
  assert.equal((reply.match(/\?/g) || []).length, 1);
  assert.match(reply, /Proposal: the living planet/);
  assert.match(reply, /heal, communicate, or remain mysterious/);
  assert.doesNotMatch(reply, /What aspect should be emphasized/);
});
test('Story Chat removes numbered question lists instead of forwarding a questionnaire', () => {
  const reply = normalizeReply('A tense premise.\n\n1. Who is the captain?\n2. What is the shield?\n3. What is the ending?\n\nWhat should the emotional hook be?');
  assert.doesNotMatch(reply, /1\. Who is|2\. What is/);
  assert.match(reply, /What should the emotional hook be/);
});
test('Story Chat does not offer generic yes/no choices for an open creative question', () => {
  assert.equal(source.includes('Continue with the direction I described.'), false);
});
