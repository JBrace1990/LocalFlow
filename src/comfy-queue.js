function rowPromptId(row, state) {
  if (Array.isArray(row)) return String(state === 'Running' ? row[0] : row[1] || '');
  return String(row?.prompt_id || row?.promptId || row?.id || '');
}

export function normalizeComfyQueue(queue = {}) {
  const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending : [];
  const running = Array.isArray(queue.queue_running) ? queue.queue_running : [];
  return [
    ...running.map(row => ({ promptId: rowPromptId(row, 'Running'), state: 'Running' })),
    ...pending.map(row => ({ promptId: rowPromptId(row, 'Queued'), state: 'Queued' })),
  ].filter(item => item.promptId);
}
