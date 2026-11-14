import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { mediaContentType } from '../src/media-content-type.js';

const root = new URL('../', import.meta.url);
const server = await fs.readFile(new URL('server.js', root), 'utf8');

test('local Kokoro preparation and status endpoints are connected to the speech engine', () => {
  assert.match(server, /from '\.\/tts-engine\.js'/);
  assert.match(server, /url\.pathname === '\/api\/tts\/status'.*getLocalTtsStatus/s);
  assert.match(server, /url\.pathname === '\/api\/tts\/prepare'.*prepareLocalSpeech/s);
  assert.match(server, /url\.pathname === '\/api\/tts\/models'.*getLocalTtsModels/s);
});

test('the speech engine transformer dependency resolves in the installed runtime', () => {
  assert.doesNotThrow(() => import.meta.resolve('@huggingface/transformers'));
});

test('default local narration generation uses Kokoro and registers project metadata', () => {
  assert.match(server, /generateLocalSpeech\(/);
  assert.match(server, /source:'Generated narration'/);
  assert.match(server, /registerMediaAsset\(record\)/);
});

test('Audio files are indexed and served with audio MIME types', () => {
  assert.match(server, /AUDIO_EXT/);
  assert.match(server, /AUDIO_EXT\.has\(ext\)/);
  assert.match(server, /mediaContentType/);
  assert.equal(mediaContentType('Narration.wav'), 'audio/wav');
  assert.equal(mediaContentType('Narration.mp3'), 'audio/mpeg');
  assert.equal(mediaContentType('preview.mp4'), 'video/mp4');
  assert.equal(mediaContentType('frame.png'), 'image/png');
  assert.equal(mediaContentType('unknown.bin'), 'application/octet-stream');
});
