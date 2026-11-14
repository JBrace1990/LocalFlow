import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { parseByteRange } from './http-byte-range.js';

export async function serveMediaFile(req, res, file, contentType, { downloadName } = {}) {
  let stat;
  try {
    stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error('Not a file');
  } catch {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Media not found' }));
  }

  const range = parseByteRange(req.headers.range, stat.size);
  if (range === false) {
    res.writeHead(416, { 'accept-ranges': 'bytes', 'content-range': `bytes */${stat.size}` });
    return res.end();
  }

  const headers = { 'content-type': contentType, 'accept-ranges': 'bytes' };
  if (downloadName) headers['content-disposition'] = `attachment; filename="${String(downloadName).replace(/[\\"\r\n]/g, '_')}"`;
  if (range) {
    headers['content-length'] = range.end - range.start + 1;
    headers['content-range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    res.writeHead(206, headers);
    return createReadStream(file, { start: range.start, end: range.end }).pipe(res);
  }

  headers['content-length'] = stat.size;
  res.writeHead(200, headers);
  return createReadStream(file).pipe(res);
}
