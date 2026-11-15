import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styleEntry = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/theme-form-controls.css', import.meta.url), 'utf8').catch(() => '');

test('ordinary inputs, selects, and textareas use the active app theme', () => {
  assert.match(styleEntry, /import\s+['"]\.\/theme-form-controls\.css['"]/);
  assert.match(css, /\.app-shell\s+:is\(\s*input:not\(\[type=["']checkbox["']\]\)/);
  assert.match(css, /select/);
  assert.match(css, /textarea/);
  assert.match(css, /background(?:-color)?:\s*var\(--field-bg/);
  assert.match(css, /color:\s*var\(--field-text/);
  assert.match(css, /border:\s*1px solid var\(--field-border/);
});

test('specialized inputs are excluded and light/dark modes set native control scheme', () => {
  for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'button', 'submit', 'reset', 'image']) {
    assert.match(css, new RegExp(`not\\(\\[type=["']${type}["']\\]\\)`), `${type} input should retain its dedicated appearance`);
  }
  assert.match(css, /\.app-shell\s*\{[^}]*color-scheme:\s*dark/s);
  assert.match(css, /\.app-shell\.appearance-light\s*\{[^}]*color-scheme:\s*light/s);
});
