import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStoryChatChoice } from '../src/story-chat-choice.js';
import { isApprovedAssetPreparation } from '../src/story-chat-approval.js';

test('preparing visual designs invokes the direct visual preparation handler', () => {
  const calls = [];
  const choice = {
    action: 'prepare-assets',
    reply: 'Yes, prepare the character and visual asset designs first. Use the plan above.',
  };

  handleStoryChatChoice(choice, {
    sendMessage: reply => calls.push(['send', reply]),
    prepareAssets: reply => calls.push(['prepare', reply]),
  });

  assert.deepEqual(calls, [['prepare', choice.reply]]);
});

test('storyboard approval still opens Studio and other choices are sent to Story Chat', () => {
  const calls = [];
  handleStoryChatChoice({ action: 'approve-storyboard', reply: 'yes' }, {
    openStoryboard: () => calls.push('open'),
    sendMessage: reply => calls.push(reply),
  });
  handleStoryChatChoice({ reply: 'clarify' }, {
    openStoryboard: () => calls.push('open'),
    sendMessage: reply => calls.push(reply),
  });

  assert.deepEqual(calls, ['open', 'clarify']);
});

test('an explicit reply to the generated prepare-assets choice is recognized as approval', () => {
  const assistantMessage = {
    role: 'assistant',
    content: 'AI proposals for your review: any unstated details are suggestions.',
    choices: [{ action: 'prepare-assets', reply: 'Yes, prepare the character and visual asset designs first.' }],
  };

  assert.equal(isApprovedAssetPreparation(assistantMessage, assistantMessage.choices[0].reply), true);
  assert.equal(isApprovedAssetPreparation(assistantMessage, 'No, I want to revise the plan.'), false);
});
