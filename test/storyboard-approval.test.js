import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completeStoryboardApproval, preserveStoryboardDraftAssets, resolveStoryboardDesignAssets, unapprovedStoryboardDesignAssets, updateProjectVisualBible } from '../src/project-workflow.js';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('approved storyboard choice becomes a completed message and cannot be approved again', () => {
  const messages = [
    { role: 'user', content: 'Looks good.' },
    {
      role: 'assistant',
      content: 'Please review the scene plan beside our chat. Should I create these storyboard scenes in Studio?',
      choices: [
        { label: 'Yes, create this storyboard', reply: 'Yes, create this storyboard.', action: 'approve-storyboard' },
        { label: 'I want to revise it', reply: 'Revise it.', action: 'revise-storyboard' },
      ],
    },
  ];

  const updated = completeStoryboardApproval(messages, 8);

  assert.equal(updated[1].content, 'Storyboard approved. Created 8 scenes and opened Studio.');
  assert.deepEqual(updated[1].choices, []);
  assert.equal(updated[1].selectedChoiceReply, 'Yes, create this storyboard.');
  assert.equal(updated[0], messages[0]);
});

test('storyboard approval completion leaves chat unchanged if no approval card exists', () => {
  const messages = [{ role: 'assistant', content: 'What should happen next?', choices: [] }];

  assert.equal(completeStoryboardApproval(messages, 3), messages);
});

test('storyboard approval resolves visual designs when draft IDs differ from saved project IDs', () => {
  assert.doesNotMatch(mainSource, /\(storyboardDraft\.assets\|\|\[\]\)\.map\(item=>existing\?\.visualAssets\?\.find\(asset=>asset\.id===item\.id\)\)/);
});

test('storyboard plan revisions preserve the linked project and its prepared visual assets', () => {
  const previous = { projectId: 'project-fox', assets: [{ id: 'draft-man', name: 'The Kind Man' }] };
  const revised = preserveStoryboardDraftAssets({ scenes: [{ title: 'Scene 1' }] }, previous);
  assert.equal(revised.projectId, 'project-fox');
  assert.deepEqual(revised.assets, previous.assets);
});

test('storyboard approval resolves renamed draft IDs to project assets by exact identity and category', () => {
  const preferred = [{ url: '/api/media/man.png', rating: 'preferred' }];
  const draft = [{ id: 'new-draft-id', name: 'The Kind Man', category: 'Character' }];
  const projectAssets = [
    { id: 'saved-man-id', name: 'The Kind Man', category: 'Character', designReferences: preferred },
    { id: 'saved-home-id', name: 'The Kind Man', category: 'Location', designReferences: preferred },
  ];
  const resolved = resolveStoryboardDesignAssets(draft, projectAssets);
  assert.deepEqual(resolved.assets.map(asset => asset.id), ['saved-man-id']);
  assert.deepEqual(resolved.missing, []);
});

test('a legacy storyboard draft without its asset list can use only the selected project’s prepared designs', () => {
  const projectAssets = [
    { id: 'style', name: 'Anime style', category: 'Style', designReferences: [{ url: '/style.png', rating: 'preferred' }] },
    { id: 'fox', name: 'Fox', category: 'Character', designReferences: [{ url: '/fox.png', rating: 'preferred' }] },
  ];
  const resolved = resolveStoryboardDesignAssets([], projectAssets);
  assert.deepEqual(resolved.assets.map(asset => asset.id), ['style', 'fox']);
  assert.deepEqual(resolveStoryboardDesignAssets([], []).missing, []);
});

test('explicitly approved designs remain approved when older saved projects lack canonical reference metadata', () => {
  const assets = [
    { id: 'fox', name: 'The Fox', designStatus: 'approved', designReferences: [] },
    { id: 'style', name: 'Series art direction', designStatus: 'needs-design', designReferences: [] },
  ];
  assert.deepEqual(unapprovedStoryboardDesignAssets(assets).map(asset => asset.id), ['style']);
});

test('storyboard resolution prefers a canonical same-name design over a stale same-ID placeholder', () => {
  const draft = [{ id: 'style-id', name: 'Series art direction and palette', category: 'Style' }];
  const saved = [
    { id: 'style-id', name: 'Series art direction and palette', category: 'Style', designStatus: 'needs-design' },
    { id: 'style-approved', name: 'Series art direction and palette', category: 'Style', designReferences: [{ url: '/style.png', rating: 'preferred' }] },
  ];
  const resolved = resolveStoryboardDesignAssets(draft, saved);
  assert.deepEqual(resolved.assets.map(asset => asset.id), ['style-approved']);
});

test('editing story art direction does not demote explicitly approved canonical designs', () => {
  const approved = { id: 'style', designStatus: 'approved', designReferences: [{ url: '/style.png', rating: 'preferred', enabled: true }] };
  const updated = updateProjectVisualBible({ visualAssets: [approved] }, { style: 'Revised anime style' }, 'Revised anime style');
  assert.equal(updated.visualAssets[0].designStatus, 'approved');
  assert.deepEqual(updated.visualAssets[0].designReferences, approved.designReferences);
});
