import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { isDesignPreparationQuestion, lastQuestion, storyChatYesNoChoices } from '../src/story-chat-approval.js';
import { buildCreatorCanonContext } from '../src/story-chat-canon.js';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const uiSource = await fs.readFile(path.join(root, 'src/main.jsx'), 'utf8');
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
  assert.match(system, /never combine separate decisions in one question/i);
  assert.match(system, /Do not ask about both the setting and a character's profession in the same turn/i);
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

test('Story Chat explicitly prevents rejected proposals from being recycled as options', () => {
  const system = buildSystem({ rejectedProposalCount: 1 });
  assert.match(system, /creator has rejected the immediately preceding assistant proposal/i);
  assert.match(system, /do not use it as canon or make new options from it/i);
  assert.match(system, /do not repeat it, extend it, or use its distinctive nouns/i);
});

test('Story Chat injects every creator-authored turn as durable canon alongside the recent transcript', () => {
  const messages = [
    { role: 'user', content: 'The fox loves the man, but he only cares for her as the fox he rescued. Do not make the love mutual or turn them into a couple.' },
    ...Array.from({ length: 24 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `Conversation turn ${index}.` })),
  ];
  const canon = buildCreatorCanonContext(messages);
  const system = buildSystem({ creatorCanon: canon });

  assert.match(system, /Do not make the love mutual or turn them into a couple\./);
  assert.match(system, /A later creator statement overrides earlier canon only when it clearly changes it/);
  assert.match(source, /sanitizeRejectedStoryChatMessages\(messages\)/);
  assert.match(uiSource, /creatorCanon:buildCreatorCanonContext\(creatorCanonMessages\)/);
});

