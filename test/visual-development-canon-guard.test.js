import assert from 'node:assert/strict';
import test from 'node:test';
import { findVisualPlanCanonConflicts } from '../src/visual-development-canon-guard.js';

test('rejects a plan that turns an explicitly possible human transformation into an impossibility', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: {
      uniqueHook: 'The fox longs to become human, despite her inability to do so.',
      conflictAndStakes: 'Her transformation is impossible.',
    },
  }, [
    'The fox wishes she could become human.',
    'Keep transformation possible but unresolved. Do not claim it is impossible.',
  ]);

  assert.ok(conflicts.some(conflict => /transformation/i.test(conflict)));
});

test('rejects a plan that quietly makes transformation impossible by saying the fox remains an animal', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: {
      uniqueHook: 'The fox remains an animal but her wish to be human is a constant theme.',
      arcAndEnding: 'She returns to the forest while remaining in fox form.',
    },
  }, ['Keep transformation possible but unresolved. Do not claim it is impossible.']);

  assert.ok(conflicts.some(conflict => /transformation/i.test(conflict)));
});

test('rejects plain-language claims that becoming human is not possible', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: { conflictAndStakes: 'The fox desires to become human, which is not possible.' },
  }, ['Keep transformation possible but unresolved.']);

  assert.ok(conflicts.some(conflict => /cannot become human/i.test(conflict)));
});

test('rejects a plan that resolves a transformation the creator left open', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: { arcAndEnding: 'The fox undergoes a transformation and becomes human.' },
    assets: [{ name: 'Transformation Sequence', brief: 'A magical scene showing her transformation.' }],
  }, ['Keep transformation possible but unresolved.']);

  assert.ok(conflicts.some(conflict => /unresolved/i.test(conflict)));
});

test('rejects a plan that makes unrequited love mutual', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: { arcAndEnding: 'The man and fox fall in love and become a couple.' },
  }, ['Her love and wish to become human remain real, but he does not reciprocate romantically.']);

  assert.ok(conflicts.some(conflict => /reciprocat|mutual/i.test(conflict)));
});

test('accepts a plan that preserves the creator-approved ending and open transformation', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: {
      premise: 'An injured red fox is cared for by a kind man.',
      arcAndEnding: 'She returns to the forest by choice and visits him freely. Her wish to become human remains unresolved, and he does not reciprocate romantically.',
    },
  }, [
    'Keep transformation possible but unresolved.',
    'She returns to the forest by choice and visits the man freely.',
    'He does not reciprocate romantically.',
  ]);

  assert.deepEqual(conflicts, []);
});

test('rejects a storyboard that turns Yuki the fox into the separate fox spirit', () => {
  const conflicts = findVisualPlanCanonConflicts({
    scenes: [
      { title: 'The Fox Spirit’s Gift', description: 'Yuki, now a fox spirit, wishes to become human.' },
    ],
  }, ['Yuki is the injured red fox. Kohaku is a separate fox spirit who grants Yuki one day in human form.']);

  assert.ok(conflicts.some(conflict => /changes Yuki from the fox protagonist/i.test(conflict)));
});

test('rejects a storyboard that makes the one-day human transformation permanent', () => {
  const conflicts = findVisualPlanCanonConflicts({
    scenes: [{ title: 'A New Life', description: 'Yuki receives a permanent transformation and lives forever as a human.' }],
  }, ['Kohaku grants Yuki a one-day transformation. It ends at dawn, when Yuki returns to fox form.']);

  assert.ok(conflicts.some(conflict => /makes Yuki’s human transformation permanent/i.test(conflict)));
});

test('allows the separate spirit to grant a temporary human transformation to the fox', () => {
  const conflicts = findVisualPlanCanonConflicts({
    scenes: [
      { title: 'The Fox Spirit’s Gift', description: 'Kohaku, the fox spirit, grants Yuki one day as a human.' },
      { title: 'Dawn Returns', description: 'At dawn Yuki returns to fox form.' },
    ],
  }, ['Yuki is an injured red fox. Kohaku is a separate fox spirit. The transformation lasts one day, until dawn.']);

  assert.deepEqual(conflicts, []);
});

test('does not mistake an explicit ban on permanent transformation for a permanent ending', () => {
  const conflicts = findVisualPlanCanonConflicts({
    scenes: [
      { title: 'The Last Lantern', description: 'Yuki knows Kohaku’s gift lasts only until dawn. No new blessing, no permanent transformation.' },
      { title: 'Dawn Returns', description: 'At dawn, Yuki returns to fox form.' },
    ],
  }, ['Kohaku grants Yuki human form for one day only. At dawn she returns to fox form.']);

  assert.deepEqual(conflicts, []);
});

test('rejects a storyboard that advances the transformation or fox return outside the creator-approved scene order', () => {
  const conflicts = findVisualPlanCanonConflicts({
    scenes: [
      { title: 'Rescue', description: 'Ren rescues Yuki, a red fox.' },
      { title: 'Care', description: 'Ren treats Yuki at the wildlife clinic.' },
      { title: 'The Fox Spirit’s Gift', description: 'At the shrine, Yuki becomes human.' },
      { title: 'Festival Reveal', description: 'Human Yuki reveals the familiar ribbon.' },
      { title: 'A Day Together', description: 'Yuki reveals her fox form to Ren.' },
      { title: 'The Last Lantern', description: 'Near midnight, Yuki returns to fox form.' },
      { title: 'Dawn Returns', description: 'At first dawn, Yuki is a red fox again.' },
      { title: 'An Open Future', description: 'Fox Yuki walks beside Ren.' },
    ],
  }, ['Yuki is a red fox. Her one-day human form is only in scenes 4–6; she returns to fox form at first dawn in scene 7.']);

  assert.ok(conflicts.some(conflict => /moves Yuki’s human form outside scenes 4–6/i.test(conflict)));
  assert.ok(conflicts.some(conflict => /returns Yuki to fox form before dawn/i.test(conflict)));
});
