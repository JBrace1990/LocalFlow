export function resolveStyleGuideReference(frame, project) {
  const name = String(frame?.name || frame?.sourceAssetName || frame?.assetName || 'Series visual guide')
    .replace(/\s*[·•:]\s*(?:design|reference|view)\s*\d+.*$/i, '')
    .trim() || 'Series visual guide';
  const normalized = value => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const styleAssets = (project?.visualAssets || []).filter(asset =>
    /style|art.?direction|palette|visual guide/i.test(`${asset.name || ''} ${asset.category || ''}`),
  );
  const owner = styleAssets.find(asset => {
    const assetName = normalized(asset.name);
    const referenceName = normalized(name);
    return assetName && (referenceName === assetName || referenceName.startsWith(`${assetName} `) || assetName.startsWith(`${referenceName} `));
  });
  return {
    ...frame,
    assignedAssetId: owner?.id || '',
    parentAssetId: owner?.id || '',
    sourceAssetId: owner?.id || '',
    assetName: owner?.name || name,
    assetCategory: owner?.category || 'Style',
    assetDescription: owner?.description || '',
    assetVisualStyle: owner?.visualStyle || '',
    referenceRole: 'series-style',
  };
}
