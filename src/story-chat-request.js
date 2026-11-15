export function createStoryChatPayload({
  baseUrl,
  model,
  messages,
  shotCount,
  style,
  assets,
  activeDesign,
  storyboardProposal,
  creatorCanon,
}) {
  return { baseUrl, model, messages, shotCount, style, assets, activeDesign, storyboardProposal, creatorCanon };
}
