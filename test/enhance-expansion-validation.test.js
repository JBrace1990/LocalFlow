import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(root, 'server.js'), 'utf8');
const routeStart = source.indexOf("if (url.pathname === '/api/prompt/enhance' && req.method === 'POST')");
const routeEnd = source.indexOf("if (url.pathname === '/api/creative/chat'", routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart, 'Enhance API route should remain available');
const enhanceRoute = source.slice(routeStart, routeEnd);
const start = source.indexOf('function isMeaningfullyEnhancedPrompt(');
const end = source.indexOf('\nfunction ', start + 10);
assert.ok(start >= 0 && end > start, 'Enhance response quality validator should remain available');
const isMeaningfullyEnhancedPrompt = vm.runInNewContext(
  `${source.slice(start, end)}; isMeaningfullyEnhancedPrompt`,
);
const settingStart = source.indexOf('function isFaithfulEnhancedSetting(');
const settingEnd = source.indexOf('\nfunction ', settingStart + 10);
assert.ok(settingStart >= 0 && settingEnd > settingStart, 'Enhance setting-preservation validator should remain available');
const isFaithfulEnhancedSetting = vm.runInNewContext(
  `${source.slice(settingStart, settingEnd)}; isFaithfulEnhancedSetting`,
);

test('Enhance rejects a verbatim echo of the source prompt', () => {
  const prompt = 'Captain Voss draws his sidearm in the ship corridor.';
  assert.equal(isMeaningfullyEnhancedPrompt(prompt, prompt), false);
});

test('Enhance accepts added camera, action, and lighting direction while retaining the source', () => {
  const sourcePrompt = 'Captain Voss draws his sidearm in the ship corridor.';
  const expanded = 'Captain Voss draws his sidearm in the ship corridor. Medium close shot from a low three-quarter angle; his focused face and steady weapon hand lead the frame. Cool console light cuts through the dim metallic passage.';
  assert.equal(isMeaningfullyEnhancedPrompt(sourcePrompt, expanded), true);
});

test('Enhance rejects a response that drops most of the creator prompt', () => {
  const sourcePrompt = 'Captain Voss draws his sidearm in the ship corridor while alarms flash red and the crew evacuates toward the escape pods.';
  assert.equal(isMeaningfullyEnhancedPrompt(sourcePrompt, 'A dramatic close-up with red lighting and deep shadows around a lone figure.'), false);
});

test('Enhance preserves a broad spacecraft setting without inventing a bridge or blank gradient', () => {
  const creatorContext = 'Voss raises his sidearm after the alarm in the spacecraft setting.';
  assert.equal(isFaithfulEnhancedSetting(creatorContext, 'Voss raises his sidearm on the spacecraft bridge.'), false);
  assert.equal(isFaithfulEnhancedSetting(creatorContext, 'Voss raises his sidearm against a plain untextured gradient background.'), false);
  assert.equal(isFaithfulEnhancedSetting(creatorContext, 'Voss raises his sidearm within the same spacecraft setting, framed in a close three-quarter shot with cool warning light.'), true);
});

test('Enhance limits AI additions to visual direction and avoids inventing scene canon', () => {
  assert.match(enhanceRoute, /Do not invent or name a specific location, background, environment, prop, character, or story object/i);
  assert.match(enhanceRoute, /If the creator names only a broad setting, preserve it at that same level/i);
  assert.match(enhanceRoute, /If no setting is named anywhere, use a restrained neutral backdrop without adding story objects/i);
  assert.doesNotMatch(enhanceRoute, /If no setting is specified, use only a plain, untextured gradient background/i);
  assert.match(enhanceRoute, /Do not infer where a weapon or other prop is carried or stored/i);
  assert.match(enhanceRoute, /Add camera, composition, lighting, palette, and rendering detail/i);
});
