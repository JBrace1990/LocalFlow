import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

test('Electron package includes backend local modules imported by server.js', () => {
  const files = packageJson.build.files;
  assert.ok(files.includes('*.js'), 'root-level backend helper modules must be packaged');
  assert.ok(files.includes('src/**/*.js'), 'backend src modules must be packaged');
  assert.ok(files.includes('server.js'), 'API entry point must be packaged');
  const imports = [...server.matchAll(/from\s+['"](\.\/[^'"]+\.js)['"]/g)].map(match => match[1]);
  assert.ok(imports.some(file => file.startsWith('./src/')), 'server imports project source helpers');
  assert.ok(imports.some(file => file.startsWith('./') && !file.startsWith('./src/')), 'server imports root helpers');
});
