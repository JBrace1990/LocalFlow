export function normalizeFilmDuration(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function allocateSceneDurations(totalSeconds, sceneCount) {
  const total = normalizeFilmDuration(totalSeconds);
  const count = Math.trunc(Number(sceneCount));
  if (total === null || !Number.isFinite(count) || count < 1) return [];
  const totalTenths = Math.round(total * 10);
  const base = Math.floor(totalTenths / count);
  const remainder = totalTenths - base * count;
  return Array.from({ length: count }, (_, index) => {
    const tenths = base + (index < remainder ? 1 : 0);
    const seconds = (tenths / 10).toFixed(1).replace(/\.0$/, '');
    return `${seconds}s`;
  });
}

export function createProjectDraft(name, durationSeconds = 90, id = `project-${Date.now()}`) {
  const cleanName = String(name ?? '').trim();
  const duration = normalizeFilmDuration(durationSeconds);
  if (!cleanName || duration === null) return null;
  return {
    id,
    name: cleanName,
    kind: 'Short film',
    targetDurationSeconds: duration,
    updated: 'Created just now',
    shots: [],
    visualAssets: [],
    visualReferences: [],
    output: null,
    visualDevelopmentRequired: true,
    visualDevelopmentApproved: false,
    visualDevelopmentStatus: 'needed',
  };
}

export function assetDesignModelsFor(models = []) {
  return models.filter(model =>
    model?.type === 'Image' &&
    model?.vendor !== 'MiniMax' &&
    Number(model.maxReferences) > 0 &&
    !/image[- ]?edit/i.test(`${model.id || ''} ${model.name || ''}`)
  );
}

export function videoModelSupportsSourceMode(model, sourceMode = 'storyboard') {
  if (model?.id === 'comfy-wan22-i2v') return sourceMode !== 'text';
  return true;
}

export function assetHasPendingGeneration(assetId, queue = []) {
  const activeStates = new Set(['Submitting', 'Queued', 'Running']);
  return Boolean(assetId) && queue.some(job =>
    (job?.assetTargetId === assetId || job?.sceneId === `asset-scene-${assetId}`) && activeStates.has(job.state)
  );
}

export function visibleGenerationQueueItems(comfyItems = [], queue = [], hiddenIds = [], comfyConnected = false, liveQueueIds = []) {
  const hidden = new Set(hiddenIds);
  const live = liveQueueIds instanceof Set ? liveQueueIds : new Set(liveQueueIds || []);
  const remoteItems = comfyItems.map(remote => {
    const local = queue.find(item => item.remoteId === remote.promptId ||
      (item.assetId && item.assetId === remote.assetId));
    return { ...remote, ...local, id: local?.id || `comfy-${remote.promptId}`, remoteId: remote.promptId, state: remote.state, provider: 'ComfyUI' };
  }).filter(item => !hidden.has(item.remoteId) && !hidden.has(item.id));
  const trackedActive = queue.filter(item => {
    const active = ['Submitting', 'Queued', 'Running'].includes(item.state);
    if (!active || hidden.has(item.id) || hidden.has(item.remoteId)) return false;
    if (live.has(item.id)) return true;
    const reportedByComfy = comfyItems.some(remote => item.remoteId === remote.promptId ||
      (item.assetId && item.assetId === remote.assetId));
    if (reportedByComfy) return false;
    if (item.provider === 'MiniMax' || (item.state === 'Submitting' && !item.remoteId)) return true;
    if (comfyConnected) return false;
    return Boolean(item.assetTargetId);
  });
  return [...remoteItems, ...trackedActive];
}

