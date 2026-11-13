import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import postcss from 'postcss';

const cssPath = fileURLToPath(new URL('../src/story-chat.css', import.meta.url));

test('design workflow has one authoritative desktop column split', async () => {
  const root = postcss.parse(await readFile(cssPath, 'utf8'));
  const desktopLayoutRules = [];

  root.walkAtRules('media', atRule => {
    if (!/min-width:\s*901px/.test(atRule.params) || /max-width/.test(atRule.params)) return;
    atRule.walkRules('.story-chat-layout.design-workflow', rule => {
      if (rule.nodes?.some(node => node.type === 'decl' && node.prop === 'grid-template-columns')) {
        desktopLayoutRules.push(rule);
      }
    });
  });

  assert.equal(desktopLayoutRules.length, 1, 'desktop column sizing should not be overridden by duplicate rules');
  assert.equal(
    desktopLayoutRules[0].nodes.find(node => node.type === 'decl' && node.prop === 'grid-template-columns').value,
    'minmax(0,1fr) minmax(0,2fr)',
    'chat should occupy one third and the design workspace two thirds'
  );
});

test('wide design workspace places a large preview beside its controls', async () => {
  const root = postcss.parse(await readFile(cssPath, 'utf8'));
  let workspaceColumns;
  let featureHeight;
  let controlsScroll;

  root.walkAtRules('media', atRule => {
    if (!/min-width:\s*1200px/.test(atRule.params)) return;
    atRule.walkRules('.story-chat-layout.design-workflow .story-design-asset-workspace', rule => {
      workspaceColumns = rule.nodes.find(node => node.type === 'decl' && node.prop === 'grid-template-columns')?.value;
    });
    atRule.walkRules('.story-chat-layout.design-workflow .story-design-feature', rule => {
      featureHeight = rule.nodes.find(node => node.type === 'decl' && node.prop === 'height')?.value;
    });
    atRule.walkRules('.story-chat-layout.design-workflow .story-design-controls', rule => {
      controlsScroll = rule.nodes.find(node => node.type === 'decl' && node.prop === 'overflow-y')?.value;
    });
  });

  assert.equal(workspaceColumns, 'minmax(0,2fr) minmax(300px,1fr)');
  assert.match(featureHeight || '', /clamp\(520px,72vh,860px\)/);
  assert.equal(controlsScroll, 'auto');
});

test('chat messages use simple left/right message bubbles without avatars', async () => {
  const app = await readFile(fileURLToPath(new URL('../src/main.jsx', import.meta.url)), 'utf8');
  const css = postcss.parse(await readFile(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8'));
  assert.doesNotMatch(app, /<div className="story-chat-avatar">/);
  let userAlignment;
  css.walkRules('.story-chat-message.user', rule => {
    userAlignment = rule.nodes.find(node => node.type === 'decl' && node.prop === 'margin-left')?.value;
  });
  assert.equal(userAlignment, 'auto');
});
