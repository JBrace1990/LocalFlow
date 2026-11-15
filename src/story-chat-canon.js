const CANON_SIGNAL = /\b(?:must(?:\s+not)?|never|do not|don't|does not|doesn't|cannot|can't|without|keep|preserve|remain(?:s)?|not (?:a|an|the|mutual|romantic|romance)|no (?:mutual|romantic|romance|human|new|extra))\b/i;
const REJECTED_PROPOSAL_SIGNAL = /\b(?:unapproved\s+(?:assistant\s+)?(?:suggestion|proposal|idea)|not\s+(?:story\s+)?canon|not\s+(?:approved|accepted)\s+(?:as\s+)?(?:canon|a?\s*(?:suggestion|proposal|idea))|reject(?:ed|ing)?\s+(?:(?:that|the|your|this|previous|prior)\s+)?(?:assistant\s+)?(?:suggestion|proposal|idea)|(?:discard|ignore)\s+(?:that|the|your|this|previous|prior)\s+(?:assistant\s+)?(?:suggestion|proposal|idea))\b/i;

function boundedMessage(value, limit) {
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (text.length <= limit) return text;
  const first = Math.ceil((limit - 24) * 0.55);
  const last = Math.floor((limit - 24) * 0.45);
  return `${text.slice(0, first)}\n[…middle omitted…]\n${text.slice(-last)}`;
}

export function buildCreatorOnlyBrief(messages) {
  return sanitizeRejectedStoryChatMessages(messages).messages
    .filter(message => message?.role === 'user' && typeof message.content === 'string' && message.content.trim())
    .map(message => `Creator: ${message.content.trim()}`)
    .join('\n');
}

function sanitizeRejectedProposalText(content) {
  let rejectedClause = false;
  const clauses = String(content || '').split(/(?<=[.!?;])\s+/);
  const cleaned = clauses.map(clause => {
    if (!REJECTED_PROPOSAL_SIGNAL.test(clause)) return clause;
    rejectedClause = true;
    return 'A prior assistant turn is excluded from the creative direction.';
  }).join(' ').replace(/\s{2,}/g, ' ').trim();
  return { content: cleaned, rejectedClause };
}

export function sanitizeRejectedStoryChatMessages(messages) {
  const sanitized = [];
  let rejectedProposalCount = 0;
  for (const source of Array.isArray(messages) ? messages : []) {
    if (!source || !['user', 'assistant'].includes(source.role) || typeof source.content !== 'string') continue;
    if (source.role === 'user') {
      const cleaned = sanitizeRejectedProposalText(source.content);
      if (cleaned.rejectedClause && sanitized.at(-1)?.role === 'assistant') {
        sanitized.pop();
        rejectedProposalCount += 1;
      }
      sanitized.push({ ...source, content: cleaned.content });
      continue;
    }
    sanitized.push({ ...source });
  }
  return { messages: sanitized, rejectedProposalCount };
}

export function appendCreatorCanonMessage(messages, content) {
  const history = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.role === 'user' && typeof message.content === 'string' && message.content.trim())
    .map(message => ({ role: 'user', content: message.content.trim() }));
  const text = String(content || '').trim();
  return text ? [...history, { role: 'user', content: text }] : history;
}

export function buildCreatorCanonContext(messages, { maxChars = 12000, maxMessageChars = 2400 } = {}) {
  const turns = sanitizeRejectedStoryChatMessages(messages).messages
    .filter(message => message?.role === 'user' && typeof message.content === 'string' && message.content.trim())
    .map((message, index) => ({ index, text: boundedMessage(message.content, maxMessageChars), constraint: CANON_SIGNAL.test(message.content) }));
  if (!turns.length) return '';

  const header = 'AUTHORITATIVE CREATOR CANON — The following are the creator’s own statements, not assistant proposals. Preserve every fact, preference, and constraint. A later creator statement overrides earlier canon only when it clearly changes it. Never reintroduce an explicitly rejected idea. Keep all assistant suggestions unconfirmed unless the creator accepts them.';
  const remaining = maxChars - header.length - 2;
  if (remaining <= 0) return boundedMessage(header, maxChars);

  const selected = new Map();
  let used = 0;
  const add = turn => {
    if (selected.has(turn.index)) return;
    const cost = turn.text.length + 24;
    if (cost > remaining - used) return;
    selected.set(turn.index, turn);
    used += cost;
  };

  // Keep the original premise and explicit constraints first, even if ordinary
  // conversational turns have pushed them outside the recent-message window.
  add(turns[0]);
  for (const turn of turns.slice(1).filter(item => item.constraint).reverse()) add(turn);
  for (const turn of [...turns].reverse()) add(turn);

  const numbered = [...selected.values()].sort((a, b) => a.index - b.index);
  return `${header}\n\n${numbered.map(turn => `Creator turn ${turn.index + 1}: ${turn.text}`).join('\n\n')}`;
}
