import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [main, packageText, viteConfig] = await Promise.all([
  fs.readFile(path.join(root, 'src/main.jsx'), 'utf8'),
  fs.readFile(path.join(root, 'package.json'), 'utf8'),
  fs.readFile(path.join(root, 'vite.config.js'), 'utf8'),
]);
const packageJson = JSON.parse(packageText);

test('generation attempts the API instead of trusting the UI startup aggregate flag', () => {
  const start = main.indexOf('const generate = async (type,modelId,options={}) => {');
  const end = main.indexOf('const generateBatch=', start);
  assert.ok(start >= 0 && end > start, 'generation submission function should be available');
  const generate = main.slice(start, end);
  assert.doesNotMatch(generate, /if\s*\(\s*!apiOnline\s*\)\s*\{[^}]*return\s*;?\s*\}/);
  assert.match(generate, /fetch\('\/api\/generate'/);
});

test('npm run dev starts the Local Flow API and Vite together without Electron', () => {
  const command = packageJson.scripts.dev;
  assert.match(command, /concurrently/);
  assert.match(command, /node --watch server\.js/);
  assert.match(command, /vite --host 127\.0\.0\.1/);
  assert.match(viteConfig, /port:\s*Number\(process\.env\.VITE_PORT\s*\|\|\s*5173\)/);
});
