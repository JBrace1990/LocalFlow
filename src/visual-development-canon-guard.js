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
  return conflicts;
}
