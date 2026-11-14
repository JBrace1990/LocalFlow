export function parseByteRange(header, size) {
  if (!header || !Number.isSafeInteger(size) || size < 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!suffixLength || size === 0) return false;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (start >= size || end < start) return false;
    end = Math.min(end, size - 1);
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  return { start, end };
}
