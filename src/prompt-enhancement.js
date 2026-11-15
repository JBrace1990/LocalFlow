function textValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isFaithfulEnhancedSetting(source, candidate) {
  const context = String(source || '').toLocaleLowerCase();
  const result = String(candidate || '').toLocaleLowerCase();
  const settingFamilies = [
    { source: /\b(spacecraft|spaceship|starship|space ship|ship|vessel)\b/, result: /\b(spacecraft|spaceship|starship|space ship|ship|vessel)\b/ },
    { source: /\b(forest|woods|woodland|jungle)\b/, result: /\b(forest|woods|woodland|jungle)\b/ },
    { source: /\b(city|town|village|street|urban)\b/, result: /\b(city|town|village|street|urban)\b/ },
    { source: /\b(ocean|sea|underwater)\b/, result: /\b(ocean|sea|underwater)\b/ },
    { source: /\b(desert|dunes)\b/, result: /\b(desert|dunes)\b/ },
    { source: /\b(hospital|clinic|infirmary)\b/, result: /\b(hospital|clinic|infirmary)\b/ },
    { source: /\b(battlefield|warzone|battle zone)\b/, result: /\b(battlefield|warzone|battle zone)\b/ },
    { source: /\b(planet|world|moon)\b/, result: /\b(planet|world|moon)\b/ },
  ];
  const setting = settingFamilies.find(family => family.source.test(context));
  if (!setting) return true;
  if (!setting.result.test(result)) return false;
  if (/\b(plain|blank|empty|untextured)\b.{0,45}\b(gradient|background)\b|\bgradient background\b/i.test(result)) return false;
  const specificPlaces = ['interior', 'exterior', 'bridge', 'cockpit', 'corridor', 'hangar', 'engine room', 'crew quarters', 'medical bay', 'medbay', 'laboratory', 'observation deck', 'command room', 'control room'];
  return !specificPlaces.some(place => result.includes(place) && !context.includes(place));
}

export function buildSafeEnhancedPrompt({ prompt, visualBible } = {}) {
  const source = textValue(prompt);
  if (!source) return '';
  const bibleStyle = typeof visualBible === 'string'
    ? visualBible.trim()
    : textValue(visualBible?.style) || textValue(visualBible?.artDirection) || textValue(visualBible?.visualStyle);
  const sourceLower = source.toLocaleLowerCase();
  const direction = [];
  if (bibleStyle && !sourceLower.includes(bibleStyle.toLocaleLowerCase())) direction.push(`Apply the established visual style: ${bibleStyle}.`);
  direction.push('Compose one coherent cinematic frame with a clear focal hierarchy, readable silhouettes, and purposeful depth.');
  if (!/\b(light|lighting|lit|sunlight|moonlight|glow|shadow|shadows|night|daylight|dawn|dusk)\b/i.test(source)) {
    direction.push('Use controlled cinematic lighting and readable shadows without changing the stated time or environment.');
  }
  direction.push('Preserve the creator’s named subjects, physical action, setting, and details; add no story events, props, or locations.');
  return `${source}\n\nVisual direction: ${direction.join(' ')}`;
}

export function buildSceneGenerationPrompt({ expanded, sceneAction } = {}) {
  const prompt = textValue(expanded);
  const action = textValue(sceneAction);
  if (!prompt || !action) return prompt;
  const normalized = value => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (normalized(prompt).includes(normalized(action))) return prompt;
  return `${prompt}\nRequired scene action: ${action}`;
}
