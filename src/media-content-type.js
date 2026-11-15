const TYPES = new Map([
  ['.aac', 'audio/aac'], ['.flac', 'audio/flac'], ['.m4a', 'audio/mp4'], ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'], ['.wav', 'audio/wav'],
  ['.avi', 'video/x-msvideo'], ['.m4v', 'video/x-m4v'], ['.mkv', 'video/x-matroska'],
  ['.mov', 'video/quicktime'], ['.mp4', 'video/mp4'], ['.webm', 'video/webm'],
  ['.avif', 'image/avif'], ['.bmp', 'image/bmp'], ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'],
]);

export function mediaContentType(filename) {
  const extension = String(filename || '').match(/\.[^.\\/]+$/)?.[0]?.toLowerCase();
  return TYPES.get(extension) || 'application/octet-stream';
}
