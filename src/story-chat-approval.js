export function lastQuestion(text) {
  const source = String(text || '');
  const end = source.lastIndexOf('?');
  if (end < 0) return '';
  const start = Math.max(source.lastIndexOf('.', end - 1), source.lastIndexOf('!', end - 1), source.lastIndexOf('\n', end - 1));
  return source.slice(start + 1, end + 1).trim();
}

export function isDesignPreparationQuestion(text) {
  const question = lastQuestion(text);
  const asksPermission = /^(?:should i|shall i|would you like me to|do you want me to)\b/i.test(question);
  return asksPermission
    && /\b(?:prepar(?:e|ing)|creat(?:e|ing)|generat(?:e|ing)|build(?:ing)?|begin(?:ning)?|start(?:ing)?)\b/i.test(question)
    && /\b(?:visual assets?|asset designs?|designs?)\b/i.test(question);
}

export function isApprovedAssetPreparation(message, reply) {
  const hasPreparationApproval = message?.role === 'assistant'
    && (isDesignPreparationQuestion(message.content || '')
      || (Array.isArray(message.choices) && message.choices.some(choice => choice?.action === 'prepare-assets')));
  const text = String(reply || '').trim().replace(/[’]/g, "'");
  if (!hasPreparationApproval || !text || /^(?:no|not yet|wait|hold on|don't|do not|not ready|let me revise|i want to revise|i'd like to revise)\b/i.test(text)) return false;
  if (/\b(?:but|however|though|except)\b[^.!?]{0,140}\b(?:revise|change|wait|hold|not ready|not yet|before we proceed)\b/i.test(text)) return false;
  return /^(?:yes|yeah|yep|sure|absolutely|definitely|sounds good|that sounds good|that's right|i agree|i approve|approve|approved|i'm ready|please do|please proceed|go ahead|proceed|do it|let'?s do it|let'?s proceed|prepare (?:the )?designs|begin visual preproduction)(?:\b|[.!?,\s]|$)/i.test(text);
}

function approvalAction(question) {
  const match = question.match(/^(?:should i|shall i|would you like me to|do you want me to)\s+(.+?)\??$/i);
  if (!match) return '';
  return match[1]
    .replace(/^(?:proceed with|go ahead and)\s+/i, '')
    .replace(/^(preparing|creating|generating|building|beginning|starting)\b/i, (_, verb) => ({
      preparing: 'prepare', creating: 'create', generating: 'generate', building: 'build', beginning: 'begin', starting: 'start',
    })[verb.toLowerCase()])
    .replace(/\b(?:now|please)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/g, '')
    .trim();
}

export function storyChatYesNoChoices(text) {
  const question = lastQuestion(text);
  const action = approvalAction(question);
  if (!action) return [];
  const labelAction = action.length > 38 ? `${action.slice(0, 35).trim()}…` : action;
  return [
    { label: `Yes, ${labelAction}`, description: `Approve this step: ${action}.`, reply: `Yes. Please ${action}.` },
    { label: 'No, clarify first', description: 'Keep discussing before making this decision.', reply: 'No. I want to clarify or revise this first.' },
  ];
}
