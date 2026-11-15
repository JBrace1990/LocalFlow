import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Studio storyboard strip gives every card an equal-width grid track', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/\.shot-strip\s*\{([^}]*)\}/g)].map((match) => match[1]);

  assert.ok(rules.length > 0, 'shot strip styles should exist');
  for (const rule of rules) {
    assert.match(rule, /grid-template-columns\s*:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
      'all five visible columns, including the last card, should use equal flexible tracks');
    assert.doesNotMatch(rule, /grid-template-columns[^;}]*\b\d+px\b/,
      'no storyboard column should have a fixed width');
  }
});
