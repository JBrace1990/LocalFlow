import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('reference frame picker leaves complete cards visible to the inspector scroll', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const gridRules = [...css.matchAll(/\.reference-frame-grid\s*\{([^}]*)\}/g)].map((match) => match[1]);

  assert.ok(gridRules.length > 0, 'reference frame grid styles should exist');
  for (const rule of gridRules) {
    assert.doesNotMatch(rule, /max-height\s*:/,
      'a fixed inner height can clip expanded cards in the last row');
    assert.doesNotMatch(rule, /overflow(?:-y)?\s*:\s*(?:auto|scroll|hidden)/,
      'the grid should grow so the inspector is the single scroll surface');
  }
});
