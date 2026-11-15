import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { createStartupHtml, createStartupUpdateScript, STARTUP_STEPS } = require('../electron/startup-screen.cjs');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('startup screen shows the startup milestones and an updating status area', () => {
  assert.ok(packageJson.build.files.includes('electron/**/*'), 'startup screen module must be packaged with Electron');
  const html = createStartupHtml();

  for (const step of STARTUP_STEPS) assert.ok(html.includes(step), `missing startup step: ${step}`);
  assert.match(html, /setStartupState/);
  assert.match(html, /role="status"/);
});

test('startup status updates safely serialize text for the splash renderer', () => {
  const script = createStartupUpdateScript(2, 'Checking the API', 'Waiting for health response: </script>');

  assert.match(script, /setStartupState/);
  assert.match(script, /Checking the API/);
  assert.doesNotMatch(script, /Waiting for health response: <\/script>/);
});
