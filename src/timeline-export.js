export function parseTimelineOutputPath(filePath) {
  const target = String(filePath || '').trim();
  if (!/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+\\)/.test(target)) return null;
  const match = target.match(/^(.*[\\/])([^\\/]+)$/);
  if (!match) return null;
  const filename = match[2];
  if (!filename || filename === '.' || filename === '..') return null;
  const directory = match[1];
  const destination = /^[A-Za-z]:[\\/]$/.test(directory) ? directory : directory.replace(/[\\/]+$/, '');
  return { destination, filename };
}

export function parseExportOutputPath(filePath, format) {
  const expectedExtension = format === 'pdf' ? '.pdf' : format === 'mp4' ? '.mp4' : '';
  if (!expectedExtension) return null;
  const target = parseTimelineOutputPath(filePath);
  if (!target || pathExtension(target.filename) !== expectedExtension) return null;
  return target;
}

function pathExtension(filename) {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}
