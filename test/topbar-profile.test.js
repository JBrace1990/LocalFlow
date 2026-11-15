import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/theme-form-controls.css', import.meta.url), 'utf8');

test('the application top bar does not show a personal profile avatar', () => {
  const topbar = app.match(/<header className="topbar">([\s\S]*?)<\/header>/)?.[1] || '';
  assert.ok(topbar, 'top bar should exist');
  assert.match(topbar, /className="top-avatar"/, 'the assertion should target the existing placeholder');
  assert.match(css, /\.app-shell\s+\.topbar\s+\.top-avatar\s*\{[^}]*display:\s*none/s);
});
