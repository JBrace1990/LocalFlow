const durationNumber = value => {
  const parsed = Number.parseFloat(String(value ?? '').replace(/s$/i, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export function videoDurationRange(models = [], modelId = '') {
  const model = models.find(item => item.id === modelId);
  if (model?.vendor === 'MiniMax' && model?.id !== 'comfy-minimax-h3') {
    return { min: 6, max: 10, step: 1, options: [6, 10] };
  }
  if (model?.id === 'comfy-minimax-h3') {
    return { min: 5.2, max: 15, step: 1, options: null };
  }
  return { min: 3, max: 15, step: 1, options: null };
}

export function formatVideoDuration(value) {
  const parsed = durationNumber(value);
  if (parsed === null) return '';
  const seconds = Math.round(parsed * 10) / 10;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
}

export function isVideoDurationSupported(models, modelId, value) {
  const seconds = durationNumber(value);
  if (seconds === null) return false;
  const range = videoDurationRange(models, modelId);
  if (range.options) return range.options.includes(seconds);
  if (seconds < range.min || seconds > range.max) return false;
  if (Math.abs(seconds - range.max) < 1e-8) return true;
  const steps = (seconds - range.min) / range.step;
  return Math.abs(steps - Math.round(steps)) < 1e-8;
}

export function closestVideoDuration(models, modelId, value) {
  const range = videoDurationRange(models, modelId);
  const seconds = durationNumber(value) ?? range.min;
  if (range.options) {
    return formatVideoDuration(range.options.reduce((best, candidate) =>
      Math.abs(candidate - seconds) < Math.abs(best - seconds) ? candidate : best
    ));
  }
  if (seconds <= range.min) return formatVideoDuration(range.min);
  if (seconds >= range.max) return formatVideoDuration(range.max);
  const steps = Math.round((seconds - range.min) / range.step);
  return formatVideoDuration(Math.min(range.max, range.min + steps * range.step));
}
