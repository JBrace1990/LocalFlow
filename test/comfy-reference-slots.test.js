import assert from 'node:assert/strict';
import test from 'node:test';
import { uniqueComfyReferenceSlots } from '../src/comfy-reference-slots.js';

test('same ComfyUI input and role consumes only one reference slot', () => {
  const slots = uniqueComfyReferenceSlots([
    { comfyInputName: 'palette-fit.png', assignment: { role: 'series-style', assetId: 'visual-guide' } },
    { comfyInputName: 'palette-fit.png', assignment: { role: 'Series-Style', assetId: 'duplicate-guide' } },
  ]);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].assignment.assetId, 'visual-guide');
});

test('the same image can occupy separate slots when it has intentionally different roles', () => {
  const slots = uniqueComfyReferenceSlots([
    { comfyInputName: 'character-sheet.png', assignment: { role: 'character' } },
    { comfyInputName: 'character-sheet.png', assignment: { role: 'wardrobe' } },
  ]);
  assert.deepEqual(slots.map(slot => slot.assignment.role), ['character', 'wardrobe']);
});

test('reference slots are renumbered contiguously after duplicates are removed', () => {
  const slots = uniqueComfyReferenceSlots([
    { comfyInputName: 'palette-fit.png', assignment: { role: 'series-style', slot: 1 } },
    { comfyInputName: 'palette-fit.png', assignment: { role: 'series-style', slot: 2 } },
    { comfyInputName: 'fox-sheet.png', assignment: { role: 'character', slot: 3 } },
  ]);
  assert.deepEqual(slots.map(slot => slot.assignment.slot), [1, 2]);
});
