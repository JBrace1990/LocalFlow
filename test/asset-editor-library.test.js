import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { featuredAssetLibraryImage } from '../src/story-asset-design.js';

const source = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('asset library preview prefers the featured generated design and falls back to a source reference', () => {
  const asset = { references: [
    { id: 'source', source: 'Uploaded', url: '/source.png' },
    { id: 'generated', source: 'Generated', url: '/generated.png', rating: 'preferred' },
  ] };
  assert.deepEqual(featuredAssetLibraryImage(asset), { url: '/generated.png', kind: 'generated' });
  assert.deepEqual(featuredAssetLibraryImage({ references: [asset.references[0]] }), { url: '/source.png', kind: 'reference' });
  assert.equal(featuredAssetLibraryImage({ references: [] }), null);
});

test('selecting a project asset opens a focused, closable edit and generation workspace', () => {
  assert.match(source, /className="asset-library-summary-card"[\s\S]*?onClick=\{\(\)=>setActiveAssetId\(asset\.id\)\}/);
  assert.match(source, /className="asset-detail-dialog"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(source, /event\.key==='Escape'[\s\S]*?setActiveAssetId\(''\)/);
  assert.match(source, /className="asset-detail-featured"/);
  assert.match(source, /aria-label="Close asset editor"/);
  assert.match(source, /generated-asset-views/);
  assert.match(source, /Improve details with AI/);
});
