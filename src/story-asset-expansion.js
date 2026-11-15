const text = value => String(value ?? '').trim();

export function buildStoryAssetExpansionPrompt({
  name = 'Visual asset', category = 'Other', aliases = '', description = '',
  visualStyle = '', projectName = '', projectStyle = '', projectContext = '',
  creatorCanon = '', references = [],
} = {}) {
  const type = text(category).toLowerCase();
  const isStyle = /style|art direction|palette/.test(type);
  const isCharacter = /character/.test(type);
  const isLocation = /location/.test(type);
  const scope = isStyle
    ? 'Develop SERIES ART DIRECTION AND PALETTE ONLY. Propose coherent linework, rendering technique, shading, color relationships, lighting, and visual texture. No characters, locations, props, or story events. Exclude costumes, vehicles, and compositions containing story subjects.'
    : isCharacter
      ? 'Develop this one character only. Use the project bible only for shared art direction and facts directly relevant to this character. Do not describe other characters, locations, props, or scenes.'
      : isLocation
        ? 'Develop this location only as an environment. Focus on geography, architecture, vegetation, materials, time-of-day lighting, and palette. Include no people, characters, animals, or props.'
        : `Develop this ${text(category) || 'asset'} only. Use project context only for shared art direction and facts directly relevant to this asset. Do not describe unrelated characters, locations, props, or scenes.`;
  const projectFacts = isStyle
    ? `Approved project art direction: ${text(projectStyle) || text(visualStyle) || 'not specified'}`
    : `Project visual bible: ${text(projectContext).slice(0, 5000)}\nAuthoritative creator canon: ${text(creatorCanon).slice(0, 12000)}`;
  return `Develop reusable visual-design details for one story asset. Return JSON only with this shape: {"fixedVisualDetails":"","designExpansion":"","visualStyle":"","referenceAnalysis":[{"name":"","role":"","observations":"","focusRegion":null,"focusConfidence":0.0}]}\n\n${scope} Creator-provided identity, stated appearance, approved story facts, and project-bible constraints are fixed canon. fixedVisualDetails repeats only creator-supplied facts. designExpansion proposes 4–8 concrete, production-ready visual details only for this asset, filling details the creator has not specified. Never change a stated trait, invent story canon, or infer new colors for named features. Keep suggestions editable and separate from canon. Analyze each reference only for its assigned role; references guide design identity, not the composition or pose of a future image.\n\nAsset name: ${text(name).slice(0, 240)}\nCategory: ${text(category).slice(0, 100)}\nAliases: ${text(aliases).slice(0, 500)}\nCreator description / canon: ${text(description).slice(0, 5000)}\nRequested asset style: ${text(visualStyle).slice(0, 1500)}\nProject: ${text(projectName).slice(0, 200)}\n${projectFacts}\nReference assignments: ${JSON.stringify(references).slice(0, 9000)}\n\nReturn fixedVisualDetails as a compact paragraph. In designExpansion, return only proposals within the asset scope above. Keep visualStyle aligned with the approved project direction. referenceAnalysis must include one concise observations entry per supplied reference.`;
}
