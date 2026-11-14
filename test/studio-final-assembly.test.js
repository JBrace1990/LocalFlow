import assert from 'node:assert/strict';
import test from 'node:test';
import { finalAssemblyState } from '../src/final-assembly.js';
import { readFile } from 'node:fs/promises';

test('final assembly state reports clip readiness and existing output', () => {
  assert.deepEqual(finalAssemblyState([{clip:'a'},{},{clip:'b'}],''), {ready:2,total:3,canAssemble:true,complete:false});
  assert.deepEqual(finalAssemblyState([{},{ }],''), {ready:0,total:2,canAssemble:false,complete:false});
  assert.equal(finalAssemblyState([{clip:'a'}],'film.mp4').complete,true);
});

test('Studio exposes assembly progress and an assembly action beside video clips', async () => {
  const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(source,/VIDEO CLIPS[\s\S]{0,500}Assemble film/);
  assert.match(source,/clips ready/);
});
