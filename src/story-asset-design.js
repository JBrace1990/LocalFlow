const frameIdentity = frame => String(frame?.assetId || frame?.id || frame?.url || '');

export function defaultStoryReferenceRole(asset = {}, frame = {}) {
  const category = String(asset.category || '').toLocaleLowerCase();
  if (/character/.test(category)) return 'character';
  if (/wardrobe|uniform|costume/.test(category)) return 'wardrobe';
  if (/vehicle|ship/.test(category)) return 'vehicle';
  if (/location|environment/.test(category)) return 'location';
  if (/prop/.test(category)) return 'prop';
  if (/style|palette|art direction/.test(category)) return 'series-style';
  return frame.referenceRole || frame.role || 'subject';
}

export function selectedStoryReferenceRole(asset = {}, frame = {}, savedSelection = {}) {
  return savedSelection.referenceRoleExplicit
    ? savedSelection.referenceRole || 'subject'
    : defaultStoryReferenceRole(asset, frame);
}


export function uniqueReferenceFrames(frames = []) {
  const unique = new Map();
  for (const frame of frames) {
    if (!frame?.url) continue;
    const role = String(frame.referenceRole || frame.role || '').trim().toLocaleLowerCase();
    const key = `${String(frame.url).trim()}\u0000${role}`;
    const existing = unique.get(key);
    unique.set(key, existing ? {
      ...existing,
      ...frame,
      rating: existing.rating === 'preferred' || frame.rating === 'preferred' ? 'preferred' : frame.rating || existing.rating,
    } : frame);
  }
  return [...unique.values()];
}

export function selectedStoryAssetReferences(asset = {}, project = {}, fallbackRole = 'style') {
  const selected = (asset.references || [])
    .filter(frame => frame?.url && frame.enabled !== false && frame.selected !== false && frame.rating !== 'rejected' &&
      (!frame.sourceAssetId || String(frame.sourceAssetId) !== String(asset.id)) &&
      frame.source !== 'Generated' &&
      (frame.sourceKind !== 'design-asset' || (frame.source === 'Story reference' && frame.sourceAssetId)))
    .map((frame, index) => {
      const sourceId = frame.sourceAssetId || frame.parentAssetId || frame.assignedAssetId || '';
      const sourceAsset = (project.visualAssets || []).find(candidate => String(candidate.id) === String(sourceId));
      return ({
      ...frame,
      referenceRole: selectedStoryReferenceRole(sourceAsset || {}, frame, frame) || (frame.ownerId ? 'wardrobe' : fallbackRole),
      _selectionOrder: index,
    });
    });
  // The picker selects a design asset, not every alternate generated image
  // belonging to that asset. Keep the preferred variant (or latest if no
  // preferred design is marked), and preserve separate uploaded references.
  const bySource = new Map();
  for (const frame of selected) {
    const sourceId = frame.sourceAssetId || frame.parentAssetId || frame.assignedAssetId;
    const key = sourceId ? `asset:${sourceId}` : `image:${frame.url}`;
    const previous = bySource.get(key);
    if (!previous || Number(frame.rating === 'preferred') > Number(previous.rating === 'preferred') ||
      (frame.rating === previous.rating && frame._selectionOrder > previous._selectionOrder)) bySource.set(key, frame);
  }
  // Asset design references are opt-in per asset. Project-wide visual guides
  // can contain alternate generated options and stale assignments that are not
  // visible in this asset's picker, so never silently append them here.
  return uniqueReferenceFrames([...bySource.values()].map(({ _selectionOrder, ...frame }) => frame));
}

export function featuredAssetDesignFrame(asset, previewId = '') {
  const generated = (asset?.references || []).filter(frame => frame?.source === 'Generated' && frame.url);
  if (!generated.length) return null;

  const preview = previewId && generated.find(frame => frameIdentity(frame) === String(previewId));
  if (preview) return preview;

  const preferred = [...generated].reverse().find(frame => frame.rating === 'preferred');
  if (preferred) return preferred;

  const preferredGuide = [...(asset?.designReferences || [])].reverse().find(frame =>
    frame?.enabled !== false && frame?.rating === 'preferred' && frame.url &&
    (!frame.sourceAssetId || String(frame.sourceAssetId) === String(asset?.id))
  );
  if (preferredGuide) {
    const matchingGenerated = generated.find(frame => frame.url === preferredGuide.url);
    if (matchingGenerated) return matchingGenerated;
  }

  return generated.at(-1) || null;
}

export function featuredAssetLibraryImage(asset) {
  const generated = featuredAssetDesignFrame(asset);
  if (generated?.url) return { url: generated.url, kind: 'generated' };

  const reference = [...(asset?.references || [])].reverse().find(frame =>
    frame?.source !== 'Generated' && frame?.url
  ) || [...(asset?.designReferences || [])].reverse().find(frame =>
    frame?.enabled !== false && frame?.url
  );
  return reference?.url ? { url: reference.url, kind: 'reference' } : null;
}
