export function isFullStoryboardReplacement(instruction = '') {
  return /\b(?:replace|rebuild|start over|full(?:y)? revise|revise the entire|entire storyboard|whole storyboard|create exactly\s+\d+\s+distinct scenes)\b/i.test(String(instruction));
}

export function buildStoryboardRevisionBrief({
  sceneCount,
  latestInstruction = '',
  userMessages = [],
  currentPlan = null,
  recentConversation = '',
  sceneIndex = null,
  fullReplacement = false,
} = {}) {
  if (fullReplacement) {
    const creatorHistory = userMessages.map(message => `Creator: ${message}`).join('\n');
    return `Replace the entire existing storyboard with a new plan of exactly ${sceneCount} scenes. The previous scene titles, order, actions, and descriptions are rejected; do not copy or preserve them. Preserve the premise and constraints in the creator-authored history below, and treat the latest creator instruction as the definitive scene-by-scene outline. Follow its scene count, durations, actions, and ending exactly. Use only approved canonical asset names from the supplied asset list.\nCreator-authored history and canon:\n${creatorHistory}\nLatest definitive full-plan instruction:\n${latestInstruction}`;
  }

  if (Number.isInteger(sceneIndex)) {
    return `Revise only scene ${sceneIndex + 1} of the existing ${sceneCount}-scene storyboard. Keep its title and preserve every other scene unchanged. Apply only the creator's explicit requested edit; retain all other story canon and setting details.\nCurrent scene: ${JSON.stringify(currentPlan?.scenes?.[sceneIndex] || {})}\nCreator instruction: ${latestInstruction}\nRecent conversation:\n${recentConversation}`;
  }

  return `Revise the existing ${sceneCount}-scene storyboard. Return exactly ${sceneCount} scenes. Preserve the existing order and story facts; apply the creator's requested adjustments without inventing new plot events.\nCurrent storyboard: ${JSON.stringify(currentPlan)}\nRecent conversation:\n${recentConversation}`;
}
