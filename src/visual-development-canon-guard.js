function flatten(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(' ');
  if (typeof value === 'object') return Object.values(value).map(flatten).join(' ');
  return '';
}

const CREATOR_REQUESTS_OPEN_TRANSFORMATION = /(?:transformation|become\s+(?:a\s+)?human|turn\s+human).{0,100}(?:possible|unresolved|open)|(?:possible|unresolved|open).{0,100}(?:transformation|become\s+(?:a\s+)?human)|do\s+not\s+(?:claim|say|make).{0,50}(?:impossible|unable|cannot)|not\s+impossible/i;
const PLAN_CLAIMS_IMPOSSIBLE = /\b(?:impossible|not\s+possible|inability|unable\s+to\s+become|cannot\s+become|can't\s+become|never\s+(?:become|transform)|fails?\s+to\s+transform)\b|\bfox\b.{0,55}\b(?:remains?|stays?|retains?)\b.{0,30}\b(?:an?\s+)?(?:animal|fox\s+form)\b/i;
const PLAN_RESOLVES_TRANSFORMATION = /(?<!to )\b(?:becomes?\s+(?:a\s+)?human|transforms?\s+into\s+(?:a\s+)?human|undergoes?\s+(?:a\s+)?transformation|successfully\s+transforms?)\b|\b(?:transformation\s+sequence|scene).{0,90}\b(?:show(?:s|ing)?|depict(?:s|ing)?|complete(?:s|d)?|succeed(?:s|ed)?)\b.{0,50}\btransform/i;
const CREATOR_REQUIRES_UNREQUITED = /(?:does\s+not|doesn't|never)\s+reciprocate\s+romantically|unrequited|not\s+mutual|not\s+a\s+(?:romantic\s+)?relationship/i;
const PLAN_CLAIMS_MUTUAL = /\b(?:mutual\s+love|falls?\s+in\s+love\s+with\s+(?:her|the\s+fox)|become\s+(?:a\s+)?couple|romantic\s+(?:relationship|love)|they\s+fall\s+in\s+love)\b/i;
const CREATOR_IDENTIFIES_FOX_PROTAGONIST = /\b(?:injured\s+)?red\s+fox\b|\bfox\s+(?:named|called)\s+yuki\b/i;
const PLAN_MAKES_YUKI_A_SPIRIT = /\byuki\b.{0,80}\b(?:is|becomes?|now|transforms?\s+into)\s+(?:a\s+)?fox\s+spirit\b|\bfox\s+spirit\s+yuki\b/i;
const CREATOR_REQUIRES_TEMPORARY_TRANSFORMATION = /\b(?:one[- ]day|one day only|until dawn|at dawn.{0,80}(?:returns?|changes? back).{0,40}fox|returns? to fox form at dawn)\b/i;
const PLAN_CLAIMS_PERMANENT_TRANSFORMATION = /\b(?:permanently|forever)\s+(?:a\s+)?human\b|\b(?:permanently|forever)\s+transformed\b|\bpermanent\s+(?:human\s+)?transformation\b|\bnew life as a human\b|\blives? forever as a human\b/gi;
const PLAN_SHOWS_YUKI_HUMAN = /\byuki\b.{0,80}\b(?:is|now|becomes?|transforms?\s+into|in\s+her)\b.{0,35}\b(?:a\s+)?human(?:\s+form)?\b|\bhuman\s+yuki\b/i;
const PLAN_RETURNS_YUKI_TO_FOX = /\byuki\b.{0,70}\b(?:returns?|changes?\s+back|transforms?\s+back)\b.{0,35}\b(?:to\s+(?:her\s+)?(?:small\s+)?(?:red\s+)?fox(?:\s+form)?|fox\s+form)\b/i;

function claimsPermanentTransformation(text) {
  for (const match of text.matchAll(PLAN_CLAIMS_PERMANENT_TRANSFORMATION)) {
    const precedingText = text.slice(Math.max(0, match.index - 45), match.index);
    if (/\b(?:no|not|never|without)\b(?:\s+\w+){0,3}\s*$/i.test(precedingText)) continue;
    return true;
  }
  return false;
}

export function findVisualPlanCanonConflicts(plan, creatorMessages = []) {
  const planText = flatten(plan);
  const creatorText = flatten(creatorMessages);
  const conflicts = [];

  if (CREATOR_REQUESTS_OPEN_TRANSFORMATION.test(creatorText) && PLAN_CLAIMS_IMPOSSIBLE.test(planText)) {
    conflicts.push('The plan says or implies the fox cannot become human, although the creator said to keep the transformation possible and unresolved.');
  }
  if (CREATOR_REQUESTS_OPEN_TRANSFORMATION.test(creatorText) && PLAN_RESOLVES_TRANSFORMATION.test(planText)) {
    conflicts.push('The plan resolves the fox’s transformation, although the creator said to keep it possible but unresolved.');
  }
  if (CREATOR_REQUIRES_UNREQUITED.test(creatorText) && PLAN_CLAIMS_MUTUAL.test(planText)) {
    conflicts.push('The plan makes the romance mutual, although the creator said the man does not reciprocate romantically.');
  }
  if (CREATOR_IDENTIFIES_FOX_PROTAGONIST.test(creatorText) && PLAN_MAKES_YUKI_A_SPIRIT.test(planText)) {
    conflicts.push('The plan changes Yuki from the fox protagonist into a fox spirit. Keep Yuki a fox; the fox spirit is a separate character.');
  }
  if (CREATOR_REQUIRES_TEMPORARY_TRANSFORMATION.test(creatorText) && claimsPermanentTransformation(planText)) {
    conflicts.push('The plan makes Yuki’s human transformation permanent, although the creator specified it lasts only one day and ends at dawn.');
  }
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  const humanRange = creatorText.match(/\b(?:human|transformation)\s+(?:form\s+)?(?:is\s+)?only\s+(?:in\s+)?scenes?\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (humanRange && scenes.length) {
    const firstHumanScene = Number(humanRange[1]);
    const lastHumanScene = Number(humanRange[2]);
    scenes.forEach((scene, index) => {
      const sceneText = flatten(scene);
      if (PLAN_SHOWS_YUKI_HUMAN.test(sceneText) && (index + 1 < firstHumanScene || index + 1 > lastHumanScene)) {
        conflicts.push(`The plan moves Yuki’s human form outside scenes ${firstHumanScene}–${lastHumanScene}.`);
      }
      if (index + 1 >= firstHumanScene && index + 1 <= lastHumanScene && /\b(?:reveals?|returns?|changes? back)\b.{0,35}\b(?:her\s+)?(?:red\s+)?fox\s+form\b/i.test(sceneText)) {
        conflicts.push(`The plan returns Yuki to fox form before the creator-approved dawn ending in scene ${lastHumanScene + 1}.`);
      }
    });
  }
  const dawnReturnScene = creatorText.match(/\bat\s+(?:first\s+)?dawn\b.{0,80}\bscene\s*(\d+)/i);
  if (CREATOR_REQUIRES_TEMPORARY_TRANSFORMATION.test(creatorText) && dawnReturnScene && scenes.length) {
    const endingIndex = Number(dawnReturnScene[1]);
    scenes.slice(0, Math.max(0, endingIndex - 1)).forEach((scene, index) => {
      if (PLAN_RETURNS_YUKI_TO_FOX.test(flatten(scene))) {
        conflicts.push(`The plan returns Yuki to fox form before dawn, although the creator specified that change happens in scene ${endingIndex}.`);
      }
    });
  }
  return conflicts;
}
