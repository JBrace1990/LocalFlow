export function createStoryChatPayload({
  baseUrl,
  model,
  messages,
  shotCount,
  style,
  assets,
  activeDesign,
  storyboardProposal,
}) {
  return { baseUrl, model, messages, shotCount, style, assets, activeDesign, storyboardProposal };
}
