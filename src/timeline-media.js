const seconds = value => {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export function timelineMediaDuration(item = {}, project = null) {
  const explicit = seconds(item.duration);
  if (explicit) return explicit;
  const scene = (project?.shots || []).find(shot => (item.sceneId && shot.id === item.sceneId)
    || (item.url && (shot.image === item.url || shot.clip === item.url
    || (shot.images || []).includes(item.url) || (shot.clips || []).includes(item.url)
    || (shot.imageAssets || []).some(asset => asset.url === item.url)
    || (shot.videoAssets || []).some(asset => asset.url === item.url))));
  return seconds(scene?.duration) || (item.kind === 'Image' ? 5 : 10);
}

export function timelineSceneTitle(item = {}, project = null) {
  const scene = (project?.shots || []).find(shot => (item.sceneId && shot.id === item.sceneId)
    || (item.url && (shot.image === item.url || shot.clip === item.url
    || (shot.images || []).includes(item.url) || (shot.clips || []).includes(item.url)
    || (shot.imageAssets || []).some(asset => asset.url === item.url)
    || (shot.videoAssets || []).some(asset => asset.url === item.url))));
  return scene?.title || '';
}
