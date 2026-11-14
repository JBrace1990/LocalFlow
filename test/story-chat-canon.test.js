import assert from 'node:assert/strict';
import test from 'node:test';
import { appendCreatorCanonMessage, buildCreatorCanonContext, buildCreatorOnlyBrief } from '../src/story-chat-canon.js';

test('creator canon history retains original instructions independently of the rolling transcript', () => {
  let canonHistory = appendCreatorCanonMessage([], 'The fox is injured, and the man cares for her.');
  for (let index = 0; index < 70; index += 1) {
    canonHistory = appendCreatorCanonMessage(canonHistory, `Creator refinement ${index}.`);
  }

  const context = buildCreatorCanonContext(canonHistory);
  assert.match(context, /The fox is injured, and the man cares for her\./);
  assert.match(context, /Creator refinement 69\./);
  assert.equal(canonHistory.length, 71);
});

test('visual-development input excludes unapproved assistant suggestions from the plan brief', () => {
  const brief = buildCreatorOnlyBrief([
    { role: 'user', content: 'A red fox is injured and a kind man cares for her. She wishes to become human.' },
    { role: 'assistant', content: 'Proposal: she discovers that becoming human is impossible.' },
    { role: 'user', content: 'Keep transformation possible but unresolved. Do not claim it is impossible.' },
    { role: 'assistant', content: 'The man secretly loves her too.' },
    { role: 'user', content: 'Her love is not reciprocated romantically.' },
  ]);

  assert.match(brief, /wishes to become human/);
  assert.match(brief, /Keep transformation possible but unresolved/);
  assert.match(brief, /Her love is not reciprocated romantically/);
  assert.doesNotMatch(brief, /becoming human is impossible|secretly loves her too/);
});

test('creator canon retains an early hard constraint after the recent chat window has moved on', () => {
  const messages = [
    { role: 'user', content: 'The fox loves the man, but he only cares for her as the fox he rescued. Do not make the love mutual or turn them into a couple.' },
    { role: 'assistant', content: 'Perhaps they could become a couple later.' },
    ...Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: index % 2 ? `Assistant suggestion ${index}.` : `Creator refinement ${index}.`,
    })),
  ];

  const canon = buildCreatorCanonContext(messages);

  assert.match(canon, /Do not make the love mutual or turn them into a couple\./);
  assert.doesNotMatch(canon, /Perhaps they could become a couple later\./);
});

test('creator canon preserves explicit creator corrections and accepted choice replies in order', () => {
  const canon = buildCreatorCanonContext([
    { role: 'user', content: 'The fox is female and remains an animal for the whole story.' },
    { role: 'assistant', content: 'A human transformation could be a proposal.' },
    { role: 'user', content: 'For the ending choice, I prefer that she remains a fox and chooses to leave freely.' },
  ]);

  assert.ok(canon.indexOf('The fox is female') < canon.indexOf('I prefer that she remains a fox'));
  assert.doesNotMatch(canon, /A human transformation could be a proposal/);
});

test('creator canon is bounded without dropping the initial premise or latest hard constraints', () => {
  const messages = [
    { role: 'user', content: 'Opening premise: an injured fox is rescued by a kind man.' },
    ...Array.from({ length: 20 }, (_, index) => ({ role: 'user', content: `Ordinary detail ${index} ${'x'.repeat(900)}.` })),
    { role: 'user', content: 'Never add a second romantic relationship or a human transformation.' },
  ];

  const canon = buildCreatorCanonContext(messages, { maxChars: 5000, maxMessageChars: 1200 });

  assert.ok(canon.length <= 5000);
  assert.match(canon, /Opening premise: an injured fox is rescued by a kind man\./);
  assert.match(canon, /Never add a second romantic relationship or a human transformation\./);
});
