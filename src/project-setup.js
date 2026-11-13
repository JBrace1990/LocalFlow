export function normalizeFilmDuration(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
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

export function assetHasPendingGeneration(assetId, queue = []) {
  const activeStates = new Set(['Submitting', 'Queued', 'Running']);
  return Boolean(assetId) && queue.some(job =>
    job?.assetTargetId === assetId && activeStates.has(job.state)
  );
}

