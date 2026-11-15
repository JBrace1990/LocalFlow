import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseByteRange } from '../src/http-byte-range.js';
import { serveMediaFile } from '../src/media-response.js';

test('media byte ranges support explicit, open-ended, and suffix requests', () => {
  assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
});

test('media byte ranges reject unsatisfiable and malformed ranges', () => {
  assert.equal(parseByteRange('bytes=10-', 10), false);
  assert.equal(parseByteRange('bytes=5-2', 10), false);
  assert.equal(parseByteRange('items=0-1', 10), null);
  assert.equal(parseByteRange(null, 10), null);
});

test('media handler advertises and serves partial byte responses', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'local-flow-range-'));
  const file = path.join(folder, 'test.mp4');
  const payload = Buffer.from('0123456789');
  await fs.writeFile(file, payload);
  const server = http.createServer((req, res) => serveMediaFile(req, res, file, 'video/mp4'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const partial = await fetch(`http://127.0.0.1:${port}/test.mp4`, { headers: { range: 'bytes=2-5' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('accept-ranges'), 'bytes');
    assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(partial.headers.get('content-length'), '4');
    assert.equal(await partial.text(), '2345');

    const unsatisfiable = await fetch(`http://127.0.0.1:${port}/test.mp4`, { headers: { range: 'bytes=20-' } });
    assert.equal(unsatisfiable.status, 416);
    assert.equal(unsatisfiable.headers.get('content-range'), 'bytes */10');

    const complete = await fetch(`http://127.0.0.1:${port}/test.mp4`);
    assert.equal(complete.status, 200);
    assert.equal(await complete.text(), payload.toString());

    const downloadServer = http.createServer((req, res) => serveMediaFile(req, res, file, 'video/mp4', { downloadName: 'test.mp4' }));
    await new Promise(resolve => downloadServer.listen(0, '127.0.0.1', resolve));
    const download = await fetch(`http://127.0.0.1:${downloadServer.address().port}/test.mp4`);
    assert.equal(download.headers.get('content-disposition'), 'attachment; filename="test.mp4"');
    await new Promise(resolve => downloadServer.close(resolve));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test('local media route delegates to the range-capable media handler', async () => {
  const source = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /serveMediaFile\(req,\s*res,\s*file,\s*type,\s*url\.searchParams/);
});
