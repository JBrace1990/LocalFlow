export function preparedAssetRank(asset, protagonist = '') {
  const name = String(asset?.name || '').toLowerCase();
  const lead = String(protagonist || '').toLowerCase();
  if (asset?.category === 'Style') return 0;
  if (asset?.category === 'Character' && lead && (name.includes(lead) || lead.includes(name))) return 1;
  if (asset?.category === 'Wardrobe') return 2;
  if (asset?.category === 'Character') return 3;
  if (asset?.category === 'Vehicle') return 4;
  if (asset?.category === 'Location') return 5;
  return 6;
}

export function nextDesignIndexForAsset(assets = [], newAsset, protagonist = '') {
  const targetRank = preparedAssetRank(newAsset, protagonist);
  return assets.filter(asset => preparedAssetRank(asset, protagonist) <= targetRank).length;
}

export function selectNewDesignAsset(assets, newAsset, protagonist, selectIndex) {
  selectIndex(nextDesignIndexForAsset(assets, newAsset, protagonist));
  return newAsset;
}

export function createCharacterDesignKickoff(name = 'New character') {
  const characterName = String(name || 'New character').trim() || 'New character';
  return `Help me design ${characterName} visually for this story. Use the existing story and approved designs as context, but do not copy another character's identity or change any established story facts. Propose a specific appearance only: face, hair, build, silhouette, clothing, colors, and anime rendering details. Do not invent this character's story role, relationships, history, goals, or actions. Clearly label every unstated appearance choice as a suggestion, and ask one focused question about the visual design so we can refine it together before generating images.`;
}
