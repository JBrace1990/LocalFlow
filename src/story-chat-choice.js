export function handleStoryChatChoice(choice, handlers = {}) {
  if (choice?.action === 'approve-storyboard') return handlers.openStoryboard?.();
  if (choice?.action === 'prepare-assets') return (handlers.prepareAssets || handlers.sendMessage)?.(choice?.reply || '');
  return handlers.sendMessage?.(choice?.reply || '');
}