test('Story Chat removes rejected proposals from Ollama history and sanitizes the canon text', () => {
  const start = source.indexOf("if (url.pathname === '/api/creative/chat'");
  const end = source.indexOf("if (url.pathname === '/api/visual-development/plan'", start);
  assert.ok(start >= 0 && end > start, 'Story Chat route should remain available');
  const route = source.slice(start, end);

  assert.match(route, /sanitizeRejectedStoryChatMessages\(messages\)/);
  assert.match(route, /sanitizedMessages\.filter\(item=>\['user','assistant'\]/);
  assert.match(route, /sanitizeRejectedStoryChatMessages\(\[\{role:'user',content:providedCreatorCanon\}\]\)/);
  assert.doesNotMatch(route, /creatorCanon=providedCreatorCanon\|\|buildCreatorCanonContext\(messages\)/);
});

test('visual-development planning builds its brief from creator turns only', () => {
  const start = uiSource.indexOf('const startStoryFromChat=async');
  const end = uiSource.indexOf('const reviseStoryboardDraft=async', start);
  assert.ok(start >= 0 && end > start, 'visual-development plan request should remain available');
  const handler = uiSource.slice(start, end);
  assert.match(handler, /buildCreatorOnlyBrief\(creatorCanonMessages\)/);
  assert.match(handler, /creatorMessages=creatorCanonMessages\.filter\(message=>message\?\.role==='user'/);
  assert.match(handler, /const creatorCanon=buildCreatorCanonContext\(creatorCanonMessages\)/);
  assert.match(handler, /creatorMessages,creatorCanon/);
  assert.doesNotMatch(handler, /conversation\.map\(message=>`\$\{message\.role==='user'\?'Creator':'Assistant'/);
});

test('storyboard revision fallback keeps the latest creator canon when planning assets', () => {
  const start = uiSource.indexOf('const reviseStoryboardDraft=async');
  const end = uiSource.indexOf('const proposeStoryboardForApproval=async', start);
  assert.ok(start >= 0 && end > start, 'storyboard revision handler should remain available');
  const handler = uiSource.slice(start, end);
  assert.match(handler, /startStoryFromChat\(conversation,creatorCanonMessages\)/);
});

test('visual-development API retries and rejects plans that contradict creator canon', () => {
  const routeStart = source.indexOf("if (url.pathname === '/api/visual-development/plan'");
  const routeEnd = source.indexOf("if (url.pathname === '/api/assets/develop'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'visual-development plan endpoint should remain available');
  const route = source.slice(routeStart, routeEnd);
  assert.match(route, /creatorMessages/);
  assert.match(route, /findVisualPlanCanonConflicts\(result,creatorMessages\)/);
  assert.match(route, /CANON VALIDATION FAILED/);
  assert.match(route, /story plan conflicts with creator-approved canon and was not accepted/);
});

const choicesStart = source.indexOf('function creativeChatOptionChoices(');
const choicesEnd = source.indexOf('\nasync function bodyJson', choicesStart);
assert.ok(choicesStart >= 0 && choicesEnd > choicesStart, 'Story Chat choice mapper should remain available');
const mapChoices = vm.runInNewContext(
  `${source.slice(choicesStart, choicesEnd)}; creativeChatOptionChoices`,
  { isDesignPreparationQuestion, lastQuestion, storyChatYesNoChoices },
);
test('Story Chat choice buttons reflect enumerated options in the active question', () => {
  const choices = mapChoices('What aspect of the planet should be emphasized? Should it be its ability to heal, communicate, or something else?');
  assert.deepEqual(Array.from(choices, choice => choice.label), ['Heal', 'Communicate', 'Something Else']);
  assert.match(choices[0].reply, /prefer heal/i);
  const planetChoices = mapChoices('Should it be bioluminescent, sentient, or something else?');
  assert.deepEqual(Array.from(planetChoices, choice => choice.label), ['Bioluminescent', 'Sentient', 'Something Else']);
});
test('Story Chat turns numbered ending alternatives into selectable, specific replies', () => {
  const choices = mapChoices('1. The fox becomes human, but her next choice remains open.\n2. The fox remains a fox and chooses to leave freely.\n3. The wish starts to transform her as dawn breaks.\n\nWhich ending direction do you prefer?');
  assert.equal(choices.length, 3);
  assert.match(choices[0].label, /fox becomes human/i);
  assert.match(choices[0].reply, /fox becomes human/i);
  assert.match(choices[1].reply, /chooses to leave freely/i);
});
test('Story Chat turns direct either-or decisions into selectable replies', () => {
  const settingChoices = mapChoices('Is it in a specific location or a general urban environment?');
  assert.deepEqual(Array.from(settingChoices, choice => choice.label), ['A specific location', 'A general urban environment']);
  assert.match(settingChoices[0].reply, /specific location/i);
  const transformationChoices = mapChoices('Would you like the fox to become human or remain a fox?');
  assert.deepEqual(Array.from(transformationChoices, choice => choice.label), ['Become human', 'Remain a fox']);
  assert.deepEqual(Array.from(mapChoices('What makes the fox distinctive?')), []);
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
test('Story Chat preserves numbered creative alternatives while removing question lists', () => {
  const reply = normalizeReply('Here are three ending proposals:\n\n1. The fox becomes human, but the ending leaves her next choice unresolved.\n2. The fox remains a fox and chooses to leave freely.\n3. The wish begins to transform her as dawn breaks.\n\nWhich direction feels right?');
  assert.match(reply, /1\. The fox becomes human/);
  assert.match(reply, /2\. The fox remains a fox/);
  assert.match(reply, /3\. The wish begins to transform her/);
  assert.match(reply, /Which direction feels right/);
});
test('Story Chat offers no buttons for an open creative question, even if it mentions a known topic', () => {
  assert.deepEqual(Array.from(mapChoices('What should make the protagonist feel distinctive?')), []);
  assert.deepEqual(Array.from(mapChoices('What mood should the story have?')), []);
});

test('Story Chat approval choices answer the specific design-preparation question', () => {
  const choices = mapChoices('Should I prepare the character and visual asset designs first?');
  assert.deepEqual(Array.from(choices, choice => choice.label), ['Prepare the design plan', 'Keep refining the story']);
  assert.match(choices[0].reply, /prepare the character and visual asset designs first/i);
  assert.match(choices[1].reply, /not yet/i);
});

test('Story Chat yes/no controls tolerate natural wording for preparation approval', () => {
  const reply = 'Proposal: the cost remains mysterious. Should I proceed with preparing the character and visual asset designs now?';
  assert.equal(isDesignPreparationQuestion(reply), true);
  const choices = mapChoices(reply);
  assert.equal(choices.length, 2);
  assert.match(choices[0].reply, /prepare.*character.*visual asset designs/i);
  assert.match(choices[1].reply, /not yet|clarify|revise/i);
});

test('Story Chat yes/no controls cover generic assistant actions without inventing choices for open questions', () => {
  const choices = mapChoices('Would you like me to create the storyboard scenes now?');
  assert.equal(choices.length, 2);
  assert.match(choices[0].reply, /create the storyboard scenes/i);
  assert.deepEqual(Array.from(mapChoices('What should happen to the forest spirit?')), []);
});

test('Story Chat never falls back to generic response buttons for arbitrary questions', () => {
  const handler = source.slice(source.indexOf('const replyLower=assistantText.toLowerCase()'), source.indexOf("if(choices.length)res.write('event: choices", source.indexOf('const replyLower=assistantText.toLowerCase()')));
  assert.doesNotMatch(handler, /Tense and mysterious|One central protagonist|That works for me|Show another option/);
});
