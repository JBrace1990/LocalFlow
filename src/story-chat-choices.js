import { isDesignPreparationQuestion, lastQuestion, storyChatYesNoChoices } from './story-chat-approval.js';

export function creativeChatOptionChoices(text) {
  const question = lastQuestion(text);
  if (isDesignPreparationQuestion(question)) return [
    { label: 'Prepare the design plan', description: 'Start building the reusable character, uniform, and art-direction designs.', reply: 'Yes, prepare the character and visual asset designs first.' },
    { label: 'Keep refining the story', description: 'Continue shaping the concept before preparing any visual designs.', reply: 'No, not yet. I want to keep refining the story first.' },
  ];
  const yesNoChoices = storyChatYesNoChoices(question);
  if (yesNoChoices.length) return yesNoChoices;
  const numberedOptions = String(text || '').split(/\r?\n/).map(line => line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1]?.trim()).filter(Boolean);
  if (numberedOptions.length >= 2 && /\b(which|choose|prefer|best captures|ending direction|these endings|these options)\b/i.test(question)) return numberedOptions.slice(0, 5).map((raw, index) => {
    const clean = raw.replace(/[*_`]/g, '').trim();
    const label = (clean.split(/\s+(?:—|–|-)\s+|:\s+|\.\s+/)[0] || clean).slice(0, 56).trim();
    return { label: label || `Option ${index + 1}`, description: clean.slice(0, 180), reply: `For this choice, I prefer: ${clean}` };
  });
  const eitherOr = question.match(/^(?:(?:is|are)\s+(?:it|this|he|she|they|the (?:story|setting|environment|man|fox))\s+(?:in|set in|located in|a|an|the|still|able to)\s+|(?:would|could)\s+you\s+(?:like|prefer|choose|want|rather)\s+(?:the fox\s+to\s+)?|should\s+(?:it|the setting|the story|the fox|the man)\s+(?:be|become|remain|stay|choose)\s+)([^,?]+?)\s+or\s+([^?]+?)\??$/i);
  if (eitherOr) return eitherOr.slice(1).map(option => {
    const clean = option.trim().replace(/[?.!]+$/, '');
    const label = clean.charAt(0).toUpperCase() + clean.slice(1);
    return { label, description: `Choose “${clean}” for this story direction.`, reply: `For this choice, I prefer ${clean}.` };
  });
  const match = question.match(/\b([a-z][a-z -]{1,30}),\s*([a-z][a-z -]{1,30}),\s*or\s+([a-z][a-z -]{1,30})\??$/i);
  if (!match) return [];
  return match.slice(1).map((value, index) => {
    const option = (index === 0 ? value.replace(/^(?:should|would|could|can)\s+/i, '').replace(/^it\s+(?:be\s+)?/i, '').replace(/^you\s+(?:prefer|choose)\s+/i, '').replace(/^be\s+/i, '').replace(/^which\s+(?:option|aspect|trait)\s*:?\s*/i, '').replace(/^what\s+(?:aspect|trait)\s+(?:should\s+)?(?:be\s+)?/i, '').replace(/^its ability to\s+/i, '') : value).trim();
    const label = option.replace(/\b\w/g, char => char.toUpperCase());
    return { label, description: `Choose “${option}” for this story direction.`, reply: `For this part, I prefer ${option}.` };
  });
}

export function hydrateStoryChatChoices(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map(message => {
    if (message?.role !== 'assistant' || !String(message.content || '').trim() || (Array.isArray(message.choices) && message.choices.length)) return message;
    const choices = creativeChatOptionChoices(message.content);
    return choices.length ? { ...message, choices } : message;
  });
}
